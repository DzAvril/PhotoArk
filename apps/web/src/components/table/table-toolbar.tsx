import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

interface TableToolbarProps {
  title?: string;
  search: string;
  onSearchChange: (value: string) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  totalItems: number;
}

export function TableToolbar({ title, search, onSearchChange, pageSize, onPageSizeChange, totalItems }: TableToolbarProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      const active = document.activeElement as HTMLElement | null;
      const isTypingTarget =
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.tagName === "SELECT" ||
        active?.isContentEditable;

      if (event.key === "/" && !isTypingTarget) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "Escape" && active === searchInputRef.current && search) {
        event.preventDefault();
        onSearchChange("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onSearchChange, search]);

  return (
    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      {title && title.trim() ? (
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm mp-muted">{search.trim() ? `筛选结果 ${totalItems} 条` : `共 ${totalItems} 条`}</p>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}
      <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[320px] md:flex-row md:items-center">
        <label className="relative block w-full md:min-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ark-ink-soft)]">
            <Search className="h-4 w-4" aria-hidden="true" />
          </span>
          <input
            ref={searchInputRef}
            className="mp-input mp-input-sm mp-input-with-icon w-full pr-10"
            placeholder="搜索名称或关键字"
            aria-label="搜索"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ark-ink-soft)] transition-colors hover:bg-[var(--ark-surface-soft)] hover:text-[var(--ark-ink)]"
              aria-label="清空搜索"
              onClick={() => onSearchChange("")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <label className="flex items-center gap-2 text-sm mp-muted">
          <span className="shrink-0">每页</span>
          <select
            className="mp-select mp-select-sm w-full md:w-[84px]"
            aria-label="每页条数"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </label>
      </div>
    </div>
  );
}
