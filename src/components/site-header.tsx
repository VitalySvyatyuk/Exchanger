import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/(auth)/actions";
import { Button, buttonClassName } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Exchanger
        </Link>
        {/* Reading the session is dynamic; stream it without blocking the page. */}
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}

async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <nav className="flex items-center gap-2">
        <Link href="/login" className={buttonClassName("ghost")}>
          Log in
        </Link>
        <Link href="/signup" className={buttonClassName("primary")}>
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-2">
      <Link href="/profile" className={buttonClassName("ghost")}>
        {user.name ?? user.email}
      </Link>
      <form action={logout}>
        <Button type="submit" variant="secondary">
          Log out
        </Button>
      </form>
    </nav>
  );
}
