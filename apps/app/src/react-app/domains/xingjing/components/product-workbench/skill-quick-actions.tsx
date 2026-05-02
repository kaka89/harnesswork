/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import type { SkillAction } from "../../types/product-workbench";

export interface SkillQuickActionsProps {
  skills: SkillAction[];
  disabled?: boolean;
  onInvoke: (slug: string) => void;
  label?: string;
}

export function SkillQuickActions({
  skills,
  disabled,
  onInvoke,
  label = "Skill",
}: SkillQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (skills.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-dls-secondary hover:bg-dls-hover disabled:opacity-50"
      >
        <ClipboardList size={14} />
        {label}
        <ChevronDown size={12} />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-[260px] overflow-hidden rounded-2xl border border-dls-border bg-dls-surface py-1 shadow-xl">
          {skills.map((skill) => (
            <button
              key={skill.slug}
              type="button"
              onClick={() => {
                setOpen(false);
                onInvoke(skill.slug);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-dls-hover"
            >
              <span className="text-[13px] text-dls-text">{skill.label}</span>
              {skill.description ? (
                <span className="text-[11px] text-dls-secondary">{skill.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
