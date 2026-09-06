import { notFound } from 'next/navigation';
import ReportGate from '../../components/ReportGate';
export const dynamic='force-dynamic';
export const metadata={title:'Your CRO audit | Monkeyman',robots:{index:false,follow:false}};
export default async function ReportPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
 return <ReportGate id={id} domain="Your store" unlocked={false}/>;
}
