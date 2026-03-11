const SLOW_OPERATION_THRESHOLD_MS = 100;
const MEMORY_WARNING_THRESHOLD_MB = 100;

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  type: "operation" | "render" | "network" | "memory";
  metadata?: Record<string, unknown>;
}

export interface MemorySnapshot {
  timestamp: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface PerformanceReport {
  metrics: PerformanceMetric[];
  memorySnapshots: MemorySnapshot[];
  slowOperations: PerformanceMetric[];
  averageRenderTime: number;
  averageNetworkTime: number;
  memoryTrend: "increasing" | "stable" | "decreasing";
}

type PerformanceObserverCallback = (metric: PerformanceMetric) => void;

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private observers: PerformanceObserverCallback[] = [];
  private isDev: boolean;
  private memoryCheckInterval: ReturnType<typeof setInterval> | null = null;
  private maxMetrics: number = 500;
  private maxSnapshots: number = 100;

  constructor() {
    this.isDev = import.meta.env.DEV;
    if (this.isDev) {
      this.setupPerformanceObservers();
      this.startMemoryMonitoring();
      console.log("[PerformanceMonitor] 开发环境性能监控已启用");
    }
  }

  private setupPerformanceObservers() {
    if (typeof PerformanceObserver === "undefined") return;

    try {
      const measureObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric({
            name: entry.name,
            duration: entry.duration,
            timestamp: entry.startTime,
            type: "operation",
          });
        }
      });
      measureObserver.observe({ entryTypes: ["measure"] });
    } catch {
      // PerformanceObserver not supported
    }

    try {
      const renderObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "paint" || entry.entryType === "largest-contentful-paint") {
            this.recordMetric({
              name: entry.name,
              duration: entry.duration || (entry as PerformanceEntry & { renderTime?: number }).renderTime || 0,
              timestamp: entry.startTime,
              type: "render",
            });
          }
        }
      });
      renderObserver.observe({ entryTypes: ["paint", "largest-contentful-paint"] });
    } catch {
      // Not supported
    }
  }

  private startMemoryMonitoring() {
    this.captureMemorySnapshot();

    this.memoryCheckInterval = setInterval(() => {
      this.captureMemorySnapshot();
    }, 10000);
  }

  private captureMemorySnapshot() {
    const memory = (performance as Performance & { memory?: MemoryInfo }).memory;
    if (!memory) return;

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };

    this.memorySnapshots.push(snapshot);
    if (this.memorySnapshots.length > this.maxSnapshots) {
      this.memorySnapshots.shift();
    }

    const usedMB = memory.usedJSHeapSize / (1024 * 1024);
    if (usedMB > MEMORY_WARNING_THRESHOLD_MB) {
      console.warn(
        `[PerformanceMonitor] 内存使用较高: ${usedMB.toFixed(2)}MB (阈值: ${MEMORY_WARNING_THRESHOLD_MB}MB)`
      );
    }
  }

  private recordMetric(metric: PerformanceMetric) {
    if (!this.isDev) return;

    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    if (metric.duration > SLOW_OPERATION_THRESHOLD_MS && metric.type === "operation") {
      console.warn(
        `[PerformanceMonitor] 慢操作检测: ${metric.name} 耗时 ${metric.duration.toFixed(2)}ms`
      );
    }

    this.observers.forEach((cb) => cb(metric));
  }

  startMeasure(name: string): () => number {
    if (!this.isDev) return () => 0;

    const startTime = performance.now();
    performance.mark(`${name}-start`);

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      try {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);
      } catch {
        // Marks might already exist
      }

      this.recordMetric({
        name,
        duration,
        timestamp: startTime,
        type: "operation",
      });

      return duration;
    };
  }

  measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.isDev) return fn();

    const stopMeasure = this.startMeasure(name);
    return fn().finally(() => {
      const duration = stopMeasure();
      console.log(`[PerformanceMonitor] ${name} 完成，耗时 ${duration.toFixed(2)}ms`);
    });
  }

  measureSync<T>(name: string, fn: () => T): T {
    if (!this.isDev) return fn();

    const stopMeasure = this.startMeasure(name);
    try {
      return fn();
    } finally {
      const duration = stopMeasure();
      console.log(`[PerformanceMonitor] ${name} 完成，耗时 ${duration.toFixed(2)}ms`);
    }
  }

  recordNetworkRequest(url: string, duration: number, status: number) {
    if (!this.isDev) return;

    this.recordMetric({
      name: `network:${url}`,
      duration,
      timestamp: Date.now(),
      type: "network",
      metadata: { status },
    });

    if (duration > SLOW_OPERATION_THRESHOLD_MS * 5) {
      console.warn(
        `[PerformanceMonitor] 慢网络请求: ${url} 耗时 ${duration.toFixed(2)}ms (状态: ${status})`
      );
    }
  }

  recordRender(componentName: string, duration: number) {
    if (!this.isDev) return;

    this.recordMetric({
      name: `render:${componentName}`,
      duration,
      timestamp: Date.now(),
      type: "render",
      metadata: { component: componentName },
    });
  }

  subscribe(callback: PerformanceObserverCallback): () => void {
    this.observers.push(callback);
    return () => {
      const index = this.observers.indexOf(callback);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  getReport(): PerformanceReport {
    const slowOperations = this.metrics.filter(
      (m) => m.duration > SLOW_OPERATION_THRESHOLD_MS && m.type === "operation"
    );

    const renderMetrics = this.metrics.filter((m) => m.type === "render");
    const networkMetrics = this.metrics.filter((m) => m.type === "network");

    const averageRenderTime =
      renderMetrics.length > 0
        ? renderMetrics.reduce((sum, m) => sum + m.duration, 0) / renderMetrics.length
        : 0;

    const averageNetworkTime =
      networkMetrics.length > 0
        ? networkMetrics.reduce((sum, m) => sum + m.duration, 0) / networkMetrics.length
        : 0;

    let memoryTrend: "increasing" | "stable" | "decreasing" = "stable";
    if (this.memorySnapshots.length >= 3) {
      const recent = this.memorySnapshots.slice(-5);
      const first = recent[0].usedJSHeapSize;
      const last = recent[recent.length - 1].usedJSHeapSize;
      const change = (last - first) / first;

      if (change > 0.1) memoryTrend = "increasing";
      else if (change < -0.1) memoryTrend = "decreasing";
    }

    return {
      metrics: [...this.metrics],
      memorySnapshots: [...this.memorySnapshots],
      slowOperations,
      averageRenderTime,
      averageNetworkTime,
      memoryTrend,
    };
  }

  getCurrentMemory(): MemorySnapshot | null {
    const memory = (performance as Performance & { memory?: MemoryInfo }).memory;
    if (!memory) return null;

    return {
      timestamp: Date.now(),
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  }

  clearMetrics() {
    this.metrics = [];
    this.memorySnapshots = [];
    console.log("[PerformanceMonitor] 性能指标已清除");
  }

  destroy() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    this.observers = [];
    this.metrics = [];
    this.memorySnapshots = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();

export function usePerformanceMeasure(name: string) {
  if (!import.meta.env.DEV) return { start: () => () => 0 };

  const start = () => performanceMonitor.startMeasure(name);
  return { start };
}

export function createPerformanceTracker(name: string) {
  if (!import.meta.env.DEV) {
    return {
      start: () => {},
      end: () => {},
      measure: <T>(fn: () => T) => fn(),
      measureAsync: <T>(fn: () => Promise<T>) => fn(),
    };
  }

  let stopMeasure: (() => number) | null = null;

  return {
    start: () => {
      stopMeasure = performanceMonitor.startMeasure(name);
    },
    end: () => {
      if (stopMeasure) {
        const duration = stopMeasure();
        stopMeasure = null;
        return duration;
      }
      return 0;
    },
    measure: <T>(fn: () => T): T => {
      return performanceMonitor.measureSync(name, fn);
    },
    measureAsync: <T>(fn: () => Promise<T>): Promise<T> => {
      return performanceMonitor.measureAsync(name, fn);
    },
  };
}
