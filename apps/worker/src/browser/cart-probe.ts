import type { Page } from 'playwright-core';
import type { CartProbe } from '@cro/shared';

/**
 * Tracking and ad endpoints. While the probe taps "Add to bag", requests to
 * these are aborted so the audit does not plant fake AddToCart events in the
 * store's analytics. Page-view tracking from the initial load has already
 * happened, exactly as for every other audited page.
 */
const TRACKING =
  /google-analytics\.com|analytics\.google\.com|googletagmanager\.com|googleadservices\.com|doubleclick\.net|google\.com\/(ccm|pagead)|facebook\.com\/tr|connect\.facebook\.net|analytics\.tiktok\.com|ct\.pinterest\.com|tr\.snapchat\.com|bat\.bing\.com|klaviyo\.com|monorail-edge\.shopifysvc\.com|\/monorail\/|\/api\/collect|px\.ads\.linkedin\.com|analytics\.twitter\.com|api\.segment\.io|mixpanel\.com|amplitude\.com|clarity\.ms|hotjar\.com|attentivemobile\.com|criteo\.|amazon-adsystem\.com|rudderstack|heapanalytics\.com/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tag the product's own buy button with `data-cro-buy`. First in page order,
 * outside header/nav/footer, sticky bars and recommendation carousels (whose
 * "Add to Cart" buttons sit further down the page). Before a size is chosen
 * many themes label it "Select a size", so that counts too.
 * Evaluated in the page: must not reference anything outside itself.
 */
const tagBuyButton = () => {
  const BUY = /add to (cart|bag|basket)|buy (it )?now|^add$|select (a |your )?(size|option|variant)|choose (a )?(size|option)/i;
  const RECS = '[class*="recommend" i], [id*="recommend" i], [class*="upsell" i], [class*="related" i], [class*="complete-the-look" i], [class*="cross-sell" i], [class*="carousel" i], [class*="slider" i], [class*="swiper" i]';
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const inFixed = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true;
    return false;
  };
  const label = (el: HTMLElement) => ((el.innerText || el.getAttribute('aria-label') || (el as HTMLInputElement).value || '')).replace(/\s+/g, ' ').trim();
  document.querySelectorAll('[data-cro-buy]').forEach((e) => e.removeAttribute('data-cro-buy'));
  const all = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]')).filter(
    (b) => visible(b) && getComputedStyle(b).pointerEvents !== 'none' && BUY.test(label(b)) &&
      !b.closest('header, nav, footer') && !b.closest('[aria-hidden="true"]'),
  );
  // When the only buy button is in a sticky bar, that is the one shoppers use.
  const main = all.find((b) => !inFixed(b) && !b.closest(RECS)) ?? all.find((b) => !inFixed(b)) ?? all.find((b) => inFixed(b));
  if (!main) return null;
  main.setAttribute('data-cro-buy', '');
  // A sticky twin ("Select a size" in a bottom bar) often opens the size picker.
  const sticky = all.find((b) => inFixed(b));
  if (sticky) sticky.setAttribute('data-cro-buy-sticky', '');
  return label(main).slice(0, 60);
};

/**
 * Choose one option in each option group near the buy button. Handles radio
 * inputs, role="radio" items and plain button groups (e.g. size buttons).
 * `indices[g]` < 0 means "use the structured-data hint, else the first
 * available option"; otherwise it picks the n-th available option.
 */
