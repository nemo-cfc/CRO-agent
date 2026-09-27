'use client';
import type { ReportState } from '@/lib/report-state';
import { ROLE_LABELS, isPublishableFinding, visibleRecommendations, visibleSummary } from '@cro/shared';
import { Recommendations } from './Recommendations';
import { CompleteAuditPreview } from './CompleteAuditPreview';
import '../report.css';

export default function AuditReport({ state, createdAt, partial }: { state: ReportState; createdAt: string; partial: boolean }) {
  const visible = state.checks.filter(isPublishableFinding);
  const deeper = state.checks.filter(check => !isPublishableFinding(check));
  const recommendations = visibleRecommendations(state.recommendations, state.checks);
  let domain = state.url || 'Your store';
  try { domain = new URL(domain).hostname; } catch {}
  return <div className="mm-report"><div className="mm-watermark" aria-hidden="true">monkeyman</div><main className="mm-sheet">
    <nav className="mm-top"><a className="mm-logo" href="/">monkey<span>man</span></a><span>VISIBLE EXPERIENCE / INSTANT REVIEW</span></nav>
    <header className="mm-cover"><div><div className="mm-eyebrow">A clearer view of the first impression</div><h1>Your store.<br /><em>A closer look.</em></h1><p className="mm-domain">{domain}</p><p className="mm-date">Prepared {new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} by Monkeyman</p></div><div className={`mm-seal ${state.scorecard ? (state.scorecard.overall >= 90 ? 'score-green' : 'score-yellow') : 'score-pending'}`}><span>AUTOMATED DIAGNOSTIC SCORE</span><strong>{state.scorecard?.overall ?? '--'}</strong><small>out of 100</small><p>90–100: green · Below 90: yellow.<br />Includes blurred checks.<br />Not a conversion prediction.</p></div></header>
    <div className="mm-stats"><div><strong>{visible.length}</strong><span>direct observations</span></div><div><strong>{deeper.length}</strong><span>deeper diagnostics</span></div><div><strong>{state.targets.length}</strong><span>pages sampled</span></div></div>
    {partial && <div className="notice">This visit was incomplete. Only eligible observations are shown; incomplete page views do not produce visible findings.</div>}
    <div className="mm-sectionlabel">01 / DIRECTLY OBSERVED</div>
    <p>{visibleSummary(state.checks)}</p>
    {visible.length === 0 && <section className="panel"><h2>A shorter report is the honest result</h2><p>No directly supported visible finding is available in this saved report. Older reports do not contain the new visibility evidence. Start a fresh audit to collect it.</p><a href="/">Run a fresh instant audit</a></section>}
    <Recommendations summary={null} recommendations={recommendations} writing={false} />
    {visible.length > 0 && <section className="panel"><h2>What we observed</h2><p>Each item records a specific element, duplicated loader reference, or confirmed browser request pattern. Suggestions are not proof of lost sales.</p><ol className="recs">{visible.map(check => <li className="rec" key={check.id}><h3>{check.title}</h3><p>{check.detail}</p><p className="fix"><strong>Suggested improvement: </strong>{String(check.evidence.suggestion)}</p><p className="review-note">{ROLE_LABELS[check.scope as keyof typeof ROLE_LABELS] || 'Page'} · {String(check.evidence.viewport)} · <a href={String(check.evidence.url)} target="_blank" rel="noopener noreferrer">View sampled page</a></p></li>)}</ol></section>}
    <div className="mm-sectionlabel">02 / COMPLETE AUDIT PREVIEW</div>
    <CompleteAuditPreview checks={deeper} scorecard={state.scorecard} />
    {state.shots.length > 0 && <section className="panel"><h2>The captured page views</h2><div className="shots">{state.shots.map(shot => <figure className="shot" key={shot.role + shot.viewport}><figcaption>{ROLE_LABELS[shot.role]} / {shot.viewport}</figcaption><div className="mm-shot"><img src={shot.dataUri} alt={ROLE_LABELS[shot.role] + ' on ' + shot.viewport} /><span aria-hidden="true">monkeyman</span></div></figure>)}</div></section>}
    <section className="panel mm-method"><h2>Scope of this instant review</h2><p>We sampled initial page views, not a complete buying journey. A closed cart drawer does not mean the site has no cart drawer. Cart, checkout, payment behavior and analytics configuration require separate verification.</p><p>The visible review prioritizes specific text and interface observations. Ambiguous backgrounds, obscured elements and unstable measurements are withheld. Design suggestions require testing with your users.</p><p>The score retains the automated diagnostics, including the blurred section. It is a provisional indicator, not a verified defect count or an accessibility certification.</p><ul>{state.targets.map(target => <li key={target.url + target.role}><b>{ROLE_LABELS[target.role]}</b> <a href={target.url} target="_blank" rel="noopener noreferrer">{target.url}</a></li>)}</ul></section>
    <footer className="mm-footer"><div className="mm-logo">monkey<span>man</span></div><p>A few clear observations. A useful next step.</p><a href="mailto:hello@monkeyman.agency">hello@monkeyman.agency</a></footer>
  </main></div>;
}
