import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/confirm-dialog";
import { InlineAlert } from "../components/inline-alert";
import {
  getJobExecutions,
  getJobs,
  getSourceMediaActivity,
  getStorageCapacities,
  getStorageMediaSummary,
  getStorageRelations,
  runJob
} from "../lib/api";
import type {
  BackupJob,
  JobExecution,
  SourceMediaActivity,
  StorageCapacityItem,
  StorageMediaSummaryItem,
  StorageRelationEdgeItem,
  StorageRelationNodeItem
} from "../types/api";

type PieSlice = {
  label: string;
  value: number;
  color: string;
  formattedValue: string;
};

type NodePosition = {
  x: number;
  y: number;
};

type RenderedRelationEdge = {
  id: string;
  d: string;
  strokeColor: string;
  markerId: string;
  strokeDasharray?: string;
  description: string;
  isRunning: boolean;
  isInteractive: boolean;
};

const mediaColors = {
  video: "#f59e0b",
  image: "#3b82f6",
  livePhoto: "#10b981"
} as const;

const RELATION_GRAPH_WIDTH = 1240;
const RELATION_NODE_RADIUS = 44;
const RELATION_GRAPH_PADDING_X = 148;
const RELATION_GRAPH_PADDING_Y = 114;

function toPercent(value: number): number {
  return Number(value.toFixed(1));
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function getRemainingPercent(totalBytes: number | null, freeBytes: number | null): number | null {
  if (totalBytes === null || freeBytes === null || totalBytes <= 0) return null;
  return toPercent((freeBytes / totalBytes) * 100);
}

function getCapacityTone(remainingPercent: number | null): {
  chipClass: string;
  barClass: string;
  statusText: string;
} {
  if (remainingPercent === null) {
    return {
      chipClass: "mp-chip",
      barClass: "bg-gradient-to-r from-[var(--ark-primary)] to-[var(--ark-primary-strong)]",
      statusText: "未知"
    };
  }
  if (remainingPercent <= 10) {
    return {
      chipClass: "mp-chip border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
      barClass: "bg-gradient-to-r from-red-500 to-red-600",
      statusText: "紧张"
    };
  }
  if (remainingPercent <= 25) {
    return {
      chipClass: "mp-chip mp-chip-warning",
      barClass: "bg-gradient-to-r from-amber-500 to-orange-500",
      statusText: "偏低"
    };
  }
  return {
    chipClass: "mp-chip mp-chip-success",
    barClass: "bg-gradient-to-r from-emerald-500 to-green-500",
    statusText: "充足"
  };
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad)
  };
}

function describeDonutSlicePath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const safeEndAngle = endAngle - 0.0001;
  const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, safeEndAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, safeEndAngle);
  const largeArcFlag = safeEndAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
    "Z"
  ].join(" ");
}

function clipLabel(label: string, maxLength: number): string {
  const chars = Array.from(label);
  if (chars.length <= maxLength) return label;
  return `${chars.slice(0, Math.max(1, maxLength - 1)).join("")}…`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getRelationGraphHeight(nodeCount: number): number {
  if (nodeCount <= 1) return 380;
  if (nodeCount <= 3) return 450;
  if (nodeCount <= 6) return 530;
  return 610;
}

function getStorageTypeLabel(type: StorageRelationNodeItem["type"]): string {
  if (type === "local_fs") return "NAS";
  if (type === "external_ssd") return "SSD";
  return "Cloud";
}

function isExecutionActive(execution: JobExecution): boolean {
  return execution.status === "queued" || execution.status === "running";
}

function upsertExecution(items: JobExecution[], execution: JobExecution): JobExecution[] {
  const next = items.filter((item) => item.id !== execution.id);
  next.unshift(execution);
  return next;
}

function getExecutionStatusLabel(execution: JobExecution): string {
  if (execution.status === "queued") return "排队中";
  if (execution.status === "running") {
    if (execution.progress.phase === "scanning") return "扫描中";
    return "执行中";
  }
  if (execution.status === "success") return "执行完成";
  return "执行失败";
}

function buildNodePositions(
  nodes: StorageRelationNodeItem[],
  graphWidth: number,
  graphHeight: number,
  nodeRadius: number
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  if (!nodes.length) return positions;

  const centerX = graphWidth / 2;
  const centerY = graphHeight / 2;
  const minX = nodeRadius + 82;
  const maxX = graphWidth - minX;
  const minY = nodeRadius + 64;
  const maxY = graphHeight - (nodeRadius + 88);

  if (nodes.length === 1) {
    positions.set(nodes[0].storageId, { x: centerX, y: centerY });
    return positions;
  }

  if (nodes.length === 2) {
    const offsetX = clampNumber(graphWidth * 0.24, nodeRadius + 88, graphWidth * 0.34);
    positions.set(nodes[0].storageId, { x: centerX - offsetX, y: centerY });
    positions.set(nodes[1].storageId, { x: centerX + offsetX, y: centerY });
    return positions;
  }

  if (nodes.length === 3) {
    positions.set(nodes[0].storageId, { x: centerX, y: minY + 14 });
    positions.set(nodes[1].storageId, { x: clampNumber(graphWidth * 0.26, minX, maxX), y: maxY });
    positions.set(nodes[2].storageId, { x: clampNumber(graphWidth * 0.74, minX, maxX), y: maxY });
    return positions;
  }

  const radiusX = Math.max(220, centerX - RELATION_GRAPH_PADDING_X);
  const radiusY = Math.max(170, centerY - RELATION_GRAPH_PADDING_Y);

  nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / nodes.length;
    const useInnerRing = nodes.length >= 7 && index % 2 === 1;
    const radiusScale = useInnerRing ? 0.78 : 1;
    const rawX = centerX + radiusX * radiusScale * Math.cos(angle);
    const rawY = centerY + radiusY * radiusScale * Math.sin(angle);
    positions.set(node.storageId, {
      x: clampNumber(rawX, minX, maxX),
      y: clampNumber(rawY, minY, maxY)
    });
  });

  return positions;
}

