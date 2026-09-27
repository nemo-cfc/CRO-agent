import type { Check } from '@cro/shared';
import { check, type RuleContext } from './util.js';

export function duplicateScriptRules(ctx: RuleContext): Check[] {
  return ctx.evidence.pages.filter(p=>p.ok&&!p.error).flatMap(page=>(page.duplicateScripts??[]).map((script,i)=>check({
    id:`observed.duplicate-script.${page.role}.${page.viewport}.${i}`, category:'tracking',scope:page.role,status:'warn',weight:0.5,
    title:`${script.provider}: the same loader is referenced more than once`,
    detail:`The same ${script.provider} loader (${script.source}) appears in ${script.count} active script elements on ${page.finalUrl} in the ${page.viewport} view. The duplicate references were present in two consecutive observations.`,
    evidence:{policy:'script-v1',confirmed:true,url:page.finalUrl,viewport:page.viewport,provider:script.provider,count:script.count,source:script.source,suggestion:'Duplicate loader references may cause redundant initialization or extra event requests. Check which integrations add them and consolidate unintended duplicates. This observation alone does not establish duplicate conversions or failed event deduplication.'},
  })));
}

export function observedTrackingRules(ctx: RuleContext): Check[] {
  return ctx.evidence.pages.filter(p=>p.ok&&!p.error).flatMap(page=>(page.repeatedEvents??[]).map((event,i)=>check({
    id:`observed.repeated-event.${page.role}.${page.viewport}.${i}`,category:'tracking',scope:page.role,status:'warn',weight:0.75,
    title:`${event.provider}: matching event requests repeated`,
    detail:`During one ${page.viewport} page load of ${page.finalUrl}, ${event.count} matching ${event.eventName} requests for tag ${event.tagId} received successful HTTP responses from ${event.endpoint} within ${event.intervalMs}ms. This confirms repeated browser requests, not duplicate counted conversions or a server-side deduplication failure.`,
    evidence:{policy:'network-v1',confirmed:true,url:page.finalUrl,viewport:page.viewport,provider:event.provider,tagId:event.tagId,eventName:event.eventName,count:event.count,intervalMs:event.intervalMs,endpoint:event.endpoint,suggestion:'Trace the matching browser event triggers and check whether more than one integration emits the same event. Verify counting and deduplication in the ad platform before changing the implementation.'},
  })));
}
