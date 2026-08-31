'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  AuditEvent,
  AuditTarget,
  Check,
  PageRole,
  Phase,
  Platform,
  Recommendation,
  Scorecard,
  Viewport,
} from '@cro/shared';

/**
 * Where the audit runs.
 *
 * Set NEXT_PUBLIC_WORKER_URL to talk to the standalone worker, which keeps a
 * warm Chromium pool and is the fast path. Leave it unset and the app uses its
 * own /api/audit route, which runs the same pipeline in-process — the shape
 * that works on serverless, at the cost of a cold browser per request.
 */
const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';

export interface Shot {
  role: PageRole;
  viewport: Viewport;
  url: string;
  dataUri: string;
}

export interface ReportState {
  status: 'idle' | 'running' | 'done' | 'error';
  phase: Phase | null;
  phaseLabel: string;
  url: string | null;
  title: string | null;
  targets: AuditTarget[];
  platform: Platform | null;
  generator: string | null;
  checks: Check[];
  scorecard: Scorecard | null;
  shots: Shot[];
  summary: string | null;
  recommendations: Recommendation[];
  notes: string[];
  error: string | null;
  durationMs: number | null;
  /** Wall-clock ms since submit, for the live timer. */
  elapsed: number;
}

const EMPTY: ReportState = {
  status: 'idle',
  phase: null,
  phaseLabel: '',
  url: null,
  title: null,
  targets: [],
  platform: null,
  generator: null,
  checks: [],
  scorecard: null,
  shots: [],
  summary: null,
  recommendations: [],
  notes: [],
  error: null,
  durationMs: null,
  elapsed: 0,
};

export function useAuditStream() {
  const [state, setState] = useState<ReportState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (input: string) => {
      abortRef.current?.abort();
      stopTimer();

      const controller = new AbortController();
      abortRef.current = controller;

      const began = Date.now();
      setState({ ...EMPTY, status: 'running', phaseLabel: 'Starting' });
      timerRef.current = setInterval(() => {
        setState((s) => (s.status === 'running' ? { ...s, elapsed: Date.now() - began } : s));
      }, 100);

      try {
        // fetch + ReadableStream rather than EventSource, so both transports
        // share one code path and errors surface as real rejections.
        let stream: Response;

        if (WORKER) {
          // Standalone worker: create a job, then subscribe to its stream.
          const res = await fetch(`${WORKER}/audit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: input }),
            signal: controller.signal,
          });
          const body = (await res.json()) as { jobId?: string; error?: string };
          if (!res.ok || !body.jobId) {
            stopTimer();
            setState((s) => ({ ...s, status: 'error', error: body.error ?? 'Could not start the audit.' }));
            return;
          }
          stream = await fetch(`${WORKER}/audit/${body.jobId}/stream`, {
            signal: controller.signal,
          });
        } else {
          // In-process route: one request that streams as the audit runs.
          stream = await fetch('/api/audit', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: input }),
            signal: controller.signal,
          });
          if (!stream.ok) {
            const body = (await stream.json().catch(() => ({}))) as { error?: string };
            stopTimer();
            setState((s) => ({ ...s, status: 'error', error: body.error ?? 'Could not start the audit.' }));
            return;
          }
        }

        if (!stream.body) throw new Error('The audit stream could not be opened.');

        const reader = stream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let split: number;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            if (!frame.startsWith('data: ')) continue;

            let event: AuditEvent;
            try {
              event = JSON.parse(frame.slice(6)) as AuditEvent;
            } catch {
              continue;
            }
            setState((s) => reduce(s, event));
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      } finally {
        stopTimer();
        setState((s) => (s.status === 'running' ? { ...s, status: 'done' } : s));
      }
    },
    [stopTimer],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    stopTimer();
    setState(EMPTY);
  }, [stopTimer]);

  return { state, start, reset };
}

function reduce(s: ReportState, e: AuditEvent): ReportState {
  switch (e.type) {
    case 'phase':
      return { ...s, phase: e.phase, phaseLabel: e.label };
    case 'meta':
      return {
        ...s,
        url: e.finalUrl,
        title: e.title,
        targets: e.targets,
        platform: e.platform,
        generator: e.generator,
      };
    case 'checks':
      return { ...s, checks: e.checks, scorecard: e.scorecard };
    case 'shot':
      return {
        ...s,
        shots: [
          ...s.shots.filter((x) => !(x.role === e.role && x.viewport === e.viewport)),
          { role: e.role, viewport: e.viewport, url: e.url, dataUri: e.dataUri },
        ],
      };
    case 'summary':
      return { ...s, summary: e.text };
    case 'rec':
      return s.recommendations.some((r) => r.title === e.recommendation.title)
        ? s
        : { ...s, recommendations: [...s.recommendations, e.recommendation] };
    case 'error':
      return { ...s, status: 'error', error: e.message };
    case 'done':
      return {
        ...s,
        status: s.status === 'error' ? 'error' : 'done',
        durationMs: e.durationMs,
        notes: e.notes,
        elapsed: e.durationMs,
      };
    default:
      return s;
  }
}
