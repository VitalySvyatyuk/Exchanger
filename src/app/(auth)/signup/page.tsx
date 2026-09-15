import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/profile");

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="text-sm text-muted">
          Get $100 on your USD account to start trading.
        </p>
      </div>
      <SignupForm />
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Log in
        </Link>
      </p>
    </>
  );
}
