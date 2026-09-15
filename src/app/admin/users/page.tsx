import type { Metadata, Route } from "next";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Decimal } from "@/lib/decimal";
import { formatDateTime, formatPrice } from "@/lib/format";
import { isUuid, param } from "@/lib/search-params";
import { listUsers } from "@/server/admin/users";
import { getLatestRates, toUsdPrices } from "@/server/rates/rates";
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

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const params = await searchParams;
  const query = param(params.q);
  const cursor = isUuid(param(params.cursor))
    ? param(params.cursor)
    : undefined;

  const [{ users, nextCursor }, rates] = await Promise.all([
    listUsers({ query, cursor }),
    getLatestRates(),
  ]);
  const prices = toUsdPrices(rates);

  return (
    <div className="flex flex-col gap-4">
      <Form action="/admin/users" className="flex flex-wrap items-end gap-2">
        <FilterField label="Search">
          <input
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Email, name or id"
            className={`${inputClass} w-72 max-w-full`}
          />
        </FilterField>
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>
        {query && (
          <Link href="/admin/users" className="px-2 text-sm underline">
            Clear
          </Link>
        )}
      </Form>

      <Table>
        <thead>
          <tr>
            <th className={th}>User</th>
            <th className={th}>Role</th>
            <th className={th}>Joined (UTC)</th>
            <th className={`${th} text-right`}>Sessions</th>
            <th className={`${th} text-right`}>Total balance</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <EmptyRow colSpan={5}>No users found.</EmptyRow>
          )}
          {users.map((user) => {
            // Converted with current rates, for a rough sense of size.
            const totalUsd = Object.entries(user.balances).reduce(
              (sum, [code, balance]) =>
                prices[code]
                  ? sum.plus(new Decimal(balance).times(prices[code]))
                  : sum,
              new Decimal(0),
            );
            return (
              <tr key={user.id}>
                <td className={td}>
                  <Link
                    href={`/admin/users/${user.id}` as Route}
                    className="font-medium underline"
                  >
                    {user.name ?? "—"}
                  </Link>
                  <div className="text-muted">{user.email}</div>
                </td>
                <td className={td}>
                  <Badge tone={user.role === "ADMIN" ? "strong" : "muted"}>
                    {user.role}
                  </Badge>
                </td>
                <td className={`${td} whitespace-nowrap text-muted`}>
                  {formatDateTime(user.createdAt)}
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {user.activeSessions}
                </td>
                <td
                  className={`${td} text-right font-mono whitespace-nowrap tabular-nums`}
                >
                  ≈ ${formatPrice(totalUsd.toFixed(2))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Pager path="/admin/users" params={params} nextCursor={nextCursor} />
    </div>
  );
}