const chooseOptions = ({ indices, hint }: { indices: number[] | null; hint: string[] }) => {
  const READY = /add to (cart|bag|basket)|buy (it )?now|^add\b/i;
  const UNAVAILABLE = /waitlist|sold ?out|unavailable|out of stock|notify me/i;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none';
  };
  const label = (el: HTMLElement) =>
    `${el.getAttribute('aria-label') ?? ''} ${el.innerText ?? el.textContent ?? ''} ${(el as HTMLInputElement).value ?? ''}`.replace(/\s+/g, ' ').trim();
  const buy = document.querySelector<HTMLElement>('[data-cro-buy]');
  if (!buy) return { found: false, ready: false, buttonText: null, groupSizes: [] as number[], picked: [] as string[] };
  const isReady = () =>
    !(buy as HTMLButtonElement).disabled && buy.getAttribute('aria-disabled') !== 'true' && READY.test((buy.innerText || buy.getAttribute('aria-label') || '').trim());

  const optionLike = (el: HTMLElement) => {
    if (el === buy || buy.contains(el) || el.contains(buy)) return false;
    const t = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
    const aria = el.getAttribute('aria-label') ?? '';
    if (/quantity|increase|decrease|wishlist|share|close|guide|chart/i.test(`${aria} ${t}`) || /^[+\-−–]$/.test(t)) return false;
    return el.getAttribute('role') === 'radio' || (el as HTMLInputElement).type === 'radio' ||
      /size|colou?r|option|variant|width|length|fit|style/i.test(aria) || (t.length > 0 && t.replace(UNAVAILABLE, '').trim().length <= 8);
  };
  const candidatesIn = (root: Element) =>
    Array.from(root.querySelectorAll<HTMLElement>('[role="radio"], input[type="radio"], button, [role="option"]')).filter(
      (el) => (el.tagName === 'INPUT' ? visible(el.closest('label') ?? el.parentElement ?? el) : visible(el)) && optionLike(el),
    );
  // Option groups live near the buy button; if none are there (the picker is
  // a separate panel), fall back to any visible drawer or dialog.
  let scope: HTMLElement | null = buy.parentElement;
  for (let d = 0; d < 8 && scope && candidatesIn(scope).length < 2; d++) scope = scope.parentElement;
  let options = scope ? candidatesIn(scope) : [];
  if (options.length < 2) {
    const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], body *')).filter((el) => {
      const s = getComputedStyle(el);
      return (s.position === 'fixed' || el.getAttribute('role') === 'dialog') && visible(el) && el.getBoundingClientRect().height > innerHeight * 0.25;
    });
    options = panels.flatMap(candidatesIn);
  }
  const byParent = new Map<Element, HTMLElement[]>();
  for (const o of options) {
    const key = o.closest('[role="radiogroup"], fieldset') ?? o.parentElement?.closest('ul, ol') ?? o.parentElement ?? o;
    byParent.set(key, [...(byParent.get(key) ?? []), o]);
  }
  const groups = Array.from(byParent.values()).filter((g) => g.length >= 2);
  const selects = scope ? Array.from(scope.querySelectorAll<HTMLSelectElement>('select')).filter((s) => visible(s) && s.options.length > 1) : [];

  const checked = (r: HTMLElement) =>
    (r as HTMLInputElement).checked || ['aria-checked', 'aria-pressed', 'aria-selected'].some((a) => r.getAttribute(a) === 'true') ||
    /(^|\s|-)(selected|is-selected|active|is-active|checked)(\s|$)|--selected|--active/i.test(r.className.toString());
  const disabled = (r: HTMLElement) =>
    (r as HTMLInputElement).disabled || r.getAttribute('aria-disabled') === 'true' || UNAVAILABLE.test(label(r)) ||
    /disabled|unavailable|sold-?out|crossed|out-of-stock/i.test(r.className.toString());
  const optionText = (r: HTMLElement) => {
    const own = r.tagName === 'INPUT' ? (r.closest('label')?.innerText ?? (r as HTMLInputElement).value) : r.innerText;
    return (own ?? '').replace(UNAVAILABLE, '').replace(/\s+/g, ' ').trim();
  };
  const click = (r: HTMLElement) => ((r.tagName === 'INPUT' ? (r.closest('label') ?? r) : r) as HTMLElement).click();

  const picked: string[] = [];
  groups.forEach((g, gi) => {
    const eligible = g.filter((r) => !disabled(r));
    if (!eligible.length) return;
    const want = indices?.[gi] ?? -1;
    let choice: HTMLElement | undefined;
    if (want < 0) {
      if (g.some(checked)) return; // already chosen by the theme
      choice = eligible.find((r) => hint.some((t) => optionText(r).toLowerCase() === t.toLowerCase())) ?? eligible[0];
    } else {
      choice = eligible[want % eligible.length];
    }
    if (choice && !checked(choice)) click(choice);
    if (choice) picked.push(optionText(choice) || label(choice));
  });
  for (const s of selects) {
    const current = s.options[s.selectedIndex];
    if (current && current.value && !current.disabled) continue;
    const option = Array.from(s.options).find((o) => o.value && !o.disabled && !UNAVAILABLE.test(o.text));
    if (!option) continue;
    s.value = option.value;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
    picked.push(option.text.trim());
  }
  return {
    found: true,
    ready: isReady(),
    buttonText: (buy.innerText || buy.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    groupSizes: groups.map((g) => g.filter((r) => !disabled(r)).length),
    picked,
  };
};

