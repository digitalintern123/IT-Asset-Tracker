import type { WarrantyStatus } from "@/types/itam";

export interface WarrantyCalculation {
  status: WarrantyStatus;
  daysRemaining: number;
  label: string;
  badgeVariant: "success" | "warning" | "destructive" | "muted";
}

export function calculateWarrantyStatus(
  expiryDateString?: string | null,
  warnThresholdDays: number = 30
): WarrantyCalculation {
  if (!expiryDateString) {
    return {
      status: "expired",
      daysRemaining: -9999,
      label: "No Warranty",
      badgeVariant: "muted",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDateString);
  expiry.setHours(0, 0, 0, 0);

  if (isNaN(expiry.getTime())) {
    return {
      status: "expired",
      daysRemaining: -9999,
      label: "Invalid Date",
      badgeVariant: "muted",
    };
  }

  const diffMs = expiry.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    const expiredDaysAgo = Math.abs(days);
    return {
      status: "expired",
      daysRemaining: days,
      label: `Expired (${expiredDaysAgo}d ago)`,
      badgeVariant: "destructive",
    };
  }

  if (days <= warnThresholdDays) {
    return {
      status: "expiring_soon",
      daysRemaining: days,
      label: days === 0 ? "Expires today!" : `Expiring in ${days}d`,
      badgeVariant: "warning",
    };
  }

  return {
    status: "active",
    daysRemaining: days,
    label: `${days} days active`,
    badgeVariant: "success",
  };
}
