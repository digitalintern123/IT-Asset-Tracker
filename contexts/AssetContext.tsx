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

export const DEMO_SAMPLE_ASSETS: Asset[] = [
  {
    id: "demo-1",
    spItemId: "1",
    name: "Encalm Prive Check-in Terminal",
    category: "Desktop",
    serialNumber: "ENC-DEL-T3-001",
    status: "in_use",
    assignee: "Rajesh Kumar (Duty Mgr)",
    location: "DEL T3 — Prive Lounge Reception",
    purchaseDate: "2024-01-15",
    purchasePrice: 1450,
    warrantyExpiry: "2027-01-15",
    notes: "Primary guest check-in terminal with passport/boarding pass reader.",
    createdAt: new Date("2024-01-15").toISOString(),
    updatedAt: new Date("2024-01-15").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "demo-2",
    spItemId: "2",
    name: "Encalm Spa Reception iPad Pro",
    category: "Tablet",
    serialNumber: "ENC-SPA-IPAD-04",
    status: "in_use",
    assignee: "Priya Sharma (Spa Lead)",
    location: "DEL T3 — Wellness Spa",
    purchaseDate: "2024-03-10",
    purchasePrice: 1199,
    warrantyExpiry: "2026-03-10",
    notes: "Spa booking and treatment scheduling tablet.",
    createdAt: new Date("2024-03-10").toISOString(),
    updatedAt: new Date("2024-03-10").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "demo-3",
    spItemId: "3",
    name: 'Flight Info Display 55" 4K',
    category: "Monitor",
    serialNumber: "FIDS-HYD-55-09",
    status: "in_use",
    assignee: "IT Lounge Operations",
    location: "HYD — International Lounge Area A",
    purchaseDate: "2023-11-20",
    purchasePrice: 1850,
    warrantyExpiry: "2026-11-20",
    notes: "Live departure flight information display.",
    createdAt: new Date("2023-11-20").toISOString(),
    updatedAt: new Date("2023-11-20").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "demo-4",
    spItemId: "4",
    name: "IT Operations ThinkPad T14",
    category: "Laptop",
    serialNumber: "PF-4K992-DEL",
    status: "in_use",
    assignee: "Amit Patel (Network Admin)",
    location: "DEL T3 — IT Server Room",
    purchaseDate: "2024-02-05",
    purchasePrice: 1650,
    warrantyExpiry: "2027-02-05",
    notes: "Lounge network monitoring and Wi-Fi controller administration.",
    createdAt: new Date("2024-02-05").toISOString(),
    updatedAt: new Date("2024-02-05").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "demo-5",
    spItemId: "5",
    name: "Bar Inventory Barcode Scanner",
    category: "Equipment",
    serialNumber: "ZEB-DS2208-GOA",
    status: "available",
    assignee: "",
    location: "GOA — Lounge IT Store",
    purchaseDate: "2024-04-12",
    purchasePrice: 320,
    warrantyExpiry: "2026-04-12",
    notes: "Zebra handheld barcode scanner for beverage stocktaking.",
    createdAt: new Date("2024-04-12").toISOString(),
    updatedAt: new Date("2024-04-12").toISOString(),
    _syncStatus: "synced",
  },
  {
    id: "demo-6",
    spItemId: "6",
    name: "Concierge iPhone 15",
    category: "Phone",
    serialNumber: "APL-IP15-HYD02",
    status: "maintenance",
    assignee: "Service Desk HYD",
    location: "HYD — Lounge Concierge",
    purchaseDate: "2024-05-18",
    purchasePrice: 999,
    warrantyExpiry: "2025-05-18",
    notes: "VIP guest assistance hotline handset. Scheduled for battery check.",
    createdAt: new Date("2024-05-18").toISOString(),
    updatedAt: new Date("2024-05-18").toISOString(),
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
        } else {
          setAssets(DEMO_SAMPLE_ASSETS);
        }
      } catch {
        setAssets(DEMO_SAMPLE_ASSETS);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 2. Fetch authoritative asset data from SharePoint or refresh demo sandbox
  const refresh = useCallback(async () => {
    // If in Demo Mode, refresh local sandbox
    if (user?.isDemo) {
      setSyncing(true);
      setSyncError(null);
      setTimeout(() => {
        setLastSyncedAt(Date.now());
        setSyncing(false);
      }, 350);
      return;
    }

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
  }, [user?.accessToken, user?.isDemo, getSpService, updateCache]);

  // Revalidate when user state changes
  useEffect(() => {
    if (user?.accessToken && !user?.isDemo) {
      refresh();
    } else if (user?.isDemo) {
      spServiceRef.current = null;
      setLastSyncedAt(Date.now());
      setAssets((prev) => (prev.length > 0 ? prev : DEMO_SAMPLE_ASSETS));
    } else {
      spServiceRef.current = null;
      setAssets(DEMO_SAMPLE_ASSETS);
    }
  }, [user?.accessToken, user?.isDemo, refresh]);

  const getAsset = useCallback(
    (id: string) => assets.find((a) => a.id === id || a.spItemId === id),
    [assets]
  );

  // Create asset (supports both Live SharePoint and Demo Sandbox)
  const addAsset = useCallback(
    async (input: AssetInput): Promise<Asset> => {
      // Demo Mode: Local sandbox creation
      if (user?.isDemo) {
        const demoAsset: Asset = {
          ...input,
          id: "demo-" + Date.now().toString(36),
          spItemId: String(assets.length + 1),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          _syncStatus: "synced",
        };
        const next = [demoAsset, ...assets];
        setAssets(next);
        await updateCache(next);
        return demoAsset;
      }

      if (!user?.accessToken || !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 or Demo Mode to create assets."
        );
      }

      setSyncing(true);
      setSyncError(null);

      try {
        const sp = await getSpService(user.accessToken);
        const createdAsset = await sp.create(input);

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
    [user?.accessToken, user?.isDemo, assets, getSpService, updateCache]
  );

  // Update asset (supports both Live SharePoint and Demo Sandbox)
  const updateAsset = useCallback(
    async (id: string, input: AssetInput): Promise<Asset | undefined> => {
      // Demo Mode: Local sandbox update
      if (user?.isDemo) {
        const existing = assets.find((a) => a.id === id || a.spItemId === id);
        if (!existing) {
          throw new Error(`Asset with ID "${id}" not found.`);
        }
        const updated: Asset = {
          ...existing,
          ...input,
          updatedAt: new Date().toISOString(),
        };
        const next = assets.map((a) =>
          a.id === id || a.spItemId === id ? updated : a
        );
        setAssets(next);
        await updateCache(next);
        return updated;
      }

      if (!user?.accessToken || !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 or Demo Mode to update assets."
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
    [user?.accessToken, user?.isDemo, assets, getSpService, updateCache]
  );

  // Delete asset (supports both Live SharePoint and Demo Sandbox)
  const deleteAsset = useCallback(
    async (id: string): Promise<void> => {
      // Demo Mode: Local sandbox deletion
      if (user?.isDemo) {
        const next = assets.filter((a) => a.id !== id && a.spItemId !== id);
        setAssets(next);
        await updateCache(next);
        return;
      }

      if (!user?.accessToken || !isMsConfigured()) {
        throw new Error(
          "Must be signed in to corporate Microsoft 365 or Demo Mode to delete assets."
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
    [user?.accessToken, user?.isDemo, assets, getSpService, updateCache]
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
