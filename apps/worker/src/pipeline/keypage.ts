import type { StaticEvidence } from '@cro/shared';

/**
 * Weighted intent keywords. The premise is that a homepage audit alone misses
 * where conversions actually happen — the page a visitor lands on when they
 * have decided to act. Highest-intent wins.
 */
const INTENT: [RegExp, number, string][] = [
  [/\b(checkout|cart|basket)\b/i, 10, 'checkout'],
  [/\b(book|booking|reserve|reservation)\b/i, 9, 'booking'],
  [/\b(pricing|prices|plans|packages|membership)\b/i, 9, 'pricing'],
  [/\b(sign-?up|signup|register|create-account|join)\b/i, 8, 'signup'],
  [/\b(get-?started|start-?(now|free|today)|free-?trial|trial)\b/i, 8, 'trial'],
  [/\b(demo|request-a-demo|book-a-call|consultation)\b/i, 8, 'demo'],
  [/\b(apply|application|enrol|enroll|admission)\b/i, 7, 'application'],
  [/\b(buy|order|purchase|shop|store)\b/i, 6, 'purchase'],
  [/\b(product|products|collections?|services?|programs?|courses?)\b/i, 4, 'product'],
  [/\b(contact|get-in-touch|enquire|inquiry)\b/i, 4, 'contact'],
];

/** Pages that are never the conversion target, however often they are linked. */
const EXCLUDE =
  /\b(blog|news|article|privacy|terms|cookie|legal|careers?|jobs?|press|sitemap|login|sign-?in|account|faq|support|help|search|tag|category|author|feed|\.pdf|\.xml|\.jpg|\.png)\b/i;

export interface KeyPagePick {
  url: string;
  reason: string;
}

/**
 * Pure heuristic over the link graph — no model call, roughly a millisecond.
 * Returns null when nothing scores, in which case the audit runs on the
 * homepage alone rather than wasting two browser contexts on a blog post.
 */
export function pickKeyPage(
  homepage: string,
  staticEvidence: StaticEvidence | null,
): KeyPagePick | null {
  if (!staticEvidence) return null;

  const home = new URL(homepage);
  const homePath = home.pathname.replace(/\/$/, '');

  let best: { url: string; score: number; label: string } | null = null;

  for (const link of staticEvidence.internalLinks) {
    let target: URL;
    try {
      target = new URL(link.href);
    } catch {
      continue;
    }

    const path = target.pathname.replace(/\/$/, '');
    if (path === homePath) continue;
    if (EXCLUDE.test(path) || EXCLUDE.test(link.text)) continue;

    let score = 0;
    let label = '';
    for (const [re, weight, name] of INTENT) {
      // A match in the URL path is a stronger signal than in the anchor text:
      // "learn more about pricing" in body copy is weaker than /pricing.
      if (re.test(path)) {
        score += weight;
        if (!label) label = name;
      }
      if (re.test(link.text)) {
        score += Math.ceil(weight / 2);
        if (!label) label = name;
      }
    }
    if (score === 0) continue;

    // Prefer shallow pages — /pricing beats /company/plans/enterprise/pricing.
    const depth = path.split('/').filter(Boolean).length;
    score -= Math.max(0, depth - 1);

    if (!best || score > best.score) best = { url: target.toString(), score, label };
  }

  if (!best) return null;
  return {
    url: best.url,
    reason: `Highest-intent internal page (${best.label})`,
  };
}
