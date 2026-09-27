import type { Check } from '@cro/shared';
import { isStore } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

export function trustRules(ctx: RuleContext): Check[] {
  const home = ctx.home;
  if (!home) {
    return [skipped('trust.unavailable', 'trust', 'Trust signals', 'The page did not load.')];
  }

  const t = home.trust;
  const out: Check[] = [];

  // Stores carry customer reviews on product pages, not the homepage;
  // ecommerce.socialProof checks them where they belong.
  if (!isStore(ctx.evidence.platform)) out.push(
    check({
      id: 'trust.testimonials',
      category: 'trust',
      title: 'Social proof from real customers',
      status: t.testimonialBlocks >= 2 ? 'pass' : t.testimonialBlocks === 1 ? 'warn' : 'fail',
      weight: 1.5,
      detail:
        t.testimonialBlocks === 0
          ? 'No testimonials, reviews or quotes found. A first-time visitor has only your word for it.'
          : `${t.testimonialBlocks} testimonial or review block${t.testimonialBlocks === 1 ? '' : 's'} on the page.`,
      evidence: { blocks: t.testimonialBlocks },
    }),
  );

  // "Client logos and certifications" is B2B/service-site advice; a store's
  // trust comes from reviews, delivery and returns, checked on the product page.
  if (!isStore(ctx.evidence.platform)) out.push(
    check({
      id: 'trust.logos',
      category: 'trust',
      title: 'Recognisable names or credentials shown',
      status: t.logoStrip || t.badgeImages > 0 ? 'pass' : 'warn',
      detail:
        t.logoStrip || t.badgeImages > 0
          ? `Found ${t.logoStrip ? 'a logo strip' : ''}${t.logoStrip && t.badgeImages > 0 ? ' and ' : ''}${t.badgeImages > 0 ? `${t.badgeImages} trust badge(s)` : ''}.`
          : 'No client logos, certifications or trust badges detected.',
      evidence: { logoStrip: t.logoStrip, badges: t.badgeImages },
    }),
  );

  const legal = [t.hasPrivacyLink, t.hasTermsLink].filter(Boolean).length;
  out.push(
    check({
      id: 'trust.legal',
      category: 'trust',
      title: 'Privacy and terms are reachable',
      status: legal === 2 ? 'pass' : legal === 1 ? 'warn' : 'fail',
      detail:
        legal === 2
          ? 'Both privacy policy and terms are linked.'
          : `Missing ${!t.hasPrivacyLink ? 'a privacy policy link' : ''}${!t.hasPrivacyLink && !t.hasTermsLink ? ' and ' : ''}${!t.hasTermsLink ? 'a terms link' : ''}. Their absence reads as a red flag on any page asking for details or payment.`,
      evidence: { privacy: t.hasPrivacyLink, terms: t.hasTermsLink },
    }),
  );

  const contactable = t.hasContactLink || t.hasPhone || t.hasEmail;
  out.push(
    check({
      id: 'trust.contact',
      category: 'trust',
      title: 'A human is reachable',
      status: contactable ? 'pass' : 'fail',
      weight: 1.25,
      detail: contactable
        ? `Contact route present (${[t.hasPhone && 'phone', t.hasEmail && 'email', t.hasContactLink && 'contact page'].filter(Boolean).join(', ')}).`
        : 'No phone number, email address or contact page found. Visitors who need reassurance before buying have nowhere to go.',
      evidence: { phone: t.hasPhone, email: t.hasEmail, contactPage: t.hasContactLink },
    }),
  );

  out.push(
    check({
      id: 'trust.presence',
      category: 'trust',
      title: 'Business has a visible footprint',
      status: t.hasAboutLink && t.hasSocialLinks ? 'pass' : t.hasAboutLink || t.hasSocialLinks ? 'warn' : 'warn',
      weight: 0.75,
      detail:
        t.hasAboutLink && t.hasSocialLinks
          ? 'About page and social profiles are both linked.'
          : `Missing ${!t.hasAboutLink ? 'an About page' : ''}${!t.hasAboutLink && !t.hasSocialLinks ? ' and ' : ''}${!t.hasSocialLinks ? 'social profile links' : ''}.`,
      evidence: { about: t.hasAboutLink, social: t.hasSocialLinks },
    }),
  );

  return out;
}
