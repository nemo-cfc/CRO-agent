import { expect, it } from 'vitest';
import { parseEventReceipt, repeatedEvents } from '../../browser/duplicate-events.js';
import { runRules } from '../index.js';
import { isPublishableFinding, visibleSummary } from '@cro/shared';
import { healthyEvidence, page } from './fixtures.js';

const meta='https://www.facebook.com/tr/?id=12345&ev=PageView&dl=https%3A%2F%2Fexample.com';
it('reports repeated matching receipts only within a single navigation and short window',()=>{
 const first=parseEventReceipt(meta+'&ts=100',null,100,1)!;
 const second=parseEventReceipt(meta+'&ts=200',null,200,1)!;
 expect(repeatedEvents([first,second])).toMatchObject([{provider:'Meta',count:2,intervalMs:100}]);
 expect(repeatedEvents([first,{...second,navigation:2}])).toEqual([]);
 expect(repeatedEvents([first,{...second,at:4000}])).toEqual([]);
 expect(repeatedEvents([first])).toEqual([]);
});
it('withholds deduplication IDs, consent updates and unrelated endpoints',()=>{
 for(const suffix of ['&eid=one','&event_id=one','&oid=order','&gcs=G100','&gcd=consent','&retry=1'])expect(parseEventReceipt(meta+suffix,null,1,1)).toBeNull();
 expect(parseEventReceipt(meta.replace('www.facebook.com','facebook.com.evil.test'),null,1,1)).toBeNull();
 expect(parseEventReceipt(meta.replace('PageView','Purchase'),null,1,1)).toBeNull();
});
it('does not confuse Google Ads fan-out endpoints or labels',()=>{
 const a=parseEventReceipt('https://www.googleadservices.com/pagead/conversion/123/?label=A',null,1,1)!;
 const b=parseEventReceipt('https://www.google.com/pagead/1p-conversion/123/?label=A',null,2,1)!;
 const c=parseEventReceipt('https://www.googleadservices.com/pagead/conversion/123/?label=B',null,2,1)!;
 expect(repeatedEvents([a,b,c])).toEqual([]);
 expect(parseEventReceipt('https://www.googleadservices.com/pagead/conversion/123/?label=A&oid=order-1',null,1,1)).toBeNull();
});
it('publishes duplicate loader evidence with a possible consequence, never a counting verdict',()=>{
 const evidence=healthyEvidence();evidence.pages=[page({duplicateScripts:[{provider:'Meta',source:'https://connect.facebook.net/en_US/fbevents.js',count:2}]})];
 const result=runRules(evidence),finding=result.checks.find(c=>c.id.startsWith('observed.duplicate-script.'))!;
 expect(isPublishableFinding(finding)).toBe(true);
 expect(finding.detail).toContain('2 active script elements');
 expect(finding.evidence.suggestion).toContain('may cause');
 expect(visibleSummary(result.checks)).toContain('1 direct observations');
 expect(result.checks.find(c=>c.id==='tracking.analytics')!.evidence).not.toHaveProperty('policy');
});
