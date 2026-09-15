import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatAmount } from "@/lib/money";
import type { SearchParams } from "@/lib/search-params";

export const th = "px-3 py-2 text-left font-medium whitespace-nowrap";
export const td = "px-3 py-2 align-top";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_thead]:bg-card [&_thead]:text-muted">
        {children}
      </table>
    </div>
  );
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}

/** A signed amount with its currency, green for credits. */
export function SignedAmount({
  amount,
  currency,
}: {
  amount: string;
  currency: { code: string; type: "FIAT" | "CRYPTO"; precision: number };
}) {
  const negative = amount.startsWith("-");
  return (
    <span
      className={`font-mono whitespace-nowrap tabular-nums ${negative ? "" : "text-success"}`}
    >
      {negative ? "−" : "+"}
      {formatAmount(amount.replace(/^-/, ""), currency)} {currency.code}
    </span>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "strong" | "danger" | "success";
}) {
  const tones = {
    muted: "border-border text-muted",
    strong: "border-foreground text-foreground",
    danger: "border-danger text-danger",
    success: "border-success text-success",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Builds a link to `path` with the current params, overridden by `changes`. */
export function hrefWith(
  path: string,
  params: SearchParams,
  changes: Record<string, string | undefined>,
): Route {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value) query.set(key, value);
    else query.delete(key);
  }
  const string = query.toString();
  return `${path}${string ? `?${string}` : ""}` as Route;
}

export function Pager({
  path,
  params,
  nextCursor,
}: {
  path: string;
  params: SearchParams;
  nextCursor: string | null;
}) {
  const onFirstPage = !params.cursor;
  if (onFirstPage && !nextCursor) return null;
  return (
    <nav aria-label="Pagination" className="flex justify-between text-sm">
      {onFirstPage ? (
        <span />
      ) : (
        <Link
          href={hrefWith(path, params, { cursor: undefined })}
          className="underline"
        >
          ← First page
        </Link>
      )}
      {nextCursor && (
        <Link
          href={hrefWith(path, params, { cursor: nextCursor })}
          className="underline"
        >
          Next page →
        </Link>
      )}
    </nav>
  );
}

export function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground";
