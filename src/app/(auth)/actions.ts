"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  loginSchema,
  safeRedirectPath,
  signupSchema,
  type AuthFormState,
} from "@/lib/validation/auth";
import { createSession, deleteSession } from "@/server/auth";
import {
  authenticate,
  EmailAlreadyRegisteredError,
  registerUser,
} from "@/server/users";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signup(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    name: field(formData, "name"),
    email: field(formData, "email"),
  };
  const parsed = signupSchema.safeParse({
    ...values,
    password: field(formData, "password"),
  });

  if (!parsed.success) {
    return { values, errors: z.flattenError(parsed.error).fieldErrors };
  }

  let user: { id: string };
  try {
    user = await registerUser(parsed.data);
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      return { values, errors: { email: [error.message] } };
    }
    console.error("Sign-up failed:", error);
    return { values, message: "Something went wrong. Please try again." };
  }

  await createSession(user.id);
  redirect("/profile");
}

export async function login(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: field(formData, "email") };
  const parsed = loginSchema.safeParse({
    ...values,
    password: field(formData, "password"),
  });

  if (!parsed.success) {
    return { values, errors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    // Same message for unknown email and wrong password.
    return { values, message: "Invalid email or password." };
  }

  await createSession(user.id);
  redirect((safeRedirectPath(formData.get("next")) ?? "/profile") as Route);
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
