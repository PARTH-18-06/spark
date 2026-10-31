import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 px-5 py-2.5 text-sm font-extrabold tracking-[0.01em] transition-[transform,box-shadow,background-color,border-color] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-0.5 active:shadow-none",
  {
    variants: {
      variant: {
        primary:
          "border-primary-dark bg-primary text-white shadow-[0_4px_0_0_var(--primary-dark)] hover:bg-[#0f988c]",
        secondary:
          "border-line bg-surface text-ink shadow-[0_4px_0_0_#c9d0ca] hover:border-primary hover:text-primary-dark",
        ghost:
          "border-transparent bg-transparent text-ink shadow-none hover:bg-white/70",
        yellow:
          "border-[#d49b14] bg-highlight text-ink shadow-[0_4px_0_0_#d49b14] hover:bg-[#ffd361]",
      },
      size: {
        default: "min-h-11",
        sm: "min-h-9 rounded-xl px-3 py-1.5 text-xs",
        lg: "min-h-13 px-7 py-3.5 text-base",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  children,
  className,
  variant,
  size,
  ...props
}: {
  href: string;
  children: ReactNode;
  className?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
} & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </Link>
  );
}
