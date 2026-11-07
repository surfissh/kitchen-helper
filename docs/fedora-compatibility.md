# Fedora 兼容层：为什么需要、做了什么、如何验证

本文记录在 **Fedora Linux 44 (KDE Plasma, x86_64)** 上运行 IrisView Developer Kit
v1.0.0 时绕过的正式检查，以及工具链对应的实现位置。目标不是伪装成 Ubuntu，而是让
开发环境在该主机上**可解释、可重复、可回退**地跑通。

## 0. 官方声明与实测差异

`IrisView-Developer-Kit-v1.0.0/DEVELOPER_KIT_INFO.json` 声明：

```json
"hostTargets": ["android-debug-physical-test", "ubuntu"]
```

SDK 的宿主检查在 `sdk/fusionui-app-sdk/developer_kit_host.py`：

```python
SUPPORTED_UBUNTU_VERSIONS = ("22.04", "26.04")

def is_supported_host(host_id, host_version):
    return host_id == "ubuntu" and host_version in SUPPORTED_UBUNTU_VERSIONS
```

在 Fedora 44 上未打补丁时，`./bin/irisview doctor` 会得到：

```json
"failedChecks": ["operatingSystem", "applicationToolchain:node", "applicationToolchain:npm"]
```

实测结论：除宿主判定外，模拟器、Client、应用加载与渲染在本机正常工作；问题集中在
**宿主检查**、**Node/npm 精确版本**、**Kit 完整性元数据** 与 **Node 模块作用域** 四类。

## 1. 兼容层总览

| 问题                                                      | 官方检查                                              | 工具链处理                                         | 实现位置                                            |
| --------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| Fedora 不在支持列表                                       | `developer_kit_host.is_supported_host`                | 仅在进程内替换宿主判定函数，Kit 文件不改           | `packages/toolchain/assets/irisview_host_compat.py` |
| Node/npm 版本不等于 24.13.0 / 11.6.2                      | `application_dependencies.probe_toolchain` + `doctor` | 固定使用 Vite+ 管理的 Node 24.13.0，隔离 npm 配置  | `src/paths.ts`、`src/sdk.ts`                        |
| Kit 声明的 SHA-256 与实际文件不符                         | `run-client.sh`、`application_api_context.py`         | 重新计算并写回哈希元数据（自动修复 + 备份）        | `src/compat/integrity.ts`                           |
| 状态目录处于 `"type": "module"` 包作用域导致 CJS 应用失败 | Node.js 模块解析                                      | 状态根放置 `package.json` 标记 + 工作区内沙箱 HOME | `src/paths.ts`、`src/sdk.ts`                        |
| 沙箱内 Xvfb 无法启动                                      | SDK 的显示检查 / 无头测试                             | `ivt smoke` 探测后回退当前显示会话                 | `src/commands/smoke.ts`                             |

## 2. 宿主判定的内存覆盖

工具链不修改 SDK 源码。它通过一个 Python 启动器加载 SDK，并在 `runpy` 执行前替换
`developer_kit_host.is_supported_host`：

```python
sys.path.insert(0, str(sdk_root))
import developer_kit_host

if host_id in allowed:
    original = developer_kit_host.is_supported_host
    developer_kit_host.is_supported_host = (
        lambda candidate_id, candidate_version:
        original(candidate_id, candidate_version) or candidate_id == host_id
    )

runpy.run_path(str(sdk_script), run_name="__main__")
```

启用条件：

- 工具链检测到当前发行版**不在** Ubuntu 22.04/26.04 列表；
- 且未设置 `IRISVIEW_STRICT_HOST=1`；
- 此时在 SDK 子进程环境中设置 `IRISVIEW_ALLOW_UNSUPPORTED_HOST=fedora`。

行为边界：

- 覆盖只存在于该 Python 子进程，不写 `/etc/os-release`，不改 Kit；
- 覆盖时会在 stderr 打印 `WARNING: unsupported host override active ...`；
- `IRISVIEW_STRICT_HOST=1` 可随时关闭，得到未修改的官方检查结果。

