import type { Check, TrackingEvidence } from '@cro/shared';
import { check, type RuleContext } from './util.js';

/**
 * Measurement is scored because the rest of the report is unactionable without
 * it: a site with no analytics cannot tell whether any of these fixes worked.
 */
export function trackingRules(ctx: RuleContext): Check[] {
  const t: TrackingEvidence = ctx.home?.tracking ?? {
    ga4: false, gtm: false, metaPixel: false, clarity: false, hotjar: false,
    hubspot: false, segment: false, plausible: false, other: [],
  };

  const analytics = t.ga4 || t.plausible || t.segment || t.hubspot;
  const behaviour = t.clarity || t.hotjar;
  const adPixel = t.metaPixel;

  const named = [
    t.ga4 && 'Google Analytics',
    t.gtm && 'Google Tag Manager',
    t.metaPixel && 'Meta Pixel',
    t.clarity && 'Microsoft Clarity',
    t.hotjar && 'Hotjar',
    t.hubspot && 'HubSpot',
    t.segment && 'Segment',
    t.plausible && 'Plausible',
  ].filter(Boolean) as string[];

  return [
    check({
      id: 'tracking.analytics',
      category: 'tracking',
      title: 'Traffic is being measured',
      status: analytics ? 'pass' : 'fail',
      weight: 1.5,
      detail: analytics
        ? `Analytics detected: ${named.join(', ')}.`
        : 'No analytics platform detected. Without a baseline, none of the changes in this report can be proven to have worked.',
      evidence: { detected: named.join(', ') },
    }),
    check({
      id: 'tracking.tagManager',
      category: 'tracking',
      title: 'Tags can be changed without a deploy',
      status: t.gtm ? 'pass' : 'warn',
      weight: 0.5,
      detail: t.gtm
        ? 'Google Tag Manager is installed, so conversion events can be added without touching the codebase.'
        : 'No tag manager. Every new conversion event needs a developer and a deploy, which in practice means the events never get added.',
      evidence: { gtm: t.gtm },
    }),
    check({
      id: 'tracking.behaviour',
      category: 'tracking',
      title: 'Visitor behaviour is observable',
      status: behaviour ? 'pass' : 'warn',
      weight: 0.75,
      detail: behaviour
        ? `Session recording or heatmapping is installed (${[t.clarity && 'Clarity', t.hotjar && 'Hotjar'].filter(Boolean).join(', ')}).`
        : 'No session recording or heatmap tool. Microsoft Clarity is free and would show exactly where visitors abandon the pages in this report.',
      evidence: { clarity: t.clarity, hotjar: t.hotjar },
    }),
    check({
      id: 'tracking.adPixel',
      category: 'tracking',
      title: 'Paid traffic can be attributed',
      status: adPixel ? 'pass' : 'na',
      weight: adPixel ? 0.5 : 0,
      detail: adPixel
        ? 'Meta Pixel is present, so paid social conversions can be attributed.'
        : 'No advertising pixel detected. Only relevant if paid acquisition is running — not counted against the score.',
      evidence: { metaPixel: t.metaPixel },
    }),
  ];
}
