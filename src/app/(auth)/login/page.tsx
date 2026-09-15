import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/validation/auth";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/profile");

  const { next } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <LoginForm next={safeRedirectPath(next) ?? undefined} />
      <p className="text-sm text-muted">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-foreground underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
