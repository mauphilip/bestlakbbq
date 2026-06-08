"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

const links = [
  { href: "/", label: "Chart" },
  { href: "/list", label: "Directory" },
  { href: "/calculator", label: "Beat the Restaurant" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-16">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-b border-border/60" />

        <div className="relative max-w-6xl mx-auto px-5 h-full flex items-center justify-between">
          {/* Wordmark */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="text-2xl leading-none">🔥</span>
            <span className="font-bold text-lg tracking-tight">
              <span className="text-primary">Best</span>
              <span className="text-foreground"> LA KBBQ</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative px-4 py-2 rounded-lg text-base font-medium transition-colors duration-150",
                  pathname === href
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {pathname === href && (
                  <span className="absolute inset-0 rounded-lg bg-foreground/8" />
                )}
                <span className="relative">{label}</span>
              </Link>
            ))}
          </nav>

          {/* Right side — theme toggle + hamburger */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/8 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setOpen((v) => !v)}
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/8 transition-colors"
              aria-label="Toggle menu"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <nav
            className="absolute top-16 left-0 right-0 bg-background border-b border-border shadow-xl px-5 py-4 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-4 py-3 rounded-xl text-base font-medium transition-colors",
                  pathname === href
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-foreground/5"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