function buildRelationEdges(
  edges: StorageRelationEdgeItem[],
  nodePositions: Map<string, NodePosition>,
  runningEdgeIds: Set<string>,
  interactiveEdgeIds: Set<string>,
  nodeRadius: number
): RenderedRelationEdge[] {
  const edgeSet = new Set(edges.map((edge) => `${edge.sourceStorageId}->${edge.destinationStorageId}`));

  const mapped: Array<RenderedRelationEdge | null> = edges.map((edge) => {
    const source = nodePositions.get(edge.sourceStorageId);
    const destination = nodePositions.get(edge.destinationStorageId);
    if (!source || !destination) return null;

    const isRunning = runningEdgeIds.has(edge.id);
    const strokeColor = edge.status === "synced" ? "#22c55e" : "#f59e0b";
    const markerId = edge.status === "synced" ? "relation-arrow-synced" : "relation-arrow-attention";
    const strokeDasharray = edge.unknownJobCount > 0 && !isRunning ? "8 6" : undefined;

    let d = "";

    if (edge.sourceStorageId === edge.destinationStorageId) {
      const startX = source.x + nodeRadius * 0.68;
      const startY = source.y - nodeRadius * 0.68;
      const endX = source.x - nodeRadius * 0.68;
      const endY = source.y - nodeRadius * 0.68;
      const control1X = source.x + nodeRadius * 2.8;
      const control1Y = source.y - nodeRadius * 3.4;
      const control2X = source.x - nodeRadius * 2.8;
      const control2Y = source.y - nodeRadius * 3.4;
      d = `M ${startX} ${startY} C ${control1X} ${control1Y} ${control2X} ${control2Y} ${endX} ${endY}`;
    } else {
      const dx = destination.x - source.x;
      const dy = destination.y - source.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.001) return null;

      const unitX = dx / distance;
      const unitY = dy / distance;
      const startX = source.x + unitX * nodeRadius;
      const startY = source.y + unitY * nodeRadius;
      const endX = destination.x - unitX * (nodeRadius + 10);
      const endY = destination.y - unitY * (nodeRadius + 10);

      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const normalX = -unitY;
      const normalY = unitX;
      const hasReverse = edgeSet.has(`${edge.destinationStorageId}->${edge.sourceStorageId}`);
      const curveSign = edge.sourceStorageId.localeCompare(edge.destinationStorageId) <= 0 ? 1 : -1;
      const curveOffset = hasReverse ? 58 * curveSign : 0;

      const controlX = midX + normalX * curveOffset;
      const controlY = midY + normalY * curveOffset;
      d = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
    }

    const next: RenderedRelationEdge = {
      id: edge.id,
      d,
      strokeColor,
      markerId,
      description: `${edge.sourceStorageName} -> ${edge.destinationStorageName}：${edge.summary}`,
      isRunning,
      isInteractive: interactiveEdgeIds.has(edge.id)
    };

    if (strokeDasharray) {
      next.strokeDasharray = strokeDasharray;
    }

    return next;
  });

  return mapped.filter((item): item is RenderedRelationEdge => item !== null);
}

