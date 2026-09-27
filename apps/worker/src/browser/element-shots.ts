import type { Page } from 'playwright-core';

export interface ElementShot {
  key: string;
  dataUri: string;
}

const HIGHLIGHT_ID = '__cro_highlight';

/**
 * Crop a highlighted screenshot of every element `collectFn` tagged with
 * `data-cro-shot`, so a finding like "Shop Now has low contrast" can show the
 * button it is talking about.
 *
 * Runs after the above-fold screenshot, because it scrolls the page. Overlays
 * that would cover the element (pop-ups, cookie banners) are hidden for the
 * crop only; the arrival state is already captured by the page screenshot and
 * reported by the friction checks. Bounded by `budgetMs` so a slow page cannot
 * eat the audit deadline.
 */
export async function captureElementShots(
  page: Page,
  signal: AbortSignal,
  budgetMs = 1800,
): Promise<ElementShot[]> {
  const started = Date.now();
  const count = await page
    .evaluate(() => document.querySelectorAll('[data-cro-shot]').length)
    .catch(() => 0);
  const shots: ElementShot[] = [];

  // A clean first screen: same view as arrival, with pop-ups and consent
  // banners hidden. Findings about the page itself (no sorting, buy button
  // below the fold, no reviews) use this; a picture dominated by a pop-up
  // said nothing about them.
  if (!signal.aborted) {
    // Pop-ups often fade in after load (Klaviyo inserts its layer ~2s in), so
    // hide in several passes and only shoot once a pass finds nothing new.
    const hidePass = () => page
      .evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let count = 0;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          if (el.hasAttribute('data-cro-clean-hidden')) continue;
          const s = getComputedStyle(el);
          if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          const coverage = (Math.max(0, r.width) * Math.max(0, r.height)) / (vw * vh);
          const consent = /cookie|consent|onetrust|gdpr|modal|popup|overlay|dialog|newsletter|klaviyo|kl-private|privy|attentive|justuno|omnisend|wisepops/i.test(`${el.id} ${el.className?.toString() ?? ''}`);
          if (coverage > 0.25 || consent) {
            el.setAttribute('data-cro-clean-hidden', `${el.style.getPropertyValue('opacity')}|${el.style.getPropertyPriority('opacity')}`);
            el.style.setProperty('opacity', '0', 'important');
            count++;
          }
        }
        // Pop-ups often lock page scrolling; that does not change the picture.
        return count;
      })
      .catch(() => 0);
    let hidden = await hidePass();
    for (let pass = 0; pass < 4 && !signal.aborted; pass++) {
      await new Promise((r) => setTimeout(r, 150));
      const more = await hidePass();
      hidden += more;
      if (!more && pass >= 1) break;
    }
    const buf = await page.screenshot({ type: 'jpeg', quality: 65 }).catch(() => null);
    if (buf) shots.push({ key: 'clean', dataUri: `data:image/jpeg;base64,${buf.toString('base64')}` });
    if (hidden) {
      await page
        .evaluate(() => {
          for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-cro-clean-hidden]'))) {
            const [value = '', priority = ''] = (el.getAttribute('data-cro-clean-hidden') ?? '').split('|');
            if (value) el.style.setProperty('opacity', value, priority);
            else el.style.removeProperty('opacity');
            el.removeAttribute('data-cro-clean-hidden');
          }
        })
        .catch(() => {});
    }
  }

  for (let i = 0; i < Math.min(count, 6); i++) {
    if (signal.aborted || Date.now() - started > budgetMs) break;
    try {
      const prepared = await page.evaluate(
        ({ index, highlightId }) => {
          const target = document.querySelectorAll<HTMLElement>('[data-cro-shot]')[index];
          if (!target) return null;
          // Scrolling can trigger collapsing headers and other layout shifts,
          // so only scroll when the element is not already fully on screen.
          const before = target.getBoundingClientRect();
          if (before.top < 0 || before.bottom > window.innerHeight) {
            target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
          }

          // Hide anything fixed/sticky that would sit on top of the element.
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const hidden: HTMLElement[] = [];
          for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
            if (el.contains(target) || target.contains(el)) continue;
            const s = getComputedStyle(el);
            if (s.position !== 'fixed' && s.position !== 'sticky') continue;
            const r = el.getBoundingClientRect();
            const coverage = (Math.max(0, r.width) * Math.max(0, r.height)) / (vw * vh);
            const consent = /cookie|consent|onetrust|gdpr|cmp|modal|popup|overlay|dialog|newsletter|klaviyo|kl-private|privy|attentive|justuno|omnisend|wisepops/i.test(
              `${el.id} ${el.className?.toString() ?? ''}`,
            );
            if (s.position === 'fixed' && (coverage > 0.25 || consent)) {
              hidden.push(el);
              el.setAttribute(
                'data-cro-prev-opacity',
                `${el.style.getPropertyValue('opacity')}|${el.style.getPropertyPriority('opacity')}`,
              );
              // Opacity, not visibility: consent tools force their children visible with !important.
              el.style.setProperty('opacity', '0', 'important');
            }
          }
          (window as unknown as Record<string, unknown>)['__croHidden'] = hidden;
          return {
            keys: (target.getAttribute('data-cro-shot') ?? '').split(' ').filter(Boolean),
            vw,
            vh,
          };
        },
        { index: i, highlightId: HIGHLIGHT_ID },
      );
      if (!prepared || prepared.keys.length === 0) continue;

      // Wait for the element to stop moving (animated headers, lazy images
      // above it), then pin a fixed-position highlight to where it sits now.
      // Measuring once and drawing in document coordinates left the box
      // visibly offset on sites whose header collapses on scroll.
      const rect = await page.evaluate(
        async ({ index, highlightId }) => {
          const target = document.querySelectorAll<HTMLElement>('[data-cro-shot]')[index];
          if (!target) return null;
          let r = target.getBoundingClientRect();
          for (let n = 0; n < 12; n++) {
            await new Promise((done) => setTimeout(done, 80));
            const next = target.getBoundingClientRect();
            const still = Math.abs(next.top - r.top) < 0.5 && Math.abs(next.left - r.left) < 0.5 &&
              Math.abs(next.height - r.height) < 0.5;
            r = next;
            if (still && n >= 1) break;
          }
          const pad = 6;
          const box = document.createElement('div');
          box.id = highlightId;
          Object.assign(box.style, {
            position: 'fixed',
            left: `${r.left - pad}px`,
            top: `${r.top - pad}px`,
            width: `${r.width + pad * 2}px`,
            height: `${r.height + pad * 2}px`,
            border: '3px solid #ff2d55',
            borderRadius: '6px',
            boxShadow: '0 0 0 4px rgba(255,45,85,.25)',
            zIndex: '2147483647',
            pointerEvents: 'none',
          });
          document.body.appendChild(box);
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        },
        { index: i, highlightId: HIGHLIGHT_ID },
      );
      if (!rect) continue;

      // The element plus surrounding context. On wide viewports, crop around
      // the element horizontally too, or a small button is lost in 1440px.
      const margin = 90;
      const { vw, vh } = prepared;
      const width = Math.min(vw, Math.max(560, Math.ceil(rect.width + 360)));
      const x = Math.max(0, Math.min(vw - width, Math.floor(rect.left + rect.width / 2 - width / 2)));
      const y = Math.max(0, Math.floor(rect.top - margin));
      const height = Math.min(vh - y, Math.max(160, Math.ceil(rect.height + margin * 2)));
      if (height <= 0) continue;
      const buf = await page
        .screenshot({ type: 'jpeg', quality: 65, clip: { x, y, width, height } })
        .catch(() => null);
      if (buf) {
        const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
        for (const key of prepared.keys) shots.push({ key, dataUri });
      }
    } catch {
      // A detached or moved element is not worth failing the page over.
    } finally {
      await page
        .evaluate((highlightId) => {
          document.getElementById(highlightId)?.remove();
          const hidden = ((window as unknown as Record<string, unknown>)['__croHidden'] ?? []) as HTMLElement[];
          for (const el of hidden) {
            const [value = '', priority = ''] = (el.getAttribute('data-cro-prev-opacity') ?? '').split('|');
            if (value) el.style.setProperty('opacity', value, priority);
            else el.style.removeProperty('opacity');
            el.removeAttribute('data-cro-prev-opacity');
          }
        }, HIGHLIGHT_ID)
        .catch(() => {});
    }
  }
  return shots;
}
