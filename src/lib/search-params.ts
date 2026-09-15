export type SearchParams = Record<string, string | string[] | undefined>;

/** A single non-empty string search param, or undefined. */
export function param(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value);
}
