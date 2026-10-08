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
    "make",
    "model",
    "category",
    "serialNumber",
    "status",
    "assignee",
    "location",
    "vertical",
    "department",
    "custodianship",
    "criticality",
    "operationalStatus",
    "assetClass",
    "accessories",
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

  // Preserve history union. A custody record present on both sides keeps
  // whichever side closed (returnedAt) or confirmed it, so a merge never
  // reopens a record the local edit just closed.
  if (localAsset.assignmentHistory || serverAsset.assignmentHistory) {
    const byId = new Map<string, NonNullable<Asset["assignmentHistory"]>[number]>();
    const order: string[] = [];
    for (const rec of [...(serverAsset.assignmentHistory || []), ...(localAsset.assignmentHistory || [])]) {
      const prev = byId.get(rec.id);
      if (!prev) {
        order.push(rec.id);
        byId.set(rec.id, rec);
      } else {
        byId.set(rec.id, {
          ...prev,
          ...rec,
          returnedAt: rec.returnedAt || prev.returnedAt,
          confirmedAt: rec.confirmedAt || prev.confirmedAt,
          confirmedBy: rec.confirmedBy || prev.confirmedBy,
        });
      }
    }
    merged.assignmentHistory = order.map((id) => byId.get(id)!);
  }

  // Approval request (pending reassign/delete): take the side that changed it.
  {
    const key = (a?: Asset) => JSON.stringify(a?.approvalRequest ?? null);
    const localChanged = baseAsset ? key(localAsset) !== key(baseAsset) : key(localAsset) !== key(serverAsset);
    merged.approvalRequest = localChanged ? localAsset.approvalRequest : serverAsset.approvalRequest;
  }

  // Preserve both sides' audit events
  if (localAsset.events || serverAsset.events) {
    const seenEvents = new Set<string>();
    merged.events = [...(serverAsset.events || []), ...(localAsset.events || [])]
      .filter((evt) => {
        if (seenEvents.has(evt.id)) return false;
        seenEvents.add(evt.id);
        return true;
      })
      .sort((a, b) => a.at.localeCompare(b.at));
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
