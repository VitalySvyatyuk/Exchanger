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
