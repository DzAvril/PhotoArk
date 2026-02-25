interface TableToolbarProps {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  totalItems: number;
}

export function TableToolbar({ title, search, onSearchChange, pageSize, onPageSizeChange, totalItems }: TableToolbarProps) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm mp-muted">共 {totalItems} 条</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[280px] sm:flex-row">
        <label className="relative block w-full sm:min-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ark-ink-soft)]">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M16 16 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <input
            className="mp-input w-full pl-9"
            placeholder="搜索名称或关键字"
            aria-label="搜索"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>
        <select
          className="mp-select w-full sm:w-[96px]"
          aria-label="每页条数"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
        </select>
      </div>
    </div>
  );
}
