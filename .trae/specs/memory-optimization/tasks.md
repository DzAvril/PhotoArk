# Tasks

## 阶段一：基础设施准备

- [x] Task 1: 安装和配置React Query
  - [x] SubTask 1.1: 安装@tanstack/react-query依赖
  - [x] SubTask 1.2: 在App.tsx中配置QueryClientProvider
  - [x] SubTask 1.3: 配置默认缓存策略（staleTime: 60s, cacheTime: 5min）
  - [x] SubTask 1.4: 创建useQuery和useMutation的自定义封装（可选）

- [x] Task 2: 实现虚拟滚动Hook
  - [x] SubTask 2.1: 创建useVirtualList Hook
  - [x] SubTask 2.2: 实现可见区域计算逻辑
  - [x] SubTask 2.3: 实现滚动事件监听和防抖
  - [x] SubTask 2.4: 编写单元测试

- [x] Task 3: 实现图片懒加载优化
  - [x] SubTask 3.1: 创建useLazyLoad Hook（基于Intersection Observer）
  - [x] SubTask 3.2: 实现图片加载队列管理
  - [x] SubTask 3.3: 实现加载优先级机制
  - [x] SubTask 3.4: 添加加载状态和错误处理

## 阶段二：Dashboard页面重构

- [x] Task 4: 重构Dashboard数据管理
  - [x] SubTask 4.1: 移除全局dashboardCache对象
  - [x] SubTask 4.2: 将API调用迁移到React Query hooks
  - [x] SubTask 4.3: 实现数据自动重新验证
  - [x] SubTask 4.4: 实现页面可见性检测，暂停不可见时的轮询

- [x] Task 5: 优化Dashboard轮询机制
  - [x] SubTask 5.1: 使用React Query的refetchInterval实现轮询
  - [x] SubTask 5.2: 实现智能轮询退避（无变化时降低频率）
  - [x] SubTask 5.3: 页面不可见时暂停轮询
  - [x] SubTask 5.4: 清理现有的手动轮询实现

- [x] Task 6: 优化Dashboard图表渲染
  - [x] SubTask 6.1: 使用React.memo优化PieStatCard组件
  - [x] SubTask 6.2: 使用React.memo优化SourceActivityHeatmap组件
  - [x] SubTask 6.3: 实现SVG元素的懒渲染
  - [x] SubTask 6.4: 优化热力图数据结构，减少重复计算

## 阶段三：JobDiff页面重构

- [x] Task 7: 实现JobDiff虚拟滚动
  - [x] SubTask 7.1: 将差异方格列表改为虚拟滚动实现
  - [x] SubTask 7.2: 优化双面板同步滚动逻辑
  - [x] SubTask 7.3: 实现滚动位置的保存和恢复
  - [x] SubTask 7.4: 测试大数据集（10000+项）的滚动性能

- [x] Task 8: 实现JobDiff数据窗口化
  - [x] SubTask 8.1: 限制内存中保留的差异项数量（最多3000项）
  - [x] SubTask 8.2: 实现LRU清理策略
  - [x] SubTask 8.3: 添加"清理数据"按钮，允许用户手动释放
  - [x] SubTask 8.4: 优化分页加载逻辑，避免数据累积

- [x] Task 9: 优化JobDiff预览功能
  - [x] SubTask 9.1: 实现预览图片的懒加载
  - [x] SubTask 9.2: 关闭预览时释放视频资源
  - [x] SubTask 9.3: 限制预览缓存大小
  - [x] SubTask 9.4: 优化预览切换的内存占用

## 阶段四：Media页面优化

- [x] Task 10: 优化Media网格渲染
  - [x] SubTask 10.1: 实现MediaGrid的虚拟滚动
  - [x] SubTask 10.2: 使用Intersection Observer实现图片懒加载
  - [x] SubTask 10.3: 实现图片加载队列（最多同时加载10个）
  - [x] SubTask 10.4: 优化MediaGridItem组件，使用React.memo

- [x] Task 11: 优化Media数据管理
  - [x] SubTask 11.1: 限制内存中保留的媒体文件数量（最多2000项）
  - [x] SubTask 11.2: 优化Live Photo检测算法，使用缓存
  - [x] SubTask 11.3: 实现数据清理机制
  - [x] SubTask 11.4: 优化displayItems的计算性能

- [x] Task 12: 优化Media预览功能
  - [x] SubTask 12.1: 实现预览资源的延迟加载
  - [x] SubTask 12.2: 关闭预览时释放资源
  - [x] SubTask 12.3: 优化预览切换的性能
  - [x] SubTask 12.4: 限制预览历史缓存

## 阶段五：全局优化

- [x] Task 13: 实现页面可见性管理
  - [x] SubTask 13.1: 创建usePageVisibility Hook
  - [x] SubTask 13.2: 页面不可见时暂停所有轮询
  - [x] SubTask 13.3: 页面不可见时降低图片加载优先级
  - [x] SubTask 13.4: 页面重新可见时恢复所有功能

- [x] Task 14: 实现代码分割
  - [x] SubTask 14.1: 使用React.lazy延迟加载Dashboard页面
  - [x] SubTask 14.2: 使用React.lazy延迟加载JobDiff页面
  - [x] SubTask 14.3: 使用React.lazy延迟加载Media页面
  - [x] SubTask 14.4: 添加加载状态组件

- [x] Task 15: 添加性能监控
  - [x] SubTask 15.1: 添加内存使用监控（开发环境）
  - [x] SubTask 15.2: 添加性能指标收集
  - [x] SubTask 15.3: 添加慢操作警告
  - [x] SubTask 15.4: 创建性能报告页面（开发环境）

## 阶段六：测试和验证

- [ ] Task 16: 性能测试
  - [ ] SubTask 16.1: 测试Dashboard页面内存占用
  - [ ] SubTask 16.2: 测试JobDiff页面内存占用
  - [ ] SubTask 16.3: 测试Media页面内存占用
  - [ ] SubTask 16.4: 测试页面切换时的内存释放

- [ ] Task 17: 功能回归测试
  - [ ] SubTask 17.1: 测试Dashboard所有功能正常
  - [ ] SubTask 17.2: 测试JobDiff所有功能正常
  - [ ] SubTask 17.3: 测试Media所有功能正常
  - [ ] SubTask 17.4: 测试页面导航和状态保持

# Task Dependencies

- Task 4 依赖 Task 1（需要React Query）
- Task 7 依赖 Task 2（需要虚拟滚动Hook）
- Task 10 依赖 Task 2 和 Task 3（需要虚拟滚动和懒加载）
- Task 16 和 Task 17 依赖所有前置任务完成
- Task 1、Task 2、Task 3 可以并行执行
- Task 4、Task 7、Task 10 可以并行执行（在依赖完成后）
