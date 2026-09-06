import 'server-only';
import { getStore } from '@netlify/blobs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ReportState } from './report-state';

export type StoredReport = { id: string; createdAt: string; status: 'running' | 'done' | 'error'; partial: boolean; state: ReportState };
export const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const directory = () => path.resolve(process.cwd(), 'data', 'reports');
const onNetlify = () => process.env.NETLIFY === 'true' || Boolean(process.env.NETLIFY_SITE_ID);
const reports = () => getStore({ name: 'cro-auditor-reports', consistency: 'strong' });

export async function saveReport(report: StoredReport) {
  if (!validId(report.id)) throw new Error('Invalid report ID');
  if (onNetlify()) {
    await reports().setJSON(report.id, report);
    return;
  }
  await mkdir(directory(), { recursive: true });
  const file = path.join(directory(), report.id + '.json');
  const temp = file + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(report), { mode: 0o600 });
  await rename(temp, file);
}

export async function readReport(id: string): Promise<StoredReport | null> {
  if (!validId(id)) return null;
  let report: StoredReport | null = null;
  if (onNetlify()) {
    report = (await reports().get(id, { type: 'json', consistency: 'strong' })) as StoredReport | null;
  } else {
    try {
      report = JSON.parse(await readFile(path.join(directory(), id + '.json'), 'utf8')) as StoredReport;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return null;
    }
  }
  if (!report) return null;
  if (report.status === 'running' && Date.now() - Date.parse(report.createdAt) > 180000) {
    report.status = 'error';
    report.state.error = 'The audit was interrupted. Please retry from the landing page.';
  }
  return report;
}
