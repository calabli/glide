# Glide 技术文档

> 版本 1.4.2 · Manifest V3 · 纯原生 JavaScript，无依赖、无构建步骤
> 产品功能说明见 [PRODUCT.md](PRODUCT.md)。

## 1. 目录结构

```
glide/
├── manifest.json          扩展清单：权限、内容脚本、快捷键、图标、默认语言
├── background.js          Service Worker：把快捷键转发给当前标签页
├── content.js             内容脚本：悬浮胶囊、夜间模式、双击回顶、滚动识别、消息处理
├── reader.js              内容脚本：阅读模式（正文提取、排版面板、朗读）
├── popup.html / popup.js  设置面板（点工具栏图标弹出）
├── _locales/{en,zh_CN}/messages.json   界面文字
├── icons/                 扩展图标 16 / 32 / 48 / 128
├── docs/                  GitHub Pages 宣传页（index.html + favicon.png），不随扩展打包
├── README.md / README.zh-CN.md        用户说明
├── PRODUCT.md / TECHNICAL.md          产品 / 技术文档
```

## 2. 整体架构

```
 ┌──────────────┐  chrome.commands   ┌──────────────┐  tabs.sendMessage {cmd}  ┌────────────────────────┐
 │  快捷键       │ ────────────────▶ │ background.js │ ───────────────────────▶ │ content.js（顶层页面）   │
 └──────────────┘                    └──────────────┘                          │   ├─ 胶囊（Shadow DOM）  │
 ┌──────────────┐  tabs.sendMessage {cmd, ...} ⇄ reply(state)                  │   ├─ 夜间模式          │
 │ popup.js     │ ────────────────────────────────────────────────────────────▶ │   └─ window.__glideReader
 │（设置面板）   │                                                              │ reader.js             │
 └──────┬───────┘                                                              └──────────┬────────────┘
        │ chrome.storage.local.set（全局设置）          storage.onChanged（所有标签页）    │
        └──────────────────────────────▶ chrome.storage.local ◀─────────────────────────┘
```

- **content.js 和 reader.js** 以 `document_start` 注入所有网址的顶层页面（`window.top !== window` 时直接返回）。两者共享同一个隔离世界（isolated world），通过 `window.__glideReader` 对象和自定义 DOM 事件通信。
- **设置面板** 直接读写 `chrome.storage.local` 中的全局设置；按网站的设置通过消息交给当前页面的 content.js 计算并保存（因为"是否与默认相同"等判断需要页面状态）。
- **所有标签页** 监听 `chrome.storage.onChanged`，设置改变后实时生效。
- 只用 `storage` 权限；不发起任何网络请求。

## 3. 存储结构（chrome.storage.local）

| 键 | 类型 | 写入方 | 说明 |
| --- | --- | --- | --- |
| `site:<hostname>` | `{ on: boolean, src: string }` | content | 本网站手动选择的夜间状态。`src` 是写入标签页的随机 ID，用来忽略自己写入的回声。与自动规则一致时删除此键 |
| `tune:<hostname>` | `{ brightness, never, dock?, dbl?, v: 2 }` | content | 按网站微调。`dock`/`dbl` 只在与全局默认不同时才存；全部为默认值时删除整个键 |
| `autoMode` | `'system' \| 'schedule' \| 'off'` | popup | 自动夜间方式，缺省为 `off` |
| `schedule` | `{ from: 'HH:MM', to: 'HH:MM' }` | popup | 定时区间，缺省 19:00–07:00 |
| `palette` | `{ bg: '#rrggbb', text: 0.6–1 }` | popup | 夜间底色与文字亮度 |
| `dockPos` | `'br' \| 'bl' \| 'rm' \| 'lm'` | popup | 胶囊位置 |
| `dockDefault` | `boolean` | popup | 胶囊全局默认，缺省 `true` |
| `dblTop` | `boolean` | popup | 双击回顶全局默认，缺省 `true` |
| `readerPrefs` | `{ fs, mw, ff, rate }` | reader | 阅读模式排版与语速 |
| `followSystem` | `boolean` | 旧版 | 1.4.0 及以前的「跟随系统」开关；只读兼容：没有 `autoMode` 且此值为 `true` 时按 `system` 处理 |

**兼容处理**：1.4.0 会把 `dock: true` 无条件写入 `tune:*`，那并非用户选择。`setTune()` 读到没有 `v: 2` 标记且 `dock === true` 的记录时会忽略该字段，新写入的记录都带 `v: 2`。

