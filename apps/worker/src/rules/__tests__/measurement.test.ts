import { describe, expect, it } from 'vitest';
import { detectTracking, mergeTracking } from '../../browser/tracking.js';
import { runRules } from '../index.js';
import { healthyEvidence, page } from './fixtures.js';

describe('tracking evidence', () => {
  it('recognizes Shopify nested pixel configuration as used on reistor.in', () => {
    const config = JSON.stringify(JSON.stringify(JSON.stringify({ google_tag_ids: ['AW-123', 'G-TEST12345'] })));
    expect(detectTracking(config).ga4).toBe(true);
    expect(detectTracking(JSON.stringify({ google_tag_ids: ['AW-123'] })).ga4).toBe(false);
  });
  it.each([
    ['https://www.google-analytics.com/g/collect?v=2', 'ga4'],
    ['https://www.googletagmanager.com/gtag/js?id=G-ABC123', 'ga4'],
    ["gtag('config', 'G-TEST123');", 'ga4'],
    ['https://www.googletagmanager.com/gtm.js?id=GTM-ABC123&l=customLayer', 'gtm'],
    ['https://connect.facebook.net/en_US/fbevents.js', 'metaPixel'],
    ['https://www.facebook.com/tr/?id=123', 'metaPixel'],
    ['https://www.clarity.ms/tag/123', 'clarity'],
    ['https://static.hotjar.com/c/hotjar-123.js', 'hotjar'],
    ['https://cdn.segment.com/analytics.js/v1/key/analytics.min.js', 'segment'],
  ] as const)('recognizes request or installation signal %s', (signal, key) => {
    expect(detectTracking(signal)[key]).toBe(true);
  });

  it('does not mistake GTM, Google Ads or an empty data layer for GA4', () => {
    expect(detectTracking('https://www.googletagmanager.com/gtm.js?id=GTM-ABC').ga4).toBe(false);
    expect(detectTracking('https://www.googletagmanager.com/gtag/js?id=AW-123').ga4).toBe(false);
    expect(detectTracking('window.dataLayer=[];')).toEqual(detectTracking(''));
  });

  it('unions evidence rather than overwriting a mobile or secondary-page detection', () => {
    const evidence = healthyEvidence();
    evidence.pages = [page({ tracking: detectTracking('') }), page({ viewport: 'mobile', tracking: detectTracking("gtag('config','G-123')") })];
    expect(runRules(evidence).checks.find(c => c.id === 'tracking.analytics')?.status).toBe('pass');
    expect(mergeTracking({ other: ['Matomo'] }, { other: ['Matomo', 'Mixpanel'] }).other).toEqual(['Matomo', 'Mixpanel']);
  });

  it('reports an inconclusive scan without asserting tracking is missing', () => {
    const evidence = healthyEvidence();
    evidence.pages = [page({ tracking: detectTracking('') })];
    const check = runRules(evidence).checks.find(c => c.id === 'tracking.analytics');
    expect(check?.status).toBe('na');
    expect(check?.detail).toContain('server-side');
  });
});

describe('performance reporting', () => {
  it.each([[1800, 'pass'], [2500, 'warn'], [3100, 'fail']] as const)('grades FCP %d', (fcp, status) => {
    const evidence = healthyEvidence();
    evidence.pages = [page({ perf: { ...page().perf, fcp } })];
    const check = runRules(evidence).checks.find(c => c.id === 'speed.fcp');
    expect(check?.status).toBe(status);
    expect(check?.evidence.fcpMs).toBe(fcp);
  });

  it('does not fabricate FCP, TBT or INP when unavailable', () => {
    const evidence = healthyEvidence();
    evidence.crux = null;
    evidence.pages = [page({ perf: { ...page().perf, fcp: null, blockingTime: null } })];
    const checks = runRules(evidence).checks;
    for (const id of ['speed.fcp', 'speed.blocking', 'speed.inp']) expect(checks.find(c => c.id === id)?.status).toBe('na');
  });

  it('uses real-user INP and labels its source', () => {
    const evidence = healthyEvidence();
    evidence.crux = { available: true, inpP75: 350, lcpP75: 2900, clsP75: 0.12 };
    const check = runRules(evidence).checks.find(c => c.id === 'speed.inp');
    expect(check?.status).toBe('warn');
    expect(check?.evidence.inpMs).toBe(350);
    expect(check?.evidence.source).toContain('real visitors');
  });
});
