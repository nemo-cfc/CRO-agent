import { describe, expect, it } from 'vitest';
import type { CartProbe } from '@cro/shared';
import { cartChecks } from '../ecommerce.js';

const probe = (overrides: Partial<CartProbe> = {}): CartProbe => ({
  status: 'opened', reason: null, selections: ['36', 'C'], buttonText: 'Add to Bag', kind: 'drawer',
  hasCheckout: true, checkoutText: '₹6,700 - CHECKOUT', hasContinueShopping: false, hasRecommendations: false,
  hasFreeShippingMessage: false, hasExpressPay: false, ms: 2100, ...overrides,
});
const byId = (checks: ReturnType<typeof cartChecks>, id: string) => checks.find((c) => c.id === id)!;

describe('cart checks', () => {
  it('flags a drawer with only a checkout button (the SKIMS case)', () => {
    const checks = cartChecks(probe());
    expect(byId(checks, 'ecommerce.cartFeedback').status).toBe('pass');
    expect(byId(checks, 'ecommerce.cartContinue').status).toBe('warn');
    expect(byId(checks, 'ecommerce.cartCrossSell').status).toBe('warn');
    expect(byId(checks, 'ecommerce.cartContinue').detail).toContain('only way back');
  });

  it('passes a drawer that offers continue shopping and suggestions', () => {
    const checks = cartChecks(probe({ hasContinueShopping: true, hasRecommendations: true }));
    expect(checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('never blames the store when the tap could not be automated', () => {
    for (const p of [null, probe({ status: 'failed', reason: 'No add-to-bag button was recognised.' })]) {
      const checks = cartChecks(p);
      expect(checks).toHaveLength(1);
      expect(checks[0]!.status).toBe('na');
    }
  });

  it('warns when nothing visible happens after the tap', () => {
    const checks = cartChecks(probe({ status: 'no-feedback', kind: 'none', hasCheckout: false }));
    expect(checks.map((c) => c.id)).toEqual(['ecommerce.cartFeedback']);
    expect(checks[0]!.status).toBe('warn');
  });
});
