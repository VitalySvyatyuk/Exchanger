import "server-only";
import { Prisma } from "@/generated/prisma/client";

/** True if the error is a unique constraint violation involving `field`. */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes(field)
    : String(target).includes(field);
}

/**
 * True if the error is a violation of the named CHECK constraint.
 *
 * Prisma surfaces these (raised here by a trigger's UPDATE) as an unknown
 * request error, with the PostgreSQL message escaped inside its own message,
 * so match on the SQLSTATE and the constraint name.
 */
export function isCheckViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof Error &&
    error.message.includes("23514") &&
    error.message.includes(constraint)
  );
}
