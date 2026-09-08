<div align="center">

# Moeshelf

**本地 Galgame 收藏管理、自动刮削与一键启动工具**

像媒体库管理电影一样管理你的 Galgame 收藏：扫描目录 → 自动获取封面与元数据 → 一键启动。

当前版本：`v1.6.0`

</div>

---

## 功能特性

- **本地收藏管理**：自动扫描游戏目录并识别文件夹与可执行文件；智能选择主程序（优先汉化/破解版，自动排除卸载器、安装程序、运行库等无关文件）。
- **多源自动刮削**：从 **VNDB / Bangumi / YMgal / CnGal / Moyu** 五个数据源自动获取封面、标题、发售日、开发商、评分等元数据；搜索支持相似度校验与全源并行，命中错误可手动修正。
- **中文体验增强**：优先展示官方/民间中文标题；详情面板自动补全**中文简介**——优先采用 Moyu 多语言简介中的 STORY 剧情正文，CnGal / YMgal / Bangumi 依次兜底。
- **角色与声优**：从多个来源获取登场角色、配音演员及对应立绘。
- **封面管理**：在线更换封面；封面与图片经服务端代理 + 本地缓存（`data/cache/images`、浏览器 IndexedDB）加载，离线仍可显示。
- **收藏与通关**：星标收藏并置顶；「已通关」标记、Fin 角标与按通关时间排序的列表。
- **数据安全**：游玩时长统计；自动备份（`data/backup`，保留最近 5 份）；一键导出 / 导入（JSON）；导出 CSV。
- **内容分级**：按 VNDB 封面分级对 R18 封面启用高斯模糊与 NSFW 标记，支持全局或单游戏开关。
- **会社视角**：按开发商列出「本地未下载」的作品（VNDB 数据），便于规划补全目标；空结果自动重拉，杜绝缓存污染。
- **网络适配**：内置代理设置（代理失败自动直连重试）；内置「开启局域网访问」脚本，手机同 WiFi 即可访问。
- **开箱即用**：发布版双击 `启动.bat` 即可运行，自动打开浏览器，支持 PWA/移动端访问。

## 快速开始

### 使用发布版

1. 解压发布包（如 `moeshelf-build-1.6.0.zip`）；
2. 双击 **`启动.bat`**，程序会自动启动服务并打开 `http://localhost:3000`；
3. 首次使用：在「设置」中指定游戏根目录 → 点击「扫描」→ 自动刮削元数据；
4. 局域网访问：运行 **`开启局域网访问.bat`**，用提示的局域网地址在手机端打开。

> 所有本地数据均保存在程序目录下的 `data/` 中，升级时保留该目录即可无损迁移。

### 从源码运行 / 开发

环境要求：**Node.js ≥ 18.17**（建议 20 及以上）。

```bash
npm install        # 安装依赖
npm run dev        # 开发模式，http://localhost:3000
npm run build      # 生产构建（输出 .next/standalone）
npm start          # 本地生产运行
node pack.js <目标目录>   # 打包「解压即用」发布目录
```

`pack.js` 会将 standalone 产物组装为发布目录（`server.js` + `node_modules` + `.next` + 启动脚本 + `data/`），与正式发布包布局一致。

## 数据源说明

| 来源 | 用途 | 备注 |
| --- | --- | --- |
| VNDB | 封面 / 标题 / 发售日 / 评分 / 会社作品 | 主要元数据源 |
| Bangumi | 中文标题 / 简介 / 角色 | API `bgm.tv` |
| YMgal | 中文标题 / 简介 / 角色 | OAuth 公开 API |
| CnGal | 中文标题 / 简介 / 角色 | `api.cngal.org` |
| Moyu（鲲 Galgame 补丁） | **中文简介优先源** / 中文名 / 多语言简介 | 站方公开 JSON API，见下 |

