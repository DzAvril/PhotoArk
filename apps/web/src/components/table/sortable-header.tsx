interface SortableHeaderProps {
  label: string;
  active: boolean;
  ascending: boolean;
  onToggle: () => void;
}

export function SortableHeader({ label, active, ascending, onToggle }: SortableHeaderProps) {
  const directionLabel = active ? (ascending ? "升序" : "降序") : "未排序";
  const icon = active ? (ascending ? "↑" : "↓") : "↕";

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-left text-sm font-medium text-[var(--ark-ink)] transition-colors hover:text-[var(--ark-primary)]"
      aria-label={`${label}，当前${directionLabel}，点击切换排序`}
      onClick={onToggle}
    >
      <span>{label}</span>
      <span aria-hidden="true" className={active ? "text-[var(--ark-primary)]" : "text-[var(--ark-ink-soft)]"}>
        {icon}
      </span>
    </button>
  );
}
