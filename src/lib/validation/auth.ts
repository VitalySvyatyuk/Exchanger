import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(255, { error: "Email is too long." })
  .pipe(z.email({ error: "Enter a valid email address." }));

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Name must be at least 2 characters long." })
    .max(100, { error: "Name must be at most 100 characters long." }),
  email,
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters long." })
    .max(128, { error: "Password must be at most 128 characters long." })
    .regex(/\p{L}/u, { error: "Password must contain a letter." })
    .regex(/\d/, { error: "Password must contain a number." }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password." }),
});

export type AuthFormState =
  | {
      errors?: Partial<Record<"name" | "email" | "password", string[]>>;
      message?: string;
      /** Submitted values, so the form can be re-filled after an error. */
      values?: { name?: string; email?: string };
    }
  | undefined;

/**
 * Returns the path if it's safe to redirect to after login, i.e. a local
 * path. Rejects absolute and protocol-relative URLs to prevent open redirects.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
