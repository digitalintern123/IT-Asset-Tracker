import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { isMsConfigured } from "@/lib/msConfig";
import { createSharePointService, type SharePointService } from "@/lib/sharepoint";
import type { Asset, AssetInput } from "@/types/asset";

const CACHE_KEY = "@asset-tracker/cache/v3";

interface CachePayload {
  lastFetched: number;
  items: Asset[];
}

const DEMO_SAMPLE_ASSETS: Asset[] = [
  {
    id: "demo-1",
    spItemId: "1",
    name: 'MacBook Pro 16"',
    category: "Laptop",
    serialNumber: "C02XJ1234567",
    status: "in_use",
    assignee: "Sarah Chen",
    location: "HQ — Floor 3",
    purchaseDate: "2024-03-12",
    purchasePrice: 2499,
    warrantyExpiry: "2027-03-12",
    notes: "Engineering primary workstation.",
    createdAt: new Date("2024-03-12").toISOString(),
    updatedAt: new Date("2024-03-12").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "demo-2",
    spItemId: "2",
    name: "Dell UltraSharp 27",
    category: "Monitor",
    serialNumber: "CN-0H5JK4-987",
    status: "available",
    assignee: "",
    location: "IT Storage — B2",
    purchaseDate: "2023-11-04",
    purchasePrice: 549,
    warrantyExpiry: "2026-11-04",
    notes: "",
    createdAt: new Date("2023-11-04").toISOString(),
    updatedAt: new Date("2023-11-04").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "demo-3",
    spItemId: "3",
    name: "iPhone 15 Pro",
    category: "Phone",
    serialNumber: "F2LXC9PQRS",
    status: "in_use",
    assignee: "Marcus Wong",
    location: "Remote — NY",
    purchaseDate: "2024-09-22",
    purchasePrice: 1199,
    warrantyExpiry: "2025-09-22",
    notes: "Sales team device.",
    createdAt: new Date("2024-09-22").toISOString(),
    updatedAt: new Date("2024-09-22").toISOString(),
    _syncStatus: "synced",
  },
];

interface AssetContextValue {
  assets: Asset[];
  loaded: boolean;
  syncing: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  getAsset: (id: string) => Asset | undefined;
  addAsset: (input: AssetInput) => Promise<Asset>;
  updateAsset: (id: string, input: AssetInput) => Promise<Asset | undefined>;
  deleteAsset: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AssetContext = createContext<AssetContextValue | undefined>(undefined);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const { user } = useAuth();

  const spServiceRef = useRef<SharePointService | null>(null);

