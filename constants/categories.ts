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
  "in_use",
  "available",
  "maintenance",
  "retired",
];

export const STATUS_LABELS: Record<AssetStatus, string> = {
  in_use: "In Use",
  available: "Available",
  maintenance: "Maintenance",
  retired: "Retired",
};

export const STATUS_COLORS: Record<
  AssetStatus,
  { bg: string; fg: string; dot: string }
> = {
  in_use: { bg: "#162447", fg: "#E6C896", dot: "#CDA45E" },
  available: { bg: "#1F4733", fg: "#86EFAC", dot: "#22C55E" },
  maintenance: { bg: "#4A3A12", fg: "#FCD34D", dot: "#F59E0B" },
  retired: { bg: "#3A2A2A", fg: "#FCA5A5", dot: "#EF4444" },
};
