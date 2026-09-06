import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { get } from '@vercel/blob';
import { cookies } from 'next/headers';
import { validId } from './report-store';
export const cookieName=(id:string)=>'mm_report_'+id;
export const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function hasReportAccess(id:string){
 if(!validId(id))return false;
 const token=(await cookies()).get(cookieName(id))?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
 try{const result=await get('grants/'+digest(token)+'.json',{access:'private'});
 if(!result)return false;
 const grant=JSON.parse(await new Response(result.stream).text());
 return grant.reportId===id && grant.expiresAt>Date.now() && timingSafeEqual(Buffer.from(grant.hash,'hex'),Buffer.from(digest(token),'hex'));
 }catch{return false;}
}
