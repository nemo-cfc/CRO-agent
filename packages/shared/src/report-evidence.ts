import type { Check } from './schema.js';

export interface ReportObservation {
  title: string;
  detail: string;
  suggestion: string;
  kind: 'measurement' | 'design' | 'observation';
}
const metrics: Record<string, {key: string; label: string; unit: string; suggestion: string}> = {
  'speed.fcp': {key:'fcpMs',label:'First Contentful Paint (FCP)',unit:'ms',suggestion:'Inspect resources delaying the first visible content, then repeat the measurement.'},
  'speed.lcp': {key:'lcpMs',label:'Largest Contentful Paint (LCP)',unit:'ms',suggestion:'Identify the largest content element and inspect its loading priority and dependencies before making changes.'},
  'speed.cls': {key:'cls',label:'Cumulative Layout Shift (CLS)',unit:'',suggestion:'Identify the elements that move during loading; reserve space where the trace confirms a shift.'},
  'speed.ttfb': {key:'ttfbMs',label:'Time to First Byte (TTFB)',unit:'ms',suggestion:'Compare repeated server-response measurements and investigate caching or server delays if the result persists.'},
  'speed.inp': {key:'inpMs',label:'Interaction to Next Paint (INP)',unit:'ms',suggestion:'Use interaction traces to locate slow handlers. Origin-level data does not identify the responsible page.'},
  'speed.blocking': {key:'blockingTimeMs',label:'Observed blocking time (estimate)',unit:'ms',suggestion:'Inspect long tasks during loading and test whether reducing unnecessary JavaScript improves responsiveness.'},
};

/** Explicit evidence contracts. Never infer missing features from null/false values. */
export function reportObservation(check: Check): ReportObservation | null {
  if (check.status === 'na') return null;
  const spec=metrics[check.id];
  if (spec) {
    const value=check.evidence[spec.key], source=check.evidence.source;
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||typeof source!=='string'||!source.trim())return null;
    const caveat=check.id==='speed.blocking'?' This bounded observation is not a Lighthouse TBT measurement.':'';
    return {kind:'measurement',title:spec.label,detail:`${spec.label}: ${value}${spec.unit ? ' '+spec.unit : ''}. Source: ${source}.${caveat}`,suggestion:spec.suggestion};
  }
  if(check.id==='mobile.overflow' && typeof check.evidence.overflowPx==='number' && Number.isFinite(check.evidence.overflowPx) && check.evidence.overflowPx>=0 && typeof check.evidence.url==='string' && typeof check.evidence.viewportWidth==='number') {
    return {kind:'measurement',title:'Horizontal page extent',detail:`The measured page extends ${check.evidence.overflowPx}px beyond the ${check.evidence.viewportWidth}px viewport on ${check.evidence.url}. This does not establish which element is responsible.`,suggestion:'Inspect overflow at this screen width and check whether off-screen content is intentional.'};
  }
  if(check.id==='cta.tapTarget' && typeof check.evidence.url==='string' && typeof check.evidence.text==='string' && ['width','height'].every(k=>typeof check.evidence[k]==='number' && Number.isFinite(check.evidence[k]) && Number(check.evidence[k])>0)) {
    return {kind:'design',title:'Review the size of this action',detail:`The action “${check.evidence.text}” measured ${check.evidence.width}×${check.evidence.height}px in the sampled mobile view of ${check.evidence.url}.`,suggestion:'Consider a larger touch area and check surrounding spacing. A size below 44px alone is not proof of a WCAG failure or missed taps.'};
  }
  if(['ecommerce.price','ecommerce.addToCart'].includes(check.id)) {
    try {
      const verification=JSON.parse(String(check.evidence.verification));
      const price=check.id==='ecommerce.price';
      const value=price?check.evidence.priceText:check.evidence.text;
      if(verification.policy!=='product-v2'||verification.completed!==true||verification[price?'price':'buy']!=='observed'||typeof value!=='string'||!value.trim()||typeof check.evidence.url!=='string')return null;
      return {kind:'observation',title:price?'Product price observed':'Buy control observed',detail:`${price?'Price':'Buy control'}: “${value}” on ${check.evidence.url}. Confirmed during the sampled visit; this does not establish initial-screen visibility or checkout success.`,suggestion:''};
    } catch {return null;}
  }
  return null;
}

export function isMeasuredRecommendation(check: Check): boolean {
  const item=reportObservation(check);
  return !!item && item.kind!=='observation' && (check.status==='warn'||check.status==='fail');
}
