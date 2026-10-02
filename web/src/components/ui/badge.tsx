import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/10 text-primary",
        warning: "border-warning/30 bg-warning/10 text-warning",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
