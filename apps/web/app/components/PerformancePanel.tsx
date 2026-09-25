import type { Check } from '@cro/shared';

const metrics = [
  ['speed.fcp', 'FCP', 'fcpMs', 'First Contentful Paint'],
  ['speed.lcp', 'LCP', 'lcpMs', 'Largest Contentful Paint'],
  ['speed.cls', 'CLS', 'cls', 'Cumulative Layout Shift'],
  ['speed.blocking', 'TBT estimate', 'blockingTimeMs', 'Blocking time during this visit'],
  ['speed.ttfb', 'TTFB', 'ttfbMs', 'Time to First Byte'],
  ['speed.inp', 'INP', 'inpMs', 'Interaction to Next Paint'],
] as const;

export function PerformancePanel({ checks }: { checks: Check[] }) {
  return <section className="panel">
    <h2>Page performance</h2>
    <p>Metrics also used in Lighthouse and Core Web Vitals. This is a short, unthrottled audit, not a Lighthouse run or score. Lab values can differ from Lighthouse. Real-user data is labeled separately; Speed Index is not measured.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
      {metrics.map(([id, label, key, name]) => {
        const check = checks.find((item) => item.id === id);
        const value = check?.evidence[key];
        const measured = check !== undefined && typeof value === 'number';
        return <div key={id} style={{ padding: 16, border: '1px solid var(--line, #ddd)', borderRadius: 8 }}>
          <div title={name}>{label}</div>
          <strong style={{ display: 'block', fontSize: 26 }} className={measured ? `${check.status}-color` : ''}>
            {measured ? (key === 'cls' ? value.toFixed(3) : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`) : 'Unavailable'}
          </strong>
          <small>{measured ? `${check.status === 'pass' ? 'Good' : check.status === 'warn' ? 'Needs improvement' : 'Poor'} · ${check.evidence.source ?? 'Audit measurement'}` : check?.detail ?? 'Not measured in this report.'}</small>
        </div>;
      })}
    </div>
  </section>;
}
