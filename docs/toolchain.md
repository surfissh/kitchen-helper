# 工具链参考

`@kitchen-helper/ivt` 是工作区内的 TypeScript 工具链，入口为
`packages/toolchain/src/cli.ts`。Node.js 24 可直接执行 TypeScript（类型擦除），因此无需
预编译即可使用；对外命令名约定为 `ivt`。

## 安装与调用

```bash
# 直接从仓库运行
node packages/toolchain/src/cli.ts <command>
# 或通过 package.json 脚本 / Vite Task
vp run doctor
# 或把 CLI 暴露为全局命令（示例）
npm link packages/toolchain   # bin: ivt -> src/cli.ts
```

## 命令

### `ivt doctor [project] [--fix|--no-fix] [--json]`

检查宿主、Kit 身份、Node/npm 固定版本、显示会话、状态目录可写性、Kit 完整性，并调用
官方 SDK 的 `doctor`。默认自动修复 Kit 哈希元数据；`--no-fix` 只报告。

### `ivt new <directory> --id <app.id> --name <en> [--name-zh <zh>] [--no-git]`

生成 TypeScript 应用：

```text
<dir>/
├── app-src/
│   ├── index.ts          # 入口：窗口、FusionUI 树、生命周期、帧循环
│   ├── app.ts            # 纯逻辑（可单测）
│   ├── storage.ts        # FUSIONUI_APP_DATA_DIR 持久化
│   └── node-shim.d.ts    # 无 @types/node 时的最小声明
├── src/XRManifest.xml    # 随包资源；构建产物 src/index.js 也在这里
├── tests/app.test.ts     # node --test
├── FusionUIApp.json
├── fusionui.config.json
├── package.json
└── tsconfig.json         # paths 指向 Kit 的 public-api
```

默认会在目录内 `git init` 并提交一次；如果目录已位于某个 Git worktree 中，则复用其
`HEAD`（打包时 SDK 需要可追溯的源码 revision）。

### `ivt build [project] [--json]`

1. `tsc -p tsconfig.json --noEmit`；
2. Vite/Rolldown 以 library 模式打包 `app-src/index.ts` → `src/index.js`：
   - format: `cjs`，target: `node24`
   - external: `@irisview/osx/*`、`@fusionui/*`、`FusionUISimulatorBinding`、Node 内置模块
   - 输出单文件，便于 SDK 原样复制进 `.fuiapp`

### `ivt test [project]`

类型检查 → 打包 → 运行 `tests/**/*.test.{ts,js}`（`node --test`）→ 调用 SDK
`irisview test` 校验 `src/` 中的 JavaScript 语法与工程元数据。

### `ivt package [project]`

`build`（默认）→ SDK `build`（生成 `dist/{linux,android}`）→ SDK `package`（默认
`--debug-unsigned`，可用 `--signed --signing-key --key-id` 生成签名包）→ SDK `verify`。
默认输出 `<project>/artifacts/<id>-<versionCode>.fuiapp`，并写 `<project>/.ivt/latest.json`
供 `--latest` 使用。

### `ivt verify [package] [--latest] [--allow-debug-unsigned] [--trusted-key <id=path>]`

调用 SDK `verify`。调试包需要 `--allow-debug-unsigned`。

### `ivt run [package] [--latest --project <dir>]`

确保 Kit 一致性后调用 SDK `run`。常用参数：

| 参数                    | 默认      | 说明                                                    |
| ----------------------- | --------- | ------------------------------------------------------- |
| `--profile`             | `release` | `release` / `diagnostic`                                |
| `--display-mode`        | `mono`    | `mono` / `stereo`                                       |
| `--audio-mode`          | `desktop` | `desktop` / `silent`                                    |
| `--port`                | `28045`   | 模拟器 TCP 端口                                         |
| `--state-dir`           | 未指定    | 隔离的模拟器状态目录（绝对路径，或相对当前目录）        |
| `--allow-debug-replace` | on        | 同 versionCode 替换已安装调试应用（重新打包后默认可用） |
| `--no-replace`          | off       | 严格拒绝同 versionCode 的字节变化                       |
| `--dry-run`             | off       | 打印启动计划，不启动模拟器                              |

`run` 是阻塞式会话：关闭 Client 窗口或按 Ctrl+C 结束。

`--state-dir` 会创建/复用一整套隔离的模拟器状态（应用安装信息、应用私有数据、运行数据、
日志与缓存），对应平台文档《模拟器数据区域的指定与读取》。应用本身不解析该参数，而是通过
Host 提供的 `FUSIONUI_APP_DATA_DIR` 私有目录读写数据；所以同一 `--state-dir` 下的应用数据
会一直保留，换一个目录就得到全新的隔离环境。工具链会在该目录根部写入
`{"type": "commonjs"}` 的 `package.json` 标记——否则当状态目录位于 `"type": "module"` 的
项目内时，Client 加载已安装的 CommonJS 入口会报
`require is not defined in ES module scope`。示例：

