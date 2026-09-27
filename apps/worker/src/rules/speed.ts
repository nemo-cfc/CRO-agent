import type { Check } from '@cro/shared';
import { check, gradeBelow, kb, ms, skipped, type RuleContext } from './util.js';

export function speedRules(ctx: RuleContext): Check[] {
  // Mobile is the honest measurement — it is where the traffic and the pain are.
  const page = ctx.homeMobile ?? ctx.homeDesktop;
  if (!page) {
    return [skipped('speed.unavailable', 'speed', 'Speed and stability', 'The page did not load.')];
  }

  const p = page.perf;
  const crux = ctx.evidence.crux;
  const out: Check[] = [];

  const labSource = page.viewport + ' audit load (unthrottled, bounded observation)';
  out.push(p.fcp != null
    ? check({ id: 'speed.fcp', category: 'speed', title: 'First Contentful Paint (FCP)',
        status: gradeBelow(p.fcp, 1800, 3000),
        detail: `First Contentful Paint is ${ms(p.fcp)} for this ${labSource}.`,
        evidence: { fcpMs: Math.round(p.fcp), source: labSource } })
    : skipped('speed.fcp', 'speed', 'First Contentful Paint (FCP)', 'First paint was not observed.'));

  const inp = crux?.available ? crux.inpP75 : null;
  out.push(inp != null
    ? check({ id: 'speed.inp', category: 'speed', title: 'Interaction to Next Paint (INP)',
        status: gradeBelow(inp, 200, 500),
        detail: `Real-user INP is ${ms(inp)} at the 75th percentile (Chrome UX Report).`,
        evidence: { inpMs: Math.round(inp), source: 'Chrome UX Report, origin-level mobile real visitors (75th percentile)' } })
    : skipped('speed.inp', 'speed', 'Interaction to Next Paint (INP)', 'Real-user data unavailable. A passive page load cannot measure INP.'));

  /* LCP — field data preferred over our single lab load ------------- */
  const lcpField = crux?.available ? crux.lcpP75 : null;
  const lcp = lcpField ?? p.lcp;
  const lcpSource = lcpField !== null ? 'origin-level mobile real visitors (75th percentile)' : labSource;

  out.push(
    lcp !== null
      ? check({
          id: 'speed.lcp',
          category: 'speed',
          title: 'Largest Contentful Paint (LCP)',
          status: gradeBelow(lcp, 2500, 4000),
          weight: 1.5,
          detail: `Largest Contentful Paint is ${ms(lcp)} for ${lcpSource}. The good threshold is 2.5s; above 4s is poor.`,
          evidence: { lcpMs: Math.round(lcp), source: lcpSource },
        })
      : skipped('speed.lcp', 'speed', 'Main content appears quickly', 'Largest Contentful Paint could not be measured.'),
  );

  /* CLS ------------------------------------------------------------ */
  const clsField = crux?.available ? crux.clsP75 : null;
  const cls = clsField ?? p.cls;
  out.push(
    cls !== null
      ? check({
          id: 'speed.cls',
          category: 'speed',
          title: 'Layout does not jump while loading',
          status: gradeBelow(cls, 0.1, 0.25),
          weight: 1.25,
          detail: `Cumulative Layout Shift is ${cls.toFixed(3)}. Above 0.1 the page visibly moves under the visitor's thumb, which is how mis-taps and rage-quits happen.`,
          evidence: { cls: Number(cls.toFixed(3)), source: clsField !== null ? 'Chrome UX Report, origin-level mobile real visitors (75th percentile)' : labSource },
        })
      : skipped('speed.cls', 'speed', 'Layout does not jump while loading', 'Layout shift could not be measured.'),
  );

  /* Server response ------------------------------------------------ */
  const ttfb = p.ttfb ?? ctx.evidence.static?.ttfbMs ?? null;
  out.push(
    ttfb !== null
      ? check({
          id: 'speed.ttfb',
          category: 'speed',
          title: 'Server responds promptly',
          status: gradeBelow(ttfb, 800, 1800),
          detail: `Time to first byte is ${ms(ttfb)}. Everything else on the page is stuck waiting behind this number.`,
          evidence: { ttfbMs: Math.round(ttfb), source: p.ttfb !== null ? labSource : 'Static HTML request' },
        })
      : skipped('speed.ttfb', 'speed', 'Server responds promptly', 'Server timing was not available.'),
  );

  /* Blocking measured from FCP to collection, not Lighthouse's TTI window. */
  out.push(p.blockingTime != null
    ? check({ id: 'speed.blocking', category: 'speed', title: 'Total Blocking Time (estimate)',
        status: gradeBelow(p.blockingTime, 200, 600),
        detail: `${Math.round(p.blockingTime)}ms of blocking observed after FCP. Counts only the portion of each task beyond 50ms, ending at collection rather than Lighthouse's Time to Interactive.`,
        evidence: { blockingTimeMs: Math.round(p.blockingTime), source: labSource } })
    : skipped('speed.blocking', 'speed', 'Total Blocking Time (estimate)', 'First paint or long-task observation unavailable.'));

  /* Images without dimensions -------------------------------------- */
  out.push(
    check({
      id: 'speed.imageDimensions',
      category: 'speed',
      title: 'Images reserve their space',
      status: p.imagesMissingDimensions === 0 ? 'pass' : p.imagesMissingDimensions <= 3 ? 'warn' : 'fail',
      detail:
        p.imagesMissingDimensions === 0
          ? 'All visible images declare width and height.'
          : `${p.imagesMissingDimensions} image${p.imagesMissingDimensions === 1 ? '' : 's'} render without width/height or an aspect ratio, so the page reflows as each one arrives. This is usually the single cheapest layout-shift fix.`,
      evidence: { missing: p.imagesMissingDimensions },
    }),
  );

  /* Page weight ---------------------------------------------------- */
  // transferSize reads 0 for cross-origin responses without Timing-Allow-Origin,
  // so this is a floor, not a total. Treated as a warning signal only.
  const imageShare = p.totalBytes > 0 ? p.imageBytes / p.totalBytes : 0;
  const dominatedByImages = imageShare > 0.5 && p.imageBytes > 1_000_000;

  out.push(
    p.totalBytes > 0
      ? check({
          id: 'speed.weight',
          category: 'speed',
          title: 'Page weight is reasonable',
          status: gradeBelow(p.totalBytes, 2_000_000, 5_000_000),
          weight: 1.25,
          detail: dominatedByImages
            ? `At least ${kb(p.totalBytes)} transferred across ${p.resourceCount} requests on the mobile homepage, and ${kb(p.imageBytes)} of that is images (${Math.round(imageShare * 100)}% of the page). Serving each image no larger than it is displayed, in a modern format where it is not already, is usually the biggest saving available.`
            : `At least ${kb(p.totalBytes)} transferred across ${p.resourceCount} requests on the mobile homepage${p.imageBytes > 0 ? ` (${kb(p.imageBytes)} images, ${kb(p.scriptBytes)} JavaScript)` : ` (${kb(p.scriptBytes)} JavaScript; image sizes were not reported by the image server)`}. Files from other domains that do not report their size are excluded, so the real figure is higher.`,
          evidence: {
            totalBytes: p.totalBytes,
            imageBytes: p.imageBytes,
            scriptBytes: p.scriptBytes,
            requests: p.resourceCount,
            imageSharePct: Math.round(imageShare * 100),
          },
        })
      : skipped('speed.weight', 'speed', 'Page weight is reasonable', 'Transfer sizes were not reported by the site.'),
  );

  return out;
}
