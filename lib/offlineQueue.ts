/**
 * Durable Offline Mutation Queue for ENCALM Asset Tracker.
 * Allows field personnel to register, update, and audit assets without internet.
 * Queued actions are replayed in order when connectivity resumes.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { Asset, QueuedMutation } from "@/types/asset";

const QUEUE_KEY = "@encalm/mutation_queue_v2";

/**
 * Check if network connection is available.
 */
export function isNetworkOnline(): boolean {
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    return navigator.onLine;
  }
  return true; // Assume online on native until fetch fails
}

/**
 * Retrieve all pending mutations in FIFO order.
 */
export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedMutation[];
  } catch (e) {
    console.warn("Failed to read offline mutation queue:", e);
    return [];
  }
}

/**
 * Add a mutation to the persistent queue.
 */
export async function enqueueOfflineMutation(
  action: "create" | "update" | "delete",
  asset: Asset,
  etag?: string
): Promise<QueuedMutation> {
  const existing = await getQueuedMutations();

  // If there's already an un-synced mutation for this asset, merge/update it
  const filtered = existing.filter((m) => m.asset.id !== asset.id);

  const newEntry: QueuedMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action,
    asset,
    timestamp: Date.now(),
    retryCount: 0,
    etag,
  };

  const updatedQueue = [...filtered, newEntry];
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updatedQueue));
  return newEntry;
}

/**
 * Remove a successfully processed mutation from the queue.
 */
export async function removeQueuedMutation(mutationId: string): Promise<void> {
  try {
    const existing = await getQueuedMutations();
    const next = existing.filter((m) => m.id !== mutationId);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Failed to remove queued mutation:", e);
  }
}

/**
 * Clear the entire offline queue.
 */
export async function clearOfflineQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {}
}

/**
 * Drain the offline mutation queue by executing each item through a runner.
 */
export async function drainOfflineQueue(
  runner: (mutation: QueuedMutation) => Promise<boolean>
): Promise<{ processed: number; remaining: number }> {
  if (!isNetworkOnline()) {
    return { processed: 0, remaining: (await getQueuedMutations()).length };
  }

  const queue = await getQueuedMutations();
  if (queue.length === 0) return { processed: 0, remaining: 0 };

  let processedCount = 0;
  for (const item of queue) {
    try {
      const ok = await runner(item);
      if (ok) {
        await removeQueuedMutation(item.id);
        processedCount++;
      } else {
        // Increment retry count
        item.retryCount = (item.retryCount || 0) + 1;
        break; // Stop draining on error to preserve FIFO ordering
      }
    } catch (err) {
      console.warn(`Failed to process queued mutation ${item.id}:`, err);
      break;
    }
  }

  const remaining = (await getQueuedMutations()).length;
  return { processed: processedCount, remaining };
}
