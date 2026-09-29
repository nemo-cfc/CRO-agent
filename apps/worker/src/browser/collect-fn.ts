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

  /**
   * Tag the exact element a check measured so the collector can crop a
   * screenshot of it afterwards. Keys are space-separated in one attribute.
   */
  document.querySelectorAll('[data-cro-shot]').forEach((el) => el.removeAttribute('data-cro-shot'));
  const mark = (el: Element | null | undefined, key: string) => {
    if (!el) return;
    const keys = (el.getAttribute('data-cro-shot') ?? '').split(' ').filter(Boolean);
    if (keys.indexOf(key) === -1) keys.push(key);
    el.setAttribute('data-cro-shot', keys.join(' '));
  };

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

  /**
   * Contrast against the colour actually behind the text, or null when that
   * cannot be known from styles: a background image, or a photo/video element
   * painted between the text and the nearest solid background. Assuming white
   * there produced "Shop Now has a contrast ratio of 1:1" for white text on a
   * photo.
   */
  const contrastRatio = (el: Element): number | null => {
    const fg = parseColor(getComputedStyle(el).color);
    if (!fg || fg[3] < 1) return null;
    let owner: Element | null = null;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none') return null;
      const c = parseColor(s.backgroundColor);
      if (c && c[3] > 0 && c[3] < 1) return null;
      if (c && c[3] === 1) { owner = n; break; }
    }
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= VH || r.right <= 0 || r.left >= VW) return null;
    // Any media or painted layer inside the background's owner that overlaps
    // the text sits between the text and that colour. Hit-testing is not used:
    // hero images are usually pointer-events:none, which hit-testing skips.
    const root = owner ?? document.body;
    const overlaps = (o: Element) => {
      const q = o.getBoundingClientRect();
      return q.width > 0 && q.height > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
    };
    for (const layer of Array.from(root.querySelectorAll('img, video, picture, canvas, iframe, svg, [style*="background"]')).slice(0, 400)) {
      if (layer.contains(el) || el.contains(layer) || !overlaps(layer)) continue;
      if (/^(IMG|VIDEO|PICTURE|CANVAS|IFRAME)$/i.test(layer.tagName) || getComputedStyle(layer).backgroundImage !== 'none') return null;
      if (layer.tagName.toLowerCase() === 'svg' && layer.getBoundingClientRect().width > r.width * 2) return null;
    }
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
  ).filter(
    // Hidden from users: aria-hidden carousel clones, inert or click-through layers.
    (el) => visible(el) && !el.closest('[aria-hidden="true"], [inert]') && getComputedStyle(el).pointerEvents !== 'none',
  );

  // Visible label only: textContent also returns hidden loading text such as
  // "Adding..." inside a buy button.
  const shownText = (el: HTMLElement) => (el.innerText ?? '').replace(/\s+/g, ' ').trim();

  const rankedCtas = ctaNodes
    .map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const label =
        shownText(el) ||
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
      // On screen means inside the viewport horizontally too: carousel slides
      // parked off to the side used to count as above-the-fold actions.
      const onScreen = r.top < VH && r.bottom > 0 && r.left < VW - 4 && r.right > 4;
      if (onScreen) prominence += 2;
      if (el.closest('nav, header nav, footer')) prominence -= 3;
      if (GENERIC_CTA.test(label) && !ACTION_VERBS.test(label)) prominence -= 1;

      return {
        el,
        text: label.slice(0, 80),
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href'),
        aboveFold: onScreen,
        width: Math.round(r.width),
        height: Math.round(r.height),
        contrast: contrastRatio(el),
        prominence,
      };
    })
    .filter((c) => c.text.length > 0)
    .sort((a, b) => b.prominence - a.prominence)
    .slice(0, 25);
  // ctas[0] is the element the CTA rules treat as the primary action.
  mark(rankedCtas[0]?.el, 'cta');
  const ctas = rankedCtas.map((c) => ({
    text: c.text, tag: c.tag, href: c.href, aboveFold: c.aboveFold,
    width: c.width, height: c.height, contrast: c.contrast, prominence: c.prominence,
  }));

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
  const primaryFormEntry =
    formEls
      .map((el) => ({ el, form: describeForm(el) }))
      .sort((a, b) => b.form.fields - a.form.fields)
      .find((f) => f.form.fields > 0) ?? null;
  mark(primaryFormEntry?.el, 'form');
  const primaryForm = primaryFormEntry?.form ?? null;

  /* ---------------------------------------------------------------- *
   * Performance
   * ---------------------------------------------------------------- */

  const perfState = (window as unknown as { __croPerf?: { lcp: number | null; cls: number; longTasks: number; longTaskMs: number; tasks: { startTime: number; duration: number }[]; longTaskSupported: boolean } }).__croPerf;
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
  const blockingTime = fcp !== null && perfState?.longTaskSupported
    ? perfState.tasks.reduce((sum, task) => sum + Math.max(0, task.startTime + task.duration - Math.max(task.startTime + 50, fcp)), 0)
    : null;
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
      if (!visible(el) || el.closest('[aria-hidden="true"], [inert]')) return false;
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
    .map((el) => ({ r: el.getBoundingClientRect(), href: el.getAttribute('href')?.split(/[?#]/)[0] ?? null }))
    // On screen horizontally: carousel slides parked off to the side are not
    // something a visitor can tap.
    .filter(({ r }) => r.width > 0 && r.height > 0 && r.left < VW - 2 && r.right > 2)
    .slice(0, 150);

  const tinyTapTargets = tapTargets.filter(({ r }) => r.width < 44 || r.height < 44).length;

  // Targets (not pairs) with a *different* target within 8px. Overlapping
  // boxes are one control (an icon inside a link) and two links to the same
  // place (a product's image and title) cannot cause a wrong tap.
  const crowded = new Set<number>();
  for (let i = 0; i < tapTargets.length; i++) {
    for (let j = i + 1; j < tapTargets.length; j++) {
      const a = tapTargets[i]!;
      const b = tapTargets[j]!;
      if (a.href && a.href === b.href) continue;
      const dx = Math.max(a.r.left - b.r.right, b.r.left - a.r.right);
      const dy = Math.max(a.r.top - b.r.bottom, b.r.top - a.r.bottom);
      if (dx < 0 && dy < 0) continue; // overlapping: nested or stacked control
      if (Math.max(0, dx) < 8 && Math.max(0, dy) < 8) { crowded.add(i); crowded.add(j); }
    }
  }
  const crowdedTapTargets = crowded.size;

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

  /**
   * Pop-ups on arrival. A layer only counts when a visitor can actually see
   * and hit it: fixed, painted (background, backdrop blur or visible content),
   * and not `pointer-events: none`. Transparent containers for closed menus
   * used to be counted as full-screen overlays, and a modal's dim backdrop was
   * counted as a second overlay; both are handled here.
   */
  const coverageOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, VW) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, VH) - Math.max(r.top, 0));
    return (w * h) / (VW * VH);
  };
  const paints = (el: HTMLElement, s: CSSStyleDeclaration) => {
    const bg = parseColor(s.backgroundColor);
    if (bg && bg[3] > 0.05) return true;
    if (s.backgroundImage !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none')) return true;
    return false;
  };
  const hasVisibleContent = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('h1, h2, h3, h4, p, button, a, input, select, img, span')).some((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && visible(c) && coverageOf(c) > 0;
    });
  const layers = Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' || s.pointerEvents === 'none' || !visible(el)) return false;
      if (el.closest('header, nav') && coverageOf(el) < 0.2) return false; // sticky header bars
      return coverageOf(el) > 0.1 && (paints(el, s) || hasVisibleContent(el));
    })
    .slice(0, 200);
  // Outermost layers only, so a modal's inner panel is not a second pop-up.
  const outer = layers.filter((el) => !layers.some((o) => o !== el && o.contains(el)));
  const POPUP_KIND: [RegExp, string][] = [
    [/cookie|consent|gdpr|privacy preference|we use cookies/i, 'cookie'],
    [/shipping to|ship to|your country|your region|currency|choose (a |your )?(country|region|location)|shopping in|select (your )?(country|region)|language/i, 'locale'],
    [/sign ?up|subscribe|newsletter|% off|discount|join (the|our)|get \d+|email address|your email/i, 'email'],
    [/verify your age|\bare you (21|18)|of legal (drinking )?age|\b(21|18)\+/i, 'age'],
  ];
  const popups = outer
    .map((el) => {
      const t = text(el);
      const kind = t.length < 3 ? 'backdrop' : (POPUP_KIND.find(([re]) => re.test(t.slice(0, 600)))?.[1] ?? 'other');
      return { kind, coverage: Math.round(coverageOf(el) * 100) / 100, text: t.slice(0, 120) };
    })
    .filter((p) => p.kind === 'backdrop' ? p.coverage > 0.5 : p.coverage > 0.1);
  const content = popups.filter((p) => p.kind !== 'backdrop');
  const backdrop = popups.find((p) => p.kind === 'backdrop');
  // A dimmed backdrop blocks the whole page, so it sets the coverage of the
  // pop-up it sits behind; it is never counted as a pop-up of its own.
  const overlays = content.map((p) =>
    backdrop && p.kind !== 'cookie' ? { ...p, coverage: Math.max(p.coverage, backdrop.coverage) } : p,
  );
  const blockingOverlays = overlays.filter((p) => p.coverage > 0.2).length || (backdrop ? 1 : 0);
  const largestOverlayCoverage = Math.max(0, ...overlays.map((p) => p.coverage), backdrop?.coverage ?? 0);
  const cookieOverlay = overlays.find((p) => p.kind === 'cookie') ?? null;

  // Modal pop-ups, whether or not the theme marks them up as dialogs.
  const openDialogs = overlays.filter((p) => p.kind !== 'cookie' && p.coverage > 0.2).length;
  const cookieBanner = !!cookieOverlay;

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
    ga4: Array.isArray(w['dataLayer']) && w['dataLayer'].some((entry: unknown) => { const command = entry as { 0?: unknown; 1?: unknown } | null; return command?.[0] === 'config' && typeof command[1] === 'string' && /^G-[A-Z0-9]+$/i.test(command[1]); }),
    gtm: !!w['google_tag_manager'] || !!document.querySelector('script[src*="/gtm.js"]'),
    metaPixel: typeof w['fbq'] === 'function',
    clarity: typeof w['clarity'] === 'function',
    hotjar: typeof w['hj'] === 'function',
    hubspot: Array.isArray(w['_hsq']),
    segment: !!w['analytics'] && typeof (w['analytics'] as Record<string, unknown>)['initialize'] === 'function',
    plausible: typeof w['plausible'] === 'function',
    other: [] as string[],
  };

  /* ---------------------------------------------------------------- *
   * Copy
   * ---------------------------------------------------------------- */

  // Only headings a visitor can see: themes often ship a hidden or empty H1
  // (SEO duplicates, split promo text), which made "one clear headline" pass
  // on pages with none and "4 headlines compete" fire on pages with one.
  const visibleH1s = Array.from(document.querySelectorAll<HTMLElement>('h1')).filter(
    (h) => visible(h) && shownText(h).length > 0 && !h.closest('[aria-hidden="true"]'),
  );
  const h1El = visibleH1s[0] ?? null;
  const h1 = h1El ? shownText(h1El) : null;
  if (h1El) mark(h1El, 'h1');

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
  const ADD_TO_CART = /add to (cart|bag|basket)|buy (it )?now|^purchase$|add to my|shop now — buy/i;

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
    return el.querySelectorAll('*').length <= 2 || el.matches('[itemprop="price"], [data-price], [class*="price" i], .money');
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

  // The product's own buy button: first in page order, outside sticky bars and
  // outside recommendation carousels (whose "Add to Cart" buttons sit far down
  // the page and were being measured instead). Before a size is chosen many
  // themes label it "Select a size", so that counts as the buy button too.
  const BUY_LABEL = new RegExp(`${ADD_TO_CART.source}|^select (a |your )?(size|option)$|^choose (a )?(size|option)$`, 'i');
  const RECS = '[class*="recommend" i], [id*="recommend" i], [class*="upsell" i], [class*="related" i], [class*="complete-the-look" i], [class*="cross-sell" i], [class*="carousel" i], [class*="slider" i], [class*="swiper" i]';
  const inFixed = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true;
    return false;
  };
  const buyLabel = (el: HTMLElement) => shownText(el) || el.getAttribute('aria-label') || (el as HTMLInputElement).value || '';
  const buyButtons = ctaNodes.filter((el) => BUY_LABEL.test(buyLabel(el)) && !el.closest('header, nav, footer'));
  const cartBtn = buyButtons.find((el) => !inFixed(el) && !el.closest(RECS)) ?? buyButtons.find((el) => !inFixed(el));
  const cartRect = cartBtn?.getBoundingClientRect();
  // A sticky buy bar that is on screen on arrival makes the buy action
  // reachable without scrolling, even when the main button is further down.
  const stickyBuy = buyButtons.find((el) => {
    const r = el.getBoundingClientRect();
    return inFixed(el) && r.top < VH && r.bottom > 0 && r.left < VW && r.right > 0;
  });
  mark(priceNode, 'price');
  mark(cartBtn, 'cart');

  // Variant pickers: a select, or a group of swatch/size buttons. Counted as
  // groups rather than options, since "3 choices to make" is the friction.
  // Choices a shopper must make before buying, counted as option groups next
  // to the buy button: radio groups, size/colour button rows and dropdowns.
  // Class-name matching ("swatch", "variant") missed SKIMS' size lists.
  const variantGroups = (() => {
    if (!cartBtn) return 0;
    const optionLike = (el: HTMLElement) => {
      if (el === cartBtn || el.contains(cartBtn) || !visible(el)) return false;
      const t = shownText(el);
      const aria = el.getAttribute('aria-label') ?? '';
      if (/quantity|increase|decrease|wishlist|share|close|guide|chart|zoom/i.test(`${aria} ${t}`) || /^[+\-−–]$/.test(t)) return false;
      return el.getAttribute('role') === 'radio' || (el as HTMLInputElement).type === 'radio' ||
        /size|colou?r|option|variant|width|length|fit/i.test(aria) || (t.length > 0 && t.length <= 8);
    };
    const inScope = (root: Element) =>
      Array.from(root.querySelectorAll<HTMLElement>('[role="radio"], input[type="radio"], button, [role="option"]')).filter(optionLike);
    let scope: HTMLElement | null = cartBtn.parentElement;
    for (let d = 0; d < 8 && scope && inScope(scope).length < 2; d++) scope = scope.parentElement;
    if (!scope) return 0;
    const byParent = new Map<Element, number>();
    for (const o of inScope(scope)) {
      const key = o.closest('[role="radiogroup"], fieldset') ?? o.parentElement?.closest('ul, ol') ?? o.parentElement ?? o;
      byParent.set(key, (byParent.get(key) ?? 0) + 1);
    }
    const selects = Array.from(scope.querySelectorAll<HTMLSelectElement>('select')).filter((s) => visible(s) && s.options.length > 1).length;
    return Array.from(byParent.values()).filter((n) => n >= 2).length + selects;
  })();

  const stockMatch = allTextForCommerce().match(
    /\b(in stock|out of stock|sold out|only \d+ left|low stock|back ?order|pre-?order)\b/i,
  );

  const galleryImages = Array.from(
    document.querySelectorAll('[class*="gallery" i] img, [class*="product" i] img, [class*="media" i] img'),
  ).filter(visible).length;

  const REVIEW_SELECTOR =
    '[class*="review" i], [class*="rating" i], [class*="stars" i], [data-reviews], [id*="judgeme" i], [class*="yotpo" i], [class*="stamped" i], [class*="okendo" i], [class*="loox" i]';
  // A review app's script counts as a review section even before its widget
  // renders (Bazaarvoice, Yotpo and others often render several seconds late),
  // so its absence on screen is "not measured", never "no reviews".
  const REVIEW_APPS = /bazaarvoice|yotpo|okendo|judge\.me|judgeme|stamped\.io|loox\.io|reviews\.io|trustpilot|junip|powerreviews|feefo|reevoo|rivyo|fera\.ai|trustoo|klaviyo.*reviews/i;
  const reviewApp = Array.from(document.querySelectorAll('script[src], iframe[src], link[href]')).some((el) =>
    REVIEW_APPS.test(el.getAttribute('src') ?? el.getAttribute('href') ?? ''),
  );
  const reviewWidget = !!document.querySelector(REVIEW_SELECTOR) || reviewApp;
  // The rating display itself: the smallest visible element whose own text
  // reads like a rating. Class names alone matched whole galleries.
  // A zero rating or zero reviews ("0 / 5", "0 reviews") is an empty widget, not proof of reviews.
  const RATING_TEXT = /\b([1-5](?:\.\d)?)\s*(?:out of\s*5|\/\s*5(?:\.0)?|stars?)|\b([1-9][\d,]*)\s*(?:reviews?|ratings?)/i;
  mark(
    Array.from(document.querySelectorAll<HTMLElement>('a, button, span, div, p'))
      .filter((el) => {
        const t = text(el);
        const r = el.getBoundingClientRect();
        // Area floor skips screen-reader-only labels that measure 1×1px.
        return t.length > 0 && t.length <= 60 && RATING_TEXT.test(t) && r.height < 120 &&
          r.width * r.height >= 600 && visible(el);
      })
      .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height -
        b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0],
    'rating',
  );

  const ratingMatch = allTextForCommerce().match(
    RATING_TEXT,
  );

  // One representative link per product in the page's own grid. The query
  // string is dropped (?size=6x9 and ?size=8x10 are the same product), and
  // links in header/nav/footer or recommendation carousels are not the grid.
  const productPath = (href: string) => href.split(/[?#]/)[0] ?? href;
  const productLinks = new Map<string, HTMLAnchorElement>();
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = productPath(a.getAttribute('href') ?? '');
    if (!/\/products?\/[^/]+/i.test(href) || /\/products?\/(category|categories)\//i.test(href) || !visible(a)) continue;
    if (a.closest('header, nav, footer') || a.closest(RECS)) continue;
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
    if (CURRENCY.test(text(a))) return true; // the whole tile is the link
    let node: HTMLElement | null = a;
    for (let depth = 0; depth < 6 && node; depth++) {
      node = node.parentElement;
      if (!node) break;
      const hrefs = new Set(
        Array.from(node.querySelectorAll<HTMLAnchorElement>('a[href]'))
          .map((l) => productPath(l.getAttribute('href') ?? ''))
          .filter((h) => /\/products?\//i.test(h)),
      );
      // Left this tile and entered the grid — stop before every product
      // inherits every other product's price.
      if (hrefs.size > 1) break;
      if (CURRENCY.test(text(node))) return true;
    }
    return false;
  }).length;



  // Controls labelled "Filter"/"Sort" count too: many themes use a plain
  // button for them (SKIMS' "Sort" was missed by the selector-only check).
  const controlLabelled = (re: RegExp) =>
    Array.from(document.querySelectorAll<HTMLElement>('button, summary, [role="button"], a, label, select')).some(
      (el) => visible(el) && !el.closest('footer') && re.test(`${shownText(el)} ${el.getAttribute('aria-label') ?? ''}`.trim()),
    );
  // A class name alone is not a control ("filter" is also a CSS utility and
  // an image-effect class); require something visible a shopper can operate.
  const operable = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).some(
      (el) => visible(el) && !el.closest('footer') &&
        (/^(BUTTON|SELECT|DETAILS|SUMMARY|INPUT)$/.test(el.tagName) || el.getAttribute('role') === 'button' ||
          !!el.querySelector('button, select, input, summary, [role="button"]')),
    );
  // "filter" alone is also a CSS utility class (Bellroy's product tiles carry
  // it), so class names must say what they are: facets, filter-bar, etc.
  const FILTER_CLASS = /(^|[\s_-])(facets?|filters?-?(bar|panel|drawer|button|btn|toggle|menu|form|group|options?|list|sidebar|trigger)|collection-filters?|product-filters?)([\s_-]|$)/i;
  const hasFilters =
    Array.from(document.querySelectorAll<HTMLElement>('[class*="filter" i], [class*="facet" i]')).some(
      (el) => FILTER_CLASS.test(el.className.toString()) && visible(el) && !el.closest('footer') &&
        (/^(BUTTON|SELECT|DETAILS|SUMMARY|INPUT)$/.test(el.tagName) || !!el.querySelector('button, select, input, summary, [role="button"]')),
    ) ||
    operable('[aria-label*="filter" i]') ||
    // ids only when the id is about filtering; Bellroy's product tiles have
    // ids embedding "data-filter-dimension-style".
    Array.from(document.querySelectorAll<HTMLElement>('[id*="filter" i], [id*="facet" i]')).some(
      (el) => /^(filters?|facets?)([_-]|$)|[_-](filters?|facets?)$/i.test(el.id) && visible(el) &&
        !!el.querySelector('button, select, input, summary, [role="button"]'),
    ) ||
    controlLabelled(/^(\+\s*)?(filters?|refine|filter (&|and) sort)\b/i);
  const hasSort = operable(
    'select[class*="sort" i], select[name*="sort" i], [class*="sort-by" i], [aria-label*="sort" i]',
  ) || controlLabelled(/^(\W\s*)?sort( by)?\b|filter (&|and) sort/i);

  const paymentIcons =
    Array.from(document.querySelectorAll('img, svg')).filter((el) =>
      /visa|mastercard|amex|paypal|klarna|afterpay|clearpay|gpay|google-?pay|apple-?pay|shop-?pay|upi|razorpay|stripe/i.test(
        `${el.getAttribute('alt') ?? ''} ${el.getAttribute('src') ?? ''} ${el.className?.toString() ?? ''} ${el.getAttribute('aria-label') ?? ''}`,
      ),
    ).length +
    // Payment messaging widgets count as payment marks too (Ruggable's
    // Klarna placement sits right under the price).
    Array.from(
      document.querySelectorAll('klarna-placement, afterpay-placement, shopify-payment-terms, shop-pay-installments-banner, [class*="klarna" i], [class*="afterpay" i], [class*="payment-terms" i], [class*="installment" i]'),
    ).filter((el) => visible(el) && !el.closest('footer')).length;

  function allTextForCommerce(): string {
    return allText;
  }

  // The same price shown anywhere on screen on arrival (e.g. in a sticky bar)
  // counts as visible without scrolling.
  const priceDigits = priceNode ? text(priceNode).replace(/[^\d]/g, '') : '';
  const priceOnScreen = priceCandidates.some((el) => {
    const r = el.getBoundingClientRect();
    return r.top < VH && r.bottom > 0 && r.left < VW && r.right > 0 && !!priceDigits &&
      text(el).replace(/[^\d]/g, '') === priceDigits;
  });

  // Rating published in the page's product data (review apps often render
  // their on-page widget seconds after load, but the JSON-LD is there).
  let structuredRating: string | null = null;
  for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try { data = JSON.parse(node.textContent ?? ''); } catch { continue; }
    // Walk the whole document: the rating is often nested (aggregateRating
    // with an itemReviewed object inside it), which a flat pattern cannot read.
    const stack: unknown[] = [data];
    while (stack.length && !structuredRating) {
      const o = stack.pop();
      if (Array.isArray(o)) { stack.push(...o); continue; }
      if (!o || typeof o !== 'object') continue;
      const rec = o as Record<string, unknown>;
      if (rec['@type'] === 'AggregateRating' || ('ratingValue' in rec && ('reviewCount' in rec || 'ratingCount' in rec))) {
        const value = Number(rec['ratingValue']);
        const count = Number(rec['reviewCount'] ?? rec['ratingCount']);
        if (value > 0 && count > 0) structuredRating = `${value} out of 5 from ${count} review${count === 1 ? '' : 's'}`;
      }
      stack.push(...Object.values(rec));
    }
    if (structuredRating) break;
  }

  // Visible page content without the site-wide header, navigation and footer.
  const productAreaText = (() => {
    const root = (document.querySelector('main') as HTMLElement | null) ?? document.body;
    let t = root.innerText ?? '';
    for (const chrome of Array.from(root.querySelectorAll<HTMLElement>('header, nav, footer'))) {
      const own = chrome.innerText ?? '';
      if (own) t = t.replace(own, ' ');
    }
    return t;
  })();

  const ecommerce = {
    structuredRating,
    priceVisible: !!priceNode,
    priceAboveFold: priceOnScreen,
    priceText: priceNode ? text(priceNode).slice(0, 60) : null,
    addToCartText: cartBtn ? buyLabel(cartBtn).slice(0, 60) : stickyBuy ? buyLabel(stickyBuy).slice(0, 60) : null,
    addToCartAboveFold: (!!cartRect && cartRect.top < VH && cartRect.bottom > 0) || !!stickyBuy,
    stickyBuyBar: !!stickyBuy,
    addToCartWidth: Math.round((cartRect ?? stickyBuy?.getBoundingClientRect())?.width ?? 0),
    addToCartHeight: Math.round((cartRect ?? stickyBuy?.getBoundingClientRect())?.height ?? 0),
    variantGroups,
    stockText: stockMatch ? stockMatch[0] : null,
    galleryImages,
    reviewWidget,
    ratingText: ratingMatch ? ratingMatch[0].slice(0, 40) : null,
    // Both judged on the page content, not the header/footer menus: a footer
    // "Return Center" link used to count as returns info while a "Shipping &
    // Returns" section on the product was missed as shipping info.
    shippingInfo:
      /\b(free (shipping|delivery)|shipping (&|and) returns?|delivery (&|and) returns?|shipping (info|information|policy|details|times?)|delivery (info|information|details|times?)|estimated delivery|ships? (in|within|today|free)|delivery (by|in|within)|dispatch(es|ed)? (in|within)|arrives? (by|in))\b/i.test(productAreaText) ||
      // A section headed just "Delivery" or "Shipping" (accordion titles).
      /^\s*(shipping|delivery)(\s+(info|information|details|options))?\s*$/im.test(productAreaText),
    // Policy wording only: bare "return" also matched product copy such as
    // Allbirds' "sugarcane delivers comfort and energy return".
    returnsInfo:
      /\b(free returns?|easy returns?|returns? (policy|&|and|within|accepted|are free)|(shipping|delivery) (&|and) returns?|\d+[- ]days? (free )?returns?|return policy|refunds?|money[- ]back|exchanges?)\b/i.test(productAreaText) ||
      /^\s*returns?( (&|and) (exchanges|refunds))?\s*$/im.test(productAreaText),
    // Shipping terms in a site-wide announcement bar or header ("Free U.S.
    // shipping on orders over $50"). Not the same as answering it at the buy
    // button, but the store does state it, so the finding must not say
    // "missing".
    shippingBanner: Array.from(document.querySelectorAll<HTMLElement>('header, [class*="announcement" i], [class*="promo-bar" i], [class*="top-bar" i], [id*="announcement" i]'))
      .some((el) => /\b(free\s+(?:[a-z.]+\s+){0,2}(shipping|delivery)|(shipping|delivery)\s+on\s+(all\s+)?orders|ships?\s+free)\b/i.test(el.innerText ?? '')),
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
      fcp,
      blockingTime,
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
      hasAboutLink: anchorMatch(/about|our story|our mission|who we are|our brand|mission/i),
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
      cookieCoverage: cookieOverlay?.coverage ?? 0,
      overlays,
      chatWidget: !!chatEl,
      widgetObscuresCta,
    },
    tracking,
    copy: {
      h1,
      h1Count: visibleH1s.length,
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
    fcp: number | null;
    blockingTime: number | null;
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
    cookieCoverage: number;
    overlays: { kind: string; coverage: number; text: string }[];
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
    stickyBuyBar: boolean;
    structuredRating: string | null;
    addToCartWidth: number;
    addToCartHeight: number;
    variantGroups: number;
    stockText: string | null;
    galleryImages: number;
    reviewWidget: boolean;
    ratingText: string | null;
    shippingInfo: boolean;
    shippingBanner: boolean;
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
