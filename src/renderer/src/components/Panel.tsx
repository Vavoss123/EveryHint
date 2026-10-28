import { useEffect, useRef, type ReactNode } from "react";
export function Panel({
  title,
  children,
  badge,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  badge?: string;
  compact?: boolean;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (compact && panel.current) panel.current.open = true;
  }, [compact]);
  return (
    <details ref={panel} className="workspace-panel" open>
      <summary>
        {title}
        {badge && <span className="eyebrow">{badge}</span>}
      </summary>
      <div className="panel-body">{children}</div>
    </details>
  );
}
