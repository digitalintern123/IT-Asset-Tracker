import type { AssetStatus, StandardCategory } from "@/types/asset";

export const CATEGORIES: StandardCategory[] = [
  "Laptop",
  "Desktop",
  "Monitor",
  "Phone",
  "Tablet",
  "Furniture",
  "Equipment",
  "Other",
];

export const CATEGORY_ICONS: Record<StandardCategory, string> = {
  Laptop: "laptop",
  Desktop: "hard-drive",
  Monitor: "tv",
  Phone: "smartphone",
  Tablet: "tablet",
  Furniture: "armchair",
  Equipment: "wrench",
  Other: "package",
};

export function getCategoryIcon(cat?: string | null): string {
  if (!cat) return "package";
  return (CATEGORY_ICONS as Record<string, string>)[cat] ?? "package";
}

export const STATUSES: AssetStatus[] = [
  "new",
  "in_use",
  "available",
  "maintenance",
  "retired",
];

export const STATUS_LABELS: Record<AssetStatus, string> = {
  new: "New Device",
  in_use: "In Use",
  available: "Available",
  maintenance: "Maintenance",
  retired: "Out of Order",
};

export const STATUS_COLORS: Record<
  AssetStatus,
  { bg: string; fg: string; dot: string }
> = {
  new: { bg: "#123A4A", fg: "#7DD3FC", dot: "#38BDF8" },
  in_use: { bg: "#162447", fg: "#E6C896", dot: "#CDA45E" },
  available: { bg: "#1F4733", fg: "#86EFAC", dot: "#22C55E" },
  maintenance: { bg: "#4A3A12", fg: "#FCD34D", dot: "#F59E0B" },
  retired: { bg: "#3A2A2A", fg: "#FCA5A5", dot: "#EF4444" },
};

/** Encalm sites. Stored in the Location column as "<CODE>" or "<CODE> — <detail>". */
export const LOCATIONS = [
  { code: "DEL", name: "Delhi" },
  { code: "HYD", name: "Hyderabad" },
  { code: "GOA", name: "Goa" },
  { code: "BUG", name: "Bhogapuram" },
  { code: "NAG", name: "Nagpur" },
] as const;

export type LocationCode = (typeof LOCATIONS)[number]["code"];

/** Company (vertical) a device belongs to. Stored in the SharePoint "Vertical" column. */
export const VERTICALS = [
  "ENCALM HOSPITALITY PVT LTD",
  "ENCALM EATS PVT LTD",
  "ENCALM SKYPLATES",
  "ENCALM HOTEL",
] as const;
