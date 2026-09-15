import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const features = [
  {
    title: "Multi-currency wallet",
    description:
      "One account per currency, and a $100 welcome bonus for every new user.",
  },
  {
    title: "Instant conversion",
    description:
      "Convert between your own accounts or send money to other users at live exchange rates.",
  },
  {
    title: "P2P marketplace",
    description:
      "Post an offer such as “Sell 50 USD for 40 EUR” and let other users buy it.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Exchange fiat and crypto with other people
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Hold balances in several currencies, convert them at market rates, and
          trade directly with other users.
        </p>
        <div>
          <Link
            href="/signup"
            className={buttonClassName("primary", "h-11 px-5")}
          >
            Sign up and get $100
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-lg border border-border bg-card p-5"
          >
            <h2 className="font-medium">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted">{feature.description}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Supported currencies</h2>
        <ul className="flex flex-wrap gap-2">
          {SUPPORTED_CURRENCIES.map((currency) => (
            <li
              key={currency.code}
              className="rounded-full border border-border px-3 py-1 text-sm"
              title={`${currency.name} (${currency.type === "FIAT" ? "fiat" : "crypto"})`}
            >
              <span className="font-mono font-medium">{currency.code}</span>
              <span className="ml-2 text-muted">{currency.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
