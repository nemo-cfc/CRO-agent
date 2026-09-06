import { readReport } from '@/lib/report-store';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const report=await readReport(id);
 if(!report)return Response.json({error:'Report not found.'},{status:404});
 return Response.json({id,status:report.status,partial:report.partial,error:report.state.error,reportUrl:report.status==='done'?'/reports/'+id:null},{headers:{'Cache-Control':'no-store'}});
}
