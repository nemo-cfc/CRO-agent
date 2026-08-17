/**
 * The benchmark corpus. Chosen to span the shapes that break a 30s budget in
 * different ways, not to be a fair sample of the web:
 *
 *  - heavy CMS pages with dozens of plugins and unoptimised media
 *  - client-rendered SPAs where DOM content arrives long after the HTML
 *  - e-commerce with third-party tag soup
 *  - sites behind a CDN challenge, where navigation may never "settle"
 *  - fast static sites, as the floor
 *
 * Override with a comma-separated list: `npm run bench -- --sites a.com,b.com`
 */
export interface BenchSite {
  url: string;
  shape: string;
}

export const SITES: BenchSite[] = [
  // Stores audit three pages instead of two, so they are the worst case for
  // the budget and belong in the corpus rather than being tested by hand.
  { url: 'https://discoverpilgrim.com', shape: 'shopify, image-heavy' },
  { url: 'https://www.allbirds.com', shape: 'shopify, spa-ish' },
  { url: 'https://therayog.com', shape: 'wordpress, image-heavy' },
  { url: 'https://vercel.com', shape: 'next.js, marketing' },
  { url: 'https://stripe.com', shape: 'spa, heavy js' },
  { url: 'https://www.shopify.com', shape: 'ecommerce marketing' },
  { url: 'https://news.ycombinator.com', shape: 'minimal static' },
  { url: 'https://wordpress.org', shape: 'cms, large' },
  { url: 'https://basecamp.com', shape: 'classic marketing' },
  { url: 'https://linear.app', shape: 'spa, animation-heavy' },
  { url: 'https://www.notion.com', shape: 'spa, heavy' },
  { url: 'https://tailwindcss.com', shape: 'docs, static' },
  { url: 'https://www.squarespace.com', shape: 'site-builder marketing' },
  { url: 'https://ghost.org', shape: 'cms marketing' },
  { url: 'https://www.cloudflare.com', shape: 'enterprise, cdn' },
  { url: 'https://astro.build', shape: 'static, fast' },
  { url: 'https://www.hubspot.com', shape: 'martech, tag soup' },
];
