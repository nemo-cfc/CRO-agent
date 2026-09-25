import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { PERF_INIT_SCRIPT } from '../../browser/init-script.js';

function observe() {
  const callbacks = new Map<string, (list: { getEntries(): unknown[] }) => void>();
  const window: { __croPerf?: { cls: number; longTasks: number; longTaskMs: number; tasks: unknown[] } } = {};
  class Observer {
    static supportedEntryTypes = ['longtask', 'layout-shift', 'largest-contentful-paint'];
    constructor(private callback: (list: { getEntries(): unknown[] }) => void) {}
    observe({ type }: { type: string }) { callbacks.set(type, this.callback); }
  }
  runInNewContext(PERF_INIT_SCRIPT, { window, PerformanceObserver: Observer });
  return { state: window.__croPerf!, send: (type: string, entries: unknown[]) => callbacks.get(type)!({ getEntries: () => entries }) };
}

it('uses the largest CLS session window and excludes interaction-related shifts', () => {
  const { state, send } = observe();
  send('layout-shift', [
    { startTime: 100, value: 0.1 }, { startTime: 500, value: 0.05 },
    { startTime: 600, value: 1, hadRecentInput: true },
    { startTime: 2000, value: 0.12 },
  ]);
  expect(state.cls).toBeCloseTo(0.15);
});

it('retains long-task timing so pre-FCP work can be excluded from blocking estimates', () => {
  const { state, send } = observe();
  send('longtask', [{ startTime: 100, duration: 70 }, { startTime: 1000, duration: 120 }]);
  expect(state.tasks).toEqual([{ startTime: 100, duration: 70 }, { startTime: 1000, duration: 120 }]);
  expect(state.longTasks).toBe(2);
  expect(state.longTaskMs).toBe(190);
});