网站键使用 `location.hostname`，没有主机名（如 `file:`）时用 `location.protocol`。

## 4. 消息协议

### 4.1 background → content（快捷键）

`chrome.commands.onCommand` 收到命令后发送 `{ cmd }`：`to-top`、`to-bottom`、`toggle-theme`、`reader`。目标页没有内容脚本时（如 `chrome://`）发送失败，错误被吞掉。

### 4.2 popup → content

| `cmd` | 参数 | 行为 | 回复 |
| --- | --- | --- | --- |
| `state` | — | 读取当前状态 | `state()` |
| `set-dark` | `on: boolean` | 与当前不同时调用 `toggleTheme()`（带动画并保存） | `state()` |
| `reset-site` | — | 删除 `site:*`，恢复自动规则 | `state()` |
| `set-tune` | `tune: Partial<{brightness, never, dock, dbl}>` | 合并到本网站微调，去掉与默认相同的 `dock`/`dbl`，保存或删除 `tune:*` | `state()` |
| `reader` | — | 切换阅读模式 | `state()` |

`state()` 返回：

```js
{ host, dark, manual, nativeDark, tune: { brightness, never, dock, dbl }, mode, systemDark, reader }
```

popup 收不到回复（页面不支持内容脚本）时给 `body` 加 `na` 类，禁用「本网站」一组。

### 4.3 content ⇄ reader（同一页面）

- `window.__glideReader`：`{ toggle(), isOpen(), scroller(), setDark(on) }`
- 自定义事件（在 `window` 上派发）：
  - `glide-reader`：阅读模式打开或关闭，胶囊据此高亮书本按钮；
  - `glide-scroll`：阅读页滚动，胶囊据此更新 ↑↓ 和显示状态。

## 5. 模块详解

### 5.1 content.js

#### 5.1.1 夜间模式渲染

整页只用浏览器原生、GPU 加速的 CSS 滤镜，不用 SVG 滤镜（大页面上 SVG 滤镜容易导致标签页崩溃）：

```css
html.glide-dark { filter: invert(1) hue-rotate(180deg) [brightness(b)]; background-color: #fff }
html.glide-dark :is(媒体元素) { filter: [brightness(1/b)] hue-rotate(180deg) invert(1) }   /* 反回来 */
html.glide-dark :is(媒体) :is(媒体) { filter: none }                                          /* 避免嵌套重复反色 */
```

反色后白底只会变成纯黑、黑字变纯白。为了得到柔和配色，在 `<html>` 下追加两个全屏 `<glide-tint>` 层（`pointer-events: none`，z-index 2147483646），它们位于被反色的 `html` 内部，所以**先混合、后反色**：

- `glide-tint.lo`：`mix-blend-mode: multiply`，压低亮部 → 反色后抬高底色；
- `glide-tint.hi`：`mix-blend-mode: screen`，抬高暗部 → 反色后压低最亮文字。

`setPalette()` 由目标底色 `bg` 和文字亮度 `text` 计算：

1. 目标最亮文字 `fg = bg + (#f2f4f8 − bg) × text`；
2. 两层颜色需要写成"反色前"的值：`F(c) = H · (1 − c)`，其中 `H` 是 `hue-rotate(180deg)` 的 3×3 颜色矩阵；
3. `lo = F(bg / fg)`，`hi = F(fg)`。

按网站亮度 `b` 在页面滤镜末尾追加 `brightness(b)`，媒体元素先乘 `1/b` 再反色，从而保持原样。

#### 5.1.2 明暗决策

```
wanted = siteChoice !== null ? siteChoice : autoDark()
autoDark = !tune.never && autoOn() && !pageNativeDark()
autoOn   = mode === 'system'   ? matchMedia('(prefers-color-scheme: dark)').matches
         : mode === 'schedule' ? inSchedule()
         : false
```

- `dark` 是唯一状态来源，点击时立即更新，不依赖 DOM（动画进行中 DOM 尚未改变）。
- `ready` 之前（尚未读到存储）不做判断，避免页面闪烁。
- `sync()` 在以下时机调用：读到存储后、`build()`（DOMContentLoaded，此时才能判断网页是否本身深色）、系统明暗变化、相关存储变化、定时模式下每 30 秒以及标签页重新可见时。
- `save()`：手动切换后，若 `dark === autoDark()` 就删除 `site:*`，否则写入 `{ on, src: TAB }`。

