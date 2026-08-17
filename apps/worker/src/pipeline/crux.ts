import type { CruxEvidence } from '@cro/shared';
import { config } from '../config.js';

const ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

interface CruxMetric {
  percentiles?: { p75?: number | string };
}

/**
 * Real-user field data from the Chrome UX Report — a useful counterweight to
 * the single synthetic load we measure, since our datacentre connection is
 * nothing like a visitor's phone on 4G.
 *
 * Entirely optional: without a key, or for a site with too little traffic to
 * be in the dataset, this returns `available: false` and the speed checks fall
 * back to lab numbers. It never blocks the pipeline.
 */
export async function fetchCrux(url: string, signal: AbortSignal): Promise<CruxEvidence | null> {
  if (!config.cruxApiKey) return null;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), config.cruxTimeoutMs);

  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(config.cruxApiKey)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin: new URL(url).origin,
        formFactor: 'PHONE',
        metrics: [
          'largest_contentful_paint',
          'interaction_to_next_paint',
          'cumulative_layout_shift',
        ],
      }),
    });

    // 404 simply means the origin has too little traffic to be in the dataset.
    if (!res.ok) return { available: false, lcpP75: null, inpP75: null, clsP75: null };

    const body = (await res.json()) as {
      record?: { metrics?: Record<string, CruxMetric> };
    };
    const m = body.record?.metrics;
    if (!m) return { available: false, lcpP75: null, inpP75: null, clsP75: null };

    const p75 = (key: string): number | null => {
      const raw = m[key]?.percentiles?.p75;
      if (raw === undefined) return null;
      const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
      return Number.isFinite(n) ? n : null;
    };

    return {
      available: true,
      lcpP75: p75('largest_contentful_paint'),
      inpP75: p75('interaction_to_next_paint'),
      clsP75: p75('cumulative_layout_shift'),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
