import { describe, expect, it } from "vitest";
import { checkAmountInput, formatAmount } from "./money";

const USD = { type: "FIAT", precision: 2 } as const;
const BTC = { type: "CRYPTO", precision: 8 } as const;
const ETH = { type: "CRYPTO", precision: 18 } as const;

describe("formatAmount", () => {
  it("groups thousands and pads fiat to its precision", () => {
    expect(formatAmount("1234567.5", USD)).toBe("1,234,567.50");
    expect(formatAmount("0", USD)).toBe("0.00");
  });

  it("keeps the sign of negative amounts, but not of zero", () => {
    expect(formatAmount("-10.00", USD)).toBe("-10.00");
    expect(formatAmount("-0.00", USD)).toBe("0.00");
  });

  it("trims trailing zeros of crypto amounts to at least two decimals", () => {
    expect(formatAmount("1.50000000", BTC)).toBe("1.50");
    expect(formatAmount("100.000000000000000000", ETH)).toBe("100.00");
  });

  it("keeps all 18 decimals without floating point errors", () => {
    expect(formatAmount("0.123456789012345678", ETH)).toBe(
      "0.123456789012345678",
    );
    expect(formatAmount("9007199254740993.000000000000000001", ETH)).toBe(
      "9,007,199,254,740,993.000000000000000001",
    );
  });
});

describe("checkAmountInput", () => {
  it.each([
    ["", false],
    ["0", false],
    ["abc", false],
    ["1e5", false],
    ["-5", false],
    ["12.345", false],
    ["12.", true],
    ["12.34", true],
  ])("%j is valid: %s", (amount, valid) => {
    expect(checkAmountInput(amount, 2, "1000").valid).toBe(valid);
  });

  it("flags amounts above the balance", () => {
    expect(checkAmountInput("100.01", 2, "100.00")).toEqual({
      valid: true,
      exceedsBalance: true,
    });
    expect(checkAmountInput("100", 2, "100.00")).toEqual({
      valid: true,
      exceedsBalance: false,
    });
  });
});