#### 5.1.3 网页本身是否深色

`pageNativeDark()` 临时去掉 `glide-dark` 类，依次读取 `body`、`html` 的计算背景色，取第一个不透明的颜色计算相对亮度，低于 0.4 判为深色。

计算出的颜色可能是 `rgb()`，也可能是 `oklch()` / `lab()` / `color()`（例如 Tailwind v4 站点）。`rgb()` 直接解析；其他格式画到 1×1 画布上再用 `getImageData` 读出 RGB，避免把 `oklch(0.98 0 0)` 之类的浅色误判为深色。

#### 5.1.4 切换动画

使用 `document.startViewTransition`：注入临时样式关闭默认淡入淡出，在 `ready` 后对 `::view-transition-new(root)` 做从按钮中心展开的 `clip-path: circle()` 动画（650ms）。

保护措施：

- 动画进行中再次切换：`skipTransition()` 后直接应用最新状态；
- 300ms 内回调没有执行（后台标签页、卡顿）：跳过动画直接切换；
- 不支持 API、开启减少动态效果、页面不可见时不使用动画。

#### 5.1.5 悬浮胶囊

- 自定义元素 `<glide-dock>` + 开放 Shadow DOM，`:host { all: initial }` 隔离网页样式。
- 夜间模式时胶囊也会被整页反色，所以 `:host(.glide-dark)` 下的颜色写的是"反色前"的值；`applyTheme()` 保证胶囊始终是 `<html>` 的最后一个子元素（在混合层之上）。
- 显示逻辑：滚动（捕获阶段监听，rAF 节流）、鼠标进入感应区（rAF 节流）时显示；1.4 秒无操作且鼠标不在附近时隐藏；全屏时强制隐藏。
- 按网站隐藏时直接对 host 设置 `display: none !important`。

#### 5.1.6 滚动容器识别

`getScroller()` 依次尝试：

1. 阅读模式的滚动层；
2. 最近一次触发 `scroll` 事件且仍可滚动的元素；
3. `document.scrollingElement`（内容高于视口时）；
4. 从视口中心元素向上找第一个 `overflow-y: auto|scroll|overlay`、可滚动、且高度超过视口 40% 的祖先；
5. 兜底 `document.scrollingElement`。

#### 5.1.7 双击回顶

在 `dblclick` 上用 `composedPath()[0]` 取真实目标（兼容阅读模式的 Shadow DOM），排除 `NOT_BLANK` 选择器命中的交互/媒体元素、可编辑元素以及直接含文字节点的元素。

### 5.2 reader.js

#### 5.2.1 正文识别（`findMain`）

一种简化的 Readability 打分：

1. 候选段落：`p, pre, blockquote`，以及不含块级子元素的 `div, td, section`；要求可见且去空白后不少于 20 字。
2. 每段得分 `1 + 标点数 × 0.5 + min(字数/100, 3)`，分别加给父、祖父（½）、曾祖父（⅓）。
3. 每个候选容器最终得分 `(累计分 + 类名/ID 权重) × (1 − 链接密度)`；类名命中 `NEG`（comment、sidebar、share、ad…）−25，命中 `POS`（article、content、post…）+25。
4. 若最佳节点位于 `article / main / [role=main]` 内，且该语义容器文字量不超过最佳节点的 1.6 倍，则改用语义容器。
5. 少于 140 字视为没有正文。

标题优先级：`og:title` → 正文内 `h1` → 页面 `h1` → `document.title`。

#### 5.2.2 清理（`clean`）

- 克隆正文节点；按索引对照原图，补全懒加载地址（`data-src`、`data-original`、`data-lazy-src`、`data-actualsrc`、`data-srcset`），移除已加载且宽度 < 48px 的小图标；
- 删除 `DROP` 列表中的元素（脚本、样式、表单、导航、隐藏元素等），删除类名/ID 命中 `NEG` 且文字少于 400 的元素；
- 属性白名单：`href, src, srcset, alt, title, colspan, rowspan, poster, controls`；所有事件属性和 `style` 都被移除；
- 链接改为绝对地址、新标签页打开；`javascript:` 链接去掉 `href`；
- `video / audio` 强制加 `controls`（原站的自定义播放器已被去掉）；
- 去掉与标题重复的 `h1` 和空元素。

#### 5.2.3 界面

