import React from "react";
import type { Key, ReactNode } from "react";

interface MobileListProps<T> {
  items: readonly T[];
  getKey: (item: T) => Key;
  renderItem: (item: T) => ReactNode;
  empty?: ReactNode;
}

export function MobileList<T,>({ items, getKey, renderItem, empty = null }: MobileListProps<T>) {
  if (items.length === 0) return empty;

  return (
    <div className="grid gap-2 md:hidden">
      {items.map((item) => (
        <div key={getKey(item)}>{renderItem(item)}</div>
      ))}
    </div>
  );
}
