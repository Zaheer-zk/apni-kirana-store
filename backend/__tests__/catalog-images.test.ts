// Integration test — runs against the test Postgres database (the same
// fixture the rest of __tests__ uses; see __tests__/setup.ts). Verifies
// the catalog-image backfill service actually writes imageUrl into the
// CatalogItem table, with the correct source (OFF vs placeholder).
//
// We stub global.fetch so the OFF lookup never leaves the host — these
// tests must stay deterministic and fast in CI.

import { prisma } from '../src/config/prisma';
import { backfillCatalogImages } from '../src/services/catalog-images.service';

const realFetch = global.fetch;

afterAll(() => {
  global.fetch = realFetch;
});

afterEach(() => {
  global.fetch = realFetch;
});

async function makeCatalogItem(
  name: string,
  opts: { imageUrl?: string | null; category?: 'GROCERY' | 'SNACKS' | 'BEVERAGES' | 'HOUSEHOLD' | 'MEDICINE' | 'ELECTRONICS' | 'OTHER' } = {},
) {
  return prisma.catalogItem.create({
    data: {
      name,
      description: null,
      category: opts.category ?? 'GROCERY',
      defaultUnit: '1 unit',
      imageUrl: opts.imageUrl ?? null,
      isActive: true,
    },
  });
}

describe('backfillCatalogImages', () => {
  it('uses an OFF image when the API returns one', async () => {
    const item = await makeCatalogItem('Tata Salt');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{ image_front_url: 'https://images.openfoodfacts.org/tata-salt.jpg' }],
      }),
    }) as unknown as typeof fetch;

    const results = await backfillCatalogImages({ delayMs: 0 });
    const r = results.find((x) => x.catalogItemId === item.id);
    expect(r?.source).toBe('openfoodfacts');
    expect(r?.imageUrl).toBe('https://images.openfoodfacts.org/tata-salt.jpg');

    const refreshed = await prisma.catalogItem.findUnique({ where: { id: item.id } });
    expect(refreshed?.imageUrl).toBe('https://images.openfoodfacts.org/tata-salt.jpg');
  });

  it('falls back to a category-tinted placeholder when OFF returns no hits', async () => {
    const item = await makeCatalogItem('NoMatchedItem', { category: 'SNACKS' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: [] }),
    }) as unknown as typeof fetch;

    const results = await backfillCatalogImages({ delayMs: 0 });
    const r = results.find((x) => x.catalogItemId === item.id);
    expect(r?.source).toBe('placeholder');
    expect(r?.imageUrl).toMatch(/placehold\.co/);
    // SNACKS tint is amber f59e0b — guards against the category map regressing.
    expect(r?.imageUrl).toMatch(/f59e0b/);
  });

  it('falls back to a placeholder when OFF errors out', async () => {
    const item = await makeCatalogItem('NetworkDown');
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;

    const results = await backfillCatalogImages({ delayMs: 0 });
    const r = results.find((x) => x.catalogItemId === item.id);
    expect(r?.source).toBe('placeholder');
    expect(r?.imageUrl).toMatch(/placehold\.co/);
  });

  it('falls back when OFF returns non-2xx', async () => {
    const item = await makeCatalogItem('Server503');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;

    const results = await backfillCatalogImages({ delayMs: 0 });
    const r = results.find((x) => x.catalogItemId === item.id);
    expect(r?.source).toBe('placeholder');
  });

  it('skips rows that already have an imageUrl unless force=true', async () => {
    const item = await makeCatalogItem('AlreadySet', { imageUrl: 'https://existing/image.jpg' });

    // Default (force=false): row should NOT show up in results because
    // the WHERE filter excludes it.
    const passive = await backfillCatalogImages({ delayMs: 0 });
    expect(passive.find((x) => x.catalogItemId === item.id)).toBeUndefined();

    // force=true: should overwrite.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: [{ image_url: 'https://off/forced.jpg' }] }),
    }) as unknown as typeof fetch;
    const forced = await backfillCatalogImages({ delayMs: 0, force: true });
    const r = forced.find((x) => x.catalogItemId === item.id);
    expect(r?.imageUrl).toBe('https://off/forced.jpg');

    const refreshed = await prisma.catalogItem.findUnique({ where: { id: item.id } });
    expect(refreshed?.imageUrl).toBe('https://off/forced.jpg');
  });

  it('honours the limit argument', async () => {
    await makeCatalogItem('Bulk1');
    await makeCatalogItem('Bulk2');
    await makeCatalogItem('Bulk3');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: [] }),
    }) as unknown as typeof fetch;

    const results = await backfillCatalogImages({ delayMs: 0, limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('passes a User-Agent so OFF doesn’t rate-limit us', async () => {
    await makeCatalogItem('UACheck');
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ products: [] }),
    });
    global.fetch = spy as unknown as typeof fetch;

    await backfillCatalogImages({ delayMs: 0 });
    expect(spy).toHaveBeenCalled();
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['User-Agent']).toMatch(/QuickEasyMart/);
  });
});
