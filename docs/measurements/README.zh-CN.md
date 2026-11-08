# 延迟测量记录（2026-11-07）

用于 JUNCTION CHINA 2026 智能穿戴赛道作品说明中「实时性与可靠性」一节的证据。
测量对象为 `apps/kitchen-helper` 打包后的 `.fuiapp`，在 IrisView 模拟器中运行。

## 测量定义

- **输入 → 结构化**：模拟器文字通道提交菜名后，HowToCook 检索、原文读取与 DeepSeek 结构化完成的时间。
- **输入 → ARUI 更新**：菜谱页状态被应用（ARUI 更新）的时间，即 CSV 中的 `input_to_screen_ms`。
- 由应用内埋点 `KITCHEN_HELPER_LATENCY` 记录墙钟时间，日志原文见 `raw/attempt-*.log`。
- 每次会话只注入一次菜名；每次测量使用独立的模拟器会话，连续执行。

## 环境

| 项         | 值                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| 日期与时间 | 2026-11-07 22:47–22:51（Asia/Shanghai）                                                              |
| 模拟器     | IrisView Developer Kit v1.0.0，profile `release/off`，单目 `640×480`                                 |
| 运行环境   | Fedora 44，Node 24.13.0，客户端由 `ivt run` 启动                                                     |
| 模型       | DeepSeek `deepseek-flash`（JSON 结构化），Key 从模拟器状态目录的应用私有目录读取，不进入仓库与安装包 |
| 数据源     | HowToCook 站点与 GitHub contents API（联网）                                                         |
| 应用构建   | `ivt package apps/kitchen-helper`，debug-unsigned                                                    |

## 结果

- 11 次尝试中 10 次成功，1 次在脚本 60 秒上限内未返回被终止；10 次成功样本均由 DeepSeek 结构化（`source=deepseek`）。
- 输入 → ARUI 更新：最小 9.8 s，中位 12.7 s，P95 16.5 s，最大 16.5 s。
- 输入 → 结构化与 ARUI 更新之间只差数毫秒（状态应用与渲染在同一帧循环内），主要耗时在检索与模型生成。
- 失败说明：本次测量前已为 GET 请求加入 3 次重试（网络错误 / 429 / 5xx）；未成功的那次是模型生成超过脚本上限，应用内自身超时为 90 秒，随后会重试或降级到本地解析 / 离线快照。

## 文件

| 文件                     | 内容                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `2026-11-07-latency.csv` | 11 次尝试逐行记录：结果、来源、两段时延、开始时间、失败原因           |
| `raw/attempt-NN.log`     | 每次尝试的完整模拟器 stdout（含 `KITCHEN_HELPER_*` 日志与应用帧输出） |

## 复现

```bash
node packages/toolchain/src/cli.ts package apps/kitchen-helper
FUSIONUI_DEMO_TEST_USER_TEXT='红烧肉' \
  node packages/toolchain/src/cli.ts run --latest --project apps/kitchen-helper \
  --state-dir apps/kitchen-helper/sim-state
```

首次运行会在模拟器状态目录的应用私有目录生成 `deepseek-key.txt` 模板；将 Key 填入后重启应用，
日志中的 `KITCHEN_HELPER_LLM_KEY` 会显示 `"source":"file"`。Key 不应提交到仓库或打进安装包。
