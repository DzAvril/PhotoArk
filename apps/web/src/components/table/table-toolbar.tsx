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
        <input
          className="mp-input w-full sm:min-w-[200px]"
          placeholder="搜索"
          aria-label="搜索"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
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
