"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Chart" },
  { href: "/list", label: "Directory" },
  { href: "/calculator", label: "Beat the Restaurant" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center">
      {/* Blur backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-xl border-b border-white/5" />

      <div className="relative max-w-6xl mx-auto px-6 w-full flex items-center justify-between">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-xl">🔥</span>
          <span className="font-bold text-base tracking-tight">
            <span className="text-primary">Best</span>
            <span className="text-foreground/90"> LA KBBQ</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative px-3.5 py-1.5 rounded-lg text-sm transition-all duration-150",
                pathname === href
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {pathname === href && (
                <span className="absolute inset-0 rounded-lg bg-white/8" />
              )}
              <span className="relative">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
