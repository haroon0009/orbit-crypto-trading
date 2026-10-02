import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border-border bg-secondary text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost:
          "border-transparent hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "px-4",
        icon: "w-9 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