> Moyu（[moyu.moe](https://www.moyu.moe)）为开源项目 [KunMoe/kun-galgame-patch](https://github.com/KunMoe/kun-galgame-patch)（AGPL-3.0）运营的社区站点。本项目**仅调用其公开 API 获取文字元数据与简介**，不涉及任何补丁资源下载，亦不包含其代码。

## 数据与隐私

- 本地数据仅保存在本机 `data/`（设置、资料库、刮削缓存、游玩时长、自动备份），**不会上传到任何服务器**；
- 刮削仅向上述站点发起元数据/简介检索请求，不含你的游戏目录、文件名之外的信息；
- 封面缓存可能含 R18 图片；删除对应缓存或整个 `data/` 可彻底清除。

## 常见问题（FAQ）

- **刮削/搜索失败**：检查网络；若配置了代理且代理未开启，程序会自动直连重试（会提示「代理不可用，已尝试直连」）。
- **中文简介为空或未更新**：早期版本查询为空的结果会被缓存；对条目点击「重新获取信息」，或在设置中清空刮削缓存后重新打开详情。
- **Moyu 条目提示「未找到对应条目」**：请确认版本为 **1.6.0+**——1.6.0 起所有 Moyu 详情请求均携带 `content_limit=all`，以兼容 R18 条目。
- **端口被占用**：启动器会自动尝试 3001–3019 端口；全部被占时请关闭占用程序后重试。
- **被安全软件拦截**：若杀毒软件阻止 `node.exe` 启动，请将程序目录加入信任列表。

## 目录结构

```
src/
├── lib/           数据源与刮削逻辑（vndb / bangumi / ymgal / cngal / moyu …）
├── app/
│   ├── api/       本地服务接口（library / scan / scrape / search / cn-description …）
│   └── page.tsx   主界面（React + Tailwind）
├── …
pack.js            发布目录打包脚本
```

## 参考与致谢

本项目站在以下开源项目与社区服务之上，特此致谢。

### 运行时框架与依赖

| 项目 | 用途 | 许可证 |
| --- | --- | --- |
| [Next.js](https://github.com/vercel/next.js) | Web 应用框架与路由 | MIT |
| [React](https://github.com/facebook/react) | 界面组件库 | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 开发语言 | Apache-2.0 |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 样式方案 | MIT |
| [undici](https://github.com/nodejs/undici) | HTTP 客户端（代理/超时封装） | MIT |
| [cheerio](https://github.com/cheeriojs/cheerio) | HTML 解析（部分源） | MIT |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 局域网访问二维码 | MIT |

### 元数据数据源（通过公开 API 调用，非代码依赖）

- [VNDB](https://vndb.org) — 主元数据：封面、发售日、评分、会社作品列表（VNDB API）。
- [Bangumi](https://bgm.tv)（开源仓库 [bangumi/server](https://github.com/bangumi/server)，AGPL-3.0）— 中文标题、简介、角色与声优（`api.bgm.tv`）；本项目仅调用其公开 API，未复制或链接其代码。
- [YMgal](https://www.ymgal.games) — 中文标题、简介、角色（开放 API）。
- [CnGal](https://www.cngal.org)（仓库 [CnGal/CnGalWebSite](https://github.com/CnGal/CnGalWebSite)，MIT）— 中文简介、角色（`api.cngal.org`）。
- [Moyu · 鲲 Galgame 补丁](https://www.moyu.moe)（[KunMoe/kun-galgame-patch](https://github.com/KunMoe/kun-galgame-patch)，AGPL-3.0）— **中文简介优先源**：多语言简介、中文名等。本项目仅调用其公开 API 获取文字元数据，未复制或链接其代码，其 AGPL 协议不影响本项目自身代码的 MIT 许可。

### 文档格式与设计参考

- 更新日志结构参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
- 版本号遵循[语义化版本（SemVer）](https://semver.org/lang/zh-CN/)；
- 产品形态启发自本地媒体库软件 [Infuse](https://firecore.com/infuse)（商业软件，非开源）。

## 免责声明

本项目仅提供**本地收藏管理与元数据检索**能力，不提供、不聚合任何盗版游戏或补丁资源本体。游戏与相关素材版权归其权利方所有，请在遵守当地法律与各站点服务条款的前提下使用本工具。

## 许可证

本项目基于 **MIT License** 开源，详见 [LICENSE](LICENSE)。
