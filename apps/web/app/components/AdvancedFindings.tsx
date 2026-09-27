/**
 * "Advanced Findings": five locked sections that preview what a full,
 * expert-led audit covers. The blurred text describes each area of review;
 * it is deliberately not presented as findings about this store, because
 * the automated audit has not examined these areas.
 */
const SECTIONS = [
  {
    title: 'Checkout flow review',
    body: 'A step-by-step walkthrough of your checkout on mobile and desktop: form fields, delivery and payment choices, error handling, trust cues at the payment step, and where shoppers hesitate or drop out between bag and order confirmation.',
  },
  {
    title: 'Analytics & conversion tracking',
    body: 'Verification that purchases, add-to-cart and checkout events reach your analytics and ad platforms exactly once, with the right values, so the numbers your campaigns optimise against can be trusted.',
  },
  {
    title: 'Product page persuasion',
    body: 'Imagery, copy, size guidance, reviews and delivery promises reviewed against what makes a first-time visitor confident enough to buy, with before-and-after examples for your best-selling products.',
  },
  {
    title: 'Navigation, search & merchandising',
    body: 'How easily shoppers find the right product: menu structure, search results and zero-result handling, filters, collection ordering, and cross-sell placement across the journey.',
  },
  {
    title: 'Prioritised test roadmap',
    body: 'A ranked list of A/B tests and quick wins with expected effort, the metric each one should move, and how long each test needs to run at your traffic level.',
  },
];

export const BOOKING_PATH = '/book';

export function AdvancedFindings() {
  return (
    <section className="rp-section rp-advanced" aria-labelledby="advanced-title">
      <div className="rp-advanced-head">
        <h2 id="advanced-title">Advanced Findings</h2>
        <p className="rp-lede">Five deeper areas our specialists review by hand in a full audit.</p>
      </div>
      <div className="rp-locked-grid">
        {SECTIONS.map((s, i) => (
          <a key={s.title} className="rp-locked" href={BOOKING_PATH} aria-label={`${s.title}: book a full audit to unlock`}>
            <div className="rp-locked-head">
              <span className="rp-locked-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <span className="rp-lock" aria-hidden="true">🔒</span>
            </div>
            <div className="rp-locked-body" aria-hidden="true">
              <p>{s.body}</p>
              <div className="rp-fake-lines"><i /><i /><i /></div>
            </div>
          </a>
        ))}
      </div>
      <div className="rp-unlock-banner">
        <p><span aria-hidden="true">🔒</span> Book a full audit to unlock the details</p>
        <a className="rp-btn" href={BOOKING_PATH}>Book a full audit</a>
      </div>
    </section>
  );
}
