import { createHash } from 'node:crypto';

export interface EventReceipt {
  provider: 'Meta' | 'Google Ads'; tagId: string; eventName: string;
  endpoint: string; fingerprint: string; at: number; navigation: number;
}
export interface RepeatedEvent {
  provider: 'Meta' | 'Google Ads'; tagId: string; eventName: string;
  endpoint: string; count: number; intervalMs: number;
}

/** Only successful, matching same-endpoint event receipts qualify upstream. */
export function parseEventReceipt(rawUrl: string, body: string | null, at: number, navigation: number): EventReceipt | null {
  try {
    const url = new URL(rawUrl);
    const params = new URLSearchParams(url.search);
    if (body) for (const [key,value] of new URLSearchParams(body)) params.append(key,value);
    // Never flag identifiers used for legitimate deduplication, consent updates,
    // or retries as proof of duplicate conversions. Unknown formats stay silent.
    if (['eid','eventID','event_id','transaction_id','oid','gcs','gcd','consent','retry'].some(k => params.has(k))) return null;
    let provider: EventReceipt['provider'], tagId: string, eventName: string;
    if (['www.facebook.com','facebook.com'].includes(url.hostname) && url.pathname === '/tr/' && params.get('ev') === 'PageView') {
      provider='Meta';tagId=params.get('id')??'';eventName='PageView';
    } else if (['www.googleadservices.com','www.google.com'].includes(url.hostname) && /^\/pagead\/(?:1p-)?conversion\/\d+\/?$/.test(url.pathname) && params.get('label')) {
      provider='Google Ads';tagId=url.pathname.match(/\d+/)![0];eventName='conversion label '+params.get('label');
    } else return null;
    if (!/^\d+$/.test(tagId)) return null;
    for (const key of ['ts','timestamp','random','rnd','cb','z']) params.delete(key);
    params.sort();
    const endpoint=url.origin+url.pathname;
    // Raw request identifiers, cookies and customer data are never persisted.
    const fingerprint=createHash('sha256').update(endpoint+'?'+params.toString()).digest('hex');
    return {provider,tagId,eventName,endpoint,fingerprint,at,navigation};
  } catch { return null; }
}

export function repeatedEvents(receipts: EventReceipt[]): RepeatedEvent[] {
  const groups=new Map<string,EventReceipt[]>();
  for (const event of receipts) {
    const key=event.navigation+':'+event.fingerprint;
    groups.set(key,[...(groups.get(key)??[]),event]);
  }
  return [...groups.values()].flatMap(events => {
    const sorted=events.sort((a,b)=>a.at-b.at);
    const first=sorted[0]!;
    const cluster=sorted.filter(e=>e.at-first.at<=2000);
    if(cluster.length<2)return [];
    return [{provider:first.provider,tagId:first.tagId,eventName:first.eventName,endpoint:first.endpoint,count:cluster.length,intervalMs:Math.round(cluster[cluster.length-1]!.at-first.at)}];
  });
}
