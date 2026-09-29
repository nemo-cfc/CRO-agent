import { storeUrl } from '@/lib/lead';
import { assertPublicHost, validateProductUrl } from '../../../../worker/src/pipeline/url.js';
import { after } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { AuditEvent } from '@cro/shared';
import { EMPTY, reduce } from '@/lib/report-state';
import { saveReport, type StoredReport } from '@/lib/report-store';
import { checkAuditLimit, clientIp } from '@/lib/audit-rate-limit';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:Request){
 const origin=request.headers.get('origin'); const allowedOrigins=new Set([new URL(request.url).origin,process.env.URL,process.env.DEPLOY_PRIME_URL,process.env.SITE_URL].filter(Boolean)); if(origin && !allowedOrigins.has(origin))return Response.json({error:'Request origin is not allowed.'},{status:403});
 let url:string; let productUrl: string | undefined;
 try{const text=await request.text();if(text.length>4096)throw new Error();const body=JSON.parse(text);if(typeof body.url!=='string')throw new Error();url=storeUrl(body.url);await assertPublicHost(new URL(url));productUrl=await validateProductUrl(new URL(url),body.productUrl);
 }catch{return Response.json({error:'Enter a publicly accessible store URL.'},{status:400});}
 const limit=checkAuditLimit(clientIp(request),url);
 if(!limit.allowed)return Response.json({error:limit.reason==='duplicate'?'This store was audited recently. Please try again later.':'You have reached the audit limit. Please try again later.'},{status:429,headers:{'Retry-After':String(limit.retryAfter),'Cache-Control':'no-store'}});
 const report:StoredReport={id:randomUUID(),createdAt:new Date().toISOString(),status:'running',partial:false,state:{...EMPTY,status:'running',url}};
 try{await saveReport(report);}catch(error){console.error('[reports] could not save a new report:',error);return Response.json({error:'We could not prepare your report. Please try again.'},{status:500});}
 after(async()=>{
  let finished=false;
  try{
   const worker=process.env.WORKER_URL || process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';
   const signal=AbortSignal.timeout(150000);
   const started=await fetch(worker+'/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,productUrl}),signal});
   const job=await started.json();if(!started.ok||!job.jobId)throw new Error(job.error||'The audit could not start.');
   const response=await fetch(worker+'/audit/'+job.jobId+'/stream',{signal});
   if(!response.ok||!response.body)throw new Error('The audit connection could not be opened.');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let boundary:number;
    while((boundary=buffer.indexOf('\n\n'))!==-1){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(!frame.startsWith('data: '))continue;
     const event=JSON.parse(frame.slice(6)) as AuditEvent;report.state=reduce(report.state,event);
     if(event.type==='done'){finished=true;report.partial=event.partial;}
    }
   }
   if(!finished)throw new Error('The audit connection ended before the report was complete.');
   report.status=report.state.scorecard?'done':'error';
   if(report.status==='error')report.state.error ||= 'We could not measure this store. Check that it is publicly accessible.';
  }catch(error){report.status='error';report.state.status='error';report.state.error=error instanceof Error?error.message:'The audit failed. Please retry.';}
  await saveReport(report);
 });
 return Response.json({id:report.id},{status:202,headers:{'Cache-Control':'no-store'}});
}
