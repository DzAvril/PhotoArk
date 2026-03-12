# [OPEN] PhotoArk diff 误报 destination_only

## 症状

- 差异页面仍然出现相同数目的 `destination_only`（目标目录有 / 源目录无），但源目录实际存在对应媒体文件。

## 假设（可证伪）

1. **源目录扫描漏扫**：`readdir`/`Dirent` 或 `stat` 在 NAS/SMB/权限/符号链接场景下导致部分文件未进入 `sourceRows`。
2. **路径键不一致**：两端相对路径存在大小写/Unicode 归一化/分隔符差异，导致归并匹配无法对齐，最终落入 `destination_only`。
3. **权限/IO 错误**：源目录对部分文件 `stat` 失败（EACCES/EPERM/ENOENT），索引里缺失，导致误报。
4. **分页/过滤侧效应**：接口返回的 `items` 中 `destination_only` 的 `relativePath` 与真实源目录路径可 `stat` 成功，说明不是“真实缺失”而是索引构建路径不一致。

## 采集计划

- 在后端 `/api/jobs/:jobId/diff` 的构建流程里上报：
  - 本次 diff 的 source/destination 索引条目数
  - `destination_only` 的数量
  - 对前 N 个 `destination_only`：
    - 是否能在源目录用同一路径 `stat` 成功
    - 是否存在大小写不敏感匹配（lowercase key）
    - 是否存在 Unicode NFD 匹配
  - 源目录扫描时的 `stat` 失败码统计（采样）

## 状态

- [OPEN] 已添加 instrumentation：同时写入 API 日志与本地采集服务，等待采集 `pre-fix` 日志。
