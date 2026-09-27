import 'server-only';
import { get, put } from '@vercel/blob';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

type Collection = 'leads' | 'grants';

function recordPath(collection: Collection, id: string) {
  if (!['leads', 'grants'].includes(collection) || !/^(?:[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(id)) {
    throw new Error('Invalid private record ID');
  }
  return `${collection}/${id}.json`;
}

/** Match report storage: private Blob when configured, local data otherwise. */
export async function savePrivateRecord(collection: Collection, id: string, record: unknown) {
  const key = recordPath(collection, id);
  const text = JSON.stringify(record);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await put(key, text, { access: 'private', addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const file = path.resolve(process.cwd(), 'data', key);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { mode: 0o600 });
  await rename(temporary, file);
}

export async function readPrivateRecord<T>(collection: Collection, id: string): Promise<T | null> {
  const key = recordPath(collection, id);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await get(key, { access: 'private' });
    return result ? JSON.parse(await new Response(result.stream).text()) as T : null;
  }
  try {
    return JSON.parse(await readFile(path.resolve(process.cwd(), 'data', key), 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
