interface TablePaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function TablePagination({ page, totalPages, onChange }: TablePaginationProps) {
  return (
    <div className="mt-3 flex items-center justify-center gap-2 text-sm md:justify-end">
      <button className="mp-btn" type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <span className="mp-muted">
        {page} / {totalPages}
      </span>
      <button className="mp-btn" type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        下一页
      </button>
    </div>
  );
}
