import type { ComponentProps } from "react";

type FormFieldProps = ComponentProps<"input"> & {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

export function FormField({
  label,
  name,
  errors,
  hint,
  ...inputProps
}: FormFieldProps) {
  const hasErrors = Boolean(errors?.length);
  const descriptionId = `${name}-description`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={hasErrors || undefined}
        aria-describedby={hasErrors || hint ? descriptionId : undefined}
        className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground aria-invalid:border-danger"
        {...inputProps}
      />
      {hasErrors ? (
        <ul id={descriptionId} className="text-sm text-danger">
          {errors?.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : (
        hint && (
          <p id={descriptionId} className="text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