```bash
# 项目内隔离状态目录：首次运行会创建它，之后复用
node packages/toolchain/src/cli.ts run --latest \
  --project apps/kitchen-helper \
  --state-dir apps/kitchen-helper/sim-state
```

### `ivt dev [project]`

`build` → SDK `build` → SDK `package` → SDK `run` 一条龙，适合日常“改代码 → 看效果”。
`ivt dev` 同样支持 `--state-dir`。

### `ivt smoke [project] [--timeout <s>] [--profile release|diagnostic]`

端到端验收：构建、打包、在 Xvfb（可用时）或当前显示会话中启动模拟器，等待日志出现
`IrisView application frame <n>`。通过时退出码为 0，可直接用于 CI。

### `ivt state <path|status|reset|adopt>`

委托 SDK `state`；状态默认位于 `.state/simulator/home/IrisView-Developer-Kit-Data/...`。
`reset` 需要 `--force`，`--scope profile|shared` 选择重置范围。

### `ivt deploy` / `ivt uninstall`

原样透传 SDK 参数（`--host ubuntu|android`、`--client-root`、`--serial`、
`--trusted-key`、`--dry-run` 等），用于真实 Client 安装/卸载。

## 环境变量

| 变量                     | 作用                                           |
| ------------------------ | ---------------------------------------------- |
| `IRISVIEW_KIT_ROOT`      | 指定 Developer Kit 根目录（默认自动发现）      |
| `IRISVIEW_NODE_BIN`      | 指定 Node.js 24.13.0 的 bin 目录或可执行文件   |
| `IRISVIEW_PYTHON`        | Python 解释器（默认 `python3`）                |
| `IRISVIEW_STATE_DIR`     | 工具链状态根（默认 `<repo>/.state/simulator`） |
| `IRISVIEW_SYSTEM_HOME=1` | SDK 使用真实 `$HOME`，而不是沙箱 HOME          |
| `IRISVIEW_STRICT_HOST=1` | 关闭非 Ubuntu 宿主覆盖，得到官方检查结果       |
| `IRISVIEW_SMOKE_DISPLAY` | `xvfb` 或 `current`，强制 smoke 的显示后端     |
| `IRISVIEW_VERBOSE=1`     | 输出更详细日志与错误堆栈                       |
| `IRISVIEW_QUIET=1`       | 静默进度输出                                   |

## 状态目录布局

```text
.state/
├── simulator/
│   ├── package.json     # {"type":"commonjs"}：修正 Node 模块作用域
│   ├── home/            # SDK 的沙箱 HOME；Kit 默认状态、模拟器数据都在这里
│   ├── tmp/             # SDK 子进程 TMPDIR
│   └── smoke/           # `ivt smoke` 的隔离状态与日志
└── cache/
    ├── npm/             # 空 user/global npmrc，避免用户配置污染 SDK 校验
    └── *-kit-integrity.json  # Kit 完整性指纹缓存
```

## 添加第三方依赖

应用工程可以正常使用 npm 依赖：

```bash
npm install --save-exact ky@1.7.5
```

构建时 Vite/Rolldown 会把运行时代码打进 `src/index.js`。SDK 只复制 `src/`，不会自动复制
根目录 `node_modules`；需要随包的资源/许可证放入 `src/`。动态 `require`、浏览器 API 或原生
addon 需在目标 Client 运行环境中实测。

## 与 Vite+ 的集成

- `vite.config.ts` 配置了 `fmt`/`lint` 忽略 Kit 与文档包，避免格式化再次破坏 Kit 哈希；
- `vp test` 运行工具链单元测试；`vp check` 执行格式、lint 与类型检查；
- `vp run app:build|app:test|app:package|app:run` 复用 `package.json` 脚本；
- Vite Task 额外提供 `sim:smoke` 与 `kit:repair`。

## 排错

| 现象                                                                    | 处理                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Node.js 24.13.0 is required ...`                                       | 安装 `.node-version` 指定版本，或设置 `IRISVIEW_NODE_BIN`                                                                 |
| `Developer Kit integrity metadata is stale`                             | 运行 `ivt doctor`（默认修复）或 `vp run kit:repair`                                                                       |
| `packaged Client bootstrap is missing or failed integrity verification` | 同上；确认没有第三方工具重新格式化了 Kit                                                                                  |
| `Host package container inputs differ`                                  | 同上；见 [fedora-compatibility.md](fedora-compatibility.md#4-kit-完整性元数据归一化核心)                                  |
| `require is not defined in ES module scope`                             | 状态目录必须位于带 `{"type":"commonjs"}` 的 `package.json` 之下；不要手动把 `IRISVIEW_STATE_DIR` 指到 `type: module` 包内 |
| `TCP port is already in use`                                            | 结束上一次模拟器会话，或换 `--port`                                                                                       |
| 模拟器窗口不出现                                                        | 检查 `DISPLAY`/`WAYLAND_DISPLAY`；无头环境尝试 `ivt smoke`                                                                |
| 打包提示没有 Git revision                                               | 在应用工程中提交源码，或 `--source-revision <sha> --source-state clean                                                    | dirty` |
