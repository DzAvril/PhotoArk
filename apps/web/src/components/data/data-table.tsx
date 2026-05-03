import React from "react";
import type { Key, ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  items: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getKey: (item: T) => Key;
  empty?: ReactNode;
}

export function DataTable<T,>({ items, columns, getKey, empty = null }: DataTableProps<T>) {
  if (items.length === 0) return empty;

  return (
    <div className="mp-table-shell hidden md:block">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getKey(item)}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
