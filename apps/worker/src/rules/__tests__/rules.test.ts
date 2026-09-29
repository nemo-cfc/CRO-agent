import { describe, expect, it } from 'vitest';
import { runRules } from '../index.js';
import { scoreChecks } from '../score.js';
import { healthyEvidence, page, staticEvidence } from './fixtures.js';
import type { Check } from '@cro/shared';

const byId = (checks: Check[], id: string): Check => {
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`no check with id ${id}`);
  return found;
};

describe('rule engine', () => {
  it('scores a healthy page highly and produces no failures', () => {
    const { checks, scorecard } = runRules(healthyEvidence());

    expect(checks.length).toBeGreaterThan(40);
    expect(checks.filter((c) => c.status === 'fail')).toEqual([]);
    expect(scorecard.overall).toBeGreaterThanOrEqual(90);
  });

  it('produces stable ids so recommendations can reference them', () => {
    const a = runRules(healthyEvidence()).checks.map((c) => c.id);
    const b = runRules(healthyEvidence()).checks.map((c) => c.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // ids are unique
  });

  it('is deterministic — same evidence, same score', () => {
    const ev = healthyEvidence();
    expect(runRules(ev).scorecard).toEqual(runRules(ev).scorecard);
  });
});

describe('above the fold', () => {
  it('fails when nothing actionable is visible on mobile', () => {
    const ev = healthyEvidence({
      pages: [
        page({ role: 'home', viewport: 'desktop' }),
        page({ role: 'home', viewport: 'mobile', ctasAboveFold: 0 }),
      ],
    });
    const { checks } = runRules(ev);
    expect(byId(checks, 'aboveFold.ctaMobile').status).toBe('fail');
    // Desktop is fine, so the two must be judged independently.
    expect(byId(checks, 'aboveFold.ctaDesktop').status).toBe('pass');
  });

  it('warns on a long headline and fails when there is none', () => {
    const long = healthyEvidence({
      pages: [page({ copy: { ...page().copy, h1: 'a '.repeat(20).trim() } })],
    });
    expect(byId(runRules(long).checks, 'aboveFold.h1Length').status).toBe('fail');

    const none = healthyEvidence({
      pages: [page({ copy: { ...page().copy, h1: null, h1Count: 0 } })],
    });
    expect(byId(runRules(none).checks, 'aboveFold.h1Present').status).toBe('fail');
  });
});

describe('calls to action', () => {
  it('fails generic button copy', () => {
    const ev = healthyEvidence({
      pages: [page({ ctas: [{ ...page().ctas[0]!, text: 'Submit' }] })],
    });
    expect(byId(runRules(ev).checks, 'cta.copy').status).toBe('fail');
  });

  it('fails a low-contrast button', () => {
    const ev = healthyEvidence({
      pages: [page({ ctas: [{ ...page().ctas[0]!, contrast: 1.8 }] })],
    });
    expect(byId(runRules(ev).checks, 'cta.contrast').status).toBe('fail');
  });

  it('flags an undersized mobile tap target', () => {
    const ev = healthyEvidence({
      pages: [
        page({ role: 'home', viewport: 'desktop' }),
        page({
          role: 'home',
          viewport: 'mobile',
          ctas: [{ ...page().ctas[0]!, width: 90, height: 22 }],
        }),
      ],
    });
    expect(byId(runRules(ev).checks, 'cta.tapTarget').status).toBe('fail');
  });
});

describe('forms', () => {
  it('is marked not-applicable when the site has no form', () => {
    const { checks } = runRules(healthyEvidence());
    expect(byId(checks, 'forms.present').status).toBe('na');
  });

  it('fails a long form and flags unlabelled fields', () => {
    const ev = healthyEvidence({
      pages: [
        page({
          form: {
            fields: 11, requiredFields: 9, unlabelledFields: 5,
            fieldsWithAutocomplete: 0, submitText: 'Submit',
            hasCaptcha: true, inputTypes: ['text', 'email'],
          },
          formCount: 1,
        }),
      ],
    });
    const { checks } = runRules(ev);
    expect(byId(checks, 'forms.fieldCount').status).toBe('fail');
    expect(byId(checks, 'forms.labels').status).toBe('fail');
    expect(byId(checks, 'forms.autocomplete').status).toBe('fail');
    expect(byId(checks, 'forms.captcha').status).toBe('warn');
  });
});

describe('speed', () => {
  it('prefers real-user field data over the lab measurement', () => {
    const ev = healthyEvidence({
      crux: { available: true, lcpP75: 5200, inpP75: 300, clsP75: 0.31 },
    });
    const { checks } = runRules(ev);
    const lcp = byId(checks, 'speed.lcp');

    // Lab LCP in the fixture is a healthy 1800ms; field data says 5200ms.
    // Field data is what visitors actually experience, so it must win.
    expect(lcp.status).toBe('fail');
    expect(lcp.evidence['source']).toContain('real visitors');
    expect(byId(checks, 'speed.cls').status).toBe('fail');
  });

  it('calls out images when they dominate page weight', () => {
    const ev = healthyEvidence({
      pages: [
        page({
          perf: {
            ...page().perf,
            totalBytes: 24_000_000,
            imageBytes: 23_400_000,
            scriptBytes: 300_000,
          },
        }),
      ],
    });
    const weight = byId(runRules(ev).checks, 'speed.weight');
    expect(weight.status).toBe('fail');
    expect(weight.detail).toContain('images');
    expect(weight.evidence['imageSharePct']).toBe(98);
  });
});

describe('scoring', () => {
  it('excludes not-applicable checks from the denominator', () => {
    const withNa = scoreChecks([
      { id: 'a', category: 'cta', title: '', status: 'pass', weight: 1, detail: '', scope: 'home', evidence: {} },
      { id: 'b', category: 'cta', title: '', status: 'na', weight: 0, detail: '', scope: 'home', evidence: {} },
    ]);
    // One pass, one skipped -> 100, not 50.
    expect(withNa.categories.find((c) => c.category === 'cta')?.score).toBe(100);
  });

  it('counts a warning as half a pass', () => {
    const s = scoreChecks([
      { id: 'a', category: 'cta', title: '', status: 'pass', weight: 1, detail: '', scope: 'home', evidence: {} },
      { id: 'b', category: 'cta', title: '', status: 'warn', weight: 1, detail: '', scope: 'home', evidence: {} },
    ]);
    expect(s.categories.find((c) => c.category === 'cta')?.score).toBe(75);
  });

  it('respects check weights within a category', () => {
    const s = scoreChecks([
      { id: 'heavy', category: 'cta', title: '', status: 'fail', weight: 3, detail: '', scope: 'home', evidence: {} },
      { id: 'light', category: 'cta', title: '', status: 'pass', weight: 1, detail: '', scope: 'home', evidence: {} },
    ]);
    expect(s.categories.find((c) => c.category === 'cta')?.score).toBe(25);
  });

  it('does not let an entirely skipped category inflate the overall score', () => {
    const s = scoreChecks([
      { id: 'a', category: 'cta', title: '', status: 'fail', weight: 1, detail: '', scope: 'home', evidence: {} },
      { id: 'b', category: 'forms', title: '', status: 'na', weight: 0, detail: '', scope: 'home', evidence: {} },
    ]);
    // forms reports 100 for display, but contributes nothing to the overall.
    expect(s.categories.find((c) => c.category === 'forms')?.applicable).toBe(0);
    expect(s.overall).toBe(0);
  });
});

describe('degradation', () => {
  it('still returns checks when rendering fails entirely', () => {
    const ev = healthyEvidence({ pages: [] });
    const { checks, scorecard } = runRules(ev);

    // The static-HTML track alone should still carry the technical checks.
    expect(byId(checks, 'technical.title').status).toBe('pass');
    expect(byId(checks, 'aboveFold.unavailable').status).toBe('na');
    expect(scorecard.overall).toBeGreaterThan(0);
  });

  it('still returns checks when the HTML fetch fails', () => {
    const ev = healthyEvidence({ static: null });
    const { checks } = runRules(ev);
    expect(byId(checks, 'technical.unavailable').status).toBe('na');
    expect(byId(checks, 'cta.copy').status).toBe('pass');
  });

  it('withholds interface conclusions from an unfinished page', () => {
    // Heavy commerce pages routinely sit at readyState "interactive" with a
    // complete DOM while a slow third-party script keeps the load event from
    // firing. Those carry a warning in `error` but must remain `ok` and be
    // scored — discarding them produced an empty report for real sites.
    const ev = healthyEvidence({
      pages: [
        page({
          role: 'home',
          viewport: 'mobile',
          ok: true,
          error: 'Still loading after 12s — audited as rendered',
          ctasAboveFold: 0,
        }),
      ],
    });
    const { checks, scorecard } = runRules(ev);
    expect(checks.some(c => c.id === 'aboveFold.ctaMobile')).toBe(false);
    expect(scorecard.overall).toBeGreaterThan(0);
  });

  it('ignores a page that did not load when picking evidence', () => {
    const ev = healthyEvidence({
      pages: [
        page({ role: 'home', viewport: 'desktop', ok: false, error: 'timeout', ctasAboveFold: 0 }),
        page({ role: 'home', viewport: 'mobile' }),
      ],
    });
    // The mobile view loaded and has a CTA; the failed desktop view must not
    // be treated as evidence of a missing one.
    expect(byId(runRules(ev).checks, 'aboveFold.ctaMobile').status).toBe('pass');
  });
});

describe('technical', () => {
  it('fails a missing meta description and warns on a long title', () => {
    const ev = healthyEvidence({
      static: staticEvidence({ metaDescription: null, title: 'x'.repeat(120) }),
    });
    const { checks } = runRules(ev);
    expect(byId(checks, 'technical.metaDescription').status).toBe('fail');
    expect(byId(checks, 'technical.title').status).toBe('warn');
  });
});
