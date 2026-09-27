import { describe, expect, it } from 'vitest';
import { isVisibleFinding, visibleRecommendations, visibleSummary, type Recommendation, type VisualObservation } from '@cro/shared';
import { stableVisualObservations } from '../../browser/visual.js';
import { buildEvidencePacket } from '../../llm/evidence-packet.js';
import { groundedRecommendation } from '../../llm/publication.js';
import { runRules } from '../index.js';
import { healthyEvidence, page } from './fixtures.js';

const observation: VisualObservation = {kind:'small-text',text:'Delivery details here',selector:'#delivery',x:10,y:20,width:150,height:12,viewportWidth:390,viewportHeight:844,fontSize:10};
function audit() {
 const evidence=healthyEvidence();
 evidence.pages=[page({visualObservations:[observation]})];
 return {evidence,...runRules(evidence)};
}
const candidate: Recommendation={title:'Sales drop by 30%',category:'tracking',severity:'critical',impact:'high',effort:'significant',why_it_matters:'Clarity is missing and shoppers abandon checkout.',fix:'Install tracking.',evidence_refs:[]};

describe('visible evidence publication',()=>{
 it('withholds legacy checks and diagnostics while preserving their score',()=>{
  const base=healthyEvidence();base.pages=[page()];
  const result=audit();
  expect(result.scorecard).toEqual(runRules(base).scorecard);
  expect(result.checks.filter(isVisibleFinding)).toHaveLength(1);
  expect(isVisibleFinding(result.checks.find(c=>c.id==='tracking.analytics')!)).toBe(false);
 });
 it('excludes failed and incomplete page views',()=>{
  for(const overrides of [{ok:false},{error:'Still loading'}]){
   const evidence=healthyEvidence();evidence.pages=[page({...overrides,visualObservations:[observation]})];
   expect(runRules(evidence).checks.filter(isVisibleFinding)).toEqual([]);
  }
 });
 it('provides the writer only publishable findings, not metrics or scores',()=>{
  const {evidence,checks,scorecard}=audit();
  const packet=buildEvidencePacket(evidence,checks,scorecard);
  expect(packet.problems).toHaveLength(1);
  expect(packet.problems[0]!.id).toContain('visual.');
  expect(packet).not.toHaveProperty('scores');
  expect(packet).not.toHaveProperty('fieldData');
 });
 it('rejects fabricated or mixed evidence references',()=>{
  const {checks}=audit();const id=checks.find(isVisibleFinding)!.id;
  for(const refs of [[],['invented'],[id,'tracking.analytics']])expect(groundedRecommendation({...candidate,evidence_refs:refs},checks)).toBeNull();
 });
 it('replaces unsupported model claims with exact observations and approved suggestions',()=>{
  const {checks}=audit();const check=checks.find(isVisibleFinding)!;
  const rec=groundedRecommendation({...candidate,evidence_refs:[check.id]},checks)!;
  expect(rec.why_it_matters).toBe(check.detail);
  expect(rec.fix).toBe(check.evidence.suggestion);
  expect(JSON.stringify(rec)).not.toMatch(/Clarity|30%|abandon|Install tracking/);
 });
 it('hides old recommendations and gives an honest empty state',()=>{
  expect(visibleRecommendations([{...candidate,evidence_refs:['tracking.analytics']}],audit().checks)).toEqual([]);
  expect(visibleSummary([])).toContain('not a clean bill of health');
 });
 it('withholds moving, changed, or newly appearing observations',()=>{
  expect(stableVisualObservations([observation],[observation])).toHaveLength(1);
  expect(stableVisualObservations([observation],[{...observation,y:40}])).toEqual([]);
  expect(stableVisualObservations([observation],[{...observation,text:'Changed'}])).toEqual([]);
  expect(stableVisualObservations([],[observation])).toEqual([]);
 });
});
