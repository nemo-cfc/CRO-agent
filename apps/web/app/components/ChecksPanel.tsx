'use client';

import { CATEGORY_LABELS, ROLE_LABELS, type Check } from '@cro/shared';

const SCOPE_LABEL: Record<Check['scope'], string | null> = {
  home: null,
  site: null,
  keypage: ROLE_LABELS.keypage,
  collection: ROLE_LABELS.collection,
  product: ROLE_LABELS.product,
};

const MARK: Record<Check['status'], string> = {
  pass: '✓',
  warn: '!',
  fail: '✕',
  na: '–',
};

function CheckItem({ check }: { check: Check }) {
  return (
    <li className={`check ${check.status}`}>
      <span className={`mark ${check.status}-color`}>{MARK[check.status]}</span>
      <div>
        <div className="title">
          {check.title}
          {SCOPE_LABEL[check.scope] && <span className="scope">{SCOPE_LABEL[check.scope]}</span>}
        </div>
        <div className="detail">{check.detail}</div>
      </div>
    </li>
  );
}

export function ChecksPanel({ checks }: { checks: Check[] }) {
  const problems = checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  const passed = checks.filter((c) => c.status === 'pass');
  const notApplicable = checks.filter((c) => c.status === 'na');

  // Failures first, then warnings, then heaviest within each — the same
  // ordering the model receives, so the report reads consistently.
  const ordered = [...problems].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'fail' ? -1 : 1;
    return b.weight - a.weight;
  });

  const byCategory = new Map<string, Check[]>();
  for (const c of ordered) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  return (
    <section className="panel">
      <h2>
        What we measured — {problems.length} issue{problems.length === 1 ? '' : 's'} across{' '}
        {checks.length} checks
      </h2>

      {problems.length === 0 && (
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Every applicable check passed. That is unusual — worth a manual look to confirm the page
          rendered as expected.
        </p>
      )}

      {[...byCategory.entries()].map(([category, list]) => (
        <div className="checkGroup" key={category}>
          <h3>
            {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
            <span className="count">
              {list.filter((c) => c.status === 'fail').length} failed,{' '}
              {list.filter((c) => c.status === 'warn').length} to review
            </span>
          </h3>
          <ul className="checks">
            {list.map((c) => (
              <CheckItem check={c} key={c.id} />
            ))}
          </ul>
        </div>
      ))}

      {passed.length > 0 && (
        <details className="passed">
          <summary>
            {passed.length} check{passed.length === 1 ? '' : 's'} passed
            {notApplicable.length > 0 && ` · ${notApplicable.length} not applicable`}
          </summary>
          <ul className="checks" style={{ marginTop: 10 }}>
            {passed.map((c) => (
              <CheckItem check={c} key={c.id} />
            ))}
            {notApplicable.map((c) => (
              <CheckItem check={c} key={c.id} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
