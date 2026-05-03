export type PaginateItemsOptions = {
  page?: number;
  pageSize?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
};

export type PaginatedItems<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

export function paginateItems<T>(items: T[], options: PaginateItemsOptions = {}): PaginatedItems<T> {
  const defaultPageSize = normalizePositiveInteger(options.defaultPageSize, 300);
  const maxPageSize = normalizePositiveInteger(options.maxPageSize, defaultPageSize);
  const requestedPageSize = normalizePositiveInteger(options.pageSize, defaultPageSize);
  const pageSize = Math.min(requestedPageSize, maxPageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(normalizePositiveInteger(options.page, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages
  };
}
