# 1.5.0 整合计划（源码重建 + 新功能）

> 本文件是集成阶段的执行清单。重建由三个子任务完成：S1（核心库 + 14 路由 + backup）、
> S2（刮削库 + 5 路由）、S3（page.tsx + icons + toast + 图标修复）。

## 重建验收基准（已核对）

- core.ts（8621/3247/263/281/667/644/2849）——已通过
- scan.ts（2147：JUNK_EXE_NAMES/SKIP 目录/评分/ignorePaths/removedPaths/identify）——已通过
- fetch.ts（8026/1085：ProxyAgent + 12s 超时）——已通过
- 路由：library/settings/cache/storage/playtime/network/drives/list-dir/list-exes/launch/open-folder/image/scan/proxy-test——已通过
- backup（新功能）——结构通过，导入白名单需扩展 tags
- S2 的 scrape/search/covers/characters/cn-description 与 S3 的 page.tsx 待审查

## 新功能落地（我负责，重建完成后做）

### 1. 标签（tags）
- [ ] 服务端 library POST 白名单加 `tags`（字符串数组、去空、去重、限 50 个）
- [ ] backup 导入归一化同样加 `tags`
- [ ] 客户端保存载荷（S3 page.tsx 中 M 函数）加 `tags`
- [ ] 详情面板加「标签」编辑区（chips + 输入 + 添加/删除）
- [ ] 工具栏加标签筛选（下拉或 chips），客户端过滤
- [ ] CSV 导出含标签列（lib/csv.ts 已就绪）

### 2. CSV 导出
- [ ] 设置面板「导出资料」区加「导出 CSV」按钮（用 lib/csv.ts，文件名 galgame-library-<日期>.csv）

### 3. 导出/导入（配合 S1 的 /api/backup）
- [ ] 设置面板加「导出资料」按钮：fetch GET /api/backup?action=export → blob 下载
- [ ] 「导入资料」按钮：选择文件 → POST /api/backup?action=import → 提示成功/失败并刷新
- [ ] 确认备份目录说明文案（自动备份在 data/backup，保留 5 份）

### 4. 目录选择器不记忆上次路径
- [ ] 确认 S3 重建的选择器组件（对应编译产物 T，1416 行）打开时从盘符列表开始（应已如此）
- [ ] 设置面板「游戏根目录」输入框：打开设置时不预填旧 rootPath（value 初始为空，placeholder 显示当前值）；保存时输入为空则保留原 rootPath
- [ ] 「数据存储位置」输入框保持原行为（预填当前值，与任务无关）

### 5. 图标修复（S3 负责，需验证）
- [ ] 卡片底部按钮：nd 时图标 className 为 "h-3 w-3 shrink-0 text-white/80"，不带 fill-current；非 nd 保持 "h-3 w-3 fill-current"
- [ ] 详情面板状态行（988 行对应处）：nd 时 text-white/70 可见度，无 fill-current
- [ ] 所有 stroke 风格图标不带 fill-current；play/star/bookmark 可带
- [ ] 无头浏览器截图对比验证

## 构建与打包

- [ ] `npm run build`（tsc 严格模式，逐项清零错误）
- [ ] `node pack.js E:\galgame-library-build-1.5.0 --with-data`
  - pack.js 会拒绝覆盖已存在目录
- [ ] 1.5.0 目录内验证：
  - [ ] 复制真实 data（用 1.4.2 的 data 副本；若 pack --with-data 未用则手动复制）
  - [ ] node server.js 起服务 → 首页 200、/api/library 返回 177 个游戏
  - [ ] 各接口 smoke test（settings/storage/playtime/cache/network/drives/scan 只读部分）
  - [ ] 无头 Edge 截图：页面渲染、未下载按钮图标可见性（像素亮度对比）
  - [ ] 确认 SSR HTML 无乱码
- [ ] git 提交全部源码 + 更新日志

## 铁律

- 不修改 E:\galgame-library-build-1.4.2 任何文件
- 不改局域网逻辑（0.0.0.0、防火墙 bat 保持原样）
- 不加缓存清理功能（原设置里的「清空刮削缓存」按钮是既有功能，保留）
- 数据字段兼容：旧数据可被新版读取，新版写出的数据旧版可读（tags 为可选新字段）
