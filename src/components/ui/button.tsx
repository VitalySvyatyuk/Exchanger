import type { ComponentProps } from "react";

const variants = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-border hover:bg-card",
  ghost: "hover:bg-card",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
};

export function buttonClassName(
  variant: keyof typeof variants = "primary",
  className = "",
) {
  return `inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`;
}

export function Button({ variant, className, ...props }: ButtonProps) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}
