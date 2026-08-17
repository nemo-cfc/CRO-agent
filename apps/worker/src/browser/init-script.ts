/**
 * Installed with `context.addInitScript` so the observers are running before
 * the page's own scripts execute.
 *
 * LCP and layout-shift entries do support `buffered: true`, so observing after
 * load would mostly work — but long tasks fired during early boot are the ones
 * that matter most for a blocking-time proxy, and those are easy to miss. This
 * costs nothing and removes the ambiguity.
 */
export const PERF_INIT_SCRIPT = `
(() => {
  // esbuild (via tsx, and via most bundlers) rewrites function declarations to
  // call a \`__name\` helper so Function.prototype.name survives minification.
  // That helper lives in the module scope, not the page — so when Playwright
  // serialises collectFn and evaluates it in the browser, it throws
  // "__name is not defined". Shimming it here keeps the collector written as
  // type-checked TypeScript instead of an opaque template string.
  if (typeof globalThis.__name !== 'function') {
    globalThis.__name = (fn) => fn;
  }

  const state = { lcp: null, cls: 0, longTasks: 0, longTaskMs: 0 };
  Object.defineProperty(window, '__croPerf', { value: state, writable: false });

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) state.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        // Shifts within 500ms of a user interaction are not penalised by CWV.
        if (!e.hadRecentInput) state.cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.longTasks += 1;
        state.longTaskMs += e.duration;
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
})();
`;
