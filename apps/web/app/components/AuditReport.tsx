'use client';
import type { Check } from '@cro/shared';
import {
  COHORT_LABELS, ROLE_LABELS, SECTION_LABELS,
  cohortOf, combinedOpportunity, displayTitle, opportunityLevel,
  opportunityScore, plainLanguage, sectionOf, type BusinessImpact, type Cohort, type PageSection,
} from '@cro/shared';
import type { ReportState } from '@/lib/report-state';
import { CheckShot } from './CheckShot';
import { AdvancedFindings, BOOKING_PATH } from './AdvancedFindings';
import { DeeperAudit } from './DeeperAudit';
import '../report.css';

/** Share of each page section's opportunities whose fix is locked. */
const LOCKED_SHARE = 0.2;
const SECTIONS: PageSection[] = ['home', 'collection', 'product'];

type Item = { check: Check; score: number; locked: boolean };

function levelTone(score: number) {
  const level = opportunityLevel(score);
  return level === 'High' ? 'high' : level === 'Moderate' ? 'mid' : 'low';
}

function OpportunityRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={`rp-ring opp-${levelTone(score)}`} role="img" aria-label={`Conversion opportunity score ${score} out of 100`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="rp-ring-track" />
        <circle cx="60" cy="60" r={r} className="rp-ring-value" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div><strong>{score}</strong><span>/ 100</span></div>
    </div>
  );
}

function ScoreBadge({ score, highlight }: { score: number; highlight?: boolean }) {
  return (
    <span className={`rp-opp opp-${levelTone(score)}${highlight ? ' rp-opp-hl' : ''}`} title="Opportunity score: how much fixing this could help, relative to other items">
      <small>Opportunity</small> {score}
    </span>
  );
}

function ImpactBlock({ impact }: { impact: BusinessImpact }) {
  const metric = impact.metric ? impact.metric.charAt(0).toUpperCase() + impact.metric.slice(1) : null;
  return (
    <div className="rp-impact">
      <p className="rp-impact-label">Business impact</p>
      <ul className="rp-impact-points">
        <li><strong>What changes</strong>{impact.statement}</li>
        {impact.checkout && <li><strong>Checkout impact</strong>{impact.checkout}</li>}
      </ul>
      {impact.range ? (
        <div className="rp-impact-target">
          <strong>{impact.range}</strong>
          <span>
            relative lift in {impact.metric}
            <small>Illustrative test target · {impact.area}</small>
          </span>
        </div>
      ) : impact.contributes ? (
        <div className="rp-impact-target is-plain">
          <span>{metric}<small>Contributes to the {impact.area} target; not expected to reach it on its own</small></span>
        </div>
      ) : impact.area ? (
        <div className="rp-impact-target is-plain">
          <span>{metric}<small>Test target set in your detailed audit · {impact.area}</small></span>
        </div>
      ) : metric ? (
        <div className="rp-impact-target is-plain">
          <span>{metric}<small>Metric this fix should improve</small></span>
        </div>
      ) : null}
    </div>
  );
}

function OpportunityCard({ item, shots, repeatShot }: { item: Item; shots: ReportState['shots']; repeatShot: boolean }) {
  const { check, score, locked } = item;
  const text = plainLanguage(check);
  return (
    <article className={`rp-op${locked ? ' is-locked' : ''}`} id={`op-${check.id}`}>
      <div className="rp-op-head">
        <h4>{displayTitle(check)}</h4>
        <ScoreBadge score={score} highlight={locked} />
      </div>
      <p className="rp-op-found">{text.found}</p>
      {text.why && <p className="rp-op-why"><strong>Why it matters</strong>{text.why}</p>}
      {text.impact.statement && <ImpactBlock impact={text.impact} />}
      {text.fix && (
        locked ? (
          <div className="rp-op-fix rp-fix-locked">
            <div className="rp-fix-blur" aria-hidden="true"><strong>How to fix</strong>{text.fix}</div>
            <a className="rp-fix-unlock" href={BOOKING_PATH}>
              <span aria-hidden="true">🔒</span> Book a full audit to unlock this fix
              <ScoreBadge score={score} highlight />
            </a>
          </div>
        ) : (
          <p className="rp-op-fix"><strong>How to fix</strong>{text.fix}</p>
        )
      )}
      {repeatShot ? <p className="rp-shot-repeat">See the screenshot above.</p> : <CheckShot check={check} shots={shots} />}
    </article>
  );
}

