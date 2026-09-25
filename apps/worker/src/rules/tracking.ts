import { mergeTracking } from '../browser/tracking.js';
import type { Check, TrackingEvidence } from '@cro/shared';
import { check, type RuleContext } from './util.js';

/**
 * Measurement is scored because the rest of the report is unactionable without
 * it: a site with no analytics cannot tell whether any of these fixes worked.
 */
export function trackingRules(ctx: RuleContext): Check[] {
  const t: TrackingEvidence = mergeTracking(...ctx.evidence.pages.filter((p) => p.ok).map((p) => p.tracking));

  const analytics = t.ga4 || t.plausible || t.segment || t.hubspot || t.other.length > 0;
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
    ...t.other,
  ].filter(Boolean) as string[];

  return [
    check({
      id: 'tracking.analytics',
      category: 'tracking',
      scope: 'site',
      title: 'Analytics installation signals',
      status: analytics ? 'pass' : 'na',
      weight: 1.5,
      detail: analytics
        ? `Installation signals detected: ${named.join(', ')}. Event delivery and configuration were not verified.`
        : 'Analytics could not be confirmed during this short, consent-free visit. Consent gating, delayed loading, first-party proxies or server-side tracking may hide an existing installation. Verify in your analytics platform; this is not scored as missing tracking.',
      evidence: { detected: named.join(', ') },
    }),
    check({
      id: 'tracking.tagManager',
      category: 'tracking',
      scope: 'site',
      title: 'Tags can be changed without a deploy',
      status: t.gtm ? 'pass' : 'na',
      weight: 0.5,
      detail: t.gtm
        ? 'Google Tag Manager is installed, so conversion events can be added without touching the codebase.'
        : 'No supported tag-manager signal observed. Tags may be deployed directly or through another manager; this does not establish that tracking is absent.',
      evidence: { gtm: t.gtm },
    }),
    check({
      id: 'tracking.behaviour',
      category: 'tracking',
      scope: 'site',
      title: 'Visitor behaviour is observable',
      status: behaviour ? 'pass' : 'na',
      weight: 0.75,
      detail: behaviour
        ? `Session recording or heatmapping is installed (${[t.clarity && 'Clarity', t.hotjar && 'Hotjar'].filter(Boolean).join(', ')}).`
        : 'No supported session-recording or heatmap signal observed during this visit. Consent or delayed loading can hide an existing installation.',
      evidence: { clarity: t.clarity, hotjar: t.hotjar },
    }),
    check({
      id: 'tracking.adPixel',
      category: 'tracking',
      scope: 'site',
      title: 'Paid traffic can be attributed',
      status: adPixel ? 'pass' : 'na',
      weight: adPixel ? 0.5 : 0,
      detail: adPixel
        ? 'Meta Pixel installation signals detected. Conversion events and delivery were not verified.'
        : 'No advertising pixel detected. Only relevant if paid acquisition is running — not counted against the score.',
      evidence: { metaPixel: t.metaPixel },
    }),
  ];
}
