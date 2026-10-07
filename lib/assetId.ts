/**
 * Stable Enterprise Asset ID Generator & Matcher for ENCALM Hospitality.
 * Standard format: ENC-{CATEGORY_CODE}-{YEAR}-{SEQUENCE}
 * Example: ENC-LAP-2026-0042, ENC-MON-2026-0018
 */

import type { Asset, AssetCategory } from "@/types/asset";

const CATEGORY_CODES: Record<string, string> = {
  Laptop: "LAP",
  Desktop: "DSK",
  Monitor: "MON",
  Phone: "PHN",
  Tablet: "TAB",
  Furniture: "FUR",
  Equipment: "EQP",
  Other: "AST",
};

export function getCategoryCode(category: string): string {
  if (CATEGORY_CODES[category]) return CATEGORY_CODES[category];
  const clean = (category || "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return clean.length >= 3 ? clean.slice(0, 3) : "AST";
}

/**
 * Generate next sequential stable asset ID for category.
 */
export function generateStableAssetId(
  category: AssetCategory,
  existingAssets: Asset[] = []
): string {
  const code = getCategoryCode(category);
  const year = new Date().getFullYear();
  const prefix = `ENC-${code}-${year}-`;

  // Find highest existing sequence number for this prefix
  let maxSeq = 0;
  for (const asset of existingAssets) {
    if (asset.id && asset.id.startsWith(prefix)) {
      const suffix = asset.id.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  // Candidate sequence: one past the highest seen for this exact prefix.
  let nextSeq = maxSeq + 1;

  // Guard against collisions with any ID already present (the previous
  // `existingAssets.length + 1` fallback could reissue a live ID after deletions).
  // TODO: this only deduplicates within one client's view. Two users creating
  // assets at the same time can still get the same ID; the durable fix is a
  // server-side sequence.
  const taken = new Set(existingAssets.map((a) => a.id));
  while (taken.has(`${prefix}${String(nextSeq).padStart(4, "0")}`)) {
    nextSeq++;
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

/**
 * Check if a string matches the standard stable asset ID pattern.
 */
export function isStableAssetId(id: string): boolean {
  if (!id) return false;
  return /^ENC-[A-Z]{3}-\d{4}-\d{4,}$/.test(id.trim());
}

/**
 * Multi-key lookup: matches by Asset ID, Serial Number, or SharePoint Item ID.
 */
export function matchesAsset(asset: Asset, query: string): boolean {
  if (!query) return false;
  const q = query.trim().toLowerCase();

  return Boolean(
    (asset.id && asset.id.toLowerCase() === q) ||
    (asset.spItemId && asset.spItemId.toLowerCase() === q) ||
    (asset.serialNumber && asset.serialNumber.toLowerCase() === q)
  );
}
