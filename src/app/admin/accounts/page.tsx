import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AccountType } from "@/generated/prisma/enums";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";
import { formatDateTime } from "@/lib/format";
import { formatAmount } from "@/lib/money";
import { isUuid, param } from "@/lib/search-params";
import { listAccounts } from "@/server/admin/accounts";
import {
  Badge,
  EmptyRow,
  FilterField,
  inputClass,
  Pager,
  Table,
  td,
  th,
} from "../ui";

export const metadata: Metadata = { title: "Accounts" };

const ACCOUNT_TYPES: AccountType[] = ["USER", "ESCROW", "TREASURY"];

export default async function AdminAccountsPage({
  searchParams,
}: PageProps<"/admin/accounts">) {
  const params = await searchParams;
  const type = ACCOUNT_TYPES.find((t) => t === params.type);
  const currencyCode = SUPPORTED_CURRENCIES.find(
    (c) => c.code === params.currency,
  )?.code;
  const hideZero = params.nonzero === "1";
  const cursor = isUuid(param(params.cursor))
    ? param(params.cursor)
    : undefined;

  const { accounts, nextCursor } = await listAccounts({
    type,
    currencyCode,
    hideZero,
    cursor,
  });

  return (
    <div className="flex flex-col gap-4">
      <Form action="/admin/accounts" className="flex flex-wrap items-end gap-2">
        <FilterField label="Type">
          <select name="type" defaultValue={type ?? ""} className={inputClass}>
            <option value="">Any</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Currency">
          <select
            name="currency"
            defaultValue={currencyCode ?? ""}
            className={`${inputClass} font-mono`}
          >
            <option value="">Any</option>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </FilterField>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="nonzero"
            value="1"
            defaultChecked={hideZero}
          />
          Hide zero balances
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
        {(type || currencyCode || hideZero) && (
          <Link href="/admin/accounts" className="px-2 text-sm underline">
            Clear
          </Link>
        )}
      </Form>

      <Table>
        <thead>
          <tr>
            <th className={th}>Type</th>
            <th className={th}>Owner</th>
            <th className={th}>Currency</th>
            <th className={`${th} text-right`}>Balance</th>
            <th className={th}>Opened (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 && (
            <EmptyRow colSpan={5}>No accounts found.</EmptyRow>
          )}
          {accounts.map((account) => (
            <tr key={account.id}>
              <td className={td}>
                <Badge tone={account.type === "USER" ? "muted" : "strong"}>
                  {account.type}
                </Badge>
              </td>
              <td className={td}>
                {account.owner ? (
                  <Link
                    href={`/admin/users/${account.owner.id}` as Route}
                    className="underline"
                  >
                    {account.owner.email}
                  </Link>
                ) : (
                  <span className="text-muted">System</span>
                )}
              </td>
              <td className={`${td} font-mono`}>{account.currency.code}</td>
              <td
                className={`${td} text-right font-mono whitespace-nowrap tabular-nums ${
                  account.balance.startsWith("-") ? "text-danger" : ""
                }`}
              >
                {formatAmount(account.balance, account.currency)}
              </td>
              <td className={`${td} whitespace-nowrap text-muted`}>
                {formatDateTime(account.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Pager path="/admin/accounts" params={params} nextCursor={nextCursor} />
    </div>
  );
}
