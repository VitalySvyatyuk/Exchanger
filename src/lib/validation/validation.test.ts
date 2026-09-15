import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loginSchema, safeRedirectPath, signupSchema } from "./auth";
import { convertSchema } from "./convert";
import { createLotSchema } from "./lot";
import { transferSchema } from "./transfer";

function errorsOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ]),
  );
}

describe("signupSchema", () => {
  it("normalizes name and email", () => {
    const result = signupSchema.parse({
      name: "  Alice  ",
      email: "  Alice@Example.COM ",
      password: "Secret123",
    });
    expect(result).toEqual({
      name: "Alice",
      email: "alice@example.com",
      password: "Secret123",
    });
  });

  it("requires a strong enough password", () => {
    const base = { name: "Alice", email: "alice@example.com" };
    expect(
      errorsOf(signupSchema.safeParse({ ...base, password: "short1" })),
    ).toMatchObject({
      password: "Password must be at least 8 characters long.",
    });
    expect(
      errorsOf(signupSchema.safeParse({ ...base, password: "12345678" })),
    ).toMatchObject({ password: "Password must contain a letter." });
    expect(
      errorsOf(signupSchema.safeParse({ ...base, password: "abcdefgh" })),
    ).toMatchObject({ password: "Password must contain a number." });
  });

  it("rejects invalid emails", () => {
    expect(
      loginSchema.safeParse({ email: "nope", password: "x" }).success,
    ).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/profile", "/profile"],
    ["/market?sell=USD", "/market?sell=USD"],
    ["//evil.example.com", null],
    ["/\\evil.example.com", null],
    ["https://evil.example.com", null],
    ["profile", null],
    [undefined, null],
  ])("%j -> %j", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe("convertSchema", () => {
  const valid = {
    from: "USD",
    to: "EUR",
    amount: "10.50",
    quotedRate: "0.84",
    idempotencyKey: randomUUID(),
  };

  it("accepts a valid conversion", () => {
    expect(convertSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects the same currency on both sides", () => {
    expect(errorsOf(convertSchema.safeParse({ ...valid, to: "USD" }))).toEqual({
      to: "Choose two different currencies.",
    });
  });

  it("enforces the source currency's precision", () => {
    expect(
      errorsOf(convertSchema.safeParse({ ...valid, amount: "1.001" })),
    ).toEqual({
      amount: "Too many decimal places for this currency.",
    });
    expect(
      convertSchema.safeParse({ ...valid, from: "BTC", amount: "0.00000001" })
        .success,
    ).toBe(true);
  });

  // Regression: malformed amounts used to throw inside safeParse
  // (new Decimal("abc")) instead of returning a validation error.
  it("rejects zero, negative and malformed amounts without throwing", () => {
    for (const amount of ["0", "-1", "1e3", "abc", "", "1.2.3", " "]) {
      const result = convertSchema.safeParse({ ...valid, amount });
      expect(result.success, amount).toBe(false);
      expect(Object.keys(errorsOf(result)), amount).toContain("amount");
    }
  });
});

describe("transferSchema", () => {
  const valid = {
    recipientEmail: " Bob@Example.com",
    from: "USD",
    to: "USD",
    amount: "5",
    note: "",
    quotedRate: "",
    idempotencyKey: randomUUID(),
  };

  it("normalizes the email and drops an empty note", () => {
    const result = transferSchema.parse(valid);
    expect(result.recipientEmail).toBe("bob@example.com");
    expect(result.note).toBeUndefined();
  });

  it("limits the note to 140 characters", () => {
    expect(
      errorsOf(transferSchema.safeParse({ ...valid, note: "x".repeat(141) })),
    ).toEqual({ note: "The note must be at most 140 characters long." });
  });

  it("requires the quoted rate only for cross-currency transfers", () => {
    expect(transferSchema.safeParse({ ...valid, to: "EUR" }).success).toBe(
      false,
    );
    expect(
      transferSchema.safeParse({ ...valid, to: "EUR", quotedRate: "0.84" })
        .success,
    ).toBe(true);
  });
});

describe("createLotSchema", () => {
  const valid = {
    sellCurrency: "USD",
    sellAmount: "30",
    buyCurrency: "EUR",
    buyAmount: "24",
    idempotencyKey: randomUUID(),
  };

  it("accepts a valid lot", () => {
    expect(createLotSchema.safeParse(valid).success).toBe(true);
  });

  it("checks both currencies and both precisions", () => {
    expect(
      errorsOf(createLotSchema.safeParse({ ...valid, buyCurrency: "USD" })),
    ).toEqual({
      buyCurrency: "Choose two different currencies.",
    });
    expect(
      errorsOf(
        createLotSchema.safeParse({
          ...valid,
          sellAmount: "1.001",
          buyAmount: "0.001",
        }),
      ),
    ).toEqual({
      sellAmount: "Too many decimal places for this currency.",
      buyAmount: "Too many decimal places for this currency.",
    });
  });
});
