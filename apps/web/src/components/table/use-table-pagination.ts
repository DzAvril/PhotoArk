import { useMemo, useState } from "react";

interface UseTablePaginationOptions {
  pageSizeStorageKey?: string;
  defaultPageSize?: number;
}

function readPersistedPageSize(key: string | undefined, fallback: number): number {
  if (!key || typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function useTablePagination<T>(
  items: T[],
  search: string,
  matcher: (item: T, keyword: string) => boolean,
  options?: UseTablePaginationOptions
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    readPersistedPageSize(options?.pageSizeStorageKey, options?.defaultPageSize ?? 10)
  );

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

  function setPageSizeWithPersist(nextSize: number) {
    setPageSize(nextSize);
    setPage(1);
    if (typeof window !== "undefined" && options?.pageSizeStorageKey) {
      window.localStorage.setItem(options.pageSizeStorageKey, String(nextSize));
    }
  }

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize: setPageSizeWithPersist,
    totalPages,
    totalItems: filtered.length,
    paged
  };
}
