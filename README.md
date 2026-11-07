# Kitchen Helper — IrisView AR 眼镜 TypeScript 开发工具链

基于工作区内 **IrisView Developer Kit v1.0.0**（`IrisView-Developer-Kit-v1.0.0/`）与
**IrisView 平台开发文档**（`IrisView-Platform-Alpha-中英双语版-v3/`）构建的 TypeScript
开发工具链。目标应用是运行在 IrisView Client / 模拟器中的 FusionUI AR 应用；工具链把
官方文档里手工的 `tsc + esbuild` 流程自动化，并在 **Fedora 44** 上完成了从脚手架、类型检查、
打包到模拟器呈现真实帧的端到端验证。

工具链本身用 TypeScript 编写（`packages/toolchain`），可直接由 Node.js 24 运行；应用侧
TypeScript 通过 Vite/Rolldown 打包为 Client 需要的 CommonJS 入口。

## 功能

| 能力                                 | 说明                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `ivt new`                            | 创建 TypeScript 应用：`app-src/` 源码、`src/XRManifest.xml`、类型声明映射、单测骨架   |
| `ivt build`                          | `tsc --noEmit` + Vite/Rolldown 打包成 `src/index.js`（CJS，`@irisview/osx/*` 外部化） |
| `ivt test`                           | 类型检查 + `node --test` 运行 TS 单测 + SDK 源码校验                                  |
| `ivt package` / `ivt verify`         | 调用 Developer Kit SDK 生成并校验 `.fuiapp` 应用包                                    |
| `ivt run` / `ivt dev`                | 在模拟器中安装并运行应用（dev = build + package + run）                               |
| `ivt smoke`                          | 端到端验收：构建、打包、启动模拟器并等待真实应用帧出现                                |
| `ivt doctor`                         | 环境自检，并在必要时修复 Kit 完整性元数据（见下文）                                   |
| `ivt state` / `deploy` / `uninstall` | 委托官方 SDK 的对应命令                                                               |

## 环境要求

| 依赖             | 版本 / 说明                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| Node.js          | **24.13.0**（工具链会自动使用 Vite+ 管理的 runtime，见 `.node-version`） |
| npm              | **11.6.2**（随 Node 24.13.0；SDK 会严格校验）                            |
| Python 3         | 运行官方 SDK（`python3`）                                                |
| IrisView Kit     | `IrisView-Developer-Kit-v1.0.0/`，可用 `IRISVIEW_KIT_ROOT` 指定其他位置  |
| 图形会话         | `DISPLAY` 或 `WAYLAND_DISPLAY`；`ivt smoke` 在 Xvfb 可用时优先使用 Xvfb  |
| 操作系统（官方） | Ubuntu 22.04 / 26.04 x86_64（Fedora 44 已实测可用，见兼容层）            |

> **Fedora 说明**：Kit 只声明支持 Ubuntu，本工具链通过内存中的宿主判定覆盖、Node/npm 精确固定、
> Kit 完整性元数据归一化等方式跳过正式检查。官方 Kit 目录本身保持原样（完整性修复只重写哈希元数据，
> 且首代文件备份在 `IrisView-Developer-Kit-v1.0.0/.integrity-backup/`）。完整原理见
> [docs/fedora-compatibility.md](docs/fedora-compatibility.md)。

> **离线环境说明**：本工作区已预置 `node_modules`（含 TypeScript 7、Vite+ 1.5、Vite/Rolldown），
> 可直接运行上述命令，无需联网安装。联网后可执行 `vp install` 刷新锁文件（`pnpm-workspace.yaml`
> 已声明 `packages/*`、`apps/*` 两个 workspace 成员）；离线沙箱内 pnpm store 为只读，安装会被拒绝。

## 快速开始

```bash
# 1. 环境自检（首次运行会修复 Kit 中被重新格式化文件失效的哈希元数据）
node packages/toolchain/src/cli.ts doctor

# 2. 构建工作区自带的 Kitchen Helper 示例应用
node packages/toolchain/src/cli.ts build apps/kitchen-helper
node packages/toolchain/src/cli.ts test apps/kitchen-helper
node packages/toolchain/src/cli.ts package apps/kitchen-helper

# 3. 在模拟器中运行（关闭 Client 窗口或 Ctrl+C 结束）
node packages/toolchain/src/cli.ts run --latest --project apps/kitchen-helper

# 4. 无人值守端到端验收：等待模拟器呈现第一帧
node packages/toolchain/src/cli.ts smoke apps/kitchen-helper
```

也可以使用 Vite Task（`package.json` 脚本与 Vite Task 均可）：

```bash
vp run doctor
vp run app:build
vp run app:package
vp run app:run
vp run sim:smoke        # 端到端验收
vp run kit:repair       # 强制修复 Kit 哈希元数据
```

创建一个新项目：

