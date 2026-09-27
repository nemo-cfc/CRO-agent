import type { Check, Scorecard as ScorecardType } from '@cro/shared';
import { Scorecard } from './Scorecard';
import { PerformancePanel } from './PerformancePanel';

export function CompleteAuditPreview({ checks, scorecard }: { checks: Check[]; scorecard: ScorecardType | null }) {
  const booking = process.env.NEXT_PUBLIC_ZOHO_CALENDAR_URL || 'mailto:hello@monkeyman.agency?subject=Book%20a%20complete%20CRO%20audit';
  return <section className="panel complete-audit">
    <h2>Complete audit · deeper review</h2>
    <p>{checks.length} automated diagnostics are retained in this report. Applicable scored checks still contribute to the diagnostic score; their details are blurred in this preview.</p>
    <div className="diagnostic-preview" aria-hidden="true" inert>
      {scorecard && <Scorecard scorecard={scorecard} />}
      <PerformancePanel checks={checks} />
      {checks.map(check => <div key={check.id} className="diagnostic-row"><strong>{check.title}</strong><p>{check.detail}</p></div>)}
    </div>
    <div className="complete-audit-booking">
      <h3>Go beyond the first screen</h3>
      <p>Book a complete review of cart and checkout interactions, product decisions, and technical findings. Those checks need further verification; this preview does not imply that a full expert review has already been completed.</p>
      <a className="complete-audit-link" href={booking}>Book a complete CRO audit</a>
      <p className="review-note">Booking requests a review. It does not automatically unlock or certify the automated diagnostics.</p>
    </div>
  </section>;
}
