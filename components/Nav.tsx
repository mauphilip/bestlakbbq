"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { Menu, X, Sun, Moon, ShieldCheck, LayoutDashboard, BookText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

const links = [
  { href: "/", label: "Chart" },
  { href: "/list", label: "Directory" },
  { href: "/calculator", label: "Beat the Restaurant" },
  { href: "/visited", label: "My Visits" },
];

const secretLinks = [
  { href: "/x/admin", label: "Admin Dashboard", icon: LayoutDashboard, desc: "Add & manage restaurants" },
  { href: "/x/blog", label: "Blog", icon: BookText, desc: "Rankings & personal picks" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const secretRef = useRef<HTMLDivElement>(null);
  const { theme, toggle } = useTheme();

  // Close drawer on route change
  useEffect(() => { setOpen(false); setSecretOpen(false); }, [pathname]);

  // Close secret dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (secretRef.current && !secretRef.current.contains(e.target as Node)) {
        setSecretOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

          {/* Right side — secret menu + theme toggle + hamburger */}
          <div className="flex items-center gap-1">
            {/* Secret admin dropdown */}
            <div className="relative" ref={secretRef}>
              <button
                onClick={() => setSecretOpen((v) => !v)}
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                  secretOpen
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-foreground/8"
                )}
                aria-label="Admin menu"
                title="Admin"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>

              {secretOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Private</p>
                  </div>
                  {secretLinks.map(({ href, label, icon: Icon, desc }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-start gap-3 px-3 py-2.5 hover:bg-foreground/5 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={toggle}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/8 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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
