/**
 * Optimistic Concurrency Control & 3-Way Merge Engine.
 * Resolves simultaneous edits by field-level comparison.
 */

import type { Asset } from "@/types/asset";

export interface MergeResult {
  hasConflict: boolean;
  conflictingFields: (keyof Asset)[];
  mergedAsset: Asset;
}

/**
 * 3-Way Merge comparison between base, local, and server asset snapshots.
 */
export function resolveAssetConflict(
  localAsset: Asset,
  serverAsset: Asset,
  baseAsset?: Asset
): MergeResult {
  const merged: Asset = { ...serverAsset };
  const conflictingFields: (keyof Asset)[] = [];

  const compareKeys: (keyof Asset)[] = [
    "name",
    "category",
    "serialNumber",
    "status",
    "assignee",
    "location",
    "purchaseDate",
    "purchasePrice",
    "warrantyExpiry",
    "notes",
  ];

  for (const key of compareKeys) {
    const localVal = localAsset[key];
    const serverVal = serverAsset[key];
    const baseVal = baseAsset ? baseAsset[key] : undefined;

    // Both identical: no conflict
    if (localVal === serverVal) {
      continue;
    }

    if (baseAsset) {
      const localChanged = localVal !== baseVal;
      const serverChanged = serverVal !== baseVal;

      if (localChanged && !serverChanged) {
        // Only local changed this field: take local change
        (merged as any)[key] = localVal;
      } else if (!localChanged && serverChanged) {
        // Only server changed this field: keep server change
        (merged as any)[key] = serverVal;
      } else if (localChanged && serverChanged) {
        // Both changed field to different values: TRUE CONFLICT
        conflictingFields.push(key);
        // Default to local edit pending user review
        (merged as any)[key] = localVal;
      }
    } else {
      // Without a base snapshot we cannot tell who changed what.
      // Flag the field AND keep the local edit so the user's work is not lost.
      conflictingFields.push(key);
      (merged as any)[key] = localVal;
    }
  }

  // Preserve history union
  if (localAsset.assignmentHistory || serverAsset.assignmentHistory) {
    const combinedHistory = [
      ...(serverAsset.assignmentHistory || []),
      ...(localAsset.assignmentHistory || []),
    ];
    // De-duplicate by ID
    const seen = new Set<string>();
    merged.assignmentHistory = combinedHistory.filter((rec) => {
      if (seen.has(rec.id)) return false;
      seen.add(rec.id);
      return true;
    });
  }

  merged.updatedAt = new Date().toISOString();
  merged.etag = serverAsset.etag;
  merged.version = (serverAsset.version || 1) + 1;

  return {
    hasConflict: conflictingFields.length > 0,
    conflictingFields,
    mergedAsset: merged,
  };
}