function PieStatCard({
  title,
  totalLabel,
  emptyLabel,
  slices
}: {
  title: string;
  totalLabel: string;
  emptyLabel: string;
  slices: PieSlice[];
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const [selectedSliceKey, setSelectedSliceKey] = useState<string | null>(null);
  const [hoverSliceKey, setHoverSliceKey] = useState<string | null>(null);

  const arcs = useMemo(() => {
    if (total <= 0) return [] as Array<PieSlice & { key: string; path: string; percent: number }>;

    let cursorAngle = -90;
    return slices
      .map((slice, index) => ({ ...slice, index }))
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const degree = (slice.value / total) * 360;
        const startAngle = cursorAngle;
        const endAngle = cursorAngle + degree;
        cursorAngle = endAngle;
        return {
          ...slice,
          key: `${title}:${slice.label}:${slice.index}`,
          path: describeDonutSlicePath(50, 50, 46, 26, startAngle, endAngle),
          percent: toPercent((slice.value / total) * 100)
        };
      });
  }, [slices, title, total]);

  const activeSliceKey = hoverSliceKey ?? selectedSliceKey;
  const activeSlice = useMemo(() => arcs.find((slice) => slice.key === activeSliceKey) ?? null, [arcs, activeSliceKey]);
  const sideStats = useMemo(
    () =>
      slices.map((slice, index) => ({
        ...slice,
        key: `${title}:${slice.label}:${index}`,
        percent: total > 0 ? toPercent((slice.value / total) * 100) : 0
      })),
    [slices, title, total]
  );

  useEffect(() => {
    if (!arcs.length) {
      setSelectedSliceKey(null);
      setHoverSliceKey(null);
      return;
    }
    const validKeys = new Set(arcs.map((slice) => slice.key));
    if (selectedSliceKey && !validKeys.has(selectedSliceKey)) {
      setSelectedSliceKey(null);
    }
    if (hoverSliceKey && !validKeys.has(hoverSliceKey)) {
      setHoverSliceKey(null);
    }
  }, [arcs, hoverSliceKey, selectedSliceKey]);

  return (
    <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full">
            {arcs.length ? (
              arcs.map((slice) => {
                const active = activeSlice?.key === slice.key;
                return (
                    <path
                      key={slice.key}
                      d={slice.path}
                      fill={slice.color}
                      stroke="#ffffff"
                      strokeWidth={1.2}
                      className="cursor-pointer transition-all duration-150 ease-out"
                      style={{
                        transform: active ? "scale(1.03)" : "scale(1)",
                        transformOrigin: "50px 50px"
                      }}
                    onMouseEnter={() => setHoverSliceKey(slice.key)}
                    onMouseLeave={() => setHoverSliceKey((prev) => (prev === slice.key ? null : prev))}
                    onFocus={() => setHoverSliceKey(slice.key)}
                    onBlur={() => setHoverSliceKey((prev) => (prev === slice.key ? null : prev))}
                    onClick={() => {
                      const shouldClear = selectedSliceKey === slice.key;
                      setSelectedSliceKey(shouldClear ? null : slice.key);
                      if (shouldClear) {
                        setHoverSliceKey(null);
                      }
                    }}
                  />
                );
              })
            ) : (
              <circle cx={50} cy={50} r={46} fill="#d1d5db" />
            )}
            <circle cx={50} cy={50} r={26} fill="var(--ark-surface)" stroke="var(--ark-line)" strokeWidth={1.2} />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
            {total > 0 ? (
              activeSlice ? (
                <div className="space-y-0.5 px-1 leading-tight">
                  <p className="text-[10px] font-semibold">{activeSlice.label}</p>
                  <p className="text-[10px] font-bold">{activeSlice.formattedValue}</p>
                  <p className="text-[10px] mp-muted">{activeSlice.percent}%</p>
                </div>
              ) : (
                <p className="px-1 text-[11px] font-semibold">{totalLabel}</p>
              )
            ) : (
              <span className="px-1 text-[11px] font-semibold">{emptyLabel}</span>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {sideStats.map((slice) => {
            const active = activeSlice?.key === slice.key;
            return (
              <div
                key={slice.key}
                className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs ${
                  active ? "bg-[var(--ark-surface-soft)]" : ""
                }`}
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="shrink-0 font-medium text-[var(--ark-ink-soft)]">
                  {slice.formattedValue} · {slice.percent}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ACTIVITY_LEVEL_COLORS = ["#cbd5e1", "#b7e4c7", "#95d5b2", "#74c69d", "#52b788"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function resolveActivityLevel(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

function SourceActivityPieChart({ data }: { data: SourceMediaActivity }) {
  const slices = [
    { key: "image", label: "图片", value: data.imageAddedCount, color: "#3b82f6" },
    { key: "video", label: "视频", value: data.videoAddedCount, color: "#f59e0b" },
    { key: "live", label: "Live Photo", value: data.livePhotoAddedCount, color: "#22c55e" }
  ].filter((item) => item.value > 0);

  const total = slices.reduce((sum, item) => sum + item.value, 0);
  if (!total) {
    return <p className="px-2 py-6 text-center text-sm mp-muted">当前年份暂无媒体文件</p>;
  }

  const cx = 72;
  const cy = 72;
  const outerRadius = 54;
  const innerRadius = 30;
  let angle = -90;

  const arcs = slices.map((slice) => {
    const sweep = (slice.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return {
      ...slice,
      percent: toPercent((slice.value / total) * 100),
      path: describeDonutSlicePath(cx, cy, outerRadius, innerRadius, start, end)
    };
  });

  return (
    <div className="p-0.5">
      <div className="flex flex-col items-center gap-1.5">
        <svg viewBox="0 0 144 144" className="h-[118px] w-[118px] shrink-0">
          {arcs.map((arc) => (
            <path key={arc.key} d={arc.path} fill={arc.color} stroke="#ffffff" strokeWidth={1.1} />
          ))}
          <circle cx={cx} cy={cy} r={innerRadius} fill="var(--ark-surface)" />
          <text x={cx} y={cy - 4} textAnchor="middle" className="fill-[var(--ark-ink-soft)] text-[10px]">
            总文件
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-[var(--ark-ink)] text-[14px] font-semibold">
            {total}
          </text>
        </svg>
        <div className="w-full space-y-0.5">
          {arcs.map((arc) => (
            <div key={`legend:${arc.key}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: arc.color }} />
                <span className="truncate">{arc.label}</span>
              </span>
              <span className="shrink-0 text-[var(--ark-ink-soft)]">
                {arc.value} · {arc.percent}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceActivityHeatmap({
  data,
  selectedYear,
  loading,
  onSelectYear
}: {
  data: SourceMediaActivity | null;
  selectedYear: number;
  loading: boolean;
  onSelectYear: (year: number) => void;
}) {
  const [hoveredDate, setHoveredDate] = useState<SourceMediaActivity["days"][number] | null>(null);

  if (!data || !data.days.length) {
    return <p className="text-sm mp-muted">暂无媒体日期分布数据</p>;
  }

  const firstDate = new Date(`${data.days[0].date}T00:00:00`);
  const firstDayOfWeek = (firstDate.getDay() + 6) % 7;
  const leadingPlaceholders = Array.from({ length: firstDayOfWeek }, () => null as null | SourceMediaActivity["days"][number]);
  const cells = [...leadingPlaceholders, ...data.days];
  const columns: Array<Array<null | SourceMediaActivity["days"][number]>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    columns.push(cells.slice(index, index + 7));
  }

  return (
    <div className="rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold text-[var(--ark-ink)]">
          {data.year} 年媒体文件分布（共 {data.totalAddedCount} 个）
        </p>
        <span className="text-xs mp-muted">统计目录 {data.sourceRootCount} · 单日峰值 {data.maxDailyCount}</span>
      </div>

      <div className="mt-2.5 grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-2.5">
          <div className="min-h-5 text-xs mp-muted">
            {hoveredDate ? (
              <span>
                {hoveredDate.date} · 文件 {hoveredDate.count}（图片 {hoveredDate.imageCount} / 视频 {hoveredDate.videoCount} / Live Photo {hoveredDate.livePhotoCount}）
              </span>
            ) : (
              <span>{data.startDate} - {data.endDate}</span>
            )}
          </div>

          <div className="mt-1.5 grid items-start gap-2 lg:grid-cols-[minmax(0,1fr)_250px]">
            <div className="overflow-x-auto pb-1">
              <div className="inline-block min-w-[760px]">
                <div className="mb-1 ml-9 flex items-center justify-between text-[10px] mp-muted">
                  {MONTH_LABELS.map((month) => (
                    <span key={`month:${month}`}>{month}</span>
                  ))}
                </div>
                <div className="inline-flex gap-1.5">
                  <div className="grid grid-rows-7 gap-1 text-[11px] mp-muted">
                  <span className="h-3 leading-3">Mon</span>
                  <span className="h-3 leading-3 opacity-0">Tue</span>
                  <span className="h-3 leading-3">Wed</span>
                  <span className="h-3 leading-3 opacity-0">Thu</span>
                  <span className="h-3 leading-3">Fri</span>
                  <span className="h-3 leading-3 opacity-0">Sat</span>
                  <span className="h-3 leading-3 opacity-0">Sun</span>
                  </div>
                  <div className="inline-flex gap-1">
                    {columns.map((column, columnIndex) => (
                      <div key={`col:${columnIndex}`} className="grid grid-rows-7 gap-1">
                        {column.map((cell, rowIndex) => {
                          if (!cell) {
                            return <span key={`empty:${columnIndex}:${rowIndex}`} className="h-3 w-3 rounded-[2px] bg-transparent" />;
                          }
                          const level = resolveActivityLevel(cell.count, data.maxDailyCount);
                          return (
                            <button
                              key={`day:${cell.date}`}
                              type="button"
                              className="h-3 w-3 rounded-[2px] border border-black/10 transition-transform hover:scale-[1.12] focus:scale-[1.12]"
                              style={{ backgroundColor: ACTIVITY_LEVEL_COLORS[level] }}
                              onMouseEnter={() => setHoveredDate(cell)}
                              onMouseLeave={() => setHoveredDate((prev) => (prev?.date === cell.date ? null : prev))}
                              onFocus={() => setHoveredDate(cell)}
                              onBlur={() => setHoveredDate((prev) => (prev?.date === cell.date ? null : prev))}
                              aria-label={`${cell.date} 文件 ${cell.count}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <SourceActivityPieChart data={data} />
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-1 text-xs mp-muted">
            <span>少</span>
            {ACTIVITY_LEVEL_COLORS.map((color) => (
              <span key={color} className="h-3 w-3 rounded-[2px] border border-black/10" style={{ backgroundColor: color }} />
            ))}
            <span>多</span>
          </div>
        </div>

        <div className="self-start w-full rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-1.5">
          <div className="max-h-[160px] space-y-1 overflow-auto pr-1">
            {[...new Set([data.year, ...data.years])].sort((a, b) => b - a).slice(0, 12).map((year) => (
              <button
                key={`year:${year}`}
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  year === selectedYear
                    ? "bg-blue-600 text-white"
                    : "text-[var(--ark-ink-soft)] hover:bg-[var(--ark-surface-soft)] hover:text-[var(--ark-ink)]"
                }`}
                onClick={() => onSelectYear(year)}
                disabled={loading && year === selectedYear}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [capacities, setCapacities] = useState<StorageCapacityItem[]>([]);
  const [storageMediaSummary, setStorageMediaSummary] = useState<StorageMediaSummaryItem[]>([]);
  const [sourceActivity, setSourceActivity] = useState<SourceMediaActivity | null>(null);
  const [selectedActivityYear, setSelectedActivityYear] = useState(new Date().getFullYear());
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [relationNodes, setRelationNodes] = useState<StorageRelationNodeItem[]>([]);
  const [relationEdges, setRelationEdges] = useState<StorageRelationEdgeItem[]>([]);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [edgeActionEdgeId, setEdgeActionEdgeId] = useState<string | null>(null);
  const [edgeActionEditJobId, setEdgeActionEditJobId] = useState<string>("");
  const [pendingSyncEdgeId, setPendingSyncEdgeId] = useState<string | null>(null);
  const [progressDialogEdgeId, setProgressDialogEdgeId] = useState<string | null>(null);
  const [startingSync, setStartingSync] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const hadActiveExecutionRef = useRef(false);

  async function refreshRelationGraph() {
    const relationRes = await getStorageRelations();
    setRelationNodes(relationRes.nodes);
    setRelationEdges(relationRes.edges);
  }

  async function loadAll() {
    try {
      const [capacityRes, mediaRes, relationRes, jobsRes, executionsRes] = await Promise.all([
        getStorageCapacities(),
        getStorageMediaSummary(),
        getStorageRelations(),
        getJobs(),
        getJobExecutions()
      ]);
      setCapacities(capacityRes.items);
      setStorageMediaSummary(mediaRes.items);
      setRelationNodes(relationRes.nodes);
      setRelationEdges(relationRes.edges);
      setJobs(jobsRes.items);
      setExecutions(executionsRes.items);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    let canceled = false;
    async function loadSourceActivity() {
      setLoadingActivity(true);
      try {
        const res = await getSourceMediaActivity(selectedActivityYear);
        if (canceled) return;
        setSourceActivity(res);
        if (res.year !== selectedActivityYear) {
          setSelectedActivityYear(res.year);
        }
      } catch (err) {
        if (canceled) return;
        setError((err as Error).message);
      } finally {
        if (!canceled) {
          setLoadingActivity(false);
        }
      }
    }
    void loadSourceActivity();
    return () => {
      canceled = true;
    };
  }, [selectedActivityYear]);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const executionsRes = await getJobExecutions();
        if (disposed) return;
        setExecutions(executionsRes.items);
      } catch {
        // Keep the last known execution state.
      } finally {
        if (!disposed) {
          timer = window.setTimeout(() => {
            void poll();
          }, 1200);
        }
      }
    };

    timer = window.setTimeout(() => {
      void poll();
    }, 1200);

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const edgeById = useMemo(() => new Map(relationEdges.map((edge) => [edge.id, edge])), [relationEdges]);

  const latestExecutionByJobId = useMemo(() => {
    const map = new Map<string, JobExecution>();
    for (const execution of executions) {
      const existing = map.get(execution.jobId);
      if (!existing || Date.parse(execution.updatedAt) > Date.parse(existing.updatedAt)) {
        map.set(execution.jobId, execution);
      }
    }
    return map;
  }, [executions]);

  const activeExecutionByJobId = useMemo(() => {
    const map = new Map<string, JobExecution>();
    for (const execution of executions) {
      if (!isExecutionActive(execution)) continue;
      const existing = map.get(execution.jobId);
      if (!existing || Date.parse(execution.updatedAt) > Date.parse(existing.updatedAt)) {
        map.set(execution.jobId, execution);
      }
    }
    return map;
  }, [executions]);

  const hasAnyActiveExecution = activeExecutionByJobId.size > 0;

  useEffect(() => {
    if (hasAnyActiveExecution) {
      hadActiveExecutionRef.current = true;
      return;
    }
    if (!hadActiveExecutionRef.current) return;
    hadActiveExecutionRef.current = false;
    void refreshRelationGraph().catch(() => undefined);
  }, [hasAnyActiveExecution]);

  const runningEdgeIds = useMemo(() => {
    const out = new Set<string>();
    for (const edge of relationEdges) {
      if (edge.jobIds.some((jobId) => activeExecutionByJobId.has(jobId))) {
        out.add(edge.id);
      }
    }
    return out;
  }, [relationEdges, activeExecutionByJobId]);

  const runningJobCountByEdgeId = useMemo(() => {
    const out = new Map<string, number>();
    for (const edge of relationEdges) {
      const count = edge.jobIds.reduce((sum, jobId) => sum + (activeExecutionByJobId.has(jobId) ? 1 : 0), 0);
      if (count > 0) out.set(edge.id, count);
    }
    return out;
  }, [relationEdges, activeExecutionByJobId]);

  const interactiveEdgeIds = useMemo(() => {
    const out = new Set<string>(runningEdgeIds);
    for (const edge of relationEdges) {
      if (edge.jobIds.length > 0) {
        out.add(edge.id);
      }
    }
    return out;
  }, [relationEdges, runningEdgeIds]);

  function getRunnableManualJobIds(edge: StorageRelationEdgeItem): string[] {
    const enabledPending = edge.pendingJobIds.filter((jobId) => jobById.get(jobId)?.enabled);
    if (enabledPending.length) return enabledPending;
    return edge.enabledJobIds.filter((jobId) => jobById.get(jobId)?.enabled);
  }

  const capacitySummary = useMemo(() => {
    const readable = capacities.filter((item) => item.available);
    const unreadable = capacities.length - readable.length;
    const totalBytes = readable.reduce((sum, item) => sum + (item.totalBytes ?? 0), 0);
    const usedBytes = readable.reduce((sum, item) => sum + (item.usedBytes ?? 0), 0);
    const usedPercent = totalBytes > 0 ? toPercent((usedBytes / totalBytes) * 100) : 0;
    const freePercent = totalBytes > 0 ? toPercent(100 - usedPercent) : 0;
    return {
      groups: capacities.length,
      readable: readable.length,
      unreadable,
      totalBytes,
      usedBytes,
      freePercent
    };
  }, [capacities]);

  const mediaSummary = useMemo(() => {
    const storagesWithMedia = storageMediaSummary.filter((item) => item.totalCount > 0).length;
    const totalCount = storageMediaSummary.reduce((sum, item) => sum + item.totalCount, 0);
    const totalBytes = storageMediaSummary.reduce((sum, item) => sum + item.totalBytes, 0);
    return {
      storagesWithMedia,
      totalStorages: storageMediaSummary.length,
      totalCount,
      totalBytes
    };
  }, [storageMediaSummary]);

  const relationSummary = useMemo(() => {
    const connectedNodeIds = new Set<string>();
    relationEdges.forEach((edge) => {
      connectedNodeIds.add(edge.sourceStorageId);
      connectedNodeIds.add(edge.destinationStorageId);
    });

    const syncedEdgeCount = relationEdges.filter((edge) => edge.status === "synced").length;
    const attentionEdgeCount = relationEdges.length - syncedEdgeCount;
    const isolatedNodeCount = relationNodes.filter((node) => !connectedNodeIds.has(node.storageId)).length;

    return {
      connectedNodeIds,
      syncedEdgeCount,
      attentionEdgeCount,
      isolatedNodeCount
    };
  }, [relationEdges, relationNodes]);

  const relationGraphHeight = useMemo(() => getRelationGraphHeight(relationNodes.length), [relationNodes.length]);
  const nodePositions = useMemo(
    () => buildNodePositions(relationNodes, RELATION_GRAPH_WIDTH, relationGraphHeight, RELATION_NODE_RADIUS),
    [relationNodes, relationGraphHeight]
  );
  const renderedRelationEdges = useMemo(
    () => buildRelationEdges(relationEdges, nodePositions, runningEdgeIds, interactiveEdgeIds, RELATION_NODE_RADIUS),
    [relationEdges, nodePositions, runningEdgeIds, interactiveEdgeIds]
  );

  const edgeActionEdge = edgeActionEdgeId ? edgeById.get(edgeActionEdgeId) : undefined;
  const edgeActionJobs = useMemo(
    () =>
      edgeActionEdge
        ? edgeActionEdge.jobIds.map((jobId) => ({ id: jobId, name: jobById.get(jobId)?.name ?? jobId }))
        : ([] as Array<{ id: string; name: string }>),
    [edgeActionEdge, jobById]
  );
  const edgeActionRunnableJobIds = useMemo(
    () => (edgeActionEdge ? getRunnableManualJobIds(edgeActionEdge) : ([] as string[])),
    [edgeActionEdge, jobById]
  );

  useEffect(() => {
    if (!edgeActionEdge) {
      setEdgeActionEditJobId("");
      return;
    }
    const preferredJobId = edgeActionEdge.pendingJobIds[0] ?? edgeActionEdge.jobIds[0] ?? "";
    setEdgeActionEditJobId(preferredJobId);
  }, [edgeActionEdge]);

  const pendingSyncEdge = pendingSyncEdgeId ? edgeById.get(pendingSyncEdgeId) : undefined;
  const pendingSyncRunnableJobIds = useMemo(() => {
    if (!pendingSyncEdge) return [] as string[];
    return getRunnableManualJobIds(pendingSyncEdge);
  }, [pendingSyncEdge, jobById]);
  const pendingSyncJobNamePreview = useMemo(() => {
    const names = pendingSyncRunnableJobIds.map((jobId) => jobById.get(jobId)?.name ?? jobId);
    return names.slice(0, 3).join("、");
  }, [pendingSyncRunnableJobIds, jobById]);

  const progressDialogEdge = progressDialogEdgeId ? edgeById.get(progressDialogEdgeId) : undefined;
  const progressDialogRows = useMemo(() => {
    if (!progressDialogEdge) return [] as Array<{ job: BackupJob | undefined; execution: JobExecution | undefined; active: boolean }>;
    return progressDialogEdge.jobIds
      .map((jobId) => ({
        job: jobById.get(jobId),
        execution: latestExecutionByJobId.get(jobId),
        active: activeExecutionByJobId.has(jobId)
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return (a.job?.name ?? "").localeCompare(b.job?.name ?? "", "zh-CN");
      });
  }, [progressDialogEdge, jobById, latestExecutionByJobId, activeExecutionByJobId]);

  const progressDialogActiveCount = progressDialogRows.filter((row) => row.active).length;
  const progressDialogCanBackground = progressDialogActiveCount > 0;
  const progressDialogPercent =
    progressDialogRows.length > 0
      ? toPercent(
          progressDialogRows.reduce((sum, row) => sum + (row.execution?.progress.percent ?? 0), 0) / progressDialogRows.length
        )
      : 0;

  const progressDialogStatus = useMemo(() => {
    if (!progressDialogRows.length) {
      return { text: "未执行", className: "mp-muted" };
    }
    if (progressDialogCanBackground) {
      return { text: `执行中（${progressDialogActiveCount}/${progressDialogRows.length}）`, className: "mp-status-warning" };
    }
    if (progressDialogRows.some((row) => row.execution?.status === "failed")) {
      return { text: "执行完成（含失败）", className: "mp-status-danger" };
    }
    if (progressDialogRows.every((row) => row.execution?.status === "success")) {
      return { text: "执行完成", className: "mp-status-success" };
    }
    return { text: "等待执行", className: "mp-muted" };
  }, [progressDialogRows, progressDialogCanBackground, progressDialogActiveCount]);

  const summaryTone = getCapacityTone(capacitySummary.freePercent);

  function handleRelationEdgeClick(edgeId: string) {
    const edge = edgeById.get(edgeId);
    if (!edge) return;

    setError("");
    if (runningEdgeIds.has(edgeId)) {
      setProgressDialogEdgeId(edgeId);
      return;
    }

    if (!edge.jobIds.length) {
      setError("该连线暂无可操作的任务。");
      return;
    }

    setEdgeActionEdgeId(edgeId);
  }

  function goToEditJobFromEdgeAction() {
    if (!edgeActionEdge) return;
    const targetJobId = edgeActionEditJobId || edgeActionEdge.jobIds[0];
    if (!targetJobId) {
      setError("未找到可编辑的任务。");
      return;
    }
    setEdgeActionEdgeId(null);
    navigate(`/jobs?editJobId=${encodeURIComponent(targetJobId)}`);
  }

  async function startManualSyncForPendingEdge() {
    const edge = pendingSyncEdge;
    if (!edge) return;
    const runnablePendingJobIds = getRunnableManualJobIds(edge);
    if (!runnablePendingJobIds.length) {
      setPendingSyncEdgeId(null);
      setError("该连线暂无可执行任务（任务可能均已禁用）。");
      return;
    }

    setStartingSync(true);
    setError("");
    setMessage("");

    const startedExecutions: JobExecution[] = [];
    const failedJobLabels: string[] = [];

    for (const jobId of runnablePendingJobIds) {
      try {
        const result = await runJob(jobId);
        startedExecutions.push(result.execution);
      } catch {
        failedJobLabels.push(jobById.get(jobId)?.name ?? jobId);
      }
    }

    if (startedExecutions.length > 0) {
      setExecutions((prev) => {
        let next = prev;
        for (const execution of startedExecutions) {
          next = upsertExecution(next, execution);
        }
        return next;
      });
      setProgressDialogEdgeId(edge.id);
      setMessage(`已开始 ${startedExecutions.length} 个同步任务，可切到后台继续执行。`);
    }

    if (failedJobLabels.length > 0) {
      setError(`有 ${failedJobLabels.length} 个任务启动失败：${failedJobLabels.join("、")}`);
    }

    if (!startedExecutions.length && !failedJobLabels.length) {
      setError("没有可启动的同步任务。");
    }

    setStartingSync(false);
    setPendingSyncEdgeId(null);
  }

  return (
    <section className="space-y-4">
      {message ? (
        <InlineAlert tone="success" autoCloseMs={5200} onClose={() => setMessage("")}>
          {message}
        </InlineAlert>
      ) : null}
      {error ? (
        <InlineAlert tone="error" onClose={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      <motion.article
        className="mp-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03, duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">存储同步关系图</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mp-chip">存储节点 {relationNodes.length}</span>
            <span className="mp-chip">同步关系 {relationEdges.length}</span>
            <span className="mp-chip mp-chip-success">已同步 {relationSummary.syncedEdgeCount}</span>
            <span className="mp-chip mp-chip-warning">待处理 {relationSummary.attentionEdgeCount}</span>
            <span className="mp-chip">孤立节点 {relationSummary.isolatedNodeCount}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            已同步链路
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            待同步链路
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-cyan-700">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            后台同步中
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            孤立存储
          </span>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--ark-line)] p-3 sm:p-4 mp-relation-graph-surface">
          {relationNodes.length ? (
            <div className="mx-auto w-full max-w-[1320px]" style={{ aspectRatio: `${RELATION_GRAPH_WIDTH} / ${relationGraphHeight}` }}>
              <svg viewBox={`0 0 ${RELATION_GRAPH_WIDTH} ${relationGraphHeight}`} className="h-full w-full" role="img" aria-label="存储同步关系图">
                <defs>
                  <marker id="relation-arrow-synced" markerWidth="12" markerHeight="12" refX="8.8" refY="6" orient="auto">
                    <path d="M0,0 L0,12 L9,6 z" fill="#22c55e" />
                  </marker>
                  <marker id="relation-arrow-attention" markerWidth="12" markerHeight="12" refX="8.8" refY="6" orient="auto">
                    <path d="M0,0 L0,12 L9,6 z" fill="#f59e0b" />
                  </marker>
                  <linearGradient id="relation-node-connected" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ecfeff" />
                    <stop offset="100%" stopColor="#bfdbfe" />
                  </linearGradient>
                  <linearGradient id="relation-node-isolated" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f8fafc" />
                    <stop offset="100%" stopColor="#e2e8f0" />
                  </linearGradient>
                  <pattern id="relation-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                  </pattern>
                  <filter id="relation-node-shadow" x="-30%" y="-30%" width="160%" height="180%">
                    <feDropShadow dx="0" dy="9" stdDeviation="6.5" floodColor="#0f172a" floodOpacity="0.15" />
                  </filter>
                  <filter id="relation-edge-shadow" x="-30%" y="-30%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="#0f172a" floodOpacity="0.26" />
                  </filter>
                </defs>

                <rect x={0} y={0} width={RELATION_GRAPH_WIDTH} height={relationGraphHeight} fill="url(#relation-grid)" opacity={0.68} />
                <ellipse cx={RELATION_GRAPH_WIDTH * 0.2} cy={relationGraphHeight * 0.16} rx={RELATION_GRAPH_WIDTH * 0.19} ry={relationGraphHeight * 0.32} fill="rgba(56,189,248,0.08)" />
                <ellipse cx={RELATION_GRAPH_WIDTH * 0.82} cy={relationGraphHeight * 0.84} rx={RELATION_GRAPH_WIDTH * 0.24} ry={relationGraphHeight * 0.34} fill="rgba(14,165,233,0.06)" />

                {renderedRelationEdges.map((edge) => (
                  <g key={`edge:${edge.id}`}>
                    <path
                      d={edge.d}
                      fill="none"
                      stroke={edge.strokeColor}
                      strokeWidth={3.2}
                      strokeLinecap="round"
                      markerEnd={`url(#${edge.markerId})`}
                      strokeDasharray={edge.strokeDasharray}
                      opacity={0.96}
                      filter="url(#relation-edge-shadow)"
                    >
                      <title>{edge.description}</title>
                    </path>

                    {edge.isRunning ? (
                      <>
                        <path
                          d={edge.d}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth={6.2}
                          strokeLinecap="round"
                          className="mp-relation-edge-flow"
                          opacity={0.96}
                        />
                        <circle r={4.2} fill="#22d3ee" className="mp-relation-energy" opacity={0.95}>
                          <animateMotion dur="1.4s" repeatCount="indefinite" path={edge.d} />
                        </circle>
                        <circle r={3.3} fill="#67e8f9" className="mp-relation-energy" opacity={0.85}>
                          <animateMotion dur="1.8s" begin="-0.9s" repeatCount="indefinite" path={edge.d} />
                        </circle>
                      </>
                    ) : null}

                    {edge.isInteractive ? (
                      <path
                        d={edge.d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={18}
                        className="mp-relation-edge-hit"
                        onClick={() => handleRelationEdgeClick(edge.id)}
                      />
                    ) : null}
                  </g>
                ))}

                {relationNodes.map((node) => {
                  const pos = nodePositions.get(node.storageId);
                  if (!pos) return null;
                  const connected = relationSummary.connectedNodeIds.has(node.storageId);
                  const fill = connected ? "url(#relation-node-connected)" : "url(#relation-node-isolated)";
                  const stroke = connected ? "#0284c7" : "#94a3b8";
                  const halo = connected ? "rgba(56,189,248,0.2)" : "rgba(148,163,184,0.16)";
                  const statusDot = connected ? "#10b981" : "#94a3b8";

                  return (
                    <g key={`node:${node.storageId}`} transform={`translate(${pos.x}, ${pos.y})`} className="mp-relation-node">
                      <g filter="url(#relation-node-shadow)">
                        <circle r={RELATION_NODE_RADIUS + 4} fill={halo} />
                        <circle r={RELATION_NODE_RADIUS} fill={fill} stroke={stroke} strokeWidth={2.8} />
                        <circle r={RELATION_NODE_RADIUS - 10} fill="rgba(255,255,255,0.86)" stroke="rgba(148,163,184,0.34)" strokeWidth={1.2} />
                        <circle cx={RELATION_NODE_RADIUS - 8} cy={-RELATION_NODE_RADIUS + 8} r={4.4} fill={statusDot} stroke="#ffffff" strokeWidth={1.4} />
                      </g>

                      <text y={-6} textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight={600} fill="#475569" letterSpacing={0.2}>
                        {getStorageTypeLabel(node.type)}
                      </text>

                      <text y={13} textAnchor="middle" fontSize="12" fontWeight={700} fill="#0f172a">
                        {clipLabel(node.storageName, 12)}
                      </text>

                      <text
                        y={RELATION_NODE_RADIUS + 22}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight={600}
                        fill="#334155"
                        className="mp-relation-node-path"
                        paintOrder="stroke"
                        stroke="rgba(255,255,255,0.92)"
                        strokeWidth={3.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {clipLabel(node.basePath, 22)}
                      </text>

                      <title>{`${node.storageName}\n${node.basePath}`}</title>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <p className="px-3 py-12 text-center text-sm mp-muted">暂无存储配置</p>
          )}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {relationEdges.map((edge) => {
            const runningCount = runningJobCountByEdgeId.get(edge.id) ?? 0;
            const toneClass = runningCount
              ? "border-cyan-200 bg-cyan-50/80 text-cyan-700"
              : edge.status === "synced"
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-700"
                : "border-amber-200 bg-amber-50/80 text-amber-700";

            return (
              <button
                key={`summary:${edge.id}`}
                type="button"
                className={`rounded-lg border px-3 py-2 text-left text-sm ${toneClass} ${interactiveEdgeIds.has(edge.id) ? "cursor-pointer" : "cursor-default"}`}
                onClick={() => handleRelationEdgeClick(edge.id)}
                disabled={!interactiveEdgeIds.has(edge.id)}
              >
                <p className="font-semibold">
                  {edge.sourceStorageName}
                  {" -> "}
                  {edge.destinationStorageName}
                </p>
                <p className="mt-1 text-xs opacity-90">
                  {runningCount > 0 ? `后台同步中（${runningCount}/${edge.jobCount}）` : edge.summary}
                </p>
              </button>
            );
          })}
          {!relationEdges.length && relationNodes.length ? (
            <p className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface)] px-3 py-2 text-sm mp-muted">
              暂无同步任务连线，当前均为孤立存储目录。
            </p>
          ) : null}
        </div>
      </motion.article>

      <motion.article
        className="mp-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">媒体日期分布热力图</h3>
          </div>
        </div>

        <div className="mt-3">
          <SourceActivityHeatmap
            data={sourceActivity}
            selectedYear={selectedActivityYear}
            loading={loadingActivity}
            onSelectYear={setSelectedActivityYear}
          />
        </div>
      </motion.article>

      <motion.article
        className="mp-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">存储盘容量</h3>
            <p className="mt-1 text-sm mp-muted">
              已读取 {capacitySummary.readable}/{capacitySummary.groups} 组
              {capacitySummary.unreadable ? `，${capacitySummary.unreadable} 组不可读取` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mp-chip">总容量 {formatBytes(capacitySummary.totalBytes)}</span>
            <span className="mp-chip">已用 {formatBytes(capacitySummary.usedBytes)}</span>
            <span className={summaryTone.chipClass}>整体剩余 {capacitySummary.freePercent}%</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {capacities.map((item) => {
            const remainingPercent = getRemainingPercent(item.totalBytes, item.freeBytes);
            const tone = getCapacityTone(remainingPercent);
            return (
              <div
                key={item.id}
                className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3 transition-all hover:border-[var(--ark-line-strong)] hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold break-all">{item.storageNames.join("、")}</p>
                    <p className="text-xs mp-muted">{item.storageNames.length} 个配置存储</p>
                  </div>
                  {item.available ? (
                    <span className={tone.chipClass}>
                      剩余 {remainingPercent}% · {tone.statusText}
                    </span>
                  ) : (
                    <span className="mp-chip mp-chip-warning">不可读取</span>
                  )}
                </div>

                {item.available ? (
                  <>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--ark-line)]">
                      <div
                        className={`h-full rounded-full ${tone.barClass}`}
                        style={{ width: `${Math.min(100, Math.max(0, item.usedPercent ?? 0))}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm mp-muted">
                      已用 {formatBytes(item.usedBytes)} / 总量 {formatBytes(item.totalBytes)} · 可用 {formatBytes(item.freeBytes)}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm mp-muted">{item.reason ?? "无法读取该存储容量"}</p>
                )}
              </div>
            );
          })}
          {!capacities.length ? <p className="text-sm mp-muted">暂无存储容量数据</p> : null}
        </div>
      </motion.article>

      <motion.article
        className="mp-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">媒体分布（按存储目录）</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mp-chip">
              有媒体的存储 {mediaSummary.storagesWithMedia}/{mediaSummary.totalStorages}
            </span>
            <span className="mp-chip">总数量 {mediaSummary.totalCount}</span>
            <span className="mp-chip">总体积 {formatBytes(mediaSummary.totalBytes)}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {storageMediaSummary.map((item) => {
            const countSlices: PieSlice[] = [
              { label: "视频", value: item.counts.video, color: mediaColors.video, formattedValue: String(item.counts.video) },
              { label: "图片", value: item.counts.image, color: mediaColors.image, formattedValue: String(item.counts.image) },
              {
                label: "Live Photo",
                value: item.counts.livePhoto,
                color: mediaColors.livePhoto,
                formattedValue: String(item.counts.livePhoto)
              }
            ];
            const sizeSlices: PieSlice[] = [
              { label: "视频", value: item.bytes.video, color: mediaColors.video, formattedValue: formatBytes(item.bytes.video) },
              { label: "图片", value: item.bytes.image, color: mediaColors.image, formattedValue: formatBytes(item.bytes.image) },
              {
                label: "Live Photo",
                value: item.bytes.livePhoto,
                color: mediaColors.livePhoto,
                formattedValue: formatBytes(item.bytes.livePhoto)
              }
            ];
            return (
              <div
                key={item.storageId}
                className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3 transition-all hover:border-[var(--ark-line-strong)] hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-all">{item.storageName}</p>
                    <p className="text-xs mp-muted break-all">{item.basePath}</p>
                  </div>
                  <span className="mp-chip">
                    {item.totalCount} 项 · {formatBytes(item.totalBytes)}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <PieStatCard title="数量分布" totalLabel={`${item.totalCount} 项`} emptyLabel="暂无数据" slices={countSlices} />
                  <PieStatCard title="体积分布" totalLabel={formatBytes(item.totalBytes)} emptyLabel="暂无数据" slices={sizeSlices} />
                </div>
              </div>
            );
          })}
          {!storageMediaSummary.length ? <p className="text-sm mp-muted">暂无媒体统计数据</p> : null}
        </div>
      </motion.article>

      {edgeActionEdge ? (
        <div
          className="fixed inset-0 z-[58] flex items-center justify-center bg-black/45 p-4"
          onClick={() => setEdgeActionEdgeId(null)}
        >
          <div className="mp-panel w-full max-w-lg p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">连线操作</h3>
                <p className="mt-1 text-sm mp-muted">
                  {edgeActionEdge.sourceStorageName}
                  {" -> "}
                  {edgeActionEdge.destinationStorageName}
                </p>
              </div>
              <span className={`text-sm font-medium ${edgeActionEdge.status === "synced" ? "mp-status-success" : "mp-status-warning"}`}>
                {edgeActionEdge.status === "synced" ? "已同步" : "待同步"}
              </span>
            </div>

            <div className="mt-3 rounded-md border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3 text-sm">
              <p className="font-medium">关联任务 {edgeActionEdge.jobCount} 个</p>
              <p className="mt-1 text-xs mp-muted">{edgeActionEdge.summary}</p>
            </div>

            <div className="mt-3 space-y-1">
              <label htmlFor="edge-action-job-select" className="text-sm font-medium">
                编辑任务
              </label>
              <select
                id="edge-action-job-select"
                className="mp-select"
                value={edgeActionEditJobId}
                onChange={(event) => setEdgeActionEditJobId(event.target.value)}
                disabled={!edgeActionJobs.length}
              >
                {edgeActionJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" className="mp-btn" onClick={() => setEdgeActionEdgeId(null)}>
                关闭
              </button>
              <button type="button" className="mp-btn" onClick={goToEditJobFromEdgeAction} disabled={!edgeActionJobs.length}>
                编辑任务
              </button>
              <button
                type="button"
                className="mp-btn mp-btn-primary"
                disabled={!edgeActionRunnableJobIds.length}
                onClick={() => {
                  setEdgeActionEdgeId(null);
                  setPendingSyncEdgeId(edgeActionEdge.id);
                }}
              >
                手动执行
              </button>
            </div>
            {!edgeActionRunnableJobIds.length ? (
              <p className="mt-2 text-xs mp-muted">当前没有可执行任务（可能均已禁用）。你仍可点击“编辑任务”。</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {progressDialogEdge ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          onClick={() => {
            if (progressDialogCanBackground) {
              setProgressDialogEdgeId(null);
              setMessage("任务已切到后台执行，可点击连线随时查看进度。");
            } else {
              setProgressDialogEdgeId(null);
            }
          }}
        >
          <div className="mp-panel w-full max-w-2xl p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">同步进度</h3>
                <p className="mt-1 text-sm mp-muted">
                  {progressDialogEdge.sourceStorageName}
                  {" -> "}
                  {progressDialogEdge.destinationStorageName}
                </p>
              </div>
              <span className={`text-sm font-medium ${progressDialogStatus.className}`}>{progressDialogStatus.text}</span>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="mp-muted">总体进度</span>
              <span className="font-semibold">{progressDialogPercent}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--ark-line)]">
              <div className="h-full rounded-full bg-[var(--ark-primary)] transition-all duration-300" style={{ width: `${progressDialogPercent}%` }} />
            </div>

            <div className="mt-3 max-h-[48vh] space-y-2 overflow-auto pr-1">
              {progressDialogRows.map((row) => {
                const execution = row.execution;
                const statusText = execution ? getExecutionStatusLabel(execution) : "未执行";
                const statusClass =
                  execution?.status === "failed"
                    ? "mp-status-danger"
                    : execution?.status === "success"
                      ? "mp-status-success"
                      : row.active
                        ? "mp-status-warning"
                        : "mp-muted";
                const percent = execution?.progress.percent ?? 0;
                return (
                  <div key={row.job?.id ?? `missing:${statusText}`} className="rounded-md border border-[var(--ark-line)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold break-all">{row.job?.name ?? row.job?.id ?? "未知任务"}</p>
                      <span className={`text-xs font-medium ${statusClass}`}>
                        {statusText}
                        {execution ? ` ${percent}%` : ""}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ark-line)]">
                      <div className="h-full rounded-full bg-[var(--ark-primary)] transition-all" style={{ width: `${percent}%` }} />
                    </div>
                    {execution?.progress.currentPath ? (
                      <p className="mt-1 break-all text-xs mp-muted">当前文件: {execution.progress.currentPath}</p>
                    ) : null}
                  </div>
                );
              })}
              {!progressDialogRows.length ? <p className="text-sm mp-muted">暂无可展示的任务进度</p> : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              {progressDialogCanBackground ? (
                <button
                  type="button"
                  className="mp-btn"
                  onClick={() => {
                    setProgressDialogEdgeId(null);
                    setMessage("任务已切到后台执行，可点击连线随时查看进度。");
                  }}
                >
                  后台执行
                </button>
              ) : null}
              <button type="button" className="mp-btn mp-btn-primary" onClick={() => setProgressDialogEdgeId(null)}>
                {progressDialogCanBackground ? "关闭弹窗" : "关闭"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingSyncEdge)}
        title="手动同步"
        description={
          pendingSyncEdge
            ? `确认启动 ${pendingSyncRunnableJobIds.length} 个任务（${pendingSyncJobNamePreview}${pendingSyncRunnableJobIds.length > 3 ? " 等" : ""}）吗？`
            : ""
        }
        confirmText="开始同步"
        busy={startingSync}
        onCancel={() => {
          if (!startingSync) setPendingSyncEdgeId(null);
        }}
        onConfirm={() => {
          void startManualSyncForPendingEdge();
        }}
      />
    </section>
  );
}