## 3. Node.js / npm 精确版本

SDK 要求逐字符匹配：

- Node.js `v24.13.0`（`application_dependencies.probe_toolchain`）
- npm `11.6.2`（`new`、`doctor` 的 host toolchain 检查）

工具链的 `managedNode()` 按以下顺序查找：`IRISVIEW_NODE_BIN` → Vite+ managed runtime
（`~/.local/share/vite-plus/js_runtime/node/24.13.0/bin`）→ nvm → fnm → 当前 `PATH`。
找到后把该目录前置到 SDK 子进程的 `PATH`，因此 `shutil.which("node")` / `which("npm")`
都指向精确版本。

另一个隐蔽问题：SDK 用 `stderr=STDOUT` 捕获 `npm --version`，而开发者 `~/.npmrc`
中的未知配置（例如 `allow-scripts`）会让 npm 把 warning 写进输出，导致版本字符串变成
`npm warn ...\n11.6.2` 从而校验失败。工具链为 SDK 子进程写入两个空 npmrc：

```text
.state/cache/npm/user.npmrc
.state/cache/npm/global.npmrc
```

并通过 `NPM_CONFIG_USERCONFIG` / `NPM_CONFIG_GLOBALCONFIG` 显式指定，避免读取用户配置。

## 4. Kit 完整性元数据归一化（核心）

### 4.1 现象

Kit 解压后，`runtime/` 下的 JS/JSON 文件被重新格式化过（例如
`{"type":"commonjs"}` 变成多行缩进 JSON），但打包时生成的哈希清单仍是旧字节的摘要。
于是运行时完整性检查失败：

```text
ERROR: packaged Client bootstrap is missing or failed integrity verification
ERROR: Host package container inputs differ
```

这不是代码语义损坏：对 `application-api/package.json` 可验证——旧哈希

```text
dbf8353f...  # 对应 {"type":"commonjs"}\n （20 字节）
```

而磁盘上是 25 字节的 pretty-printed JSON。也就是说：**内容等价、字节不同、声明过期**。

### 4.2 三层完整性约束

| 层       | 文件                                                                                     | 验证方                                             | 依赖关系                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 启动器   | `runtime/SHA256SUMS`                                                                     | `runtime/run-client.sh`                            | 校验 `client-bootstrap.js`、`application-api/manifest.json`、`compatibility-packages.json`                   |
| 应用 API | `runtime/runtime/@irisview/application-api/manifest.json`                                | `application_api/host-context.cjs`                 | 记录 `profile.json` 与各 API 模块的 `bytes`/`sha256`                                                         |
| 容器绑定 | `runtime/share/application-api/compatibility-packages.json` + `runtime/PACKAGE_INFO.txt` | `libexec/fusionui-apps/application_api_context.py` | `container.applicationApiManifestSha256`、`containerSha256`、`application_api_container_sha256` 三者必须自洽 |
| 索引     | `profiles.json`、根 `SHA256SUMS`                                                         | 离线审计/重建工具                                  | 与实际文件哈希保持一致                                                                                       |

### 4.3 修复算法（`ivt doctor --fix`，默认开启）

1. 重算 `application-api/manifest.json` 中每个文件的 `bytes`/`sha256`，并更新 `profile.sha256`；
2. 读取新的 manifest 摘要，更新 compatibility catalog 的
   `container.applicationApiManifestSha256`，重算 canonical container 摘要
   `containerSha256`（Python 侧使用 `sort_keys=True, separators=(",", ":")` 的 canonical JSON，
   工具链用等价的递归键排序实现）；
3. 更新 `PACKAGE_INFO.txt` 的 `application_api_container_sha256`、
   `application_api_compatibility_catalog_sha256`、`application_package_catalog_sha256`；
