import { mergeTracking } from '../browser/tracking.js';
import type { AuditEvent, AuditEvidence, PageEvidence, TrackingEvidence } from '@cro/shared';
import { PLATFORM_LABELS, isStore } from '@cro/shared';
import { config } from '../config.js';
import { collectPage } from '../browser/collect.js';
import { runRules } from '../rules/index.js';
import { writeRecommendations } from '../llm/recommend.js';
import { fetchStatic } from './static.js';
import { fetchCrux } from './crux.js';
import { pickTargets } from './targets.js';
import { attachShots } from './attach-shots.js';

export type Emit = (event: AuditEvent) => void;

export async function runAudit(url: string, emit: Emit, productUrl?: string): Promise<void> {
  const started = Date.now();
  const at = () => Date.now() - started;
  const notes: string[] = [];

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), config.deadlineMs);
  const { signal } = controller;

  const phase = (p: AuditEvent extends { type: 'phase' } ? never : Parameters<typeof phaseEvent>[0], label: string) =>
    emit(phaseEvent(p, label, at()));

  try {
    /* -------------------------------------------------------------- *
     * Static HTML + field data, in parallel. Both are fast and neither
     * needs a browser, so the link graph is ready before rendering.
     * -------------------------------------------------------------- */
    phase('fetching', 'Reading the page');

    const [staticResult, crux] = await Promise.all([
      fetchStatic(url, signal),
      fetchCrux(url, signal),
    ]);

    if (!staticResult) notes.push('The raw HTML could not be fetched; some technical checks were skipped.');

    const staticEvidence = staticResult?.evidence ?? null;
    const platform = staticResult?.platform ?? 'other';

    // On a store this walks the funnel — homepage, collection, product —
    // because each stage loses shoppers differently. Elsewhere it resolves to
    // the single highest-intent page.
    const { targets, notes: targetNotes } = await pickTargets(
      staticEvidence?.finalUrl ?? url,
      platform,
      staticEvidence,
      signal,
      productUrl,
    );
    notes.push(...targetNotes);

    emit({
      type: 'meta',
      url,
      finalUrl: staticEvidence?.finalUrl ?? url,
      title: staticEvidence?.title ?? null,
      description: staticEvidence?.metaDescription ?? null,
      platform,
      targets,
      generator: staticEvidence?.generator ?? null,
      tracking: null,
      at: at(),
    });

    /* -------------------------------------------------------------- *
     * Render. Four contexts in parallel — home and the high-intent page,
     * each at desktop and mobile. Screenshots are taken on the desktop
     * home view and the mobile home view only; two are enough for the
     * report and each one costs real milliseconds.
     * -------------------------------------------------------------- */
    phase(
      'rendering',
      isStore(platform)
        ? `Loading ${targets.length} ${PLATFORM_LABELS[platform]} pages on desktop and mobile`
        : `Loading ${targets.length === 1 ? 'the page' : 'both pages'} on desktop and mobile`,
    );

    // Viewports per role, and this is a budget decision worth being explicit
    // about. Loading three funnel pages at both widths means six concurrent
    // Chromium renders, which measured 20s on a real store — enough to breach
    // the 30s wall once the model call is added.
    //
    // The homepage keeps both widths because layout differences there are
    // material and the desktop screenshot is what makes the report
    // recognisable. Collection and product pages are mobile-only: nearly every
    // check that reads them already prefers the mobile view, and on a store
    // mobile is where the traffic and the losses are. Better to audit three
    // pages honestly at the width that matters than two pages at both.
    const VIEWPORTS: Record<typeof targets[number]['role'], readonly ('desktop' | 'mobile')[]> = {
      home: ['desktop', 'mobile'],
      keypage: ['desktop', 'mobile'],
      collection: ['mobile'],
      product: ['mobile'],
    };

    const loads: { url: string; role: typeof targets[number]['role']; viewport: 'desktop' | 'mobile'; screenshot: boolean; probeOnly?: boolean }[] =
      targets.flatMap((t) =>
        VIEWPORTS[t.role].map((viewport) => ({
          url: t.url,
          role: t.role,
          viewport,
          // One screenshot per page: mobile everywhere, plus desktop home.
          screenshot: viewport === 'mobile' || t.role === 'home',
        })),
      );
    // The add-to-bag test gets its own mobile session on the product page,
    // in parallel with the measured load rather than after it.
    const product = targets.find((t) => t.role === 'product');
    if (product) loads.push({ url: product.url, role: 'product', viewport: 'mobile', screenshot: false, probeOnly: true });

    const allLoads: PageEvidence[] = await Promise.all(
      loads.map((t) =>
        collectPage({ ...t, signal }).then((page) => {
          // Push each screenshot the moment its page finishes rather than
          // waiting for the slowest of the four.
          if (page.screenshot) {
            emit({
              type: 'shot',
              role: page.role,
              viewport: page.viewport,
              url: page.finalUrl,
              dataUri: page.screenshot,
              at: at(),
            });
          }
          if (page.sectionShots?.length) {
            emit({ type: 'sections', role: page.role, url: page.finalUrl, shots: page.sectionShots, at: at() });
          }
          return page;
        }),
      ),
    );

    // Fold the probe's result into the measured product page; the probe load
    // itself is not a page the rules should score.
    const probeLoad = allLoads[loads.findIndex((l) => l.probeOnly)] ?? null;
    const pages = allLoads.filter((_, i) => !loads[i]!.probeOnly);
    if (probeLoad) {
      const target = pages.find((p) => p.role === 'product' && p.viewport === 'mobile');
      if (target) {
        target.cartProbe = probeLoad.cartProbe ?? {
          status: 'failed', reason: probeLoad.error ?? 'The test page did not load in time.', selections: [], buttonText: null, kind: 'none',
          hasCheckout: false, checkoutText: null, hasContinueShopping: false, hasRecommendations: false,
          hasFreeShippingMessage: false, hasExpressPay: false, ms: 0,
        };
        if (!target.ecommerce.addToCartText && target.cartProbe.status !== 'failed' && target.cartProbe.status !== 'no-feedback' && target.cartProbe.buttonText) {
          target.ecommerce.addToCartText = target.cartProbe.buttonText;
          notes.push('Buy control confirmed in the independent cart session; arrival visibility remains unverified.');
        }
        target.elementShots = [...(target.elementShots ?? []), ...(probeLoad.elementShots ?? [])];
      }
    }

    const loaded = pages.filter((p) => p.ok);

    if (loaded.length === 0) {
      const reason = pages.find((p) => p.error)?.error ?? 'the page did not respond';

      // Raw-HTML checks alone produce nothing the report may publish, so a
      // "done" here delivered an empty report (motoradds.com). Fail instead,
      // so the shopper is told to retry rather than shown a blank audit.
      emit({
        type: 'error',
        message: `We could not open ${url} in our browser (${reason}). Please try again in a minute.`,
        recoverable: false,
        at: at(),
      });
      emit({ type: 'done', durationMs: at(), partial: true, notes, at: at() });
      return;
    } else if (loaded.length < pages.length) {
      notes.push(`${pages.length - loaded.length} of ${pages.length} page views did not load in time.`);
    }

    // A page that rendered but never finished loading is still reported as
    // audited — say so, rather than quietly presenting it as a clean run.
    const slow = loaded.filter((p) => p.error !== null);
    if (slow.length > 0) {
      notes.push(
        `${slow.length === pages.length ? 'The site' : `${slow.length} of ${pages.length} page views`} was still loading when measured, so speed figures are a lower bound.`,
      );
    }

    // Cross-check tracking: DOM globals miss loaders deferred behind consent,
    // the HTML scan misses tags injected at runtime. Union of the two.
    const tracking = mergeTracking(...loaded.map((p) => p.tracking), staticResult?.trackingFromHtml);
    for (const p of pages) if (tracking) p.tracking = tracking;

    const evidence: AuditEvidence = {
      url,
      platform,
      targets,
      static: staticEvidence,
      crux,
      // Screenshots already went out over the wire; drop them from the
      // evidence object so the packet handed around stays small.
      pages: pages.map((p) => ({ ...p, screenshot: null, elementShots: undefined })),
    };

    emit({
      type: 'meta',
      url,
      finalUrl: staticEvidence?.finalUrl ?? loaded[0]?.finalUrl ?? url,
      title: staticEvidence?.title ?? null,
      description: staticEvidence?.metaDescription ?? null,
      platform,
      targets,
      generator: staticEvidence?.generator ?? null,
      tracking,
      at: at(),
    });

    /* -------------------------------------------------------------- *
     * Score. Pure functions, well under 100ms.
     * -------------------------------------------------------------- */
    phase('scoring', 'Running the checks');
    const { checks, scorecard } = runRules(evidence);
    // Pictures ride along for the report only; the model call below still
    // receives the plain checks.
    emit({ type: 'checks', checks: attachShots(checks, pages), scorecard, at: at() });

    /* -------------------------------------------------------------- *
     * Write. The single model call.
     * -------------------------------------------------------------- */
    // The model gets its own window. Measurement stops at the deadline with
    // whatever it has; the write-up may then run until WRITE_DEADLINE_MS, so a
    // slow site no longer leaves no time at all for recommendations.
    const writer = new AbortController();
    const writeTimer = setTimeout(() => writer.abort(), Math.max(3000, config.writeDeadlineMs - at()));
    phase('writing', 'Writing recommendations');
    const result = await writeRecommendations(evidence, checks, scorecard, writer.signal, {
      onSummary: (text) => emit({ type: 'summary', text, at: at() }),
      onRecommendation: (recommendation, index) =>
        emit({ type: 'rec', index, recommendation, at: at() }),
    });

    clearTimeout(writeTimer);
    if (result.note) notes.push(result.note);

    phase('done', 'Report complete');
    emit({
      type: 'done',
      durationMs: at(),
      partial: !result.ok || loaded.length < pages.length || loaded.some(p => p.error !== null),
      notes,
      at: at(),
    });
  } catch (err) {
    emit({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
      at: at(),
    });
    emit({ type: 'done', durationMs: at(), partial: true, notes, at: at() });
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}

function phaseEvent(
  p: 'queued' | 'resolving' | 'fetching' | 'rendering' | 'scoring' | 'writing' | 'done',
  label: string,
  at: number,
): AuditEvent {
  return { type: 'phase', phase: p, label, at };
}
