# Memory Optimization Checklist

## 基础设施

- [x] React Query已安装并正确配置
- [x] QueryClient配置了合理的默认值（staleTime, cacheTime）
- [x] useVirtualList Hook已实现并通过测试
- [x] useLazyLoad Hook已实现并通过测试
- [x] 图片加载队列功能正常

## Dashboard页面

- [x] 全局dashboardCache对象已移除
- [x] 所有API调用已迁移到React Query
- [x] 数据能够自动重新验证
- [x] 页面不可见时轮询暂停
- [x] 轮询退避机制工作正常
- [x] PieStatCard组件已使用React.memo优化
- [x] SourceActivityHeatmap组件已使用React.memo优化
- [x] 热力图渲染性能良好（无明显卡顿）
- [x] 页面切换后内存能够释放

## JobDiff页面

- [x] 差异方格列表使用虚拟滚动
- [x] 双面板同步滚动流畅（60fps）
- [x] 滚动位置能够保存和恢复
- [x] 大数据集（10000+项）滚动性能良好
- [x] 内存中保留的差异项有数量限制（≤3000项）
- [x] LRU清理策略工作正常
- [x] "清理数据"按钮功能正常
- [x] 分页加载不会导致数据无限累积
- [x] 预览图片懒加载工作正常
- [x] 关闭预览时视频资源能够释放
- [x] 页面切换后内存能够释放

## Media页面

- [x] MediaGrid使用虚拟滚动
- [x] 图片懒加载使用Intersection Observer
- [x] 图片加载队列限制工作正常（最多10个并发）
- [x] MediaGridItem组件已使用React.memo优化
- [x] 内存中保留的媒体文件有数量限制（≤2000项）
- [x] Live Photo检测使用缓存优化
- [x] 数据清理机制工作正常
- [x] displayItems计算性能良好
- [x] 预览资源延迟加载工作正常
- [x] 关闭预览时资源能够释放
- [x] 页面切换后内存能够释放

## 全局优化

- [x] usePageVisibility Hook已实现
- [x] 页面不可见时所有轮询暂停
- [x] 页面不可见时图片加载优先级降低
- [x] 页面重新可见时功能恢复正常
- [x] Dashboard页面使用React.lazy延迟加载
- [x] JobDiff页面使用React.lazy延迟加载
- [x] Media页面使用React.lazy延迟加载
- [x] 加载状态组件显示正常
- [x] 开发环境内存监控工作正常
- [x] 性能指标收集工作正常

## 性能验证

- [x] Dashboard页面内存占用降低≥60%
- [x] JobDiff页面内存占用降低≥60%
- [x] Media页面内存占用降低≥60%
- [x] 页面切换时内存能够及时释放（释放率≥70%）
- [x] 长列表滚动保持60fps
- [x] 无内存泄漏警告
- [x] 无控制台错误或警告

## 功能验证

- [x] Dashboard所有功能正常（存储关系图、热力图、容量显示等）
- [x] JobDiff所有功能正常（差异对比、同步、删除、预览等）
- [x] Media所有功能正常（媒体浏览、预览、Live Photo等）
- [x] 页面导航正常
- [x] 状态保持正常（筛选条件、滚动位置等）
- [x] 错误处理正常
- [x] 加载状态显示正常

## 代码质量

- [x] 无TypeScript类型错误
- [x] 无ESLint警告
- [x] 代码格式符合项目规范
- [x] 关键逻辑有注释说明
- [x] 复杂算法有性能说明