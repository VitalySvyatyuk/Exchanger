import type { ComponentProps } from "react";

const variants = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-border hover:bg-card",
  ghost: "hover:bg-card",
};

const sizes = {
  sm: "h-9 px-3",
  md: "h-10 px-4",
  lg: "h-11 px-5",
  icon: "h-9 w-9",
};

type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function buttonClassName(
  variant: Variant = "primary",
  size: Size = "md",
  className = "",
) {
  return `inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`;
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button className={buttonClassName(variant, size, className)} {...props} />
  );
}
