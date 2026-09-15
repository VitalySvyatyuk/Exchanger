import { Decimal } from "@/lib/decimal";

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function formatAge(date: Date, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

/** A price with 6 significant digits and thousands separators: 76,934 or 1.15509. */
export function formatPrice(value: string): string {
  const rounded = new Decimal(value).toSignificantDigits(6);
  const [integer, fraction] = (
    rounded.greaterThanOrEqualTo(1000) ? rounded.toFixed(2) : rounded.toString()
  ).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
