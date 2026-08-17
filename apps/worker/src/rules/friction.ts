import type { Check } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

export function frictionRules(ctx: RuleContext): Check[] {
  const page = ctx.homeMobile ?? ctx.homeDesktop;
  if (!page) {
    return [skipped('friction.unavailable', 'friction', 'Interruptions', 'The page did not load.')];
  }

  const f = page.friction;
  const out: Check[] = [];

  out.push(
    check({
      id: 'friction.blockingOverlay',
      category: 'friction',
      title: 'Nothing blocks the page on arrival',
      status: f.blockingOverlays === 0 ? 'pass' : f.largestOverlayCoverage < 0.5 ? 'warn' : 'fail',
      weight: 1.5,
      detail:
        f.blockingOverlays === 0
          ? 'No large overlay covers the page on load.'
          : `${f.blockingOverlays} overlay covers up to ${Math.round(f.largestOverlayCoverage * 100)}% of the screen the moment a visitor arrives. An interruption before any value has been delivered is the highest-bounce pattern on the web.`,
      evidence: {
        overlays: f.blockingOverlays,
        coverage: f.largestOverlayCoverage,
      },
    }),
  );

  out.push(
    check({
      id: 'friction.dialogs',
      category: 'friction',
      title: 'No modal opens unprompted',
      status: f.openDialogs === 0 ? 'pass' : 'fail',
      detail:
        f.openDialogs === 0
          ? 'No modal dialog is open at load.'
          : `${f.openDialogs} modal dialog${f.openDialogs === 1 ? ' is' : 's are'} already open when the page loads, before the visitor has done anything.`,
      evidence: { openDialogs: f.openDialogs },
    }),
  );

  out.push(
    check({
      id: 'friction.cookieBanner',
      category: 'friction',
      title: 'Consent notice stays out of the way',
      status: !f.cookieBanner ? 'pass' : f.largestOverlayCoverage < 0.25 ? 'warn' : 'fail',
      weight: 0.75,
      detail: !f.cookieBanner
        ? 'No cookie or consent banner blocking the view.'
        : `A consent banner is present and the largest overlay covers ${Math.round(f.largestOverlayCoverage * 100)}% of the viewport. Consent is often legally necessary; taking half the screen on a phone is not.`,
      evidence: { cookieBanner: f.cookieBanner, coverage: f.largestOverlayCoverage },
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
