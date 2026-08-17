/**
 * The entire DOM scan, as one function evaluated in the page.
 *
 * This is deliberately one `page.evaluate` rather than thirty `page.$eval`
 * calls: each round trip costs a CDP hop, and the difference between one
 * evaluate (~50ms) and thirty (~2s) is a tenth of the whole audit budget.
 *
 * Everything here runs in browser context — no imports, no closures over
 * Node scope. The return value is structured-cloned back.
 */
export function collectFn(): CollectResult {
  /* ---------------------------------------------------------------- *
   * helpers
   * ---------------------------------------------------------------- */

  const VW = window.innerWidth;
  const VH = window.innerHeight;

  const visible = (el: Element): boolean => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const text = (el: Element | null): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const parseColor = (c: string): [number, number, number, number] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m || !m[1]) return null;
    const p = m[1].split(',').map((x) => Number.parseFloat(x.trim()));
    if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null;
    return [p[0]!, p[1]!, p[2]!, p[3] === undefined ? 1 : p[3]];
  };

  /** Walk ancestors until an opaque background is found; default to white. */
  const effectiveBg = (el: Element): [number, number, number] => {
    let node: Element | null = el;
    while (node) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0.5) return [c[0], c[1], c[2]];
      node = node.parentElement;
    }
    return [255, 255, 255];
  };

  const relLum = (rgb: [number, number, number]): number => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };

  const contrastRatio = (el: Element): number | null => {
    const fg = parseColor(getComputedStyle(el).color);
    if (!fg) return null;
    const bg = effectiveBg(el);
    const l1 = relLum([fg[0], fg[1], fg[2]]);
    const l2 = relLum(bg);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  const rx = (words: string[]) => new RegExp(`\\b(${words.join('|')})\\b`, 'i');

  const ACTION_VERBS = rx([
    'get', 'start', 'book', 'buy', 'try', 'join', 'sign\\s?up', 'subscribe',
    'download', 'request', 'contact', 'call', 'schedule', 'shop', 'order',
    'apply', 'claim', 'reserve', 'enroll', 'register', 'checkout', 'add to cart',
    'talk to', 'speak to', 'find out', 'see plans', 'view pricing',
  ]);

  const GENERIC_CTA = rx([
    'submit', 'click here', 'read more', 'learn more', 'continue', 'next',
    'go', 'here', 'more', 'ok', 'send', 'enter',
  ]);

  /* ---------------------------------------------------------------- *
   * CTAs
   * ---------------------------------------------------------------- */

  const ctaNodes = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a, button, input[type="submit"], input[type="button"], [role="button"]',
    ),
  ).filter(visible);

  const ctas = ctaNodes
    .map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const label =
        text(el) ||
        el.getAttribute('aria-label') ||
        (el as HTMLInputElement).value ||
        '';

      // Prominence: how much this looks like a *primary* action rather than
      // a nav item or an inline text link.
      let prominence = 0;
      if (ACTION_VERBS.test(label)) prominence += 3;
      const bg = parseColor(s.backgroundColor);
      if (bg && bg[3] > 0.1) prominence += 2;
      if (Number.parseFloat(s.borderRadius) > 2) prominence += 1;
      if (Number.parseFloat(s.paddingLeft) >= 12) prominence += 1;
      if (Number.parseFloat(s.fontSize) >= 16) prominence += 1;
      if (s.fontWeight === 'bold' || Number(s.fontWeight) >= 600) prominence += 1;
      if (r.top < VH) prominence += 2;
      if (el.closest('nav, header nav, footer')) prominence -= 3;
      if (GENERIC_CTA.test(label) && !ACTION_VERBS.test(label)) prominence -= 1;

      return {
        text: label.slice(0, 80),
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href'),
        aboveFold: r.top < VH && r.top + r.height > 0,
        width: Math.round(r.width),
        height: Math.round(r.height),
        contrast: contrastRatio(el),
        prominence,
      };
    })
    .filter((c) => c.text.length > 0)
    .sort((a, b) => b.prominence - a.prominence)
    .slice(0, 25);

  /* ---------------------------------------------------------------- *
   * Forms
   * ---------------------------------------------------------------- */

  const formEls = Array.from(document.querySelectorAll('form')).filter(visible);

  const describeForm = (form: HTMLFormElement) => {
    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea',
      ),
    ).filter((i) => {
      const t = (i as HTMLInputElement).type;
      return t !== 'hidden' && t !== 'submit' && t !== 'button' && visible(i);
    });

    const labelled = inputs.filter((i) => {
      if (i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')) return true;
      if (i.closest('label')) return true;
      if (i.id && form.querySelector(`label[for="${CSS.escape(i.id)}"]`)) return true;
      return false;
    });

    const submit = form.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], button:not([type])',
    );

    return {
      fields: inputs.length,
      requiredFields: inputs.filter((i) => i.hasAttribute('required')).length,
      unlabelledFields: inputs.length - labelled.length,
      fieldsWithAutocomplete: inputs.filter((i) => {
        const a = i.getAttribute('autocomplete');
        return !!a && a !== 'off';
      }).length,
      submitText:
        text(submit) || (submit as HTMLInputElement | null)?.value || null,
      hasCaptcha: !!form.querySelector(
        '.g-recaptcha, [class*="recaptcha"], [class*="hcaptcha"], [class*="turnstile"], iframe[src*="recaptcha"]',
      ),
      inputTypes: Array.from(
        new Set(
          inputs.map((i) =>
            i.tagName === 'INPUT' ? (i as HTMLInputElement).type || 'text' : i.tagName.toLowerCase(),
          ),
        ),
      ),
    };
  };

  // The "primary" form is the one a visitor is most likely meant to fill in:
  // the one with the most visible fields. Search boxes lose to lead forms.
  const primaryForm =
    formEls.length > 0
      ? formEls
          .map(describeForm)
          .sort((a, b) => b.fields - a.fields)
          .find((f) => f.fields > 0) ?? null
      : null;

  /* ---------------------------------------------------------------- *
   * Performance
   * ---------------------------------------------------------------- */

  const perfState = (window as unknown as { __croPerf?: { lcp: number | null; cls: number; longTasks: number; longTaskMs: number } }).__croPerf;
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

  const bytesFor = (types: string[]) =>
    resources
      .filter((r) => types.includes(r.initiatorType))
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);

  // Classifying images by initiatorType alone misses every background-image,
  // which arrives as initiatorType "css" — and on image-heavy sites those are
  // usually the largest files on the page. Fall back to the extension.
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?|#|$)/i;
  const imageBytes = resources
    .filter(
      (r) =>
        r.initiatorType === 'img' || r.initiatorType === 'image' || IMAGE_EXT.test(r.name),
    )
    .reduce((sum, r) => sum + (r.transferSize || 0), 0);

  const imgs = Array.from(document.querySelectorAll('img')).filter(visible);
  const missingDims = imgs.filter((i) => {
    if (i.hasAttribute('width') && i.hasAttribute('height')) return false;
    const s = getComputedStyle(i);
    if (s.aspectRatio && s.aspectRatio !== 'auto') return false;
    return true;
  }).length;

  // Chrome exposes renderBlockingStatus on resource entries; fall back to a
  // DOM count of head stylesheets and sync scripts where it is absent.
  const rbFromEntries = resources.filter(
    (r) => (r as PerformanceResourceTiming & { renderBlockingStatus?: string }).renderBlockingStatus === 'blocking',
  ).length;
  const rbFromDom =
    document.querySelectorAll('head link[rel="stylesheet"]:not([media="print"])').length +
    document.querySelectorAll('head script[src]:not([async]):not([defer]):not([type="module"])').length;

  /* ---------------------------------------------------------------- *
   * Trust markers
   * ---------------------------------------------------------------- */

  // Two different views of the page text, because they answer different questions.
  //
  // `allText` is everything, used for presence tests (is there a phone number?
  // how often does jargon appear?) where block boundaries are irrelevant.
  //
  // `prose` joins block-level elements with newlines, because `textContent`
  // on <body> welds them together with no separator — a nav menu, a heading
  // and three buttons become one 60-word "sentence", which destroys any
  // readability metric computed from it.
  const allText = text(document.body).slice(0, 200_000);

  const BLOCK_SEL = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, dd, figcaption';
  const prose = Array.from(document.querySelectorAll(BLOCK_SEL))
    .filter((el) => !el.querySelector(BLOCK_SEL) && visible(el))
    .map((el) => text(el))
    .filter((t) => t.length > 0)
    .join('\n')
    .slice(0, 200_000);

  const anchors = Array.from(document.querySelectorAll('a')).filter(visible);
  const anchorMatch = (re: RegExp) =>
    anchors.some((a) => re.test(text(a)) || re.test(a.getAttribute('href') ?? ''));

  const testimonialBlocks = document.querySelectorAll(
    'blockquote, [class*="testimonial" i], [class*="review" i], [id*="testimonial" i], [class*="quote" i]',
  ).length;

  const logoStrip = Array.from(document.querySelectorAll('div, section, ul')).some((c) => {
    const inner = c.querySelectorAll('img');
    if (inner.length < 3) return false;
    return Array.from(inner).some((i) =>
      /logo|brand|partner|client|featured|as-seen/i.test(
        `${i.getAttribute('alt') ?? ''} ${i.getAttribute('src') ?? ''} ${i.className}`,
      ),
    );
  });

  const badgeImages = Array.from(document.querySelectorAll('img')).filter((i) =>
    /secure|ssl|trust|guarantee|verified|certified|norton|mcafee|stripe|paypal|badge|award/i.test(
      `${i.getAttribute('alt') ?? ''} ${i.getAttribute('src') ?? ''}`,
    ),
  ).length;

  /* ---------------------------------------------------------------- *
   * Mobile ergonomics
   * ---------------------------------------------------------------- */

  const scrollW = Math.max(
    document.documentElement.scrollWidth,
    document.body?.scrollWidth ?? 0,
  );
  const overflowPx = Math.max(0, scrollW - VW);

  const smallTextNodes = Array.from(document.querySelectorAll('p, li, span, div, a, td'))
    .filter((el) => {
      if (!el.firstChild || el.firstChild.nodeType !== Node.TEXT_NODE) return false;
      const t = text(el);
      if (t.length < 12) return false;
      return Number.parseFloat(getComputedStyle(el).fontSize) < 12;
    }).length;

  // Only button-like targets are judged: an inline text link inside a
  // paragraph is legitimately small and flagging it would be noise.
  const tapTargets = ctaNodes
    .filter((el) => {
      if (el.tagName !== 'A') return true;
      if (el.closest('p, li')) return false;
      const s = getComputedStyle(el);
      return s.display !== 'inline';
    })
    .slice(0, 150)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);

  const tinyTapTargets = tapTargets.filter((r) => r.width < 44 || r.height < 44).length;

  let crowdedTapTargets = 0;
  for (let i = 0; i < tapTargets.length; i++) {
    for (let j = i + 1; j < tapTargets.length; j++) {
      const a = tapTargets[i]!;
      const b = tapTargets[j]!;
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
      if (dx < 8 && dy < 8) crowdedTapTargets++;
    }
  }

  const stickyCta = Array.from(document.querySelectorAll<HTMLElement>('*')).some((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') return false;
    const r = el.getBoundingClientRect();
    if (r.bottom < VH * 0.6) return false;
    if (!visible(el)) return false;
    return !!el.querySelector('a, button') && ACTION_VERBS.test(text(el));
  });

  /* ---------------------------------------------------------------- *
   * Friction: overlays, dialogs, widgets
   * ---------------------------------------------------------------- */

  const CHAT_RE =
    /intercom|drift|crisp|tawk|zendesk|hubspot-messages|livechat|freshchat|tidio|olark|helpscout|chatway/i;

  const overlayCandidates = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(
    (el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      if (Number.parseInt(s.zIndex, 10) < 100) return false;
      return visible(el);
    },
  );

  let largestOverlayCoverage = 0;
  let blockingOverlays = 0;
  for (const el of overlayCandidates.slice(0, 300)) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, VW) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, VH) - Math.max(r.top, 0));
    const coverage = (w * h) / (VW * VH);
    if (coverage > largestOverlayCoverage) largestOverlayCoverage = coverage;
    if (coverage > 0.2) blockingOverlays++;
  }

  const openDialogs = Array.from(
    document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]'),
  ).filter(visible).length;

  const cookieBanner = overlayCandidates.some((el) =>
    /cookie|consent|gdpr|privacy preference/i.test(text(el).slice(0, 400)),
  );

  const chatEl = Array.from(document.querySelectorAll<HTMLElement>('iframe, div, button')).find(
    (el) =>
      CHAT_RE.test(`${el.id} ${el.className} ${el.getAttribute('src') ?? ''} ${el.getAttribute('title') ?? ''}`) &&
      visible(el),
  );

  const topCta = ctaNodes.find((el) => {
    const r = el.getBoundingClientRect();
    return r.top < VH;
  });

  let widgetObscuresCta = false;
  if (chatEl && topCta) {
    const a = chatEl.getBoundingClientRect();
    const b = topCta.getBoundingClientRect();
    widgetObscuresCta = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  /* ---------------------------------------------------------------- *
   * Tracking (DOM globals — the static track cross-checks script srcs)
   * ---------------------------------------------------------------- */

  const w = window as unknown as Record<string, unknown>;
  const tracking = {
    ga4: typeof w['gtag'] === 'function' || Array.isArray(w['dataLayer']),
    gtm: Array.isArray(w['dataLayer']) && !!document.querySelector('script[src*="googletagmanager"]'),
    metaPixel: typeof w['fbq'] === 'function',
    clarity: typeof w['clarity'] === 'function',
    hotjar: typeof w['hj'] === 'function',
    hubspot: Array.isArray(w['_hsq']),
    segment: typeof w['analytics'] === 'object' && w['analytics'] !== null,
    plausible: typeof w['plausible'] === 'function',
    other: [] as string[],
  };

  /* ---------------------------------------------------------------- *
   * Copy
   * ---------------------------------------------------------------- */

  const h1El = document.querySelector('h1');
  const h1 = text(h1El) || null;

  const heroCopy =
    Array.from(document.querySelectorAll('p'))
      .filter((p) => {
        const r = p.getBoundingClientRect();
        return r.top < VH && text(p).length > 40 && visible(p);
      })
      .map((p) => text(p))[0] ?? null;

  const words = prose.split(/\s+/).filter((x) => x.length > 0);
  // Density metrics count hits over `allText`, so their denominator must be
  // `allText` too — dividing an allText hit count by a prose word count
  // silently inflates the ratio.
  const allWordCount = allText.split(/\s+/).filter((x) => x.length > 0).length;
  // A block boundary ends a sentence even without punctuation — headings and
  // list items rarely carry a full stop but are still discrete units.
  const sentences = prose
    .split(/[.!?]+[\s\n]+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);

  const syllables = (word: string): number => {
    const w2 = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w2.length <= 3) return 1;
    const groups = w2.replace(/(?:es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
    return groups ? groups.length : 1;
  };

  let readingEase: number | null = null;
  let avgSentenceWords: number | null = null;
  if (words.length > 50 && sentences.length > 2) {
    const sample = words.slice(0, 2000);
    const totalSyll = sample.reduce((s, x) => s + syllables(x), 0);
    avgSentenceWords = Math.round((words.length / sentences.length) * 10) / 10;
    readingEase =
      Math.round(
        (206.835 - 1.015 * avgSentenceWords - 84.6 * (totalSyll / sample.length)) * 10,
      ) / 10;
  }

  const countHits = (re: RegExp) => (allText.match(re) ?? []).length;

  const BENEFIT = /\b(you|your|save|grow|faster|easier|without|free|guarantee|results?|stop|avoid|more|less|proven)\b/gi;
  const FEATURE = /\b(feature|powered|built|platform|technolog\w*|integration|api|solution|architecture|module|engine|suite)\b/gi;
  const JARGON = /\b(leverage|synerg\w*|holistic|robust|seamless|cutting-edge|best-in-class|world-class|innovative|paradigm|ecosystem|empower|streamline|revolutioni\w*|disrupt\w*|next-generation|state-of-the-art|turnkey|scalable|bespoke|curated|unlock)\b/gi;

  /* ---------------------------------------------------------------- *
   * Shopping signals
   *
   * Gathered on every page; the rule engine decides which of them mean
   * anything for the role the page was loaded as.
   * ---------------------------------------------------------------- */

  const CURRENCY = /(?:[$£€¥₹]|\bRs\.?|\bUSD|\bEUR|\bGBP|\bINR)\s?\d[\d.,]*/;
  const ADD_TO_CART = /add to (cart|bag|basket)|buy (it )?now|add to my|shop now — buy/i;

  /**
   * Currency strings that are not the product's price.
   *
   * A first pass took the first element containing a currency amount and
   * happily reported a store's price as "Spend $100 more to earn free
   * shipping!" — a promo bar that happens to sit above the product. Anything
   * with this phrasing is marketing, not the price.
   */
  // Words that never appear in a price display but are common in the promo
  // bars that sit near one. "free shipping" alone was not enough — it missed
  // "Free ground shipping on orders over $100"; matching on `shipping`,
  // `order` and `over` independently covers the variants.
  const PROMO =
    /\b(spend|save|earn|off|shipping|delivery|orders?|over|under|more|discount|coupon|code|was|rrp|starting|minimum|threshold|reward|gift|when you)\b/i;

  /** The authoritative price, when the page publishes structured data. */
  const structuredPrice = (): string | null => {
    for (const node of Array.from(
      document.querySelectorAll<HTMLElement>('script[type="application/ld+json"]'),
    )) {
      const m = node.textContent?.match(/"price"\s*:\s*"?([\d.,]+)"?/);
      if (m?.[1]) return m[1];
    }
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[property="product:price:amount"], meta[itemprop="price"]',
    );
    return meta?.content ?? null;
  };

  const declared = structuredPrice();

  const priceCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[itemprop="price"], [data-price], [class*="price" i], [class*="Price"], .money, span, p, strong, b, div',
    ),
  ).filter((el) => {
    if (!visible(el)) return false;
    const t = text(el);
    // The price element is a short string that is mostly the number itself;
    // a paragraph containing a price is prose, not a price display.
    if (t.length === 0 || t.length > 40) return false;
    if (!CURRENCY.test(t)) return false;
    if (PROMO.test(t)) return false;
    // Leaf-ish only, so a wrapper does not win over the element that renders it.
    return el.querySelectorAll('*').length <= 2;
  });

  // Prefer the element showing the price the page itself declared, then an
  // element explicitly marked up as a price, then the first plausible one.
  const priceNode =
    (declared
      ? priceCandidates.find((el) => text(el).replace(/[^\d.,]/g, '').includes(declared.replace(/[^\d.,]/g, '')))
      : null) ??
    priceCandidates.find(
      (el) => el.hasAttribute('itemprop') || el.hasAttribute('data-price') || /price|money/i.test(el.className?.toString() ?? ''),
    ) ??
    priceCandidates[0] ??
    null;

  const priceRect = priceNode?.getBoundingClientRect();

  const cartBtn = ctaNodes.find((el) => {
    const label = text(el) || el.getAttribute('aria-label') || (el as HTMLInputElement).value || '';
    return ADD_TO_CART.test(label);
  });
  const cartRect = cartBtn?.getBoundingClientRect();

  // Variant pickers: a select, or a group of swatch/size buttons. Counted as
  // groups rather than options, since "3 choices to make" is the friction.
  const variantGroups =
    document.querySelectorAll('select[name*="option" i], select[id*="option" i], select[name*="variant" i]').length +
    Array.from(
      document.querySelectorAll('[class*="swatch" i], [class*="variant" i], [class*="option" i]'),
    ).filter((el) => visible(el) && el.querySelectorAll('input, button, label').length >= 2).length;

  const stockMatch = allTextForCommerce().match(
    /\b(in stock|out of stock|sold out|only \d+ left|low stock|back ?order|pre-?order)\b/i,
  );

  const galleryImages = Array.from(
    document.querySelectorAll('[class*="gallery" i] img, [class*="product" i] img, [class*="media" i] img'),
  ).filter(visible).length;

  const reviewWidget = !!document.querySelector(
    '[class*="review" i], [class*="rating" i], [class*="stars" i], [data-reviews], [id*="judgeme" i], [class*="yotpo" i], [class*="stamped" i], [class*="okendo" i], [class*="loox" i]',
  );

  const ratingMatch = allTextForCommerce().match(
    /(\d(?:\.\d)?)\s*(?:out of\s*5|\/\s*5|stars?)|(\d[\d,]*)\s*(?:reviews?|ratings?)/i,
  );

  // One representative link per product.
  const productLinks = new Map<string, HTMLAnchorElement>();
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = a.getAttribute('href') ?? '';
    if (!/\/products?\//i.test(href) || !visible(a)) continue;
    if (!productLinks.has(href)) productLinks.set(href, a);
  }

  /**
   * Whether a product tile shows its price, determined structurally rather
   * than by guessing class names.
   *
   * Matching on `[class*="card"]`/`[class*="tile"]` looked reasonable and was
   * wrong: it reported "0 of 13 tiles show a price" on a store whose grid
   * plainly shows prices, because that theme uses none of those words. Walking
   * up from the link until the ancestor covers more than one product finds the
   * tile boundary whatever it happens to be called.
   */
  const tilesWithPrice = Array.from(productLinks.values()).filter((a) => {
    let node: HTMLElement | null = a;
    for (let depth = 0; depth < 6 && node; depth++) {
      node = node.parentElement;
      if (!node) break;
      const hrefs = new Set(
        Array.from(node.querySelectorAll<HTMLAnchorElement>('a[href]'))
          .map((l) => l.getAttribute('href') ?? '')
          .filter((h) => /\/products?\//i.test(h)),
      );
      // Left this tile and entered the grid — stop before every product
      // inherits every other product's price.
      if (hrefs.size > 1) break;
      if (CURRENCY.test(text(node))) return true;
    }
    return false;
  }).length;



  const hasFilters = !!document.querySelector(
    '[class*="filter" i], [class*="facet" i], [id*="filter" i], [aria-label*="filter" i], details[class*="filter" i]',
  );
  const hasSort = !!document.querySelector(
    'select[class*="sort" i], select[name*="sort" i], [class*="sort-by" i], [aria-label*="sort" i]',
  );

  const paymentIcons = Array.from(document.querySelectorAll('img, svg')).filter((el) =>
    /visa|mastercard|amex|paypal|klarna|afterpay|clearpay|gpay|google-?pay|apple-?pay|shop-?pay|upi|razorpay|stripe/i.test(
      `${el.getAttribute('alt') ?? ''} ${el.getAttribute('src') ?? ''} ${el.className?.toString() ?? ''} ${el.getAttribute('aria-label') ?? ''}`,
    ),
  ).length;

  function allTextForCommerce(): string {
    return allText;
  }

  const ecommerce = {
    priceVisible: !!priceNode,
    priceAboveFold: !!priceRect && priceRect.top < VH && priceRect.bottom > 0,
    priceText: priceNode ? text(priceNode).slice(0, 60) : null,
    addToCartText: cartBtn ? (text(cartBtn) || cartBtn.getAttribute('aria-label') || '').slice(0, 60) : null,
    addToCartAboveFold: !!cartRect && cartRect.top < VH && cartRect.bottom > 0,
    addToCartWidth: cartRect ? Math.round(cartRect.width) : 0,
    addToCartHeight: cartRect ? Math.round(cartRect.height) : 0,
    variantGroups,
    stockText: stockMatch ? stockMatch[0] : null,
    galleryImages,
    reviewWidget,
    ratingText: ratingMatch ? ratingMatch[0].slice(0, 40) : null,
    shippingInfo: /\b(free shipping|free delivery|ships? (in|within|today)|delivery by|dispatch)\b/i.test(allText),
    returnsInfo: /\b(returns?|refunds?|exchanges?|money[- ]back)\b/i.test(allText),
    paymentIcons,
    productTiles: productLinks.size,
    tilesWithPrice,
    hasFilters,
    hasSort,
    cartLink: !!document.querySelector('a[href*="/cart" i], [class*="cart" i][href], [aria-label*="cart" i]'),
    // A search *trigger* counts as search being available. Most mobile themes
    // render an icon that opens an overlay, so there is no input in the DOM
    // until it is tapped — reporting "no search box" there is wrong.
    searchBox:
      !!document.querySelector(
        'input[type="search"], input[name*="search" i], input[placeholder*="search" i], [role="search"]',
      ) ||
      Array.from(document.querySelectorAll<HTMLElement>('button, a, [aria-label]')).some(
        (el) =>
          visible(el) &&
          /^\s*search\b|search/i.test(
            `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.getAttribute('href') ?? ''}`,
          ),
      ),
  };

  /* ---------------------------------------------------------------- *
   * Result
   * ---------------------------------------------------------------- */

  return {
    ctas,
    ctasAboveFold: ctas.filter((c) => c.aboveFold).length,
    form: primaryForm,
    formCount: formEls.length,
    perf: {
      lcp: perfState?.lcp ?? null,
      cls: perfState ? Math.round(perfState.cls * 1000) / 1000 : null,
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      longTasks: perfState?.longTasks ?? 0,
      longTaskMs: Math.round(perfState?.longTaskMs ?? 0),
      resourceCount: resources.length,
      imageBytes,
      scriptBytes: bytesFor(['script']),
      totalBytes: resources.reduce((s, r) => s + (r.transferSize || 0), 0),
      imagesMissingDimensions: missingDims,
      imagesWithoutAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
      renderBlockingResources: rbFromEntries > 0 ? rbFromEntries : rbFromDom,
    },
    trust: {
      testimonialBlocks,
      reviewSchema: /"@type"\s*:\s*"(Review|AggregateRating|Product)"/.test(
        document.documentElement.innerHTML.slice(0, 500_000),
      ),
      logoStrip,
      badgeImages,
      hasPrivacyLink: anchorMatch(/privacy/i),
      hasTermsLink: anchorMatch(/terms|conditions/i),
      hasContactLink: anchorMatch(/contact/i),
      hasAboutLink: anchorMatch(/about/i),
      hasPhone: !!document.querySelector('a[href^="tel:"]') || /\+?\d[\d\s().-]{8,}\d/.test(allText),
      hasEmail: !!document.querySelector('a[href^="mailto:"]'),
      hasSocialLinks: anchorMatch(/facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok/i),
    },
    mobile: {
      horizontalOverflow: overflowPx > 2,
      overflowPx,
      smallTextNodes,
      tinyTapTargets,
      crowdedTapTargets,
      stickyCta,
    },
    friction: {
      blockingOverlays,
      largestOverlayCoverage: Math.round(largestOverlayCoverage * 100) / 100,
      openDialogs,
      cookieBanner,
      chatWidget: !!chatEl,
      widgetObscuresCta,
    },
    tracking,
    copy: {
      h1,
      h1Count: document.querySelectorAll('h1').length,
      h2Count: document.querySelectorAll('h2').length,
      heroCopy: heroCopy ? heroCopy.slice(0, 300) : null,
      wordCount: allWordCount,
      readingEase,
      avgSentenceWords,
      benefitHits: countHits(BENEFIT),
      featureHits: countHits(FEATURE),
      jargonHits: countHits(JARGON),
      headlineHasNumber: h1 ? /\d/.test(h1) : false,
    },
    ecommerce,
  };
}

