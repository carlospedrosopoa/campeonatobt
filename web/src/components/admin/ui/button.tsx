import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "border-signal bg-signal text-white hover:bg-signal-strong hover:border-signal-strong",
  secondary: "border-[#d9d5cc] bg-white text-ink hover:bg-sand",
  ghost: "border-transparent bg-transparent text-ink-2 hover:bg-sand-2 hover:text-ink",
  danger: "border-red-200 bg-white text-red-700 hover:bg-red-50",
  dark: "border-ink bg-ink text-white hover:bg-[#2a2c33]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function Button({ variant = "secondary", size = "md", icon, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function LinkButton({ variant = "secondary", size = "md", icon, className, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
