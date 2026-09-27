import { cookies } from 'next/headers';
import { hasReportAccess, cookieName } from '@/lib/report-access';
import { readReport } from '@/lib/report-store';
import { launchBrowser } from '../../../../../../worker/src/browser/launcher.js';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;

/**
 * Renders the viewer's own report page in headless Chromium and returns it as
 * a PDF. The viewer's access cookie is forwarded, so the PDF shows exactly what
 * they can already see and nobody else can fetch it.
 */
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!await hasReportAccess(id))return Response.json({error:'Complete the form to unlock this report.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
 const report=await readReport(id);if(!report||report.status!=='done')return Response.json({error:'Report unavailable.'},{status:404});
 const token=(await cookies()).get(cookieName(id))!.value;
 const origin=new URL(request.url).origin;
 let host='report';try{host=new URL(report.state.url??'').hostname.replace(/^www\./,'');}catch{}
 const browser=await launchBrowser();
 try{
  const context=await browser.newContext({viewport:{width:1100,height:1400},deviceScaleFactor:1});
  await context.addCookies([{name:cookieName(id),value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();
  await page.goto(origin+'/reports/'+id,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.rp-sheet',{timeout:30000});
  await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
  // The app's print stylesheet deliberately blanks the page; render the screen layout instead.
  await page.emulateMedia({media:'screen'});
  await page.addStyleTag({content:'.pdf-download,.expert-dialog,.unlock-dialog{display:none!important}'});
  const pdf=await page.pdf({format:'A4',printBackground:true,scale:0.72,margin:{top:'10mm',bottom:'10mm',left:'8mm',right:'8mm'}});
  return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${host}-cro-audit.pdf"`,'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'}});
 }catch(error){
  return Response.json({error:error instanceof Error?error.message:'Could not create the PDF.'},{status:500});
 }finally{await browser.close().catch(()=>{});}
}
