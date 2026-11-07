# 厨房助手 — 设计与实现说明

[English](kitchen-helper.md) | 中文

本文说明 Kitchen Helper AR 应用的整体结构、为什么把状态机与 FusionUI 分离，以及
HowToCook + DeepSeek 流水线在断网或没有 API Key 时如何降级。

相关文档：[应用 README](../apps/kitchen-helper/README.zh-CN.md)、
[工具链说明](toolchain.md)、[Fedora 兼容层](fedora-compatibility.md)。

## 目标与约束

- 运行在 IrisView Client / 模拟器中，640×480 单目 AR HUD。
- 用最少的文字和装饰，带厨房小白完成一道菜。
- 从 [HowToCook](https://github.com/Anduin2017/HowToCook) 拉取菜谱，用 DeepSeek API
  做结构化提取。
- MVP 不接入 ASR：语音用文字模拟（模拟器文字通道）。
- 假定 SDK 全部功能可用；当前只针对模拟器。
- 键盘输入 `*` 必须强制触发一次任务异常，用于验证异常界面。

## 页面流转

```text
首页 ──确认──► 聆听页 ──文字──► 加载页 ──成功──► 菜谱信息页
  ▲              │                 │                  │
  │              │ 返回            │ 失败             │ 确认
  │              ▼                 ▼                  ▼
  └──────────── 首页 ◄─────────── 异常页 ◄──────── 事前准备页
                                                     │ 所有卡片移除
                                                     ▼
                                                   步骤页
                                                     │ 最后一步
                                                     ▼
                                                   完成页 ──确认──► 首页
```

所有流转由 `app-src/model/state.ts` 决定。`app-src/index.ts` 只负责：

1. 轮询 `takeNavigationAction()` 与 `takeTextInput()`；
2. 把动作和时间增量交给 reducer；
3. 执行 reducer 返回的 effect（`load-recipe`、`ask-assistant`、`persist-completion`）；
4. 把新状态交给 `AppRenderer`。

这样无需模拟器就能测试完整交互逻辑。

## 交互方式

| 来源       | 动作             | 首页         | 准备页                       | 步骤页                 |
| ---------- | ---------------- | ------------ | ---------------------------- | ---------------------- |
| 眼镜腿点按 | `activate`       | 进入聆听     | 标记已备好；全备好后开始做菜 | 开始倒计时，否则下一步 |
| 眼镜腿滑动 | `up` / `down`    | —            | 切换原料 / 厨具行            | 滚动步骤内容           |
| 眼镜腿滑动 | `left` / `right` | 切换推荐高亮 | 左右移动卡片焦点             | 下一步 / 上一步        |
| 返回手势   | `back`           | —            | 返回菜谱页                   | 返回菜谱页             |
| 输入框     | 命令词           | 同上         | 同上                         | 同上                   |
| 输入框     | 其他文字         | 菜名         | 忽略                         | 向助手提问             |

命令词在 `parseTextInput()` 中定义：`确认/确定/ok/enter`、`上/下/左/右`、`返回/back`、`*`。
文字通道也用于 `FUSIONUI_DEMO_TEST_USER_TEXT` 自动化演示。

## 倒计时规则

- 每个步骤可以声明 0 个或多个计时器（`StepTimerSpec[]`）。实际 HowToCook 菜谱通常有 0–3 个
  计时动作。
- 步骤页按确认时，先启动**当前步骤所有未开始的计时器**；若没有未开始的计时器，才进入下一步
  （即“确认键意图冲突”规则）。
- 左划始终进入下一步（即使倒计时未开始），右划返回上一步。
- 计时器属于烹饪状态而不是某个页面，所以切换步骤时继续运行。`visibleTimers()` 返回所有
  已启动的计时器加上当前步骤未开始的计时器，纵向排列成进度条。
- 进度由 reducer 时钟驱动。计时结束后变为完成态、转绿，并保留标签与时间直到完成做菜。
- 步骤页滚动使用 0–2 页索引；上下滑切换页面，渲染器平滑移动内容位置。

## 准备页焦点规则

- 原料行在上，厨具行在下；初始焦点在原料行。
- 左右移动在行边界处停住（不循环）；上下在两行均非空时切换。
- 移除焦点卡片后自动选中下一张（末尾则选上一张）。整行清空时焦点自动切到另一行。
- 所有卡片移除后显示“已准备好”，再按确认开始做菜。
- 每行只创建焦点附近的 3 张卡片，既减轻模拟器场景负担，也符合“一行约 1.7 张卡片”的视觉密度。

## 菜谱流水线

### 1. 搜索

携带 `.AspNetCore.Culture=zh-CN` 请求
`https://howtocook.aiursoft.com/Dashboard/Index?q=<菜名>`，解析第一个
`/Recipes/Detail/<id>` 链接与卡片标题。没有匹配则返回 `not-found` 异常。

### 2. 获取原文

用同一 culture cookie 请求详情页，提取两种表示：

1. “Edit on GitHub” 链接 → 规范 Markdown；
2. 详情页可见文本作为兜底。

Markdown 通过 `https://api.github.com/repos/Anduin2017/HowToCook/contents/...` 读取并
base64 解码，不依赖 `raw.githubusercontent.com` 直连。

### 3. DeepSeek 结构化

存在 `DEEPSEEK_API_KEY` 时，把 Markdown 发给 `deepseek-chat`，提示词要求严格 JSON
（`app-src/recipe/llm.ts`）：

```json
{
  "titleZh": "...",
  "titleEn": "...",
  "summaryZh": "...",
  "summaryEn": "...",
  "difficulty": 2,
  "totalMinutes": 15,
  "servingsZh": "...",
  "servingsEn": "...",
  "caloriesKcal": 252,
  "ingredients": [
    { "nameZh": "...", "nameEn": "...", "amountZh": "...", "amountEn": "...", "icon": "tomato" }
  ],
  "cookware": [
    { "nameZh": "...", "nameEn": "...", "amountZh": "...", "amountEn": "...", "icon": "pan" }
  ],
  "steps": [
    {
      "titleZh": "...",
      "titleEn": "...",
      "instructionZh": "...",
      "instructionEn": "...",
      "tipZh": null,
      "tipEn": null,
      "timers": [{ "labelZh": "翻炒", "labelEn": "Stir-fry", "durationSeconds": 20 }],
      "heat": 2,
      "icon": "flame"
    }
  ]
}
```

返回值会做归一化：数值截断、图标校验、计时时长限制、英文缺失时回退中文、缺少厨具时补
炒锅 + 锅铲。JSON 无效或步骤少于 2 个会抛 `invalid` 并进入异常页。

### 4. 本地兜底

没有 Key（或 DeepSeek 失败）时，`extractLocalRecipe()` 直接解析 Markdown：

- 一级标题 → 菜名；首段 → 简介；
- `预估烹饪难度`、`预估卡路里` → 元信息；
- “必备原料和工具”列表 → 原料 + 厨具（关键词分类）；
- “计算”列表 → 用量（`名称 = 用量`）；
- “操作”编号项 → 步骤；缩进子项 → 小白提示；
- 步骤中显式的 `X 秒/分钟/小时` → 倒计时；
- 关键词决定火候（0–3）与图标。

三道新手菜以完整结构化快照内置于 `recipe/recommended.ts`，对应菜名断网时可直接使用。

### 5. 助手问答

做菜过程中输入自由文字会弹出模态框。有 Key 时 DeepSeek 收到菜名、当前步骤、操作、提示与
问题，返回中英双语 JSON；没有 Key 时用本地关键词库回答常见问题（刀工、火候、溅油、咸淡、
时间、淀粉、替代食材）。确认关闭弹窗，倒计时继续运行。

## 异常页与 `*`

任意位置输入 `*` 会立即强制进入 `forced` 异常（不发起请求）。流水线异常映射为：

| 代码        | 触发条件                     | 可重试               |
| ----------- | ---------------------------- | -------------------- |
| `not-found` | HowToCook 无匹配             | 是                   |
| `network`   | 搜索 / 详情请求失败          | 是                   |
| `llm`       | DeepSeek 请求或返回失败      | 是                   |
| `invalid`   | 结构化 JSON 或本地解析不可用 | 是                   |
| `forced`    | 用户输入 `*`                 | 仅当它打断了一次查询 |

异常页显示中英双语标题/说明、技术细节行；允许重试时显示重试操作。返回始终回到首页。

## 渲染与动画

- 所有布局都在 640×480 的 `Board` 上绝对定位；字号刻意放大（13–44 px）以便扫视。
- 页面**没有顶部 header 和底部 footer**，只保留核心信息。
- MVP 模拟器 profile（`release/off`）会拒绝原生 `AnimationPlayback`，因此 `ui/anim.ts`
  用应用时钟驱动公开的 `Style.opacity`，实现渐入、焦点脉冲、聆听波形、进度条、彩带与
  助手弹窗动画。
- **不要对已经带着样式呈现过的 widget 做位置动画**：模拟器会校验构图几何，一旦位置动画
  与样式/opacity 变化出现在同一批帧，或者在移动后的父节点里重新排版文字，就会以
  `Composition geometry proof rejected`（`reachable-envelope` 阶段）拒绝合成，随后报
  `The display could not be updated`；Client 会把应用标记为「需要处理」，画面停在最后一帧
  且不再接受输入。因此首页推荐区改成两个固定卡片槽位，轮播时只替换文字、图标与强调色，
  不做任何位移动画；焦点只用颜色表达。几何始终不变的 widget 使用样式或 opacity 动画是
  安全的，`ui/anim.ts` 就负责这类效果。
- 图标由 `tools/generate-icons.py` 生成 PNG，放在 `src/assets/icons`；打包后通过
  `__dirname`（打包后的 `src/` 目录）解析路径。
- 零宽度原生 View 同样会让首帧无法呈现，因此进度条填充宽度最小为 1。

## 配置与密钥

| 配置                     | 位置                                                    |
| ------------------------ | ------------------------------------------------------- |
| DeepSeek Key（推荐）     | 模拟器状态目录下、应用私有目录里的 `deepseek-key.txt`   |
| DeepSeek Key（CI/覆盖）  | `DEEPSEEK_API_KEY` 环境变量（优先于文件）               |
| DeepSeek Key（开发占位） | `app-src/config.ts` 占位符（会被打包进 bundle，不推荐） |
| DeepSeek 地址/模型/超时  | `app-src/config.ts`                                     |
| HowToCook 站点/仓库/超时 | `app-src/config.ts`                                     |
| 应用身份与能力           | `FusionUIApp.json`                                      |

`FusionUIApp.json` 声明 `input.navigation` 与 `input.text`，`minimumHostVersion: 2`。

### 运行时 Key 文件与模拟器状态目录

按平台文档《模拟器数据区域的指定与读取》，`--state-dir` 指定的是模拟器**整套隔离状态**
（安装信息、应用数据、运行数据、日志、缓存），应用不能解析它，只能通过 Host 提供的私有目录
（`FUSIONUI_APP_DATA_DIR`，由
[`application-data.ts`](../apps/kitchen-helper/app-src/application-data.ts) 封装为
`applicationDataPath()`）读写自己的数据。

因此 `vp run app:run`（以及应用自己的 `run` 脚本）会传入
`--state-dir apps/kitchen-helper/sim-state`，把整套状态留在项目目录内。首次运行会打印
解析后的私有目录：

```text
KITCHEN_HELPER_DATA_DIR {"path":".../apps/kitchen-helper/sim-state/applications/data/com.example.kitchenhelper"}
KITCHEN_HELPER_LLM_KEY {"source":"file","file":".../applications/data/com.example.kitchenhelper/deepseek-key.txt","model":"deepseek-chat"}
```

应用首次运行会自动生成带注释模板的 `deepseek-key.txt`。把 Key 粘贴进去
（空行与 `#` 注释会被忽略）后重启应用即可；Key 在请求时
读取，不会被打进 `.fuiapp`。该文件位于 `sim-state/` 下（已被 git 忽略）。打进 `.fuiapp`
的 Key 对拿到安装包的人可见，生产环境仍应通过后端代理下发短期令牌。

## 验证结果

| 检查项                            | 结果                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| `ivt test apps/kitchen-helper`    | 通过 — 6 个测试文件、43 个测试用例（状态机、解析器、LLM 归一化、降级） |
| `ivt package apps/kitchen-helper` | 通过 — `.fuiapp`，debug-unsigned                                       |
| `ivt smoke apps/kitchen-helper`   | 通过 — `IrisView application frame 1`                                  |
| 文字注入 `番茄炒蛋`               | 通过 — 实时搜索 + 本地结构化 → 菜谱页                                  |
| 文字注入 `*`                      | 通过 — 强制异常页                                                      |
| 文字注入 `确认`                   | 通过 — 聆听页                                                          |

## 已知限制

- 不接入 ASR / TTS；语音由文字模拟。
- 假设模拟器可联网；离线模式仅覆盖三道内置菜谱。
- 同时只支持一条做菜流程；除“上次完成/完成数”外没有历史记录页面。
- MVP 模拟器拒绝原生动画播放，因此使用帧驱动动画。
- 真机部署与签名不在本 MVP 范围内。
