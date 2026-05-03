import React from "react";
import type { Key, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
  className?: string;
  headerProps?: ThHTMLAttributes<HTMLTableCellElement>;
  cellProps?: TdHTMLAttributes<HTMLTableCellElement> | ((item: T) => TdHTMLAttributes<HTMLTableCellElement>);
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
      <table className="mp-data-table min-w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" {...column.headerProps} className={[column.className, column.headerProps?.className].filter(Boolean).join(" ")}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getKey(item)}>
              {columns.map((column) => {
                const cellProps = typeof column.cellProps === "function" ? column.cellProps(item) : column.cellProps;
                return (
                  <td key={column.key} {...cellProps} className={[column.className, cellProps?.className].filter(Boolean).join(" ")}>
                    {column.render(item)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
