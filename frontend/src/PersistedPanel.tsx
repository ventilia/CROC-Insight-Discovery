import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function PersistedPanel({ id, title, children, className = "" }: {
  id: string; title: string; children: ReactNode; className?: string;
}) {
  const key = "kit.panel." + id;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(key) !== "closed"; } catch { return true; }
  });
  return <details className={"surface persisted-panel " + className} open={open} onToggle={(event) => {
    const expanded = event.currentTarget.open;
    setOpen(expanded);
    try { localStorage.setItem(key, expanded ? "open" : "closed"); } catch {}
  }}>
    <summary><h2>{title}</h2><ChevronDown size={19} aria-hidden="true" /></summary>
    {children}
  </details>;
}
