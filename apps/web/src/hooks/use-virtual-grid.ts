import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface UseVirtualGridOptions {
  columnCount: number;
  rowCount: number;
  columnWidth: number;
  rowHeight: number;
  containerWidth: number;
  containerHeight: number;
  overscan?: number;
}

interface VirtualCell {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
}

interface UseVirtualGridResult {
  virtualCells: VirtualCell[];
  totalWidth: number;
  totalHeight: number;
  scrollLeft: number;
  scrollTop: number;
  handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  scrollTo: (options: { scrollLeft?: number; scrollTop?: number }) => void;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function useVirtualGrid(options: UseVirtualGridOptions): UseVirtualGridResult {
  const { columnCount, rowCount, columnWidth, rowHeight, containerWidth, containerHeight, overscan = 3 } = options;

  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);

  const totalWidth = useMemo(() => columnCount * columnWidth, [columnCount, columnWidth]);
  const totalHeight = useMemo(() => rowCount * rowHeight, [rowCount, rowHeight]);

  const maxScrollLeft = useMemo(() => Math.max(0, totalWidth - containerWidth), [totalWidth, containerWidth]);
  const maxScrollTop = useMemo(() => Math.max(0, totalHeight - containerHeight), [totalHeight, containerHeight]);

  useEffect(() => {
    if (!containerRef.current) return;

    const nextScrollLeft = Math.min(scrollLeft, maxScrollLeft);
    const nextScrollTop = Math.min(scrollTop, maxScrollTop);
    if (nextScrollLeft === scrollLeft && nextScrollTop === scrollTop) return;

    if (nextScrollLeft !== scrollLeft) {
      containerRef.current.scrollLeft = nextScrollLeft;
      setScrollLeft(nextScrollLeft);
    }
    if (nextScrollTop !== scrollTop) {
      containerRef.current.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }, [maxScrollLeft, maxScrollTop, scrollLeft, scrollTop]);

  const virtualCells = useMemo(() => {
    if (columnCount === 0 || rowCount === 0) return [];

    const effectiveScrollLeft = Math.min(scrollLeft, maxScrollLeft);
    const effectiveScrollTop = Math.min(scrollTop, maxScrollTop);

    const startColumnIndex = Math.max(0, Math.floor(effectiveScrollLeft / columnWidth) - overscan);
    const startRowIndex = Math.max(0, Math.floor(effectiveScrollTop / rowHeight) - overscan);
    
    const visibleColumnCount = Math.ceil(containerWidth / columnWidth);
    const visibleRowCount = Math.ceil(containerHeight / rowHeight);
    
    const endColumnIndex = Math.min(columnCount - 1, startColumnIndex + visibleColumnCount + overscan * 2);
    const endRowIndex = Math.min(rowCount - 1, startRowIndex + visibleRowCount + overscan * 2);

    const cells: VirtualCell[] = [];
    for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex++) {
      for (let columnIndex = startColumnIndex; columnIndex <= endColumnIndex; columnIndex++) {
        cells.push({
          columnIndex,
          rowIndex,
          style: {
            position: "absolute",
            left: columnIndex * columnWidth,
            top: rowIndex * rowHeight,
            width: columnWidth,
            height: rowHeight,
          },
        });
      }
    }
    return cells;
  }, [scrollLeft, scrollTop, maxScrollLeft, maxScrollTop, columnCount, rowCount, columnWidth, rowHeight, containerWidth, containerHeight, overscan]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const newScrollLeft = target.scrollLeft;
    const newScrollTop = target.scrollTop;

    isScrollingRef.current = true;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    setScrollLeft(newScrollLeft);
    setScrollTop(newScrollTop);

    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  }, []);

  const scrollTo = useCallback(
    (options: { scrollLeft?: number; scrollTop?: number }) => {
      if (containerRef.current) {
        if (options.scrollLeft !== undefined) {
          containerRef.current.scrollLeft = options.scrollLeft;
        }
        if (options.scrollTop !== undefined) {
          containerRef.current.scrollTop = options.scrollTop;
        }
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    virtualCells,
    totalWidth,
    totalHeight,
    scrollLeft,
    scrollTop,
    handleScroll,
    scrollTo,
    containerRef,
  };
}