/**
 * What appeared after the tap: a drawer or cart page (inspected for what it
 * offers), or a smaller confirmation such as "1 item · View your cart".
 * Only layers that were NOT already visible and interactive before the tap
 * count; themes often reuse an empty, click-through layer for the drawer.
 */
const inspectBag = (startUrl: string) => {
  const CART = /checkout|subtotal|my bag|your bag|shopping bag|your cart|shopping cart|basket|cart \(\d+\)/i;
  const TOAST = /added to (your )?(cart|bag|basket)|item added|view (your )?(cart|bag)|\b\d+ items?\b.*(cart|bag)|(cart|bag).*\b\d+ items?\b/i;
  const w = window as unknown as { __croBefore?: Set<Element> };
  const shown = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return Number(s.opacity) > 0.5 && s.visibility !== 'hidden' && s.pointerEvents !== 'none' && r.width > 0 && r.height > 0;
  };
  const onPage = /\/cart\/?(\?|$)/.test(location.pathname) && location.href !== startUrl;
  let container: Element | null = onPage ? document.querySelector('main') ?? document.body : null;
  if (!container) {
    const candidates = Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (w.__croBefore?.has(el)) return false;
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && el.getAttribute('role') !== 'dialog' && el.getAttribute('aria-modal') !== 'true') return false;
      const r = el.getBoundingClientRect();
      const onScreen = r.left >= -2 && r.right <= innerWidth + 2 && r.top >= -2 && r.bottom <= innerHeight + 2;
      return onScreen && r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.4 && shown(el) && CART.test((el as HTMLElement).innerText ?? '');
    });
    container = candidates.find((c) => !candidates.some((o) => o !== c && o.contains(c))) ?? null;
  }
  if (!container) {
    const fresh = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((el) => {
      if (w.__croBefore?.has(el) || !shown(el)) return false;
      const t = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
      const r = el.getBoundingClientRect();
      return t.length > 3 && t.length < 160 && TOAST.test(t) && r.top < innerHeight && r.bottom > 0 && el.children.length < 12;
    });
    // Prefer an explicit message ("Added to cart", "View your cart") over a
    // header counter that merely changed.
    const toast = fresh.find((el) => /added|view (your )?(cart|bag)/i.test(el.innerText ?? '') && !el.closest('header')) ?? fresh[0];
    if (!toast) return null;
    return {
      kind: 'toast' as const,
      text: (toast.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      hasCheckout: /check ?out/i.test(toast.innerText ?? ''),
      checkoutText: null,
      hasContinueShopping: false,
      hasRecommendations: false,
      hasFreeShippingMessage: false,
      hasExpressPay: false,
    };
  }
  container.setAttribute('data-cro-bag', '');
  const text = ((container as HTMLElement).innerText ?? container.textContent ?? '').replace(/\s+/g, ' ');
  const CONTROL = 'a, button, input[type="submit"], input[type="button"], [role="button"]';
  const labelOf = (el: HTMLElement) => `${el.innerText ?? ''} ${el.getAttribute('aria-label') ?? ''} ${(el as HTMLInputElement).value ?? ''}`;
  // Checkout apps (e.g. Allbirds' "Checkout+") render their buttons inside
  // open shadow roots, which querySelectorAll does not enter.
  const deepAll = (root: ParentNode, selector: string): HTMLElement[] => {
    const found = Array.from(root.querySelectorAll<HTMLElement>(selector));
    for (const host of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      if (host.shadowRoot) found.push(...deepAll(host.shadowRoot, selector));
    }
    return found;
  };
  const controls = deepAll(container, CONTROL).filter((el) => el.getBoundingClientRect().width > 0);
  const ctl = (re: RegExp) => controls.find((el) => re.test(labelOf(el)));
  // Many drawers are built from two fixed layers (item list + footer with
  // the checkout button), so also accept a checkout control that appeared
  // on screen with the drawer but sits outside the panel we picked.
  // Some themes build the checkout "button" from a plain <div>/<span> with a
  // click handler (Ruggable's "GO TO CHECKOUT"), so a short element whose
  // own text starts with checkout wording counts too. Informational lines
  // such as "Secure Checkout · SSL" do not start that way and are skipped.
  const CHECKOUT_START = /^\s*(go to |proceed to |continue to )?check ?out\b/i;
  const textual = (root: ParentNode) =>
    deepAll(root, 'div, span, p, a, button').find((el) => {
      const t = (el.innerText ?? '').replace(/\s+/g, ' ').trim();
      return t.length > 0 && t.length <= 40 && CHECKOUT_START.test(t) && shown(el) && !w.__croBefore?.has(el);
    });
  const checkout = ctl(/check ?out/i) ?? textual(container) ?? (onPage ? undefined : Array.from(document.querySelectorAll<HTMLElement>(CONTROL)).find((el) => {
    if (w.__croBefore?.has(el) || !shown(el)) return false;
    const r = el.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0 && /check ?out/i.test(labelOf(el));
  }));
  const productLinks = new Set(
    Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/products/"]')).map((a) => a.pathname),
  );
  return {
    kind: onPage ? 'page' as const : 'drawer' as const,
    text: text.slice(0, 400),
    hasCheckout: !!checkout,
    checkoutText: checkout ? (checkout.innerText || (checkout as HTMLInputElement).value || checkout.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40) : null,
    hasContinueShopping: !!ctl(/continue shopping|keep shopping|shop more|back to (shop|store)|continue browsing/i),
    hasRecommendations: productLinks.size >= 2 || /you may also like|complete the look|recommended|pairs well|frequently bought|you might like|goes well with/i.test(text),
    hasFreeShippingMessage: /free (shipping|delivery)|away from free|spend .{1,12} more/i.test(text),
    hasExpressPay: /shop ?pay|apple ?pay|google ?pay|g ?pay|paypal|amazon ?pay/i.test(text) ||
      !!container.querySelector('[class*="express" i], shopify-accelerated-checkout, [aria-label*="pay" i]'),
  };
};

