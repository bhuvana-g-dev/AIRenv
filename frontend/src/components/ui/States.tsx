import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border hairline bg-emerald/5 text-mint" aria-hidden="true">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="font-display text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div
        className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-orange-400/25 bg-orange-400/10 text-orange-300"
        aria-hidden="true"
      >
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="font-display text-sm font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="label mb-2 text-mint/80">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {description && <div className="mt-1.5 max-w-2xl text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
