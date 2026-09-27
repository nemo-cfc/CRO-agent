import type { Check } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

const KIND_LABEL: Record<string, string> = {
  locale: 'country or region selector',
  email: 'email sign-up / discount pop-up',
  age: 'age confirmation',
  other: 'pop-up',
};

export function frictionRules(ctx: RuleContext): Check[] {
  const page = ctx.homeMobile ?? ctx.homeDesktop;
  if (!page) {
    return [skipped('friction.unavailable', 'friction', 'Interruptions', 'The page did not load.')];
  }

  const f = page.friction;
  const viewport = page.viewport === 'mobile' ? 'on mobile' : 'on desktop';
  const out: Check[] = [];

  // Cookie banners are judged on their own below; everything else that
  // covers a meaningful share of the screen on arrival is an interruption.
  const popups = (f.overlays ?? []).filter((o) => o.kind !== 'cookie' && o.coverage > 0.2);
  const worst = Math.max(0, ...popups.map((o) => o.coverage));
  const described = popups
    .map((o) => `a ${KIND_LABEL[o.kind] ?? 'pop-up'} (${o.text ? `"${o.text.slice(0, 60)}${o.text.length > 60 ? '…' : ''}"` : 'no text'})`)
    .join(' and ');
  out.push(
    check({
      id: 'friction.blockingOverlay',
      category: 'friction',
      title: 'Nothing blocks the page on arrival',
      status: popups.length === 0 ? 'pass' : worst < 0.5 ? 'warn' : 'fail',
      weight: 1.5,
      detail:
        popups.length === 0
          ? `No pop-up covers the page on arrival ${viewport}.`
          : `On arrival ${viewport}, ${described} ${popups.length === 1 ? 'covers' : 'cover'} ${Math.round(worst * 100)}% of the screen${worst >= 0.99 ? ' (including the dimmed backdrop)' : ''} before the visitor has done anything.`,
      evidence: {
        popups: popups.length,
        coverage: worst,
        kinds: popups.map((o) => o.kind).join(', '),
      },
    }),
  );

  const cookie = f.cookieBanner ? (f.cookieCoverage ?? 0) : 0;
  out.push(
    check({
      id: 'friction.cookieBanner',
      category: 'friction',
      title: 'Consent notice stays out of the way',
      status: !f.cookieBanner || cookie <= 0.2 ? 'pass' : cookie <= 0.35 ? 'warn' : 'fail',
      weight: 0.75,
      detail: !f.cookieBanner
        ? `No cookie or consent banner was showing on arrival ${viewport}.`
        : `The consent banner covers ${Math.round(cookie * 100)}% of the screen ${viewport}.${cookie > 0.2 ? ' Consent is often legally required, but a compact bar leaves the page usable while the visitor decides.' : ''}`,
      evidence: { cookieBanner: f.cookieBanner, coverage: cookie },
    }),
  );

  out.push(
    check({
      id: 'friction.chatWidget',
      category: 'friction',
      title: 'Chat widget does not cover the action',
      status: !f.chatWidget ? 'pass' : f.widgetObscuresCta ? 'fail' : 'pass',
      detail: !f.chatWidget
        ? 'No chat widget on the page.'
        : f.widgetObscuresCta
          ? 'The chat widget overlaps a call-to-action button. On a phone this means the launcher intercepts taps meant for the button.'
          : 'Chat widget is present and clear of the main action.',
      evidence: { chatWidget: f.chatWidget, obscuresCta: f.widgetObscuresCta },
    }),
  );

  return out;
}
