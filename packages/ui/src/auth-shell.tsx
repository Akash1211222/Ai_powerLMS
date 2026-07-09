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
      {/* Brand panel */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-500 to-brand-800 p-12 text-white lg:flex">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-white/5" />
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
        <div className="w-full max-w-md animate-fadeUp">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-faint">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-faint">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