/**
 * Tap the product page's buy button once and record what the shopper gets
 * back: a drawer, a cart page, a confirmation message, or nothing.
 *
 * Runs in the audit's throwaway browser context, which is closed right after,
 * so nothing persists. Never goes further than the bag: no checkout, no forms.
 */
export async function probeCart(page: Page, signal: AbortSignal, budgetMs = 6000): Promise<{ probe: CartProbe; shot: string | null }> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  let blocked = 0;
  const result = (probe: Omit<CartProbe, 'ms' | 'trackingBlocked'>, shot: string | null = null) => ({ probe: { ...probe, ms: elapsed(), trackingBlocked: blocked }, shot });
  const empty = {
    selections: [] as string[], buttonText: null, kind: 'none' as const, hasCheckout: false, checkoutText: null,
    hasContinueShopping: false, hasRecommendations: false, hasFreeShippingMessage: false, hasExpressPay: false,
  };

  await page.route(TRACKING, (route) => { blocked++; return route.abort(); }).catch(() => {});
  try {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })).catch(() => {});
    const initialLabel = await page.evaluate(tagBuyButton).catch(() => null);
    const retag = async () => {
      const tagged = await page.evaluate(() => !!document.querySelector('[data-cro-buy]')).catch(() => false);
      if (!tagged) await page.evaluate(tagBuyButton).catch(() => null);
    };
    if (!initialLabel) return result({ ...empty, status: 'failed', reason: 'No add-to-bag button was recognised on the product page.' });

    // Structured data names an in-stock variant ("36 C", "Clay"), which
    // usually picks a buyable combination on the first try.
    const hint = await page.evaluate(() => {
      for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const found: string[][] = [];
          const walk = (o: unknown): void => {
            if (Array.isArray(o)) return o.forEach(walk);
            if (!o || typeof o !== 'object') return;
            const rec = o as Record<string, unknown>;
            const offers = rec['offers'] as Record<string, unknown> | undefined;
            const avail = String(offers?.['availability'] ?? '');
            if (rec['@type'] === 'Product' && /InStock/i.test(avail)) {
              found.push([rec['size'], rec['color']].filter((v) => typeof v === 'string').join(' ').split(/[\s/|]+/).filter(Boolean));
            }
            Object.values(rec).forEach(walk);
          };
          walk(JSON.parse(node.textContent ?? ''));
          if (found.length) return found[0]!;
        } catch { /* malformed JSON-LD */ }
      }
      return [] as string[];
    }).catch(() => [] as string[]);

    // Try combinations odometer-style until the buy button turns into an
    // active "Add to bag".
    let indices: number[] | null = null;
    let state = { found: true, ready: false, buttonText: initialLabel as string | null, groupSizes: [] as number[], picked: [] as string[] };
    let openedPicker = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (signal.aborted || elapsed() > budgetMs * 0.6) break;
      // Themes often re-render the buy button when an option is chosen,
      // which drops our tag; find it again before every step.
      await retag();
      state = await page.evaluate(chooseOptions, { indices, hint });
      if (!state.found) break;
      await sleep(400);
      await retag();
      state.ready = await page
        .evaluate(() => {
          const b = document.querySelector<HTMLElement>('[data-cro-buy]');
          return !!b && !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true' &&
            /add to (cart|bag|basket)|buy (it )?now|^add\b/i.test((b.innerText || b.getAttribute('aria-label') || '').trim());
        })
        .catch(() => false);
      if (state.ready) break;
      if (!state.groupSizes.length) {
        // No options next to the button: the picker may open from the
        // (sticky) "Select a size" button. Try that once.
        if (openedPicker) break;
        openedPicker = true;
        await page.evaluate(() => {
          const b = document.querySelector<HTMLElement>('[data-cro-buy-sticky]') ?? document.querySelector<HTMLElement>('[data-cro-buy]');
          b?.click();
        }).catch(() => {});
        await sleep(600);
        continue;
      }
      // Next combination: advance the last group first, like an odometer.
      const sizes = state.groupSizes;
      const next: number[] = indices ?? sizes.map(() => 0);
      let g = sizes.length - 1;
      while (g >= 0) {
        next[g] = (next[g] ?? 0) + 1;
        if (next[g]! < sizes[g]!) break;
        next[g] = 0;
        g--;
      }
      indices = next;
      if (g < 0) break;
    }

    if (!state.found) return result({ ...empty, status: 'failed', reason: 'The add-to-bag button disappeared while options were being chosen.' });
    if (!state.ready) {
      return result({ ...empty, selections: state.picked, buttonText: state.buttonText, status: 'failed', reason: 'Could not find an in-stock option combination that enabled the add-to-bag button.' });
    }

    // Remember what a shopper could already see and use, so a pre-existing
    // pop-up is not mistaken for the bag. Empty click-through layers are left
    // out on purpose: themes often turn one into the drawer.
    const before = await page.evaluate(() => {
      const w = window as unknown as { __croBefore?: Set<Element> };
      w.__croBefore = new Set(
        Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight &&
            Number(s.opacity) > 0.1 && s.visibility !== 'hidden' && s.pointerEvents !== 'none' && (el.innerText ?? '').trim().length > 0;
        }),
      );
      return location.href;
    });

    await retag();
    const buttonText = await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('[data-cro-buy]');
      if (!b) return null;
      // Read the label before tapping: many buttons switch to "Adding...".
      const text = (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      b.click();
      return text;
    });
    if (!buttonText) return result({ ...empty, selections: state.picked, status: 'failed', reason: 'The add-to-bag button disappeared before it could be tapped.' });

    // Wait for a drawer, a cart page or a confirmation message.
    type Found = NonNullable<ReturnType<typeof inspectBag>>;
    let found: Found | null = null;
    // Cart apps (Rebuy, Slide Cart...) take 1.5-3s to open the drawer; give the
    // drawer its own 5s window regardless of time spent choosing options.
    const deadline = elapsed() + 5000;
    while (!found && elapsed() < deadline && !signal.aborted) {
      await sleep(200);
      found = await page.evaluate(inspectBag, before).catch(() => null);
    }

    if (!found) {
      return result({ ...empty, selections: state.picked, buttonText, status: 'no-feedback', reason: 'No bag drawer, cart page or confirmation message appeared within 5 seconds of tapping the button.' });
    }
    if (found.kind !== 'toast') {
      // Let the drawer finish loading: themes often render it first with a
      // placeholder total ("₹0 - Checkout") while the cart request completes.
      // An empty drawer shell can sit unchanged for a moment before its items
      // and buttons arrive, so "stable" only counts once a checkout control
      // is present (or the settle window runs out).
      const settleUntil = Math.min(budgetMs + 1500, elapsed() + 2500);
      let stable = 0;
      while (elapsed() < settleUntil && !signal.aborted && stable < 2) {
        await sleep(250);
        const again: Found | null = await page.evaluate(inspectBag, before).catch(() => null);
        if (!again || again.kind === 'toast') break;
        const loading = !again.hasCheckout || (!!again.checkoutText && /(^|[^\d.,])0([.,]00)?\b/.test(again.checkoutText));
        stable = !loading && again.checkoutText === found.checkoutText && again.text === found.text ? stable + 1 : 0;
        found = again;
      }
    }

    // Pop-ups that were already open (country selector, cookie banner) would
    // otherwise sit on top of the drawer in the picture.
    await page
      .evaluate(() => {
        const w = window as unknown as { __croBefore?: Set<Element> };
        const bag = document.querySelector('[data-cro-bag]');
        for (const el of w.__croBefore ?? []) {
          if (!(el instanceof HTMLElement) || (bag && (el.contains(bag) || bag.contains(el)))) continue;
          if (getComputedStyle(el).position !== 'fixed') continue;
          const r = el.getBoundingClientRect();
          const big = (r.width * r.height) / (innerWidth * innerHeight) > 0.2;
          if (big || /cookie|consent|onetrust|modal|popup|overlay|dialog/i.test(`${el.id} ${el.className?.toString() ?? ''}`)) {
            el.style.setProperty('opacity', '0', 'important');
          }
        }
      })
      .catch(() => {});
    await sleep(150);
    // Read the bag one last time at the moment of the picture, so the checks
    // describe exactly what the screenshot shows.
    if (found.kind !== 'toast') {
      const last: Found | null = await page.evaluate(inspectBag, before).catch(() => null);
      if (last && last.kind === found.kind) found = last;
    }
    // Checkout apps (Allbirds' "Checkout+") can render the checkout button in
    // a cross-origin iframe, which page scripts cannot read. Playwright can:
    // look inside visible frames that sit on screen with the drawer.
    if (found.kind === 'drawer' && !found.hasCheckout) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const box = await (await frame.frameElement().catch(() => null))?.boundingBox().catch(() => null);
        if (!box || box.width < 80 || box.height < 20 || box.y > 844 || box.y + box.height < 0) continue;
        const label = await frame
          .evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').match(/(go to |proceed to )?check ?out[^|]{0,30}(\|\s*[^\s]+)?/i)?.[0] ?? null)
          .catch(() => null);
        if (label) {
          found = { ...found, hasCheckout: true, checkoutText: label.trim().slice(0, 40) };
          break;
        }
      }
    }
    const buf = await page.screenshot({ type: 'jpeg', quality: 65 }).catch(() => null);
    return result(
      {
        status: 'opened',
        reason: found.kind === 'toast' ? found.text : null,
        selections: state.picked,
        buttonText,
        kind: found.kind,
        hasCheckout: found.hasCheckout,
        checkoutText: found.checkoutText,
        hasContinueShopping: found.hasContinueShopping,
        hasRecommendations: found.hasRecommendations,
        hasFreeShippingMessage: found.hasFreeShippingMessage,
        hasExpressPay: found.hasExpressPay,
      },
      buf ? `data:image/jpeg;base64,${buf.toString('base64')}` : null,
    );
  } catch (err) {
    return result({ ...empty, status: 'failed', reason: (err instanceof Error ? err.message : String(err)).slice(0, 200) });
  } finally {
    await page.unroute(TRACKING).catch(() => {});
  }
}