  // Helper: write ephemeral read cache to AsyncStorage
  const updateCache = useCallback(async (items: Asset[]) => {
    try {
      const payload: CachePayload = {
        lastFetched: Date.now(),
        items,
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Ephemeral cache write failure is non-fatal
    }
  }, []);

  // Helper: get or create SharePoint service instance
  const getSpService = useCallback(async (token: string): Promise<SharePointService> => {
    if (!spServiceRef.current) {
      spServiceRef.current = await createSharePointService(token);
    }
    return spServiceRef.current;
  }, []);

  // 1. Initial hydration: Load ephemeral cache for fast render
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const payload = JSON.parse(raw) as CachePayload;
          setAssets(payload.items || []);
          setLastSyncedAt(payload.lastFetched || null);
        } else if (!user) {
          // If no user and no cache, show demo sample assets
          setAssets(DEMO_SAMPLE_ASSETS);
        }
      } catch {
        if (!user) setAssets(DEMO_SAMPLE_ASSETS);
      } finally {
        setLoaded(true);
      }
    })();
  }, [user]);

  // 2. Fetch authoritative asset data directly from SharePoint Online
  const refresh = useCallback(async () => {
    if (!user?.accessToken || !isMsConfigured()) {
      return;
    }

    setSyncing(true);
    setSyncError(null);

    try {
      const sp = await getSpService(user.accessToken);
      const serverItems = await sp.fetchAll();

      setAssets(serverItems);
      const now = Date.now();
      setLastSyncedAt(now);
      await updateCache(serverItems);
    } catch (err: any) {
      const msg = err?.message || "Failed to load assets from SharePoint";
      console.warn("SharePoint load error:", msg);
      setSyncError(msg);
    } finally {
      setSyncing(false);
    }
  }, [user?.accessToken, getSpService, updateCache]);

  // Revalidate from SharePoint on login or token change
  useEffect(() => {
    if (user?.accessToken) {
      refresh();
    } else {
      spServiceRef.current = null;
      setAssets(DEMO_SAMPLE_ASSETS);
    }
  }, [user?.accessToken, refresh]);

  const getAsset = useCallback(
    (id: string) => assets.find((a) => a.id === id || a.spItemId === id),
    [assets]
  );

  // DIRECT PRODUCTION MUTATION: Create asset on SharePoint
  const addAsset = useCallback(
    async (input: AssetInput): Promise<Asset> => {
      if (!user?.accessToken || !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 to create assets."
        );
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const sp = await getSpService(user.accessToken);
        const createdAsset = await sp.create(input);

        // Update in-memory state and cache with confirmed SharePoint response
        const next = [createdAsset, ...assets];
        setAssets(next);
        await updateCache(next);
        return createdAsset;
      } catch (err: any) {
        const msg = err?.message || "Failed to save asset to SharePoint.";
        setSyncError(msg);
        throw new Error(msg);
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, assets, getSpService, updateCache]
  );

  // DIRECT PRODUCTION MUTATION: Update asset on SharePoint
  const updateAsset = useCallback(
    async (id: string, input: AssetInput): Promise<Asset | undefined> => {
      if (!user?.accessToken || !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 to update assets."
        );
      }

      const existing = assets.find((a) => a.id === id || a.spItemId === id);
      if (!existing) {
        throw new Error(`Asset with ID "${id}" not found.`);
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const sp = await getSpService(user.accessToken);

        // Resolve SharePoint internal item ID
        let targetSpId = existing.spItemId;
        if (!targetSpId) {
          targetSpId = (await sp.findItemIdByAssetId(existing.id)) || undefined;
        }

        if (!targetSpId) {
          throw new Error("Unable to locate asset record in SharePoint.");
        }

        const confirmedUpdated = await sp.update(targetSpId, input);

        const next = assets.map((a) =>
          a.id === id || a.spItemId === targetSpId ? confirmedUpdated : a
        );
        setAssets(next);
        await updateCache(next);
        return confirmedUpdated;
      } catch (err: any) {
        const msg = err?.message || "Failed to update asset in SharePoint.";
        setSyncError(msg);
        throw new Error(msg);
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, assets, getSpService, updateCache]
  );

  // DIRECT PRODUCTION MUTATION: Delete asset on SharePoint
  const deleteAsset = useCallback(
    async (id: string): Promise<void> => {
      if (!user?.accessToken || !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 to delete assets."
        );
      }

      const existing = assets.find((a) => a.id === id || a.spItemId === id);
      if (!existing) return;

      setSyncing(true);
      setSyncError(null);

      try {
        const sp = await getSpService(user.accessToken);

        let targetSpId = existing.spItemId;
        if (!targetSpId) {
          targetSpId = (await sp.findItemIdByAssetId(existing.id)) || undefined;
        }

        if (targetSpId) {
          await sp.remove(targetSpId);
        }

        const next = assets.filter((a) => a.id !== id && a.spItemId !== targetSpId);
        setAssets(next);
        await updateCache(next);
      } catch (err: any) {
        const msg = err?.message || "Failed to delete asset from SharePoint.";
        setSyncError(msg);
        throw new Error(msg);
      } finally {
        setSyncing(false);
      }
    },
    [user?.accessToken, assets, getSpService, updateCache]
  );

  const value = useMemo<AssetContextValue>(
    () => ({
      assets,
      loaded,
      syncing,
      syncError,
      lastSyncedAt,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      refresh,
    }),
    [
      assets,
      loaded,
      syncing,
      syncError,
      lastSyncedAt,
      getAsset,
      addAsset,
      updateAsset,
      deleteAsset,
      refresh,
    ]
  );

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets(): AssetContextValue {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error("useAssets must be used within AssetProvider");
  return ctx;
}
