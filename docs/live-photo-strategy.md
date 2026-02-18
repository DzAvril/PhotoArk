# iOS Live Photo 备份策略

## 目标
- 备份后可恢复为可识别的 Live Photo，而不是两份无关联文件。

## 实施策略

1. 识别
- 默认按同名基线匹配：`IMG_0001.HEIC` + `IMG_0001.MOV`
- 如来源可提供 metadata（assetIdentifier），优先 metadata 绑定。

2. 存储
- 图片与视频分别存储。
- 在索引层写入 `live_photo_links`，记录同一 `asset_id` 下 image/video 的对象路径与哈希。

3. 恢复
- 恢复到 Apple Photos 兼容目录结构。
- 优先恢复原始文件名与时间戳。
- 导出 manifest，包含 image/video 对应关系，保证批量恢复后仍可重建 Live Photo。

4. 校验
- 备份后做双文件哈希校验。
- 恢复后做 pairing 完整性校验（image/video 是否都存在）。
