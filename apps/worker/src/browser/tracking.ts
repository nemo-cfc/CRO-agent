import type { TrackingEvidence } from '@cro/shared';

/** Installation evidence only: this cannot verify delivery or server-side tracking. */
export function detectTracking(signals: string): TrackingEvidence {
  // Shopify web pixels embed configuration as repeatedly JSON-escaped strings.
  // Normalize only quote/slash escapes; never execute the site's script text.
  signals = signals.replace(/\\+(?=["'/])/g, '');
  return {
    ga4: /(?:google-analytics\.com\/(?:g\/)?collect|googletagmanager\.com\/gtag\/js[^\s"']*[?&]id=G-|gtag\s*\(\s*['"]config['"]\s*,\s*['"]G-|["']google_tag_ids["']\s*:\s*\[[^\]]*["']G-[A-Z0-9]+["'])/i.test(signals),
    gtm: /googletagmanager\.com\/(?:gtm\.js|ns\.html)|\bGTM-[A-Z0-9]+\b/i.test(signals),
    metaPixel: /connect\.facebook\.net\/[^\s"']*fbevents|facebook\.com\/tr[/?]|fbq\s*\(\s*['"]init['"]/i.test(signals),
    clarity: /clarity\.ms\/(?:tag|collect)\//i.test(signals),
    hotjar: /(?:static|script)\.hotjar\.com|\bhjid\s*:/i.test(signals),
    hubspot: /(?:js\.hs-scripts\.com|hs-analytics\.net|track\.hubspot\.com)/i.test(signals),
    segment: /(?:cdn\.segment\.com|api\.segment\.io)/i.test(signals),
    plausible: /plausible\.io\/(?:js|api)\//i.test(signals),
    other: [
      /(?:cdn\.mxpnl\.com|api(?:-eu)?\.mixpanel\.com)/i.test(signals) && 'Mixpanel',
      /(?:cdn|api2?)\.amplitude\.com/i.test(signals) && 'Amplitude',
      /(?:[\w.-]+\.)?posthog\.com\/(?:static|e|i)\//i.test(signals) && 'PostHog',
      /matomo\.(?:js|php)/i.test(signals) && 'Matomo',
    ].filter((name): name is string => !!name),
  };
}

export function mergeTracking(...sources: (Partial<TrackingEvidence> | null | undefined)[]): TrackingEvidence {
  const result = detectTracking('');
  for (const source of sources) {
    if (!source) continue;
    for (const key of ['ga4', 'gtm', 'metaPixel', 'clarity', 'hotjar', 'hubspot', 'segment', 'plausible'] as const) {
      result[key] ||= !!source[key];
    }
    result.other = [...new Set([...result.other, ...(source.other ?? [])])];
  }
  return result;
}
