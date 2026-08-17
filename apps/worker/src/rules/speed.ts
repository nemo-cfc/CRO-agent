import type { Check } from '@cro/shared';
import { check, gradeBelow, kb, ms, skipped, type RuleContext } from './util.js';

export function speedRules(ctx: RuleContext): Check[] {
  // Mobile is the honest measurement — it is where the traffic and the pain are.
  const page = ctx.homeMobile ?? ctx.homeDesktop;
  if (!page) {
    return [skipped('speed.unavailable', 'speed', 'Speed and stability', 'The page did not load.')];
  }

  const p = page.perf;
  const crux = ctx.evidence.crux;
  const out: Check[] = [];

  /* LCP — field data preferred over our single lab load ------------- */
  const lcpField = crux?.available ? crux.lcpP75 : null;
  const lcp = lcpField ?? p.lcp;
  const lcpSource = lcpField !== null ? 'real visitors (75th percentile)' : 'this test load';

  out.push(
    lcp !== null
      ? check({
          id: 'speed.lcp',
          category: 'speed',
          title: 'Main content appears quickly',
          status: gradeBelow(lcp, 2500, 4000),
          weight: 1.5,
          detail: `Largest Contentful Paint is ${ms(lcp)} for ${lcpSource}. Google treats 2.5s as good and 4s as poor; every extra second past 2s costs conversions.`,
          evidence: { lcpMs: Math.round(lcp), source: lcpSource },
        })
      : skipped('speed.lcp', 'speed', 'Main content appears quickly', 'Largest Contentful Paint could not be measured.'),
  );

  /* CLS ------------------------------------------------------------ */
  const clsField = crux?.available ? crux.clsP75 : null;
  const cls = clsField ?? p.cls;
  out.push(
    cls !== null
      ? check({
          id: 'speed.cls',
          category: 'speed',
          title: 'Layout does not jump while loading',
          status: gradeBelow(cls, 0.1, 0.25),
          weight: 1.25,
          detail: `Cumulative Layout Shift is ${cls.toFixed(3)}. Above 0.1 the page visibly moves under the visitor's thumb, which is how mis-taps and rage-quits happen.`,
          evidence: { cls: Number(cls.toFixed(3)) },
        })
      : skipped('speed.cls', 'speed', 'Layout does not jump while loading', 'Layout shift could not be measured.'),
  );

  /* Server response ------------------------------------------------ */
  const ttfb = p.ttfb ?? ctx.evidence.static?.ttfbMs ?? null;
  out.push(
    ttfb !== null
      ? check({
          id: 'speed.ttfb',
          category: 'speed',
          title: 'Server responds promptly',
          status: gradeBelow(ttfb, 800, 1800),
          detail: `Time to first byte is ${ms(ttfb)}. Everything else on the page is stuck waiting behind this number.`,
          evidence: { ttfbMs: Math.round(ttfb) },
        })
      : skipped('speed.ttfb', 'speed', 'Server responds promptly', 'Server timing was not available.'),
  );

  /* Main-thread blocking ------------------------------------------- */
  out.push(
    check({
      id: 'speed.blocking',
      category: 'speed',
      title: 'Page stays responsive while loading',
      status: gradeBelow(p.longTaskMs, 300, 900),
      detail: `${p.longTasks} long task${p.longTasks === 1 ? '' : 's'} totalling ${Math.round(p.longTaskMs)}ms blocked the main thread. During those, taps and scrolls do nothing.`,
      evidence: { longTasks: p.longTasks, longTaskMs: Math.round(p.longTaskMs) },
    }),
  );

  /* Images without dimensions -------------------------------------- */
  out.push(
    check({
      id: 'speed.imageDimensions',
      category: 'speed',
      title: 'Images reserve their space',
      status: p.imagesMissingDimensions === 0 ? 'pass' : p.imagesMissingDimensions <= 3 ? 'warn' : 'fail',
      detail:
        p.imagesMissingDimensions === 0
          ? 'All visible images declare width and height.'
          : `${p.imagesMissingDimensions} image${p.imagesMissingDimensions === 1 ? '' : 's'} render without width/height or an aspect ratio, so the page reflows as each one arrives. This is usually the single cheapest layout-shift fix.`,
      evidence: { missing: p.imagesMissingDimensions },
    }),
  );

  /* Page weight ---------------------------------------------------- */
  // transferSize reads 0 for cross-origin responses without Timing-Allow-Origin,
  // so this is a floor, not a total. Treated as a warning signal only.
  const imageShare = p.totalBytes > 0 ? p.imageBytes / p.totalBytes : 0;
  const dominatedByImages = imageShare > 0.5 && p.imageBytes > 1_000_000;

  out.push(
    p.totalBytes > 0
      ? check({
          id: 'speed.weight',
          category: 'speed',
          title: 'Page weight is reasonable',
          status: gradeBelow(p.totalBytes, 2_000_000, 5_000_000),
          weight: 1.25,
          detail: dominatedByImages
            ? `At least ${kb(p.totalBytes)} transferred across ${p.resourceCount} requests, and ${kb(p.imageBytes)} of that is images — ${Math.round(imageShare * 100)}% of the page. Converting them to WebP at display size typically cuts this by 80-90% with no visible quality loss, and it is the single largest speed lever available here.`
            : `At least ${kb(p.totalBytes)} transferred across ${p.resourceCount} requests (${kb(p.imageBytes)} images, ${kb(p.scriptBytes)} JavaScript). Cross-origin files that do not report their size are excluded, so the real figure is higher.`,
          evidence: {
            totalBytes: p.totalBytes,
            imageBytes: p.imageBytes,
            scriptBytes: p.scriptBytes,
            requests: p.resourceCount,
            imageSharePct: Math.round(imageShare * 100),
          },
        })
      : skipped('speed.weight', 'speed', 'Page weight is reasonable', 'Transfer sizes were not reported by the site.'),
  );

  return out;
}