```bash
node packages/toolchain/src/cli.ts new ../my-ar-app \
  --id com.example.myapp --name "My AR App" --name-zh "我的 AR 应用"
cd ../my-ar-app
ivt build && ivt test && ivt package && ivt run --latest
```

## 仓库结构

```text
.
├── packages/toolchain/           # @kitchen-helper/ivt：TypeScript 工具链
│   ├── src/
│   │   ├── cli.ts                # 命令入口（node 直接运行 TS）
│   │   ├── commands/             # doctor/new/build/test/package/run/dev/smoke/state...
│   │   ├── compat/integrity.ts   # Developer Kit 完整性元数据检查与修复
│   │   ├── sdk.ts                # 官方 Python SDK 桥接、Node/npm 固定、宿主兼容环境
│   │   ├── build.ts              # tsc 类型检查 + Vite/Rolldown CJS 打包
│   │   ├── scaffold.ts           # TS 应用脚手架
│   │   └── project.ts            # 应用工程模型与校验
│   ├── assets/irisview_host_compat.py  # 非 Ubuntu 宿主判定的内存覆盖器
│   ├── templates/ts-app/         # `ivt new` 模板
│   └── tests/                    # Vitest 单元测试
├── apps/kitchen-helper/          # 示例 AR 应用（TypeScript，完整通过 SDK 打包与模拟器验证）
│   ├── app-src/                  # TS 源码（recipe 状态机 + HUD 渲染 + 持久化）
│   ├── src/                      # XRManifest.xml + 构建产物 index.js
│   └── tests/                    # node --test 单元测试
├── docs/
│   ├── fedora-compatibility.md   # Fedora 兼容层原理与验证
│   └── toolchain.md              # CLI、构建流水线、状态目录、环境变量
├── vite.config.ts                # Vite+ 格式/检查/任务配置
└── tsconfig.json                 # 工具链类型检查配置
```

## 构建流水线

官方 SDK 不编译 TypeScript，也不执行 npm scripts；它接收“已经构建好的 JavaScript 源码目录”。
工具链据此分成两个阶段：

```text
app-src/index.ts ──tsc --noEmit──> 类型检查
        │
        └──Vite/Rolldown(bundle, CJS, node24)──> src/index.js
                                                  │
              src/XRManifest.xml + 资源 ─────────┤
                                                  ▼
                        irisview build   → dist/{linux,android}/
                        irisview package → *.fuiapp (debug-unsigned / signed)
                        irisview run     → 模拟器安装、启动、呈现应用帧
```

打包时 `@irisview/osx/*`、`@fusionui/*` 与 Node 内置模块保持为运行时外部引用（由 Client 提供），
其余应用模块和第三方库被打进 `src/index.js`；这与文档中 `esbuild --external:@irisview/osx/*`
的约定一致，但不需要在应用工程里安装 esbuild。

## 验证结果（Fedora 44）

| 检查项                                      | 结果                                            |
| ------------------------------------------- | ----------------------------------------------- |
| `ivt doctor`                                | pass（host override active，Node/npm 精确匹配） |
| `ivt build apps/kitchen-helper`             | pass（类型检查 + 10.6 KiB CJS bundle）          |
| `ivt test apps/kitchen-helper`              | pass（1 个测试文件 + SDK 源码校验）             |
| `ivt package apps/kitchen-helper`           | pass（`.fuiapp`，debug-unsigned，9.0 KiB）      |
| `ivt verify --latest`                       | pass（结构与信任关系校验）                      |
| `ivt smoke apps/kitchen-helper`             | pass（`IrisView application frame 1`）          |
| `ivt new` + build/test/package/verify/smoke | pass（脚手架应用同样在模拟器呈现第一帧）        |
| `vp test` / `vp check` / `vp run app:build` | pass                                            |

示例应用运行日志（模拟器侧）：

```text
KITCHEN_READY com.example.kitchenhelper cycles=1
IrisView application frame 1: content=1 leftHash=992788b4 rightHash=992788b4 leftLit=307200 rightLit=307200
```

## 已知限制

- 非 Ubuntu 主机属于**未声明支持**路径：本工具链只覆盖运行与调试所需检查，真实眼镜/Android
  Client 的部署仍应在官方支持的 Ubuntu 环境或厂商支持的 Client 上验证。
- Kit 完整性修复会重写 `SHA256SUMS`、`profiles.json`、`application-api/manifest.json`、
  `PACKAGE_INFO.txt` 与 compatibility container 哈希字段；不改动二进制与 JS 语义，首次修复前
  备份原始文件。详见兼容性文档。
- 模拟器会话不支持热重载；修改代码后重新执行 `ivt dev`（或 build/package/run）。
- `ivt smoke` 在本机沙箱中 Xvfb 不可用时会回退到当前图形会话；CI 中请确保 Xvfb 可用或使用
  带显示器的 runner。
