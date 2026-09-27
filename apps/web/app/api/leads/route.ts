import { savePrivateRecord } from '@/lib/private-store';
import { randomUUID } from 'node:crypto';
import { validateLead } from '@/lib/lead';
export const runtime='nodejs';
export async function POST(request:Request) {
 const origin=request.headers.get('origin'); const allowedOrigins=new Set([new URL(request.url).origin,process.env.URL,process.env.DEPLOY_PRIME_URL,process.env.SITE_URL].filter(Boolean)); if(origin && !allowedOrigins.has(origin)) return Response.json({error:'Request origin is not allowed.'},{status:403});
 let lead;
 try {
  const text=await request.text();
  if(text.length>8192) return Response.json({error:'Submission is too large.'},{status:413});
  lead=validateLead(JSON.parse(text));
 } catch(error) { return Response.json({error:error instanceof Error?error.message:'Check the form.'},{status:400}); }
 try {
  const id=randomUUID();
  const route=lead.gmv==='100k-plus'||lead.intent==='plus'?'priority':lead.gmv==='under-5k'||lead.budget==='exploring'?'nurture':'standard';
  await savePrivateRecord('leads',id,{id,createdAt:new Date().toISOString(),magnet:'cro',route,...lead});
  return Response.json({id,url:lead.storeUrl},{status:201,headers:{'Cache-Control':'no-store'}});
 } catch { return Response.json({error:'We could not save your details. Please try again.'},{status:500}); }
}
