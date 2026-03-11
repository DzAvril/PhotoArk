import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Cpu, Database, RefreshCw, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { MetricCard } from "../components/metric-card";
import { performanceMonitor } from "../lib/performance-monitor";
import type { PerformanceReport, MemorySnapshot, PerformanceMetric } from "../lib/performance-monitor";

const SLOW_THRESHOLD_MS = 100;

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getTrendIcon(trend: "increasing" | "stable" | "decreasing") {
  if (trend === "increasing") {
    return <TrendingUp className="h-4 w-4 text-red-500" />;
  }
  if (trend === "decreasing") {
    return <TrendingDown className="h-4 w-4 text-green-500" />;
  }
  return null;
}

function getTrendLabel(trend: "increasing" | "stable" | "decreasing") {
  if (trend === "increasing") return "上升";
  if (trend === "decreasing") return "下降";
  return "稳定";
}

function MemoryChart({ snapshots }: { snapshots: MemorySnapshot[] }) {
  if (snapshots.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-sm mp-muted">
        等待更多内存快照数据...
      </div>
    );
  }

  const maxMemory = Math.max(...snapshots.map((s) => s.usedJSHeapSize));
  const minMemory = Math.min(...snapshots.map((s) => s.usedJSHeapSize));
  const range = maxMemory - minMemory || 1;
  const chartHeight = 120;
  const chartWidth = 100;
  const padding = 10;

  const points = snapshots.map((snapshot, index) => {
    const x = padding + (index / (snapshots.length - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - ((snapshot.usedJSHeapSize - minMemory) / range) * (chartHeight - 2 * padding);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  return (
    <div className="relative h-40">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full w-full">
        <defs>
          <linearGradient id="memory-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
          </linearGradient>
        </defs>
        <path
          d={`${pathD} L ${chartWidth - padding},${chartHeight - padding} L ${padding},${chartHeight - padding} Z`}
          fill="url(#memory-gradient)"
        />
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {snapshots.map((snapshot, index) => {
          const x = padding + (index / (snapshots.length - 1)) * (chartWidth - 2 * padding);
          const y = chartHeight - padding - ((snapshot.usedJSHeapSize - minMemory) / range) * (chartHeight - 2 * padding);
          return (
            <circle
              key={snapshot.timestamp}
              cx={x}
              cy={y}
              r={2}
              fill="#3b82f6"
              className="transition-all hover:r-3"
            >
              <title>{`${formatBytes(snapshot.usedJSHeapSize)} @ ${formatTimestamp(snapshot.timestamp)}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] mp-muted">
        <span>{formatBytes(minMemory)}</span>
        <span>{formatBytes(maxMemory)}</span>
      </div>
    </div>
  );
}

function MetricTypeBadge({ type }: { type: PerformanceMetric["type"] }) {
  const colors: Record<PerformanceMetric["type"], string> = {
    operation: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    render: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    network: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    memory: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  };

  const labels: Record<PerformanceMetric["type"], string> = {
    operation: "操作",
    render: "渲染",
    network: "网络",
    memory: "内存",
  };

  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[type]}`}>
      {labels[type]}
    </span>
  );
}

export function PerformancePage() {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [currentMemory, setCurrentMemory] = useState<MemorySnapshot | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    function updateReport() {
      setReport(performanceMonitor.getReport());
      setCurrentMemory(performanceMonitor.getCurrentMemory());
    }

    updateReport();

    if (autoRefresh) {
      const interval = setInterval(updateReport, 2000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [autoRefresh]);

  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-4 text-lg font-semibold">仅开发环境可用</h2>
          <p className="mt-2 text-sm mp-muted">性能监控功能仅在开发环境中启用</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-[var(--ark-primary)]" />
      </div>
    );
  }

  const recentMetrics = report.metrics.slice(-50).reverse();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">性能监控</h2>
          <p className="mt-1 text-sm mp-muted">开发环境专用，实时监控应用性能指标</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-[var(--ark-line)]"
            />
            自动刷新
          </label>
          <button
            type="button"
            className="mp-btn"
            onClick={() => {
              performanceMonitor.clearMetrics();
              setReport(performanceMonitor.getReport());
            }}
          >
            <Trash2 className="h-4 w-4" />
            清除数据
          </button>
          <button
            type="button"
            className="mp-btn"
            onClick={() => {
              setReport(performanceMonitor.getReport());
              setCurrentMemory(performanceMonitor.getCurrentMemory());
            }}
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="当前内存"
          value={currentMemory ? formatBytes(currentMemory.usedJSHeapSize) : "N/A"}
          meta={currentMemory ? `堆限制 ${formatBytes(currentMemory.jsHeapSizeLimit)}` : "不可用"}
          icon={<Cpu className="h-5 w-5" />}
          tone="blue"
        />
        <MetricCard
          title="内存趋势"
          value={getTrendLabel(report.memoryTrend)}
          meta={report.memorySnapshots.length > 0 ? `${report.memorySnapshots.length} 个快照` : "暂无数据"}
          icon={getTrendIcon(report.memoryTrend) || <Activity className="h-5 w-5" />}
          tone={report.memoryTrend === "increasing" ? "amber" : "emerald"}
        />
        <MetricCard
          title="平均渲染时间"
          value={formatDuration(report.averageRenderTime)}
          meta={report.metrics.filter((m) => m.type === "render").length + " 次渲染"}
          icon={<BarChart3 className="h-5 w-5" />}
          tone="violet"
        />
        <MetricCard
          title="慢操作"
          value={String(report.slowOperations.length)}
          meta={`阈值 ${SLOW_THRESHOLD_MS}ms`}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={report.slowOperations.length > 0 ? "amber" : "emerald"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="mp-panel p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">内存使用趋势</h3>
            {currentMemory && (
              <span className="text-sm mp-muted">
                已用 {formatBytes(currentMemory.usedJSHeapSize)} / {formatBytes(currentMemory.totalJSHeapSize)}
              </span>
            )}
          </div>
          <div className="mt-3">
            <MemoryChart snapshots={report.memorySnapshots} />
          </div>
          {currentMemory && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md border border-[var(--ark-line)] p-2">
                <p className="text-xs mp-muted">已用堆</p>
                <p className="font-semibold">{formatBytes(currentMemory.usedJSHeapSize)}</p>
              </div>
              <div className="rounded-md border border-[var(--ark-line)] p-2">
                <p className="text-xs mp-muted">总堆</p>
                <p className="font-semibold">{formatBytes(currentMemory.totalJSHeapSize)}</p>
              </div>
              <div className="rounded-md border border-[var(--ark-line)] p-2">
                <p className="text-xs mp-muted">堆限制</p>
                <p className="font-semibold">{formatBytes(currentMemory.jsHeapSizeLimit)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mp-panel p-4">
          <h3 className="text-base font-semibold">性能统计</h3>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-md border border-[var(--ark-line)] p-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" />
                <span className="text-sm">总指标数</span>
              </div>
              <span className="font-semibold">{report.metrics.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[var(--ark-line)] p-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" />
                <span className="text-sm">渲染指标</span>
              </div>
              <span className="font-semibold">{report.metrics.filter((m) => m.type === "render").length}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[var(--ark-line)] p-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-500" />
                <span className="text-sm">网络请求</span>
              </div>
              <span className="font-semibold">{report.metrics.filter((m) => m.type === "network").length}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[var(--ark-line)] p-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-green-500" />
                <span className="text-sm">操作指标</span>
              </div>
              <span className="font-semibold">{report.metrics.filter((m) => m.type === "operation").length}</span>
            </div>
          </div>
        </div>
      </div>

      {report.slowOperations.length > 0 && (
        <div className="mp-panel p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="text-base font-semibold">慢操作警告</h3>
          </div>
          <p className="mt-1 text-sm mp-muted">超过 {SLOW_THRESHOLD_MS}ms 的操作将被标记</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ark-line)]">
                  <th className="px-3 py-2 text-left font-medium">名称</th>
                  <th className="px-3 py-2 text-left font-medium">耗时</th>
                  <th className="px-3 py-2 text-left font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {report.slowOperations.slice(-20).reverse().map((metric, index) => (
                  <tr key={`${metric.timestamp}-${index}`} className="border-b border-[var(--ark-line)]">
                    <td className="px-3 py-2 font-mono text-xs">{metric.name}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-amber-600">{formatDuration(metric.duration)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs mp-muted">{formatTimestamp(metric.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mp-panel p-4">
        <h3 className="text-base font-semibold">最近指标</h3>
        <p className="mt-1 text-sm mp-muted">最近 50 条性能指标记录</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)]">
                <th className="px-3 py-2 text-left font-medium">类型</th>
                <th className="px-3 py-2 text-left font-medium">名称</th>
                <th className="px-3 py-2 text-left font-medium">耗时</th>
                <th className="px-3 py-2 text-left font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {recentMetrics.map((metric, index) => (
                <tr key={`${metric.timestamp}-${index}`} className="border-b border-[var(--ark-line)]">
                  <td className="px-3 py-2">
                    <MetricTypeBadge type={metric.type} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{metric.name}</td>
                  <td className="px-3 py-2">
                    <span className={metric.duration > SLOW_THRESHOLD_MS ? "font-semibold text-amber-600" : ""}>
                      {formatDuration(metric.duration)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs mp-muted">{formatTimestamp(metric.timestamp)}</td>
                </tr>
              ))}
              {recentMetrics.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center mp-muted">
                    暂无性能指标数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mp-panel p-4">
        <h3 className="text-base font-semibold">使用说明</h3>
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <strong>内存监控：</strong>每 10 秒自动采集一次内存快照，当内存超过 100MB 时会在控制台输出警告。
          </p>
          <p>
            <strong>慢操作检测：</strong>操作耗时超过 100ms 会被标记为慢操作，并在控制台输出警告。
          </p>
          <p>
            <strong>代码中使用：</strong>
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--ark-surface-soft)] p-3 text-xs">
{`import { performanceMonitor, createPerformanceTracker } from '@/lib/performance-monitor';

// 方式 1: 直接使用
const stop = performanceMonitor.startMeasure('my-operation');
// ... 执行操作
const duration = stop();

// 方式 2: 使用 tracker
const tracker = createPerformanceTracker('my-task');
tracker.start();
// ... 执行任务
tracker.end();

// 方式 3: 包装函数
const result = performanceMonitor.measureSync('sync-task', () => {
  return doSomething();
});

const data = await performanceMonitor.measureAsync('async-task', async () => {
  return await fetchData();
});`}
          </pre>
        </div>
      </div>
    </section>
  );
}
