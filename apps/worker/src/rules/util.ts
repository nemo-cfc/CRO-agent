import type { AuditEvidence, Category, Check, CheckStatus, PageEvidence } from '@cro/shared';

export interface RuleContext {
  evidence: AuditEvidence;
  /** Convenience views. Null when that page/viewport failed to load. */
  homeDesktop: PageEvidence | null;
  homeMobile: PageEvidence | null;
  keyDesktop: PageEvidence | null;
  keyMobile: PageEvidence | null;
  /** Whichever homepage view loaded — most checks are viewport-agnostic. */
  home: PageEvidence | null;
}

export function buildContext(evidence: AuditEvidence): RuleContext {
  const find = (role: string, vp: string) =>
    evidence.pages.find((p) => p.role === role && p.viewport === vp && p.ok && !p.error) ?? null;

  const homeDesktop = find('home', 'desktop');
  const homeMobile = find('home', 'mobile');

  // "The other page we audited" — the generic key page on a normal site, or
  // the product page on a store, since that is where the decision is made.
  const secondary = (vp: 'desktop' | 'mobile') =>
    find('keypage', vp) ?? find('product', vp) ?? find('collection', vp);

  return {
    evidence,
    homeDesktop,
    homeMobile,
    keyDesktop: secondary('desktop'),
    keyMobile: secondary('mobile'),
    home: homeDesktop ?? homeMobile,
  };
}

export interface CheckInput {
  id: string;
  category: Category;
  title: string;
  status: CheckStatus;
  weight?: number;
  detail: string;
  scope?: Check['scope'];
  evidence?: Check['evidence'];
}

export function check(input: CheckInput): Check {
  return {
    id: input.id,
    category: input.category,
    title: input.title,
    status: input.status,
    weight: input.weight ?? 1,
    detail: input.detail,
    scope: input.scope ?? 'home',
    evidence: input.evidence ?? {},
  };
}

/** `pass` at or below `good`, `warn` at or below `ok`, otherwise `fail`. */
export function gradeBelow(value: number, good: number, ok: number): CheckStatus {
  if (value <= good) return 'pass';
  if (value <= ok) return 'warn';
  return 'fail';
}

/** `pass` at or above `good`, `warn` at or above `ok`, otherwise `fail`. */
export function gradeAbove(value: number, good: number, ok: number): CheckStatus {
  if (value >= good) return 'pass';
  if (value >= ok) return 'warn';
  return 'fail';
}

export function bool(value: boolean, whenTrue: CheckStatus, whenFalse: CheckStatus): CheckStatus {
  return value ? whenTrue : whenFalse;
}

export function ms(v: number | null): string {
  if (v === null) return 'not measured';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

export function kb(bytes: number): string {
  if (bytes <= 0) return 'unknown';
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/** A check that could not be evaluated, so it neither helps nor hurts the score. */
export function skipped(
  id: string,
  category: Category,
  title: string,
  reason: string,
): Check {
  return check({ id, category, title, status: 'na', detail: reason, weight: 0 });
}
