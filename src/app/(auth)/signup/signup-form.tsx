"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { signup } from "../actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormField
        label="Name"
        name="name"
        autoComplete="name"
        required
        defaultValue={state?.values?.name}
        errors={state?.errors?.name}
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.values?.email}
        errors={state?.errors?.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters, including a letter and a number."
        errors={state?.errors?.password}
      />

      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
