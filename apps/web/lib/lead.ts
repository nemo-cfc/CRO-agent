export const choices = {
 intent: [['build','New store / first Shopify build'],['redesign','Redesign - store leaks revenue'],['scale','Scale - CRO, apps, retention'],['plus','Shopify Plus / multi-region / B2B']],
 gmv: [['pre','Not live / pre-revenue'],['under-5k','Under $5k'],['5-20k','$5k - $20k'],['20-50k','$20k - $50k'],['50-100k','$50k - $100k'],['100k-plus','$100k+']],
 budget: [['exploring','Exploring / not budgeted'],['under-2k','Under $2,000'],['2-5k','$2,000 - $5,000'],['5-15k','$5,000 - $15,000'],['15k-plus','$15,000+']],
 urgency: [['asap','This month'],['30-60','30-60 days'],['quarter','This quarter'],['research','Researching only']],
} as const;
export type Lead = { storeUrl:string; intent:string; gmv:string; budget:string; urgency:string; name:string; email:string; phone:string };
export function storeUrl(value:string): string {
 const u = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : 'https://' + value.trim());
 if (!['http:','https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) throw new Error('Enter a public store URL, such as yourstore.com.');
 return u.toString();
}
export function validateLead(value: unknown): Lead {
 if (!value || typeof value !== 'object') throw new Error('Complete all form fields.');
 const v=value as Record<string,unknown>;
 const result = {} as Lead;
 for (const key of ['storeUrl','intent','gmv','budget','urgency','name','email','phone'] as const) {
  if (typeof v[key] !== 'string' || (v[key] as string).length > (key==='storeUrl'?2048:254)) throw new Error('Check your form details.');
  result[key]=(v[key] as string).trim();
 }
 result.storeUrl=storeUrl(result.storeUrl);
 for (const key of ['intent','gmv','budget','urgency'] as const) if (!choices[key].some(([id])=>id===result[key])) throw new Error('Select your needs, revenue, budget, and timing.');
 if (result.name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('Enter your name and a valid email address.');
 if(result.phone && !/^[+()\d\s.-]{5,40}$/.test(result.phone)) throw new Error('Check your phone number or leave it blank.');
 return result;
}

export function validateReportLead(value:unknown){
 if(!value||typeof value!=='object')throw new Error('Complete your contact details.');
 const v=value as Record<string,unknown>;
 if(typeof v.strategySession!=='boolean')throw new Error('Choose whether you would like a free strategy session.');
 const lead=validateLead(v.strategySession?v:{...v,intent:'build',gmv:'pre',budget:'exploring',urgency:'research'});
 return {...lead,strategySession:v.strategySession,intent:v.strategySession?lead.intent:null,gmv:v.strategySession?lead.gmv:null,budget:v.strategySession?lead.budget:null,urgency:v.strategySession?lead.urgency:null,privacyNoticeVersion:'2026-09-06'};
}
