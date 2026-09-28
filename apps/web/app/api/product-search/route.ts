import { searchStoreProducts } from '@/lib/product-search';
import { parseStoreLink } from '@/lib/store-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/product-search?store=brand.com&q=modal+tank
 * Finds matching products on the visitor's own store so they can pick their
 * best-seller by name instead of copying its link.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim();
  const parsed = parseStoreLink(params.get('store') ?? '');
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
  if (q.length < 2) return Response.json({ store: parsed.store.toString(), source: 'none', products: [] });
  try {
    const result = await searchStoreProducts(parsed.store.toString(), q);
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error && /reachable|find a site|private/i.test(error.message)
      ? error.message
      : 'We could not search that store right now.';
    return Response.json({ error: message }, { status: 502 });
  }
}
