/**
 * Timing benchmark for the 30-second constraint.
 *
 * The budget is the product requirement, so it gets measured rather than
 * assumed. Runs the real pipeline (pool, browser, rules, model) against a
 * corpus of awkward sites and reports p50/p95 per phase.
 *
 *   npm run bench
 *   npm run bench -- --sites example.com,other.com
 *   npm run bench -- --repeat 3 --no-llm
 */
import type { AuditEvent } from '@cro/shared';
import { config } from '../src/config.js';
import { pool } from '../src/browser/pool.js';
import { runAudit } from '../src/pipeline/run.js';
import { normalizeUrl } from '../src/pipeline/url.js';
import { SITES, type BenchSite } from './sites.js';

interface Run {
  url: string;
  shape: string;
  ok: boolean;
  /** Time at which each phase *started*, ms from submit. */
  marks: Partial<Record<string, number>>;
  checks: number;
  score: number | null;
  recs: number;
  total: number;
  partial: boolean;
  notes: string[];
  error: string | null;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] ?? null) : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

async function benchOne(site: BenchSite): Promise<Run> {
  const started = Date.now();
  const run: Run = {
    url: site.url,
    shape: site.shape,
    ok: false,
    marks: {},
    checks: 0,
    score: null,
    recs: 0,
    total: 0,
    partial: false,
    notes: [],
    error: null,
  };

  const url = normalizeUrl(site.url).toString();

  await runAudit(url, (event: AuditEvent) => {
    switch (event.type) {
      case 'phase':
        run.marks[event.phase] ??= Date.now() - started;
        break;
      case 'checks':
        run.marks['checksDelivered'] = Date.now() - started;
        run.checks = event.checks.length;
        run.score = event.scorecard.overall;
        break;
      case 'rec':
        run.marks['firstRec'] ??= Date.now() - started;
        run.recs++;
        break;
      case 'error':
        run.error = event.message.slice(0, 120);
        break;
      case 'done':
        run.total = event.durationMs;
        run.partial = event.partial;
        run.notes = event.notes;
        run.ok = run.checks > 0;
        break;
    }
  });

  return run;
}

async function main(): Promise<void> {
  const only = arg('sites');
  const repeat = Number.parseInt(arg('repeat') ?? '1', 10);
  const noLlm = flag('no-llm');

  if (noLlm) process.env['GROQ_API_KEY'] = '';

  // Normalise up front so `--sites example.com` (no scheme) is usable and the
  // reporting below can parse every entry as a URL.
  const corpus: BenchSite[] = (
    only ? only.split(',').map((u) => ({ url: u.trim(), shape: 'custom' })) : SITES
  ).map((s) => ({ ...s, url: normalizeUrl(s.url).toString() }));

  console.log(`\ncorpus: ${corpus.length} sites × ${repeat}`);
  console.log(`deadline: ${config.deadlineMs}ms   model: ${noLlm ? '(disabled)' : config.model} @ effort=${config.effort}`);

  const warmStart = Date.now();
  await pool.start();
  console.log(`pool warmed in ${Date.now() - warmStart}ms\n`);

  const runs: Run[] = [];

  console.log(
    ['site'.padEnd(30), 'total'.padStart(8), 'render'.padStart(8), 'checks'.padStart(8), 'llm'.padStart(8), 'n'.padStart(4), 'score'.padStart(6)].join(''),
  );
  console.log('─'.repeat(74));

  for (let pass = 0; pass < repeat; pass++) {
    for (const site of corpus) {
      let run: Run;
      try {
        run = await benchOne(site);
      } catch (err) {
        run = {
          url: site.url, shape: site.shape, ok: false, marks: {}, checks: 0,
          score: null, recs: 0, total: 0, partial: true, notes: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
      runs.push(run);

      const renderMs = (run.marks['scoring'] ?? run.total) - (run.marks['rendering'] ?? 0);
      const llmMs = run.marks['writing'] !== undefined ? run.total - run.marks['writing'] : 0;
      const host = new URL(site.url).hostname.replace(/^www\./, '');

      console.log(
        [
          host.slice(0, 29).padEnd(30),
          `${(run.total / 1000).toFixed(1)}s`.padStart(8),
          `${(renderMs / 1000).toFixed(1)}s`.padStart(8),
          `${((run.marks['checksDelivered'] ?? 0) / 1000).toFixed(1)}s`.padStart(8),
          `${(llmMs / 1000).toFixed(1)}s`.padStart(8),
          String(run.checks).padStart(4),
          (run.score === null ? '—' : String(run.score)).padStart(6),
          run.error ? `  ✕ ${run.error.slice(0, 40)}` : run.partial ? '  ~partial' : '',
        ].join(''),
      );
    }
  }

  /* ---- rollup ---- */
  const good = runs.filter((r) => r.ok);
  const totals = good.map((r) => r.total);
  const renders = good.map((r) => (r.marks['scoring'] ?? r.total) - (r.marks['rendering'] ?? 0));
  const checksAt = good.map((r) => r.marks['checksDelivered'] ?? 0);
  const llms = good
    .filter((r) => r.marks['writing'] !== undefined)
    .map((r) => r.total - r.marks['writing']!);

  const row = (label: string, vals: number[]) =>
    console.log(
      `  ${label.padEnd(22)} p50 ${(percentile(vals, 50) / 1000).toFixed(1)}s   p95 ${(percentile(vals, 95) / 1000).toFixed(1)}s   max ${(Math.max(0, ...vals) / 1000).toFixed(1)}s`,
    );

  console.log(`\n${'─'.repeat(74)}\nresults over ${good.length}/${runs.length} successful runs\n`);
  row('total', totals);
  row('render phase', renders);
  row('first checks visible', checksAt);
  if (llms.length > 0) row('model write', llms);

  const overDeadline = good.filter((r) => r.total > config.deadlineMs).length;
  const over30 = good.filter((r) => r.total > 30_000).length;
  const failed = runs.filter((r) => !r.ok);

  console.log('');
  console.log(`  over ${config.deadlineMs / 1000}s deadline   ${overDeadline}/${good.length}`);
  console.log(`  over 30s hard limit  ${over30}/${good.length}`);
  console.log(`  partial reports      ${good.filter((r) => r.partial).length}/${good.length}`);
  console.log(`  failed outright      ${failed.length}/${runs.length}`);

  if (failed.length > 0) {
    console.log('\n  failures:');
    for (const f of failed) console.log(`    ${f.url} — ${f.error ?? 'no checks produced'}`);
  }

  // Acceptance targets from the plan.
  const p50 = percentile(totals, 50);
  const p95 = percentile(totals, 95);
  const pass = p50 <= 20_000 && p95 <= 27_000 && over30 === 0;
  console.log(
    `\n  targets: p50 ≤20s (${(p50 / 1000).toFixed(1)}s), p95 ≤27s (${(p95 / 1000).toFixed(1)}s), zero over 30s (${over30})  →  ${pass ? 'PASS' : 'MISS'}\n`,
  );

  await pool.close();
  process.exit(pass ? 0 : 1);
}

await main();
