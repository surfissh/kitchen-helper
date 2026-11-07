# Kitchen Helper — IrisView AR 示例应用

`apps/kitchen-helper` 是用本仓库工具链构建的 TypeScript AR 应用，用于验证
“**TypeScript 源码 → CJS bundle → `.fuiapp` → 模拟器呈现真实应用帧**”全链路。

## 应用行为

- 640×480 单目 HUD：标题、步骤号、步骤名（中/英随 Client 显示语言）、倒计时、
  操作提示、进度点、循环计数；
- 四步烹饪循环：清洗食材 → 切配 → 下锅 → 装盘，每步带独立倒计时；
- `←/→` 导航键切换步骤（Client 提供导航输入时）；
- 每轮结束后休息 3 秒进入下一轮；已完成轮数持久化到应用私有目录；
- 应用日志输出 `KITCHEN_READY`、`KITCHEN_STEP`、`KITCHEN_CYCLE`，便于自动化断言。

## 结构

| 文件                   | 用途                                                   |
| ---------------------- | ------------------------------------------------------ |
| `app-src/index.ts`     | 窗口/FusionUI 对象树、帧循环、输入处理、HUD 绘制       |
| `app-src/recipe.ts`    | 纯状态机（时间注入、步骤推进、倒计时、跳过、循环）     |
| `app-src/storage.ts`   | `FUSIONUI_APP_DATA_DIR` 下的持久化                     |
| `tests/recipe.test.ts` | `node --test` 单元测试，覆盖跨步骤、循环、跳过与倒计时 |
| `src/XRManifest.xml`   | 随包清单                                               |
| `src/index.js`         | `ivt build` 生成，不提交                               |

## 构建与运行

```bash
# 工作区根目录
vp run app:build
vp run app:test
vp run app:package
vp run app:run          # 关闭窗口或 Ctrl+C 结束
vp run sim:smoke        # 端到端验收，等待第一帧
```

应用 ID 为 `com.example.kitchenhelper`，版本 `1.0.0` / versionCode `1`。修改版本内容后递增
`FusionUIApp.json` 的 `versionCode` 再打包；本地调试可用
`ivt run --latest --allow-debug-replace` 同版本覆盖（保留应用数据）。
