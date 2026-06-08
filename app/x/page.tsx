import Link from "next/link";
import { ShieldCheck, BookText, LayoutDashboard, ArrowRight } from "lucide-react";

const sections = [
  {
    href: "/x/admin",
    icon: LayoutDashboard,
    label: "Admin Dashboard",
    desc: "Search Yelp, add & manage restaurants, export data. PIN protected.",
    badge: "PIN required",
    badgeColor: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  },
  {
    href: "/x/blog",
    icon: BookText,
    label: "Blog & Rankings",
    desc: "Personal rankings, influencer picks, and KBBQ deep dives.",
    badge: "Private",
    badgeColor: "text-primary bg-primary/10 border-primary/20",
  },
];

export default function XIndexPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">Private Section</h1>
            <p className="text-xs text-muted-foreground">bestlakbbq.com/x</p>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {sections.map(({ href, icon: Icon, label, desc, badge, badgeColor }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <Icon className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm">{label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${badgeColor}`}>{badge}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/40 text-center mt-8">
          Not linked anywhere — you know the URL.
        </p>
      </div>
    </main>
  );
}
