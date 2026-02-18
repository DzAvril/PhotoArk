import { useMemo, useState } from "react";

export function useTablePagination<T>(items: T[], search: string, matcher: (item: T, keyword: string) => boolean) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => matcher(item, keyword));
  }, [items, search, matcher]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems: filtered.length,
    paged
  };
}
