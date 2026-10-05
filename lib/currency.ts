/**
 * Indian Rupee (₹ / INR) Currency Formatter for ENCALM Asset Tracker.
 */

export const CURRENCY_SYMBOL = "₹";
export const CURRENCY_CODE = "INR";

/**
 * Format numeric value in Indian Rupees.
 * Examples:
 * - formatRupees(150000, { compact: true }) => "₹1.50 L"
 * - formatRupees(12500000, { compact: true }) => "₹1.25 Cr"
 * - formatRupees(45000) => "₹45,000"
 */
export function formatRupees(
  amount: number | null | undefined,
  options?: { compact?: boolean }
): string {
  const n = Number(amount) || 0;

  if (options?.compact) {
    if (n >= 10_000_000) {
      const cr = (n / 10_000_000).toFixed(2).replace(/\.?0+$/, "");
      return `${CURRENCY_SYMBOL}${cr} Cr`;
    }
    if (n >= 100_000) {
      const lakh = (n / 100_000).toFixed(2).replace(/\.?0+$/, "");
      return `${CURRENCY_SYMBOL}${lakh} L`;
    }
    if (n >= 1_000) {
      const k = (n / 1_000).toFixed(1).replace(/\.?0+$/, "");
      return `${CURRENCY_SYMBOL}${k}k`;
    }
    return `${CURRENCY_SYMBOL}${n}`;
  }

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // Fallback Indian grouping format
    const str = Math.round(n).toString();
    const lastThree = str.substring(str.length - 3);
    const otherNumbers = str.substring(0, str.length - 3);
    const formatted =
      otherNumbers !== ""
        ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
        : lastThree;
    return `${CURRENCY_SYMBOL}${formatted}`;
  }
}
