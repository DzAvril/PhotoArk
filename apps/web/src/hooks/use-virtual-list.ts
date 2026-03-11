import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UseVirtualListOptions {
  itemCount: number;
  itemSize: number | ((index: number) => number);
  containerHeight: number;
  overscan?: number;
}

interface VirtualItem {
  index: number;
  style: React.CSSProperties;
}

interface UseVirtualListResult {
  virtualItems: VirtualItem[];
  totalHeight: number;
  containerProps: React.HTMLAttributes<HTMLDivElement>;
  scrollToIndex: (index: number) => void;
}

function getItemSize(itemSize: number | ((index: number) => number), index: number): number {
  return typeof itemSize === "function" ? itemSize(index) : itemSize;
}

function getItemOffset(
  itemSize: number | ((index: number) => number),
  index: number,
  cachedPositions: number[] | null
): number {
  if (cachedPositions && cachedPositions.length > index) {
    return cachedPositions[index];
  }
  if (typeof itemSize === "number") {
    return index * itemSize;
  }
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += itemSize(i);
  }
  return offset;
}

function calculateTotalHeight(
  itemCount: number,
  itemSize: number | ((index: number) => number),
  cachedPositions: number[] | null
): number {
  if (itemCount === 0) return 0;
  const lastItemOffset = getItemOffset(itemSize, itemCount - 1, cachedPositions);
  const lastItemSize = getItemSize(itemSize, itemCount - 1);
  return lastItemOffset + lastItemSize;
}

function buildPositionCache(
  itemCount: number,
  itemSize: number | ((index: number) => number)
): number[] {
  const positions: number[] = [];
  let offset = 0;
  for (let i = 0; i < itemCount; i++) {
    positions.push(offset);
    offset += getItemSize(itemSize, i);
  }
  return positions;
}

function findStartIndex(
  scrollTop: number,
  itemSize: number | ((index: number) => number),
  itemCount: number,
  cachedPositions: number[] | null
): number {
  if (typeof itemSize === "number") {
    return Math.floor(scrollTop / itemSize);
  }
  if (cachedPositions) {
    let low = 0;
    let high = itemCount - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midOffset = cachedPositions[mid];
      if (midOffset < scrollTop) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return Math.max(0, low - 1);
  }
  let offset = 0;
  for (let i = 0; i < itemCount; i++) {
    const size = getItemSize(itemSize, i);
    if (offset + size > scrollTop) {
      return i;
    }
    offset += size;
  }
  return 0;
}

function findEndIndex(
  startIndex: number,
  containerHeight: number,
  itemSize: number | ((index: number) => number),
  itemCount: number,
  cachedPositions: number[] | null
): number {
  if (typeof itemSize === "number") {
    return startIndex + Math.ceil(containerHeight / itemSize);
  }
  let height = 0;
  let index = startIndex;
  const startOffset = getItemOffset(itemSize, startIndex, cachedPositions);
  while (height < containerHeight && index < itemCount) {
    height = getItemOffset(itemSize, index, cachedPositions) + getItemSize(itemSize, index) - startOffset;
    index++;
  }
  return index;
}

export function useVirtualList(options: UseVirtualListOptions): UseVirtualListResult {
  const { itemCount, itemSize, containerHeight, overscan = 3 } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const positionCache = useMemo(() => {
    if (typeof itemSize === "function") {
      return buildPositionCache(itemCount, itemSize);
    }
    return null;
  }, [itemCount, itemSize]);

  const totalHeight = useMemo(
    () => calculateTotalHeight(itemCount, itemSize, positionCache),
    [itemCount, itemSize, positionCache]
  );

  const virtualItems = useMemo(() => {
    if (itemCount === 0) return [];

    const startIndex = Math.max(
      0,
      findStartIndex(scrollTop, itemSize, itemCount, positionCache) - overscan
    );
    const endIndex = Math.min(
      itemCount - 1,
      findEndIndex(startIndex, containerHeight, itemSize, itemCount, positionCache) + overscan
    );

    const items: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const offset = getItemOffset(itemSize, i, positionCache);
      const size = getItemSize(itemSize, i);
      items.push({
        index: i,
        style: {
          position: "absolute",
          top: offset,
          height: size,
          width: "100%",
        },
      });
    }
    return items;
  }, [scrollTop, itemCount, itemSize, containerHeight, overscan, positionCache]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const newScrollTop = target.scrollTop;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      setScrollTop(newScrollTop);
    }, 16);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= itemCount) return;
      const offset = getItemOffset(itemSize, index, positionCache);
      if (containerRef.current) {
        containerRef.current.scrollTop = offset;
      }
    },
    [itemCount, itemSize, positionCache]
  );

  const containerProps: React.HTMLAttributes<HTMLDivElement> = useMemo(
    () => ({
      ref: containerRef as React.RefObject<HTMLDivElement>,
      onScroll: handleScroll,
      style: {
        overflow: "auto",
        height: containerHeight,
        position: "relative" as const,
      },
    }),
    [containerHeight, handleScroll]
  );

  return {
    virtualItems,
    totalHeight,
    containerProps,
    scrollToIndex,
  };
}
