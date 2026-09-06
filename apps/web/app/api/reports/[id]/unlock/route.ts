import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import { randomBytes, randomUUID } from 'node:crypto';
import { validateReportLead } from '@/lib/lead';
import { readReport } from '@/lib/report-store';
import { cookieName, digest } from '@/lib/report-access';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const origin=request.headers.get('origin'); const allowedOrigins=new Set([new URL(request.url).origin,process.env.URL,process.env.DEPLOY_PRIME_URL,process.env.SITE_URL].filter(Boolean)); if(!origin || !allowedOrigins.has(origin))return NextResponse.json({error:'Request origin is not allowed.'},{status:403});
 const {id}=await params;const report=await readReport(id);if(!report||report.status!=='done')return NextResponse.json({error:'Report is not ready.'},{status:409});
 let lead;
 try{const text=await request.text();if(text.length>8192)throw new Error('Submission is too large.');lead=validateReportLead({...JSON.parse(text),storeUrl:report.state.url});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Complete all fields.'},{status:400});}
 try{
 const leadId=randomUUID(),token=randomBytes(32).toString('hex'),hash=digest(token),expiresAt=Date.now()+7*86400000;
 await put('leads/'+leadId+'.json',JSON.stringify({id:leadId,reportId:id,createdAt:new Date().toISOString(),...lead},null,2),{access:'private',addRandomSuffix:false,allowOverwrite:true});
 await put('grants/'+hash+'.json',JSON.stringify({hash,reportId:id,leadId,expiresAt}),{access:'private',addRandomSuffix:false,allowOverwrite:true});
 const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 response.cookies.set(cookieName(id),token,{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',maxAge:7*86400,path:'/'});return response;
 }catch{return NextResponse.json({error:'We could not save your details. Please try again.'},{status:500});}
}
