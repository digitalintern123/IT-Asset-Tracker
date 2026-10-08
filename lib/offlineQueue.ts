/**
 * Durable Offline Mutation Queue for ENCALM Asset Tracker.
 * Allows field personnel to register, update, and audit assets without internet.
 * Queued actions are replayed in order when connectivity resumes.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { Asset, QueuedMutation } from "@/types/asset";

const QUEUE_KEY = "@encalm/mutation_queue_v2";
const DEAD_LETTER_KEY = "@encalm/mutation_deadletters_v1";
const MAX_MUTATION_ATTEMPTS = 5;

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

  const prior = existing.find((m) => m.asset.id === asset.id);
  const filtered = existing.filter((m) => m.asset.id !== asset.id);

  // A pending create that is then edited or deleted must stay a create —
  // the item has no spItemId yet, so an update/delete would target a
  // SharePoint item that does not exist.
  let effectiveAction = action;
  if (prior?.action === "create") {
    if (action === "update") {
      effectiveAction = "create";
    } else if (action === "delete") {
      // Created and deleted while offline: nothing to send at all.
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
      return {
        id: `mut_noop_${Date.now()}`,
        action: "delete",
        asset,
        timestamp: Date.now(),
        retryCount: 0,
        etag,
      };
    }
  }

  const newEntry: QueuedMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action: effectiveAction,
    asset,
    timestamp: Date.now(),
    retryCount: prior?.retryCount ?? 0,
    etag: etag ?? prior?.etag,
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

async function persistRetryCount(mutationId: string, attempts: number): Promise<void> {
  try {
    const existing = await getQueuedMutations();
    const next = existing.map((m) =>
      m.id === mutationId ? { ...m, retryCount: attempts } : m
    );
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Failed to persist retry count:", e);
  }
}

async function addDeadLetter(mutation: QueuedMutation): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    const list: QueuedMutation[] = raw ? JSON.parse(raw) : [];
    list.push(mutation);
    await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(list.slice(-50)));
  } catch (e) {
    console.warn("Failed to record dead-letter mutation:", e);
  }
}

export async function getDeadLetterMutations(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
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
  // true = done; false = retry later; "permanent" = will never succeed
  // (e.g. SharePoint rejected it), so dead-letter it and keep draining.
  runner: (mutation: QueuedMutation) => Promise<boolean | "permanent">
): Promise<{ processed: number; remaining: number; failed: number }> {
  if (!isNetworkOnline()) {
    return { processed: 0, remaining: (await getQueuedMutations()).length, failed: 0 };
  }

  const queue = await getQueuedMutations();
  if (queue.length === 0) return { processed: 0, remaining: 0, failed: 0 };

  let processedCount = 0;
  let failedCount = 0;
  for (const item of queue) {
    let ok: boolean | "permanent" = false;
    try {
      ok = await runner(item);
    } catch (err) {
      console.warn(`Failed to process queued mutation ${item.id}:`, err);
      ok = false;
    }

    if (ok === "permanent") {
      console.error(`Mutation ${item.id} was rejected; moving to dead letters.`);
      await removeQueuedMutation(item.id);
      await addDeadLetter({ ...item, retryCount: (item.retryCount || 0) + 1 });
      failedCount++;
      continue;
    }

    if (ok) {
      await removeQueuedMutation(item.id);
      processedCount++;
      continue;
    }

    // Persist the retry count — mutating `item` alone is lost on reload.
    const attempts = (item.retryCount || 0) + 1;
    if (attempts >= MAX_MUTATION_ATTEMPTS) {
      console.error(
        `Dropping mutation ${item.id} after ${attempts} attempts; moving to dead letters.`
      );
      await removeQueuedMutation(item.id);
      await addDeadLetter({ ...item, retryCount: attempts });
      failedCount++;
      continue;
    }

    await persistRetryCount(item.id, attempts);
    break; // Stop draining to preserve FIFO ordering for this asset.
  }

  const remaining = (await getQueuedMutations()).length;
  return { processed: processedCount, remaining, failed: failedCount };
}
