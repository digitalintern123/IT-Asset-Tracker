/**
 * Stable Enterprise Asset ID Generator & Matcher for ENCALM Hospitality.
 * Standard format: ENC-{CATEGORY_CODE}-{YEAR}-{SEQUENCE}
 * Example: ENC-LAP-2026-0042, ENC-MON-2026-0018
 */

import type { Asset, AssetCategory } from "@/types/asset";

const CATEGORY_CODES: Record<AssetCategory, string> = {
  Laptop: "LAP",
  Desktop: "DSK",
  Monitor: "MON",
  Phone: "PHN",
  Tablet: "TAB",
  Furniture: "FUR",
  Equipment: "EQP",
  Other: "AST",
};

/**
 * Generate next sequential stable asset ID for category.
 */
export function generateStableAssetId(
  category: AssetCategory,
  existingAssets: Asset[] = []
): string {
  const code = CATEGORY_CODES[category] || "AST";
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

  // If no sequence found, use count + 1 with fallback to random 4 digits
  const nextSeq = maxSeq > 0 ? maxSeq + 1 : existingAssets.length + 1;
  const seqPadded = String(nextSeq).padStart(4, "0");

  return `${prefix}${seqPadded}`;
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

  return (
    (asset.id && asset.id.toLowerCase() === q) ||
    (asset.spItemId && asset.spItemId.toLowerCase() === q) ||
    (asset.serialNumber && asset.serialNumber.toLowerCase() === q)
  );
}