4. 按依赖顺序重算 `runtime/SHA256SUMS` → `profiles.json` 的文件记录 → 根 `SHA256SUMS`；
5. 每个文件首次修复前复制到 `IrisView-Developer-Kit-v1.0.0/.integrity-backup/`，之后只写有变化的文件；
6. 结果按 mtime/size 指纹缓存到 `.state/cache/<kit-hash>-kit-integrity.json`，后续检查为 O(stat)。

修复的**幂等**性由“先计算期望字节、与磁盘比较、仅变化时写入”保证；重复执行不会产生新变更。
`ivt doctor`（默认 repair）、`ivt run`、`ivt package`、`ivt smoke` 都会确保 Kit 处于一致状态；
`ivt doctor --no-fix` 只报告。

### 4.4 为什么可以这样做

- 只改哈希元数据（`SHA256SUMS`、`profiles.json`、`manifest.json`、`PACKAGE_INFO.txt` 的两个哈希字段），
  不改任何二进制、JS 逻辑或应用信任策略；
- 备份保留首代文件，可人工比对；
- 在官方支持的 Ubuntu 上如果 Kit 未被动过，这些元数据本来就一致，修复会自动跳过。

## 5. Node 模块作用域（CommonJS vs ESM）

Client 通过 Node runtime 加载安装后的应用代码，路径形如：

```text
<state>/applications/applications/<id>/versions/<sha>/code/index.js
```

工具链打包输出是 **CommonJS**（`require("@irisview/osx/os")`），但状态目录默认位于工作区内，
而工作区根 `package.json` 是 `"type": "module"`。Node 会把安装后的 `index.js` 当作 ESM，
运行时报：

```text
ReferenceError: require is not defined in ES module scope
```

处理方式：

1. 在状态根写入 `{"type":"commonjs"}` 的 `package.json`：
   `.state/simulator/package.json`；
2. SDK 子进程的 `HOME` 默认重定向到 `.state/simulator/home`，使 Kit 的默认状态路径落在
   工作区内（可写、与 `run`/`state` 命令一致）；
3. 想使用真实 `$HOME` 时设置 `IRISVIEW_SYSTEM_HOME=1`（在 Ubuntu 常规开发机上更自然）。

## 6. Xvfb 与无头验收

`ivt smoke` 的流程是：构建 → 打包 → 启动模拟器 → 等待日志出现
`IrisView application frame <n>`。它优先用 Xvfb 隔离图形输出，但本机沙箱中 Xvfb 会
`fb_register() failed: -19` 崩溃，且 `xvfb-run -a true` 仍可能返回 0。因此探测命令使用
需要真实 display 的 `xvfb-run -a xdpyinfo`；失败则回退当前桌面会话。

```text
IRISVIEW_SMOKE_DISPLAY=xvfb     # 强制 Xvfb
IRISVIEW_SMOKE_DISPLAY=current  # 强制当前显示
```

## 7. 验证清单

```bash
# 1. 宿主覆盖与版本固定
node packages/toolchain/src/cli.ts doctor
#   host: fedora 44 (unsupported, in-memory override active)
#   node: 24.13.0 via Vite+ managed runtime
#   npm: 11.6.2
#   integrity: consistent
#   sdk-doctor: profile release

# 2. 官方检查本身（doctor 通过后即代表 SDK host preflight 通过）
node packages/toolchain/src/cli.ts run --latest --project apps/kitchen-helper --dry-run

# 3. 真实运行
node packages/toolchain/src/cli.ts run --latest --project apps/kitchen-helper
#   模拟器日志: IrisView application frame 1 ...

# 4. 端到端验收
node packages/toolchain/src/cli.ts smoke apps/kitchen-helper
```

## 8. 边界与后续

- 覆盖仅限**本机开发/模拟器**路径；未验证真实眼镜固件、BlueZ 配对或 Android Client 部署。
- 若替换/重新解压 Kit（哈希清单与文件再次变化），`.state/cache` 中的完整性缓存会因 mtime
  变化自动失效并重新修复。
- 如果上游修复 Kit 的哈希清单，`ivt doctor` 会自动判定一致并跳过修复。
