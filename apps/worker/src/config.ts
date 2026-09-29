import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')].find(existsSync);
if (envPath) process.loadEnvFile(envPath);

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int('PORT', 8787),
  host: process.env.HOST ?? '0.0.0.0',
  /** Shared secret the web app sends as a Bearer token. Unset: no check (local dev). */
  workerToken: process.env.WORKER_TOKEN ?? '',

  /** Pre-warmed BrowserContexts held open. Each audit borrows up to 4. */
  poolSize: int('POOL_SIZE', 8),
  maxConcurrentAudits: int('MAX_CONCURRENT_AUDITS', 2),
  maxQueueDepth: int('MAX_QUEUE_DEPTH', 8),

  /**
   * Hard wall for the whole pipeline. Deliberately below the 30s product
   * requirement so a slow site degrades into a partial report rather than
   * a timeout the user sees.
   */
  /** Measurement stops here; whatever was collected is scored. */
  deadlineMs: int('AUDIT_DEADLINE_MS', 20_000),
  /** The model write-up must finish by this point (from the start of the audit). */
  writeDeadlineMs: int('WRITE_DEADLINE_MS', 28_000),
  /** Per-page navigation budget. */
  navTimeoutMs: int('NAV_TIMEOUT_MS', 12_000),
  /** How long to wait for `load` after `domcontentloaded` before moving on. */
  settleMs: int('SETTLE_MS', 2_500),
  /** Budget for the static HTML fetch track. */
  staticTimeoutMs: int('STATIC_TIMEOUT_MS', 6_000),
  /** Budget for the CrUX call. Skipped entirely without a key. */
  cruxTimeoutMs: int('CRUX_TIMEOUT_MS', 3_000),

  groqApiKey: process.env.GROQ_API_KEY ?? '',
  cruxApiKey: process.env.CRUX_API_KEY ?? '',
  model: process.env.CRO_MODEL ?? 'openai/gpt-oss-120b',
  /** Latency lever. Sweep low -> medium with `npm run bench`. */
  effort: (process.env.CRO_EFFORT ?? 'low') as 'low' | 'medium' | 'high',

  userAgent:
    process.env.CRO_USER_AGENT ??
    'Mozilla/5.0 (compatible; CROAgent/0.1; +https://example.com/cro-agent)',
} as const;

export const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
