# CRO Audit Agent

Enter a website address. The agent loads the homepage **and** the highest-intent page it can find, on desktop and mobile, runs 47 conversion checks, and writes up what to change — streaming results as they land, with a hard 25-second deadline.

## Why it is built this way

A naive version of this — launch Playwright per request, run Lighthouse, hand a screenshot to a vision model — takes 60–90 seconds. Three structural choices get it to a measured p95 of 13.5s for the measurement half:

**A persistent worker with a pre-warmed Chromium pool.** Launching Chromium costs 3–5 seconds; that happens once at boot, not per request. Contexts are pre-created per viewport profile and replaced after each use (never reused — cookies and storage would bleed between audits).

**A deterministic rule engine does the audit; the model only writes.** All 47 checks run as pure TypeScript in under 100ms. Scores are reproducible, free, and unit-testable. The model gets a compact evidence packet and one job: decide what matters most and write it for a human. This is also why `apps/worker/src/rules/` has real test coverage — it is the part that decides what is true.

**Progressive streaming over SSE.** Page metadata appears at ~1s, screenshots and all 47 checks at ~4s, recommendations after. A slow target site degrades into a partial report rather than a spinner that times out.

Explicitly rejected: **Lighthouse** (15–40s on its own — replaced by in-page `PerformanceObserver`), **PageSpeed Insights API** (3–20s+, unpredictable), and **vision analysis of screenshots** (8–15s, the single biggest risk to the budget). Screenshots are still captured — for the report UI, not for the model.

## Running it

```bash
npm install
npx playwright install chromium
cp .env.example .env    # then add ANTHROPIC_API_KEY
npm run dev
```

Worker on `:8787`, frontend on `:3000`.

Without `ANTHROPIC_API_KEY` the audit still runs and returns all 47 measured checks with scores — only the written recommendations are skipped, and the report says so.

## Verifying the 30-second constraint

The budget is the product requirement, so it is measured rather than assumed:

```bash
npm run bench
```

Runs the real pipeline against 15 sites chosen to break a time budget in different ways — image-heavy WordPress, JS-heavy SPAs, e-commerce tag soup, CDN-fronted enterprise sites, minimal static pages. Reports p50/p95 per phase and exits non-zero if it misses p50 ≤20s, p95 ≤27s, zero runs over 30s.

```bash
npm run bench -- --sites yoursite.com    # one site
npm run bench -- --no-llm                # measurement phases only
npm run bench -- --repeat 3              # variance across passes
```

Unit tests for the rule engine:

```bash
npm test
```

## Measured results

Full 15-site corpus, `--no-llm`, warm pool:

| | p50 | p95 | max |
|---|---|---|---|
| Total (excl. model) | 4.4s | 13.5s | 13.5s |
| Render phase | 3.5s | 13.2s | 13.2s |
| First checks visible | 4.4s | 13.5s | 13.5s |

15/15 completed, none over the 25s deadline. End-to-end through the frontend, `therayog.com` returns a complete 47-check report in **8.0s**.

Two caveats that matter more than the headline numbers:

**The model-write phase is not in those figures.** The benchmark ran without an API key. Re-run `npm run bench` with `ANTHROPIC_API_KEY` set before relying on the 30-second claim — roughly 11–20s of headroom remains at p95, which should be comfortable at `effort=low` but is not yet verified. If it misses, the levers in order are: lower `CRO_EFFORT`, drop the second page to desktop-only, tighten `NAV_TIMEOUT_MS`.

**Run-to-run variance is substantial on slow sites.** A five-site pass put `hubspot.com` at 19.5s where the full-corpus pass had it at 8.3s. The benchmark runs sites back-to-back with no gap, which is the worst case for the context pool: each audit borrows 4 of 4 contexts, so the next `acquire()` races the refill and falls back to creating on demand. Real traffic (human-paced, capped at 2 concurrent) gives the pool time to refill. If you plan to run audits back-to-back, raise `POOL_SIZE`.

## Layout

```
packages/shared/       Zod schemas — the contract between worker and web
apps/worker/
  src/browser/         Chromium pool, init script, single-pass DOM collector
  src/pipeline/        Orchestration, deadline, static HTML, key-page pick, SSRF guard
  src/rules/           47 checks in 10 category modules + weighted scoring
  src/llm/             Cached rubric, evidence packet, streaming JSON extractor
  bench/               Timing harness
apps/web/              Next.js frontend, SSE consumer
```

## Design notes worth knowing

**Key-page detection is a heuristic, not a model call.** Internal links are scored against weighted intent keywords (`checkout` 10, `pricing` 9, `product` 4…), penalised for depth, and filtered against a never-convert list (blog, privacy, careers). Takes about a millisecond. Returns nothing rather than guessing, in which case only the homepage is audited.

**The collector is one `page.evaluate`, not thirty `page.$eval` calls.** Each round trip is a CDP hop; the difference is roughly 50ms versus 2s.

**Navigation waits on `domcontentloaded`, never `networkidle`.** Chat widgets and polling scripts mean `networkidle` frequently never fires at all.

**Two text extractions, not one.** `body.textContent` welds block elements together with no separator, so a nav menu plus a heading plus three buttons reads as one 60-word sentence and destroys any readability metric. Readability is computed over block-joined prose; keyword presence uses the full text.

**Images are classified by extension, not just `initiatorType`.** CSS background images arrive as `initiatorType: 'css'`, and on image-heavy sites those are usually the largest files on the page.

**Field data beats lab data where available.** With `CRUX_API_KEY` set, LCP and CLS come from real visitors at the 75th percentile rather than one synthetic load from a datacentre.

**Not-applicable checks are excluded from scoring**, so a site with no form is not punished for having no form — and the category renders as `n/a` rather than a free 100.

**The URL is user-supplied and the worker sits inside a private network**, so `assertPublicHost` resolves the hostname and refuses private, loopback, link-local (including cloud metadata at 169.254.169.254) and CGNAT ranges. This is not airtight against DNS rebinding — the browser resolves independently, after the check. If this ever faces the open internet, put the worker's egress behind an allowlist proxy rather than hardening that function.

## Configuration

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required for written recommendations |
| `CRUX_API_KEY` | — | Optional; enables real-user performance data |
| `AUDIT_DEADLINE_MS` | `25000` | Hard wall, deliberately under the 30s requirement |
| `POOL_SIZE` | `8` | Pre-warmed contexts; each audit borrows 4 |
| `MAX_CONCURRENT_AUDITS` | `2` | Beyond this, requests queue |
| `CRO_MODEL` | `claude-opus-5` | |
| `CRO_EFFORT` | `low` | Latency lever — sweep `low` → `medium` with the bench |
| `NAV_TIMEOUT_MS` | `12000` | Per-page navigation budget |

## Known limits

- Job state is in-memory, so this is single-instance. Multi-replica needs Redis pub/sub for the event stream.
- `transferSize` reads 0 for cross-origin responses without `Timing-Allow-Origin`, so page weight is a floor, not a total. The check says so.
- Page weight varies between runs on sites with lazy-loaded images, because the settle window is bounded at 2.5s. The verdict rarely changes; the exact number does.
- Sites behind an interactive CDN challenge will be audited as the challenge page. Not currently detected.
