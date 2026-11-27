import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

/**
 * Form field label. For a single control the `<label>` wraps it (implicit association)
 * and the hint is linked with `aria-describedby`. Use `group` when the children are a
 * composite (several buttons, a search widget): it renders a labelled `role="group"`
 * instead, so clicking the label doesn't activate the first child.
 */
export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: ReactNode; group?: boolean }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const hintEl = hint && (
    <span id={hintId} className="mt-1 block text-[11px] text-faint">
      {hint}
    </span>
  );
  if (group)
    return (
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={hint ? hintId : undefined} className="block">
        <span id={`${id}-label`} className="mb-1.5 block text-xs font-medium text-muted">
          {label}
        </span>
        {children}
        {hintEl}
      </div>
    );
  const control =
    hint && isValidElement(children)
      ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": hintId })
      : children;
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
        {control}
      </label>
      {hintEl}
    </div>
  );
}
