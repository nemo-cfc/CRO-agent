import { readReport } from '@/lib/report-store';
import { hasReportAccess } from '@/lib/report-access';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!await hasReportAccess(id))return Response.json({error:'Complete the form to unlock this report.'},{status:403,headers:{'Cache-Control':'private, no-store'}});
 const report=await readReport(id);if(!report||report.status!=='done')return Response.json({error:'Report unavailable.'},{status:404});
 return Response.json({state:report.state,createdAt:report.createdAt,partial:report.partial},{headers:{'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, noarchive','X-Content-Type-Options':'nosniff'}});
}
