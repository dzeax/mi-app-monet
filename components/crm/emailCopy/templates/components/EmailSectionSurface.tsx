"use client";

import type { HTMLAttributes, ReactNode } from "react";

type EmailSectionSurfaceProps = {
  children: ReactNode;
  variant?: "default" | "divider";
  className?: string;
} & HTMLAttributes<HTMLElement>;

export function EmailSectionSurface({
  children,
  variant = "default",
  className,
  ...rest
}: EmailSectionSurfaceProps) {
  return (
    <section
      className={[
        "bg-white px-5 py-5 text-[15px] leading-[1.6] sm:px-6 sm:py-6",
        variant === "divider" ? "border-t border-[color:var(--color-border)]/70" : "",
        className || "",
      ].join(" ")}
      {...rest}
    >
      {children}
    </section>
  );
}
