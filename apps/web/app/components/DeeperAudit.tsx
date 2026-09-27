import { BOOKING_PATH } from './AdvancedFindings';

const ROWS: { area: string; shows: string; target: string }[] = [
  {
    area: 'Product discovery',
    shows: 'Whether search, collections, and filters help shoppers find the right products—or send them into dead ends, such as sold-out items left at the top of a collection instead of moving to the end',
    target: '+4–8% relative lift in discovery-to-product-view rate',
  },
  {
    area: 'Product pages',
    shows: 'Which unanswered questions or unclear product details may be stopping an add-to-cart decision',
    target: '+3–7% relative lift in product-view-to-add-to-cart rate',
  },
  {
    area: 'Mobile shopping',
    shows: 'Whether popups, variant selection, layout, or hidden buttons make buying harder on a phone',
    target: '+4–9% relative lift in mobile product-view-to-add-to-cart rate',
  },
  {
    area: 'Ad-to-page experience',
    shows: 'Whether the page delivers what the ad promised, or makes visitors search for it',
    target: '+3–6% relative lift in landing-page-to-product-view rate',
  },
  {
    area: 'Shipping and returns',
    shows: 'Whether delivery costs, timelines, or return terms create uncertainty before checkout',
    target: '+2–5% relative lift in add-to-cart-to-checkout rate',
  },
  {
    area: 'Cart and checkout',
    shows: 'What interrupts shoppers between adding a product and completing an order',
    target: 'A test target set after we identify the specific friction',
  },
];

/** Pitch for the detailed, human-led audit. Targets are illustrative, and labelled as such. */
const PERSONAL: { title: string; text: string }[] = [
  { title: 'Your visitors', text: 'Where they come from (ads, search, social, email), which devices they use, and whether they are new or returning.' },
  { title: 'Your products', text: 'Your price points, the size of your range, and how shoppers choose between your products.' },
  { title: 'Your funnel', text: 'Where your own shoppers hesitate or drop off, read from your analytics rather than averages.' },
  { title: 'Your priorities', text: 'One ranked list of fixes and tests for your store and your team, not a generic checklist.' },
];

export function DeeperAudit({ domain }: { domain?: string }) {
  return (
    <section className="rp-section rp-deeper" aria-labelledby="deeper-title">
      <h2 id="deeper-title">See what a deeper audit could uncover</h2>
      <p className="rp-lede">
        Your instant AI audit spots the obvious issues. A detailed human audit goes further: we follow the same paths your
        shoppers take, find where they hesitate or drop off, and show you what to fix first.
      </p>
      <p className="rp-lede">
        The numbers below are <strong>illustrative test targets</strong>, not promises. Your audit would replace them with
        findings from <em>your</em> store and its funnel data.
      </p>

      <div className="rp-deeper-proof">
        <span className="rp-deeper-proof-badge">Proven across hundreds of stores</span>
        <p>
          The areas below are what we see again and again across the <strong>hundreds of stores we have audited, delivered
          and fixed</strong>. They are where most stores leave sales behind, so they are where we start.
        </p>
      </div>

      <table className="rp-deeper-table">
        <thead>
          <tr>
            <th scope="col">What we investigate</th>
            <th scope="col">What your detailed audit would show</th>
            <th scope="col">Illustrative test target</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.area}>
              <th scope="row" data-label="What we investigate">{r.area}</th>
              <td data-label="What your detailed audit would show">{r.shows}</td>
              <td data-label="Illustrative test target" className="rp-deeper-target">{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rp-deeper-personal">
        <p className="rp-deeper-personal-eyebrow">Then we make it yours</p>
        <h3>Recommendations built around {domain ?? 'your store'} and the people who shop there</h3>
        <p>
          General patterns only get you so far. Your detailed audit turns them into recommendations that fit the kind of
          visitors you receive and the store you run:
        </p>
        <ul>
          {PERSONAL.map((p) => (
            <li key={p.title}><strong>{p.title}</strong>{p.text}</li>
          ))}
        </ul>
      </div>

      <div className="rp-deeper-get">
        <h3>What you get</h3>
        <p>
          Not a generic checklist. You get screenshots of the issues we found, an explanation of why each one matters, a
          priority score, and a practical fix or test for your team to implement. We’ll also show you which funnel metric to
          watch, so you can tell whether a change worked.
        </p>
        <a className="rp-btn" href={BOOKING_PATH}>Get my detailed audit</a>
      </div>

      <p className="rp-deeper-footnote">
        <em>The uplift ranges shown are examples of what we might test for, not predicted or guaranteed results for your store.</em>
      </p>
    </section>
  );
}
