# 内存性能分析指南

## 启用内存采样与快照

1. 在 `.env` 中启用并设置采样参数：

```
MEMORY_PROFILING_ENABLED=true
MEMORY_SAMPLE_INTERVAL_MS=10000
MEMORY_SAMPLE_LIMIT=720
MEMORY_SAMPLE_RECENT_LIMIT=60
MEMORY_SNAPSHOT_DIR=./apps/api/data/memory-snapshots
MEMORY_AUTO_SNAPSHOT_ENABLED=false
MEMORY_AUTO_SNAPSHOT_INTERVAL_MS=600000
MEMORY_AUTO_SNAPSHOT_MAX_FILES=20
MEMORY_AUTO_SNAPSHOT_RSS_THRESHOLD_MB=0
```

2. 启动 API：

```
npm run dev -w @photoark/api
```

## 运行阶段内存监测

### 采样数据

访问：`GET /api/memory/metrics`

返回包含：
- `memoryUsage`：进程内存占用（rss/heapUsed/heapTotal/external/arrayBuffers）
- `heapStats`：V8 堆统计
- `resource`：进程资源使用
- `samples`：采样数量、统计摘要与最近采样
- `system`：系统内存与负载

建议在以下阶段采样对比：
- 启动完成后空闲态
- 首次加载媒体/存储扫描
- 执行备份作业过程中
- 大规模文件列表或预览访问

### 堆快照

访问：`POST /api/memory/snapshot`

返回快照文件路径与大小，可在 Chrome DevTools Memory 面板打开分析。

### 自动快照

自动快照支持定时与阈值触发：

```
MEMORY_AUTO_SNAPSHOT_ENABLED=true
MEMORY_AUTO_SNAPSHOT_INTERVAL_MS=600000
MEMORY_AUTO_SNAPSHOT_MAX_FILES=20
MEMORY_AUTO_SNAPSHOT_RSS_THRESHOLD_MB=0
```

说明：
- `MEMORY_AUTO_SNAPSHOT_INTERVAL_MS`：定时快照间隔，默认 10 分钟
- `MEMORY_AUTO_SNAPSHOT_MAX_FILES`：保留最近快照数量，多余会自动清理
- `MEMORY_AUTO_SNAPSHOT_RSS_THRESHOLD_MB`：RSS 阈值触发，设置为 0 表示关闭阈值

## Node.js Inspector 分析

以 Inspector 模式启动 API：

```
node --inspect --inspect-port=9229 apps/api/dist/index.js
```

在 Chrome 打开 `chrome://inspect` 连接进程，使用 Memory 面板完成以下操作：
- Heap snapshot：观察大对象与引用链
- Allocation instrumentation on timeline：定位频繁分配/释放
- Allocation sampling：识别热点调用路径

## Chrome DevTools Memory 分析步骤

1. 运行 `GET /api/memory/metrics` 记录基线数据
2. 在关键操作前后分别生成 Heap Snapshot
3. 对比快照差异，重点关注：
   - Retainers 引用链是否存在未释放的对象
   - ArrayBuffer/Buffer 是否持续增长
   - 大型数组/Map/对象集合的增长趋势

## 基准与验证

建议建立基准指标：
- 空闲态 `rss`、`heapUsed`、`external` 的稳定值
- 高峰期 `rss` 与 `heapUsed` 的峰值与 p95
- 关键请求前后 `heapUsed` 的回落速度

优化后用相同的操作流程复测并对比：
- `heapUsed` 与 `rss` 峰值是否降低
- `heapUsed` 是否在操作完成后回落
- `samples.summary` 中 `p95` 是否显著下降

## 常见优化方向

结合快照与采样数据，优先考虑：
- 大数组/大对象的分段处理或流式处理
- 频繁创建的大对象进行复用或对象池
- 避免不必要的闭包与临时数组
- 长时间保留的缓存增加容量上限与淘汰策略
- 大文件读取改为流式读取，避免 `readFile` 全量加载
- 长链路处理拆分为阶段释放引用
