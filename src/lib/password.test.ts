import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("Secret123");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[\w+/=]+\$[\w+/=]+$/);
    await expect(verifyPassword("Secret123", hash)).resolves.toBe(true);
    await expect(verifyPassword("Secret124", hash)).resolves.toBe(false);
  });

  it("uses a random salt", async () => {
    const [a, b] = await Promise.all([
      hashPassword("Secret123"),
      hashPassword("Secret123"),
    ]);
    expect(a).not.toBe(b);
  });

  it("treats unknown or malformed hashes as a mismatch", async () => {
    await expect(verifyPassword("x", "bcrypt$10$abc")).resolves.toBe(false);
    await expect(verifyPassword("x", "")).resolves.toBe(false);
  });
});
