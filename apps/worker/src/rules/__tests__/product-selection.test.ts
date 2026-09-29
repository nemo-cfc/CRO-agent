import { describe, it, expect } from 'vitest';
import { pickTargets } from '../../pipeline/targets.js';
import { healthyStoreEvidence } from './fixtures.js';
import { isRecommendable, type Check } from '@cro/shared';
describe('selected products and publication', () => {
 it('preserves a selected product instead of discovering another one', async () => {
  const selected='https://shop.example.com/products/user-selection';
  const result=await pickTargets('https://shop.example.com/', 'shopify', healthyStoreEvidence().static, new AbortController().signal, selected);
  expect(result.targets.filter(t=>t.role==='product').map(t=>t.url)).toEqual([selected]);
 });
 it('preserves selection even if static HTML failed', async () => {
  const selected='https://shop.example.com/products/user-selection';
  const result=await pickTargets('https://shop.example.com/', 'other', null, new AbortController().signal, selected);
  expect(result.targets.some(t=>t.url===selected && t.role==='product')).toBe(true);
 });
 it('does not publish an unknown failing heuristic by default',()=>{
  expect(isRecommendable({id:'future.missingThing',status:'fail',weight:2,evidence:{}} as Check)).toBe(false);
 });
});
