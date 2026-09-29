import type { AuditEvent, AuditTarget, Check, PageRole, Phase, Platform, Recommendation, Scorecard, Viewport } from '@cro/shared';
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
  /** Whole-page section screenshots of the product page, for verification. */
  sections?: { role: PageRole; url: string; shots: { index: number; y: number; dataUri: string }[] }[];
  summary: string | null;
  recommendations: Recommendation[];
  notes: string[];
  error: string | null;
  durationMs: number | null;
  /** Wall-clock ms since submit, for the live timer. */
  elapsed: number;
}

export const EMPTY: ReportState = {
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

export function reduce(s: ReportState, e: AuditEvent): ReportState {
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
    case 'sections':
      return {
        ...s,
        sections: [...(s.sections ?? []).filter((x) => x.url !== e.url), { role: e.role, url: e.url, shots: e.shots }],
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