/** Shape returned by {@link collectFn}. Mirrors the evidence sub-schemas. */
export interface CollectResult {
  ctas: {
    text: string;
    tag: string;
    href: string | null;
    aboveFold: boolean;
    width: number;
    height: number;
    contrast: number | null;
    prominence: number;
  }[];
  ctasAboveFold: number;
  form: {
    fields: number;
    requiredFields: number;
    unlabelledFields: number;
    fieldsWithAutocomplete: number;
    submitText: string | null;
    hasCaptcha: boolean;
    inputTypes: string[];
  } | null;
  formCount: number;
  perf: {
    lcp: number | null;
    cls: number | null;
    ttfb: number | null;
    domContentLoaded: number | null;
    longTasks: number;
    longTaskMs: number;
    resourceCount: number;
    imageBytes: number;
    scriptBytes: number;
    totalBytes: number;
    imagesMissingDimensions: number;
    imagesWithoutAlt: number;
    renderBlockingResources: number;
  };
  trust: {
    testimonialBlocks: number;
    reviewSchema: boolean;
    logoStrip: boolean;
    badgeImages: number;
    hasPrivacyLink: boolean;
    hasTermsLink: boolean;
    hasContactLink: boolean;
    hasAboutLink: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
    hasSocialLinks: boolean;
  };
  mobile: {
    horizontalOverflow: boolean;
    overflowPx: number;
    smallTextNodes: number;
    tinyTapTargets: number;
    crowdedTapTargets: number;
    stickyCta: boolean;
  };
  friction: {
    blockingOverlays: number;
    largestOverlayCoverage: number;
    openDialogs: number;
    cookieBanner: boolean;
    chatWidget: boolean;
    widgetObscuresCta: boolean;
  };
  tracking: {
    ga4: boolean;
    gtm: boolean;
    metaPixel: boolean;
    clarity: boolean;
    hotjar: boolean;
    hubspot: boolean;
    segment: boolean;
    plausible: boolean;
    other: string[];
  };
  copy: {
    h1: string | null;
    h1Count: number;
    h2Count: number;
    heroCopy: string | null;
    wordCount: number;
    readingEase: number | null;
    avgSentenceWords: number | null;
    benefitHits: number;
    featureHits: number;
    jargonHits: number;
    headlineHasNumber: boolean;
  };
  ecommerce: {
    priceVisible: boolean;
    priceAboveFold: boolean;
    priceText: string | null;
    addToCartText: string | null;
    addToCartAboveFold: boolean;
    addToCartWidth: number;
    addToCartHeight: number;
    variantGroups: number;
    stockText: string | null;
    galleryImages: number;
    reviewWidget: boolean;
    ratingText: string | null;
    shippingInfo: boolean;
    returnsInfo: boolean;
    paymentIcons: number;
    productTiles: number;
    tilesWithPrice: number;
    hasFilters: boolean;
    hasSort: boolean;
    cartLink: boolean;
    searchBox: boolean;
  };
}
