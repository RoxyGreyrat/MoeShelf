[![Made with DeepSeek V4 Flash](https://img.shields.io/badge/Made%20with-DeepSeek%20V4%20Flash-536DFE?style=flat-square&logo=deepseek&logoColor=white)](https://deepseek.com)


<div align="center">

# Moeshelf

**本地 Galgame 收藏管理工具**

自动扫描 · 多源刮削 · 中文信息 · 游玩记录 · 局域网访问

**当前版本：`v1.6.0`**

</div>

---

## 功能

### 本地收藏管理

* 自动扫描游戏目录，识别文件夹与可执行文件
* 智能选择主程序，自动排除安装程序、卸载器、运行库等无关文件
* 支持收藏、置顶、已通关标记
* 支持按通关时间查看游戏
* 自动统计游玩时长

### 多源自动刮削

支持以下数据源：

| 数据源         | 主要内容            |
| ----------- | --------------- |
| **VNDB**    | 封面、标题、发售日、评分、会社 |
| **Bangumi** | 中文标题、简介、角色、声优   |
| **YMgal**   | 中文标题、简介、角色      |
| **CnGal**   | 中文标题、简介、角色      |
| **Moyu**    | 中文名、多语言简介、剧情简介  |

支持全源并行搜索与相似度校验，降低错误匹配概率，也可以手动修正条目。

### 中文体验

* 优先显示中文标题
* 自动获取中文简介
* Moyu → CnGal → YMgal → Bangumi 多级简介回退
* 自动获取角色、声优及角色立绘

### 封面管理

* 在线更换游戏封面
* 图片经过服务端代理并缓存到本地
* 支持浏览器 IndexedDB 缓存
* 缓存后可离线查看

### 内容分级

根据 VNDB 封面分级：

* R18 封面自动启用模糊
* 显示 NSFW 标记
* 支持全局开关
* 支持单个游戏单独设置

### 会社视角

按开发商查看 VNDB 中的其他作品：

> 找出「还没下载」的作品，方便规划收藏补全。

缓存异常时会自动重新获取数据，避免错误缓存影响结果。

### 局域网访问

* 内置代理设置
* 代理失败后自动尝试直连
* 一键开启局域网访问
* 手机与电脑连接同一 Wi-Fi 即可访问
* 支持 PWA / 移动端

### 数据安全

所有个人数据默认保存在本地：

```text
data/
├── backup/      # 自动备份
├── cache/       # 刮削与图片缓存
└── ...
```

支持：

* 自动备份，保留最近 5 份
* JSON 导入 / 导出
* CSV 导出
* 游戏库升级无损迁移

---

## 快速开始

### 使用发布版

1. 前往 GitHub **Releases** 下载最新版本
2. 解压后双击 **`启动.bat`**
3. 浏览器会自动打开：

```text
http://localhost:3000
```

4. 在「设置」中选择游戏根目录
5. 点击「扫描」
6. 等待程序自动刮削游戏信息

### 手机访问

电脑与手机连接到同一个 Wi-Fi 后：

1. 双击 **`开启局域网访问.bat`**
2. 根据提示获取局域网地址
3. 在手机浏览器打开该地址

---

## 从源码运行

### 环境要求

* **Node.js ≥ 18.17**
* 推荐 **Node.js 20+**

### 安装与运行

```bash
npm install
npm run dev
```

开发服务器默认运行于：

```text
http://localhost:3000
```

### 生产构建

```bash
npm run build
npm start
```

### 打包发布版

```bash
node pack.js <目标目录>
```

`pack.js` 会自动组装发布目录：

```text
server.js
node_modules/
.next/
启动脚本
data/
```

生成与正式发布版相同结构的「解压即用」目录。

---

## 数据源

Moeshelf **仅获取公开的游戏元数据**，不提供游戏本体、补丁或其他资源。

| 来源          | 用途                 |
| ----------- | ------------------ |
| **VNDB**    | 主要元数据、封面、评分、发售日、会社 |
| **Bangumi** | 中文标题、简介、角色、声优      |
| **YMgal**   | 中文标题、简介、角色         |
| **CnGal**   | 中文标题、简介、角色         |
| **Moyu**    | 中文名、多语言简介、剧情简介     |

Moyu（鲲 Galgame 补丁）是一个开源社区项目。Moeshelf 仅调用其公开 API 获取文字元数据，**不下载或提供补丁资源，也未复制其代码**。

---

## 数据与隐私

Moeshelf 是一个**本地收藏管理工具**。

你的游戏库数据保存在本机：

```text
data/
```

不会将你的游戏库、游玩记录等个人数据上传到 Moeshelf 自有服务器。

刮削时，程序会向上述第三方数据源请求游戏元数据。具体数据处理方式以各数据源自身的服务条款与隐私政策为准。

---

## FAQ

### 刮削失败怎么办？

检查网络连接。

如果配置了代理，程序会在代理不可用时自动尝试直连，并提示：

> 代理不可用，已尝试直连

### 中文简介没有显示怎么办？

早期版本可能会缓存空结果。

可以尝试：

1. 打开游戏详情
2. 点击「重新获取信息」

或者在「设置」中清空刮削缓存后重新获取。

### Moyu 提示「未找到对应条目」？

请确认使用 **v1.6.0 或更高版本**。

v1.6.0 起，Moyu 详情请求统一携带 `content_limit=all`，以兼容部分 R18 条目。

### 端口被占用怎么办？

程序会自动尝试：

```text
3001 → 3019
```

如果全部被占用，请关闭占用端口的程序后重新启动。

### 被杀毒软件拦截怎么办？

部分安全软件可能会阻止发布版中的 `node.exe` 运行。

如果确认程序来源可信，可以将 Moeshelf 程序目录加入安全软件的信任列表。

---

## 项目结构

```text
Moeshelf/
├── src/
│   ├── lib/              # 数据源与刮削逻辑
│   │   ├── vndb/
│   │   ├── bangumi/
│   │   ├── ymgal/
│   │   ├── cngal/
│   │   └── moyu/
│   │
│   ├── app/
│   │   ├── api/          # 本地 API
│   │   └── page.tsx      # 主界面
│   │
│   └── ...
│
├── pack.js               # 发布版打包脚本
├── package.json
└── README.md
```

---

## 数据源与开源项目致谢

### 运行时框架

* [Next.js](https://github.com/vercel/next.js) — Web 应用框架
* [React](https://github.com/facebook/react) — UI 框架
* [TypeScript](https://github.com/microsoft/TypeScript) — 开发语言
* [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) — CSS 框架
* [undici](https://github.com/nodejs/undici) — HTTP 客户端
* [cheerio](https://github.com/cheeriojs/cheerio) — HTML 解析
* [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — 二维码生成

### 数据源

* [VNDB](https://vndb.org)
* [Bangumi](https://bgm.tv)
* [YMgal](https://www.ymgal.games)
* [CnGal](https://www.cngal.org)
* [Moyu](https://www.moyu.moe)

感谢所有提供公开数据与开源项目的开发者及社区。

---

## 免责声明

Moeshelf 仅提供：

> **本地 Galgame 收藏管理 + 元数据检索**

本项目**不提供、不聚合任何游戏本体、盗版资源或补丁资源**。

游戏及相关素材的版权归其权利人所有，请在遵守当地法律及相关服务条款的前提下使用本项目。

---

## 许可证

本项目基于 **MIT License** 开源。

详见 [LICENSE](LICENSE)。