export default function AuditReport({ state, createdAt, partial }: { state: ReportState; createdAt: string; partial: boolean }) {
  let domain = state.url || 'your store';
  try { domain = new URL(domain).hostname.replace(/^www\./, ''); } catch {}
  const date = new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Only shortcomings: flagged checks, scored and sorted by opportunity.
  const flagged = state.checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .map((check) => ({ check, score: opportunityScore(check) }))
    .sort((a, b) => b.score - a.score);

  // Per page section; the top ~20% of each section have their fix locked.
  const bySection = SECTIONS.map((section) => {
    const own = flagged.filter((f) => sectionOf(f.check) === section);
    const lockedCount = own.length ? Math.ceil(own.length * LOCKED_SHARE) : 0;
    const items: Item[] = own.map((f, i) => ({ ...f, locked: i < lockedCount }));
    const cohorts = new Map<Cohort, Item[]>();
    for (const item of items) {
      const key = cohortOf(item.check);
      cohorts.set(key, [...(cohorts.get(key) ?? []), item]);
    }
    const cohortList = [...cohorts.entries()]
      .map(([cohort, list]) => ({ cohort, items: list, score: combinedOpportunity(list.map((i) => i.score)) }))
      .sort((a, b) => b.score - a.score);
    return { section, items, cohorts: cohortList, score: combinedOpportunity(items.map((i) => i.score)) };
  }).filter((s) => s.items.length > 0);

  const overall = combinedOpportunity(flagged.map((f) => f.score), 5);
  const top = flagged.slice(0, 3);
  const cohortCount = bySection.reduce((s, sec) => s + sec.cohorts.length, 0);

  // Show each picture once: neighbouring findings often share a screenshot.
  const shownShots = new Set<string>();
  const isRepeat = (c: Check) => {
    if (!c.shot) return false;
    const key = c.shot.dataUri ? c.shot.dataUri.slice(-80) : `${c.shot.role}-${c.shot.viewport}`;
    if (shownShots.has(key)) return true;
    shownShots.add(key);
    return false;
  };

  return (
    <div className="rp">
      <header className="rp-bar">
        <a className="rp-logo" href="/">monkey<span>man</span></a>
        <span className="rp-bar-title">Conversion audit · {domain}</span>
      </header>

      <main className="rp-sheet">
        <section className="rp-hero">
          <div className="rp-hero-text">
            <p className="rp-eyebrow">Conversion opportunity report</p>
            <h1>{domain}</h1>
            <p className="rp-meta">Prepared {date} by Monkeyman · we checked {state.targets.length} page{state.targets.length === 1 ? '' : 's'} on a phone and a computer</p>
            <ul className="rp-pages">
              {state.targets.map((t) => (
                <li key={t.url}><span>{ROLE_LABELS[t.role]}</span><a href={t.url} target="_blank" rel="noopener noreferrer">{t.url.replace(/^https?:\/\/(www\.)?/, '')}</a></li>
              ))}
            </ul>
          </div>
          <div className="rp-hero-score">
            <OpportunityRing score={overall} />
            <p className={`rp-verdict opp-${levelTone(overall)}`}>{opportunityLevel(overall)} opportunity</p>
            <p className="rp-hero-note">{flagged.length} things to improve, in {cohortCount} groups. A higher score means more room to win extra sales.</p>
          </div>
        </section>

        {partial && <div className="rp-notice">Part of this visit did not finish in time, so a few items could not be checked.</div>}

        {top.length > 0 && (
          <section className="rp-section">
            <h2>Your biggest opportunities</h2>
            <ol className="rp-top">
              {top.map((f, i) => (
                <li key={f.check.id}>
                  <a href={`#op-${f.check.id}`}>
                    <span className="rp-top-num">{i + 1}</span>
                    <span className="rp-top-title">{displayTitle(f.check)}<small>{SECTION_LABELS[sectionOf(f.check)]}</small></span>
                    <ScoreBadge score={f.score} />
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}

        {bySection.map((sec) => (
          <section key={sec.section} className="rp-section rp-page" id={`page-${sec.section}`}>
            <div className="rp-page-head">
              <h2>{SECTION_LABELS[sec.section]}</h2>
              <ScoreBadge score={sec.score} />
            </div>
            {sec.cohorts.map((co) => (
              <div key={co.cohort} className="rp-cohort">
                <div className="rp-cohort-head">
                  <h3>{COHORT_LABELS[co.cohort]}</h3>
                  <span className="rp-cohort-meta">{co.items.length} item{co.items.length === 1 ? '' : 's'}</span>
                  <ScoreBadge score={co.score} />
                </div>
                {co.items.map((item) => <OpportunityCard key={item.check.id} item={item} shots={state.shots} repeatShot={isRepeat(item.check)} />)}
              </div>
            ))}
          </section>
        ))}

        {flagged.length === 0 && (
          <section className="rp-section"><h2>No shortcomings found</h2><p className="rp-lede">Nothing we checked needs fixing right now.</p></section>
        )}

        <AdvancedFindings />

        <DeeperAudit domain={domain} />

        <section className="rp-section rp-method">
          <h2>How this report works</h2>
          <p>We visited your {state.targets.length === 1 ? 'page' : 'homepage, a collection page and a product page'} with an automated browser on a phone-sized and a computer screen, and on the product page we added one item to the bag to see what a shopper gets back (no order is placed, and your analytics are not affected). Only things worth improving are listed. Each has an opportunity score from 0 to 100: an estimate of how much fixing it could help compared with the other items, not a sales forecast. The test targets under each business impact are illustrative ranges we commonly test for in that area, not predicted or guaranteed results for your store.</p>
        </section>
      </main>
    </div>
  );
}
