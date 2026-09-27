import type { Check } from '@cro/shared';
import type { Shot } from '@/lib/report-state';

const ROLE: Record<string, string> = { home: 'Homepage', keypage: 'Key page', collection: 'Collection page', product: 'Product page' };

/**
 * The picture behind a finding: a highlighted crop of the exact element that
 * was measured, or the above-fold view of the page when the finding is about
 * the page as a whole.
 */
export function CheckShot({ check, shots }: { check: Check; shots: Shot[] }) {
  const shot = check.shot;
  if (!shot) return null;
  const src =
    shot.kind === 'element'
      ? shot.dataUri
      : shots.find((s) => s.role === shot.role && s.viewport === shot.viewport)?.dataUri;
  if (!src) return null;
  return (
    <figure className="check-shot">
      <img src={src} alt={`${shot.caption} (${ROLE[shot.role] ?? shot.role}, ${shot.viewport})`} />
      <figcaption>
        {shot.caption} · {ROLE[shot.role] ?? shot.role} · {shot.viewport}
        {shot.kind === 'element' && shot.highlighted !== false ? ' · highlighted in red' : ''}
      </figcaption>
    </figure>
  );
}
