import type { Check } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

export function technicalRules(ctx: RuleContext): Check[] {
  const s = ctx.evidence.static;
  if (!s) {
    return [
      skipped('technical.unavailable', 'technical', 'Technical foundations', 'HTML could not be fetched.'),
    ];
  }

  const out: Check[] = [];
  const titleLen = s.title?.length ?? 0;

  out.push(
    check({
      id: 'technical.title',
      category: 'technical',
      title: 'Page title is present and well-sized',
      status: titleLen === 0 ? 'fail' : titleLen >= 20 && titleLen <= 60 ? 'pass' : 'warn',
      detail:
        titleLen === 0
          ? 'No page title. This is the first thing a searcher reads about the page.'
          : `Title is ${titleLen} characters: "${s.title}". Google truncates past roughly 60.`,
      evidence: { title: s.title, length: titleLen },
    }),
  );

  const descLen = s.metaDescription?.length ?? 0;
  out.push(
    check({
      id: 'technical.metaDescription',
      category: 'technical',
      title: 'Meta description sells the click',
      status: descLen === 0 ? 'fail' : descLen >= 70 && descLen <= 160 ? 'pass' : 'warn',
      detail:
        descLen === 0
          ? 'No meta description, so Google will pick an arbitrary sentence from the page for the search snippet.'
          : `Description is ${descLen} characters. 70-160 fills the snippet without truncation.`,
      evidence: { length: descLen, description: s.metaDescription },
    }),
  );

  out.push(
    check({
      id: 'technical.canonical',
      category: 'technical',
      title: 'Canonical URL is declared',
      status: s.canonical ? 'pass' : 'warn',
      weight: 0.75,
      detail: s.canonical
        ? `Canonical points to ${s.canonical}.`
        : 'No canonical tag. Duplicate URLs (with tracking parameters, trailing slashes, www variants) will compete with each other in search.',
      evidence: { canonical: s.canonical },
    }),
  );

  const ogCount = [s.og.title, s.og.description, s.og.image].filter(Boolean).length;
  out.push(
    check({
      id: 'technical.socialPreview',
      category: 'technical',
      title: 'Link previews are configured',
      status: ogCount === 3 ? 'pass' : ogCount >= 1 ? 'warn' : 'fail',
      detail:
        ogCount === 3
          ? 'Open Graph title, description and image are all set.'
          : `${ogCount} of 3 Open Graph tags set. Without an og:image, every share on WhatsApp, Slack or LinkedIn renders as a bare grey link — a direct loss of click-through on shared traffic.`,
      evidence: { ogTitle: s.og.title, ogDescription: s.og.description, ogImage: s.og.image },
    }),
  );

  out.push(
    check({
      id: 'technical.schema',
      category: 'technical',
      title: 'Structured data describes the business',
      status: s.schemaTypes.length > 0 ? 'pass' : 'warn',
      weight: 0.75,
      detail:
        s.schemaTypes.length > 0
          ? `Structured data found: ${s.schemaTypes.slice(0, 6).join(', ')}.`
          : 'No structured data. Search engines have to infer what this business is and what it sells.',
      evidence: { types: s.schemaTypes.join(', ') },
    }),
  );

  out.push(
    check({
      id: 'technical.lang',
      category: 'technical',
      title: 'Document language is declared',
      status: s.lang ? 'pass' : 'warn',
      weight: 0.5,
      detail: s.lang
        ? `Language declared as "${s.lang}".`
        : 'No lang attribute on the html element. Screen readers and translation tools have to guess.',
      evidence: { lang: s.lang },
    }),
  );

  return out;
}
