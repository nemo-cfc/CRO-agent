'use client';

import type { Phase } from '@cro/shared';

const STEPS: { phase: Phase; label: string }[] = [
  { phase: 'fetching', label: 'Reading page' },
  { phase: 'rendering', label: 'Rendering' },
  { phase: 'scoring', label: 'Scoring' },
  { phase: 'writing', label: 'Writing' },
  { phase: 'done', label: 'Done' },
];

export function ProgressRail({
  phase,
  elapsed,
  running,
}: {
  phase: Phase | null;
  elapsed: number;
  running: boolean;
}) {
  const current = STEPS.findIndex((s) => s.phase === phase);
  const seconds = (elapsed / 1000).toFixed(1);

  return (
    <div className="rail">
      {STEPS.map((step, i) => {
        const cls = i === current ? 'active' : i < current ? 'past' : '';
        return (
          <div className={`step ${cls}`} key={step.phase}>
            <span className="dot" />
            {step.label}
          </div>
        );
      })}
      <span className={`timer ${elapsed > 30_000 ? 'over' : ''}`}>
        {seconds}s{running ? '' : ' total'}
      </span>
    </div>
  );
}
