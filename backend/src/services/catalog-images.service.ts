// Catalog image backfill — fills CatalogItem.imageUrl for rows that don't
// have one yet. The seed script doesn't ship images (the master list grows
// organically as admins approve items), so without this every product
// card on the customer apps falls back to a coloured letter tile.
//
// Strategy
// --------
// 1. Try OpenFoodFacts (https://world.openfoodfacts.org) — free, no API
//    key, has lots of Indian branded products (5-Star, Bingo Bhujia,
//    Tata Salt etc.). Returns the first product photo if the search
//    matches.
// 2. Fallback: a deterministic placehold.co URL coloured to the catalog
//    category. Not a real photo, but better than no image at all, and
//    sized appropriately so the existing card layouts don't shift.
//
// Both endpoints are stateless GETs — safe to call without auth. We
// rate-limit our own loop to be polite (1 req every 250ms) and skip
// rows that already have an imageUrl.
//
// Re-runnable
// -----------
// Idempotent. Re-running only touches rows where imageUrl is still null,
// so it's safe to ship as an admin "backfill missing images" button.
// Pass { force: true } to overwrite existing rows (e.g. if an admin
// wants to refresh the photo pool after a brand change).

import type { ItemCategory } from '@prisma/client';
import { prisma } from '../config/prisma';

/** Result for a single catalog row. Bubbled up to the admin endpoint. */
export interface BackfillResult {
  catalogItemId: string;
  name: string;
  source: 'openfoodfacts' | 'placeholder' | 'skipped';
  imageUrl: string | null;
  error?: string;
}

interface BackfillOpts {
  /** Overwrite even if imageUrl is already set. Default false. */
  force?: boolean;
  /** Cap on how many rows to touch in one run. Default 200. */
  limit?: number;
  /** Sleep between requests so we don't hammer OFF. Default 250ms. */
  delayMs?: number;
}

// Tint each placeholder per category so the customer-web grid stays
// visually navigable when no real photo is available. Picked from the
// product palette (primary green, amber, blue, rose, slate).
const CATEGORY_TINT: Record<ItemCategory, { bg: string; fg: string }> = {
  GROCERY: { bg: '16a34a', fg: 'ffffff' }, // primary green
  SNACKS: { bg: 'f59e0b', fg: '1f2937' }, // amber
  BEVERAGES: { bg: '8b5cf6', fg: 'ffffff' }, // violet
  HOUSEHOLD: { bg: '64748b', fg: 'ffffff' }, // slate
  MEDICINE: { bg: 'ef4444', fg: 'ffffff' }, // red
  ELECTRONICS: { bg: '0ea5e9', fg: 'ffffff' }, // cyan
  OTHER: { bg: '6b7280', fg: 'ffffff' }, // gray
};

function placeholderFor(name: string, category: ItemCategory): string {
  const tint = CATEGORY_TINT[category] ?? CATEGORY_TINT.OTHER;
  // placehold.co serves real PNG bytes (no JS / no SVG-in-img-quirks) and
  // is free for low-traffic use. Encode the item name into the text so
  // the placeholder is at least readable. Cap text length so the URL
  // stays under 2 KB and the rendered text doesn't overflow the tile.
  const text = encodeURIComponent(name.slice(0, 30));
  return `https://placehold.co/400x400/${tint.bg}/${tint.fg}.png?text=${text}`;
}

interface OffSearchResponse {
  products?: Array<{
    image_url?: string;
    image_front_url?: string;
    image_front_small_url?: string;
  }>;
}

async function tryOpenFoodFacts(name: string): Promise<string | null> {
  // OFF search API. `page_size=1` keeps the response small; we only ever
  // pick the top hit. `fields=image_url,image_front_url` strips the rest
  // so we don't pay for the full product payload.
  const q = encodeURIComponent(name);
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?` +
    `search_terms=${q}&search_simple=1&action=process&json=1&page_size=1` +
    `&fields=image_url,image_front_url,image_front_small_url`;
  // Browser-safe timeout — OFF can be slow under load.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        // OFF asks API consumers to identify themselves — be a good
        // citizen so we don't get rate-limited / blocked.
        'User-Agent': 'QuickEasyMart/1.0 (admin@quickeasymart.com)',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OffSearchResponse;
    const top = data.products?.[0];
    if (!top) return null;
    return (
      top.image_front_url ??
      top.image_url ??
      top.image_front_small_url ??
      null
    );
  } catch {
    // Network error / timeout / abort — fall back to placeholder. We
    // don't log per-row to keep the admin endpoint's response small.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function backfillCatalogImages(
  opts: BackfillOpts = {},
): Promise<BackfillResult[]> {
  const { force = false, limit = 200, delayMs = 250 } = opts;
  const items = await prisma.catalogItem.findMany({
    where: force ? { isActive: true } : { isActive: true, imageUrl: null },
    select: { id: true, name: true, category: true, imageUrl: true },
    take: limit,
    orderBy: { name: 'asc' },
  });

  const results: BackfillResult[] = [];
  for (const item of items) {
    if (!force && item.imageUrl) {
      results.push({
        catalogItemId: item.id,
        name: item.name,
        source: 'skipped',
        imageUrl: item.imageUrl,
      });
      continue;
    }
    let imageUrl: string | null = null;
    let source: BackfillResult['source'] = 'placeholder';
    try {
      const off = await tryOpenFoodFacts(item.name);
      if (off) {
        imageUrl = off;
        source = 'openfoodfacts';
      } else {
        imageUrl = placeholderFor(item.name, item.category);
        source = 'placeholder';
      }
      await prisma.catalogItem.update({
        where: { id: item.id },
        data: { imageUrl },
      });
      results.push({
        catalogItemId: item.id,
        name: item.name,
        source,
        imageUrl,
      });
    } catch (err) {
      results.push({
        catalogItemId: item.id,
        name: item.name,
        source: 'skipped',
        imageUrl: null,
        error: (err as Error).message,
      });
    }
    // Be polite — OFF is a free community service.
    if (delayMs > 0) await sleep(delayMs);
  }
  return results;
}
