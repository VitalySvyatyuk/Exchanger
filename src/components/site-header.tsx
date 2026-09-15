import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/(auth)/actions";
import { Button, buttonClassName } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      {/* On phones the main navigation wraps onto a second row. */}
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
        <Link
          href="/"
          className="flex h-10 items-center text-lg font-semibold tracking-tight"
        >
          Exchanger
        </Link>
        {/* Reading the session is dynamic; stream it without blocking the page. */}
        <Suspense fallback={null}>
          <Navigation />
        </Suspense>
      </div>
    </header>
  );
}

async function Navigation() {
  const user = await getCurrentUser();

  return (
    <>
      <nav
        aria-label="Main"
        className="order-last -mx-3 flex w-[calc(100%+1.5rem)] gap-1 sm:order-none sm:mx-0 sm:ml-auto sm:w-auto"
      >
        <Link href="/market" className={buttonClassName("ghost", "sm")}>
          Market
        </Link>
        {user && (
          <>
            <Link href="/convert" className={buttonClassName("ghost", "sm")}>
              Convert
            </Link>
            <Link href="/transfer" className={buttonClassName("ghost", "sm")}>
              Send
            </Link>
          </>
        )}
        {user?.role === "ADMIN" && (
          <Link href="/admin" className={buttonClassName("ghost", "sm")}>
            Admin panel
          </Link>
        )}
      </nav>

      {user ? (
        <nav aria-label="Account" className="flex min-w-0 items-center gap-1">
          <Link
            href="/profile"
            className={buttonClassName("ghost", "sm", "min-w-0")}
          >
            <span className="max-w-48 truncate">{user.name ?? user.email}</span>
          </Link>
          <form action={logout}>
            <Button type="submit" variant="secondary" size="sm">
              Log out
            </Button>
          </form>
        </nav>
      ) : (
        <nav aria-label="Account" className="flex items-center gap-1">
          <Link href="/login" className={buttonClassName("ghost", "sm")}>
            Log in
          </Link>
          <Link href="/signup" className={buttonClassName("primary", "sm")}>
            Sign up
          </Link>
        </nav>
      )}
    </>
  );
}
