import { describe, expect, it } from "vitest";
import { formatAge, formatDateTime, formatPrice } from "./format";

describe("formatAge", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000);

  it.each([
    [5, "just now"],
    [90, "1 min ago"],
    [2 * 3600 + 5, "2 h ago"],
    [3 * 86_400, "3 d ago"],
    [-30, "just now"],
  ])("%is -> %s", (seconds, expected) => {
    expect(formatAge(ago(seconds), now)).toBe(expected);
  });
});

describe("formatPrice", () => {
  it("uses 6 significant digits and thousands separators", () => {
    expect(formatPrice("76934")).toBe("76,934.00");
    expect(formatPrice("1.155094544488")).toBe("1.15509");
    expect(formatPrice("0.000012997")).toBe("0.000012997");
  });
});

describe("formatDateTime", () => {
  it("formats in UTC", () => {
    // ICU versions differ on "Sep" vs "Sept".
    expect(formatDateTime(new Date("2026-09-15T09:33:00Z"))).toMatch(
      /^15 Sept? 2026, 09:33$/,
    );
  });
});