- `<glide-reader>` + Shadow DOM，全屏固定层，z-index 2147483645；插入在夜间混合层之前，所以夜间模式下同样被调色，图片通过 `:host(.dark)` 再反色回来。
- 打开时给 `<html>` 设置 `overflow: hidden !important`，关闭时恢复原值（包括优先级）。
- Esc 在捕获阶段处理：排版面板打开时先关面板，否则退出。

#### 5.2.4 朗读

- `speechSynthesis` 逐段朗读：段落列表为标题 + `h2/h3/h4/p/li/blockquote` 中的叶子段落。
- 每段按句末标点切分，并合并为不超过 140 字的块（规避 Chrome 长语音中途停止的问题）。
- 语言：前 8 段 CJK 字符占比 > 15% 用 `zh-CN`，否则用页面 `lang` 或 `en-US`。
- 语音打分：常见主力语音 +4、本机语音 +2、默认语音 +1、趣味语音 −4。
- `cancel()` 后延迟 60ms 再 `speak()`（Chrome 偶尔吞掉紧随其后的语音）；`tts.current` 用于忽略已被取消语音的回调。
- 页面 `pagehide` 时取消朗读。

### 5.3 popup.js

- 启动时读取全局设置并渲染，再向当前标签页发送 `state`。
- 全局设置直接 `storage.set`；滑块写入做了节流（配色 60ms、亮度 40ms）。
- 修改会影响当前网站显示的全局设置后，延迟 90ms 再次请求 `state` 刷新「本网站」一组。
- 文字通过 `data-i18n` / `data-i18n-aria` / `data-i18n-title` 属性填充。

### 5.4 国际化

- `manifest.json` 中 `default_locale: "en"`，`_locales/en` 与 `_locales/zh_CN` 键必须一一对应。
- 脚本中统一用 `L(key, subs)` 包装 `chrome.i18n.getMessage`，取不到时返回键名。
- 快捷键提示按平台显示 `⌥⇧` 或 `Alt+Shift+`。

## 6. 开发与发布

### 本地调试

1. `chrome://extensions` → 开启开发者模式 → 加载已解压的扩展程序 → 选择项目根目录。
2. 修改代码后点 Glide 卡片上的刷新 ↻，再刷新网页（内容脚本不会自动注入到已打开的页面）。
3. 调试入口：
   - 内容脚本：网页 DevTools → Sources → Content scripts；
   - 设置面板：右键工具栏图标 → 审查弹出内容；
   - Service Worker：扩展卡片上的「Service Worker」链接。

### 自测清单

- 浅色普通网页、本身深色的网页、Tailwind v4（oklch 背景）网页上的自动夜间判断；
- 内部滚动的网页应用（↑↓、双击回顶）；
- 夜间模式下：图片视频原色、亮度滑块、胶囊与阅读页配色；
- 阅读模式：中文文章、英文文章、含图片/代码/表格的文章、朗读与点段跳转；
- 多个同站标签页的夜间状态同步；
- `chrome://` 页面上设置面板的禁用提示。

### 发布

1. 修改 `manifest.json` 中的 `version`，同步更新 `docs/index.html` 的版本号与 `PRODUCT.md` 的版本历史。
2. 打包时只包含扩展所需文件和 README，不含 `docs/` 与 PRODUCT / TECHNICAL 文档；压缩包内是一个 `glide/` 文件夹：

   ```bash
   git archive --prefix=glide/ -o glide-1.4.2.zip HEAD manifest.json background.js content.js reader.js popup.html popup.js _locales icons README.md README.zh-CN.md
   ```

3. 打上 `vX.Y.Z` 标签，在 GitHub Releases 上传 zip；宣传页由 GitHub Pages 从 `docs/` 目录发布。

## 7. 设计约束与取舍

| 决策 | 原因 |
| --- | --- |
| 只用 `storage` 权限 | 隐私承诺；代价是无法向已打开的标签页注入脚本 |
| `<all_urls>` 内容脚本 + `document_start` | 尽早应用夜间模式，避免白屏闪烁 |
| CSS `filter` 而非 SVG 滤镜或逐元素改色 | 性能稳定、兼容所有网站；SVG 滤镜在大页面上可能导致崩溃 |
| 混合层定色 | 在不逐元素改色的前提下得到非纯黑的柔和配色 |
| Shadow DOM 承载所有 UI | 与网页样式互不影响 |
| 只在顶层页面运行 | 避免 iframe 中出现多个胶囊、重复反色 |
| 无构建、无依赖 | 便于审阅和直接加载 |
