import {it,expect} from 'vitest';
import {reportObservation,plainLanguage,type Check} from '@cro/shared';
const metric=(value:unknown,source:unknown,status:Check['status']='pass')=>({id:'speed.lcp',category:'speed',title:'LCP',detail:'old dramatic claim',scope:'home',weight:1,status,evidence:{lcpMs:value,source}} as Check);
it('shows measured results even when no problem was flagged',()=>{
 expect(reportObservation(metric(1200,'mobile audit load'))?.detail).toContain('1200 ms');
});
it('withholds invalid and unsourced measurements',()=>{
 for(const value of [null,'4000',-1,NaN,Infinity])expect(reportObservation(metric(value,'audit load'))).toBeNull();
 expect(reportObservation(metric(4000,''))).toBeNull();
 expect(reportObservation(metric(4000,'audit load','na'))).toBeNull();
});
it('does not turn measured data into a guaranteed sales impact',()=>{
 const result=plainLanguage(metric(5000,'mobile audit load','fail'));
 expect(result.found).toContain('5000 ms');expect(result.found).not.toContain('dramatic');
 expect(result.impact.range).toBeNull();expect(result.impact.statement).toBe('');
});
