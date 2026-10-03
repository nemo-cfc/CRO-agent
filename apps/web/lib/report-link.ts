import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Staff links: a report URL the sales team can open from Zoho without filling
 * in the unlock form (which would also create a fake lead). The link carries
 * an HMAC of the report id, so it opens that one report and nothing else.
 */
const secret = () => process.env.REPORT_LINK_SECRET ?? '';
const sign = (reportId: string) => createHmac('sha256', secret()).update('report:' + reportId).digest('hex');

/** Staff link for a report, or null when REPORT_LINK_SECRET is not set. */
export function staffReportLink(reportId: string): string | null {
  const site = process.env.SITE_URL?.replace(/\/+$/, '');
  if (!secret() || !site) return null;
  return `${site}/api/reports/${reportId}/open?access=${sign(reportId)}`;
}

export function validStaffAccess(reportId: string, access: string | null): boolean {
  if (!secret() || !access || !/^[a-f0-9]{64}$/.test(access)) return false;
  return timingSafeEqual(Buffer.from(sign(reportId), 'hex'), Buffer.from(access, 'hex'));
}
