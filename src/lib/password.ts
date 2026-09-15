import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

// Password hashing with Node's built-in scrypt, so no native dependency.
// Stored format: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DEFAULT_OPTIONS = { N: 2 ** 15, r: 8, p: 1 } as const;
// N * r * 128 bytes; must fit under maxmem.
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(
  password: string,
  salt: Buffer,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { ...options, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = DEFAULT_OPTIONS;
  const key = await deriveKey(password, salt, { N, r, p });

  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [algorithm, N, r, p, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !N || !r || !p || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64");
  const actual = await deriveKey(password, Buffer.from(salt, "base64"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
