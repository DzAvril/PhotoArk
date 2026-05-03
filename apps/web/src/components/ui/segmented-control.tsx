import React from "react";

export type SegmentedControlItem<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  value: T;
  items: Array<SegmentedControlItem<T>>;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ ariaLabel, value, items, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="mp-segment" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="mp-segment-item"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          <span>{item.label}</span>
          {typeof item.count === "number" ? <span className="mp-segment-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
