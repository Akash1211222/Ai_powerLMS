import { Logo } from './logo';

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Split-screen auth layout: a gradient brand panel (design mockups) beside the
 * form card. Collapses to a single column on small screens.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-bg">
      <div className="aurora-bg" aria-hidden>
        <div className="blob-3" />
      </div>
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-grad-holo p-12 text-white lg:flex">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15 backdrop-blur-2xl" />
        <div className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-white/10 backdrop-blur-2xl" />
        <div className="absolute left-1/3 top-1/4 h-40 w-40 animate-floaty rounded-card border border-white/25 bg-white/10 backdrop-blur-xl" />
        <Logo withWordmark className="[&_span]:text-white" />
        <div className="relative">
          <h2 className="text-3xl font-extrabold leading-tight">
            One connected student intelligence ecosystem.
          </h2>
          <p className="mt-3 max-w-sm text-white/80">
            Learning, mentorship, placement and community — with AI-guided insight from your first
            class to your first offer.
          </p>
        </div>
        <p className="relative text-sm text-white/70">© FutureCorp Academy</p>
      </aside>

      {/* Form panel */}
      <main className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="glass w-full max-w-md animate-fadeUp rounded-card p-8 shadow-card">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-faint">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-faint">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
