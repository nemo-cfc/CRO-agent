import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { savePrivateRecord } from '@/lib/private-store';
import { readReport, validId } from '@/lib/report-store';
import { cookieName, digest } from '@/lib/report-access';
import { validStaffAccess } from '@/lib/report-link';
export const runtime='nodejs';

/**
 * Opens a report from a staff link (see lib/report-link.ts): grants access the
 * same way the unlock form does, without recording a lead, then shows the report.
 */
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const url=new URL(request.url);
 if(!validId(id)||!validStaffAccess(id,url.searchParams.get('access')))return NextResponse.json({error:'This report link is not valid.'},{status:403});
 const report=await readReport(id);if(!report||report.status!=='done')return NextResponse.json({error:'Report unavailable.'},{status:404});
 const token=randomBytes(32).toString('hex'),hash=digest(token),expiresAt=Date.now()+7*86400000;
 try{await savePrivateRecord('grants',hash,{hash,reportId:id,leadId:'staff',expiresAt});}
 catch{return NextResponse.json({error:'Could not open the report. Please try again.'},{status:500});}
 // Behind a proxy request.url can carry an internal host; prefer the public address.
 const response=NextResponse.redirect(new URL('/reports/'+id,process.env.SITE_URL||url.origin),303);
 response.headers.set('Cache-Control','private, no-store');
 response.cookies.set(cookieName(id),token,{httpOnly:true,sameSite:'lax',secure:url.protocol==='https:',maxAge:7*86400,path:'/'});
 return response;
}
