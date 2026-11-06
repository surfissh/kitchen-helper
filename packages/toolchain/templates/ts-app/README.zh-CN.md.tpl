# __APP_NAME__

[English](README.md) | 中文

由 `ivt` 工具链创建的 TypeScript IrisView 应用。

## 构建方式

| 路径               | 用途                                                       |
| ------------------ | ---------------------------------------------------------- |
| `app-src/`         | TypeScript 源码（入口：`app-src/index.ts`）。              |
| `app-src/app.ts`   | 可单元测试的纯逻辑。                                       |
| `src/`             | 随包资源（`XRManifest.xml`）以及生成的构建产物。          |
| `src/index.js`     | `ivt build` 生成的 CommonJS 入口，不要手工修改。           |
| `FusionUIApp.json` | 应用 ID、版本与能力声明。                                  |
| `tests/`           | `node --test` 运行 TypeScript 测试。                       |

打包器会保留 `@irisview/osx/*` 与 Node 内置模块为外部引用，由 Client 在运行时提供；
其余代码打包进 `src/index.js`。

## 常用命令

```bash
ivt build       # tsc 类型检查 + 打包 app-src/index.ts -> src/index.js
ivt test        # 单元测试 + SDK 源码校验
ivt package     # SDK 构建与 .fuiapp 打包（默认 debug-unsigned）
ivt run --latest
```

如果 Developer Kit 不在工作区旁边，请设置 `IRISVIEW_KIT_ROOT`。在 Fedora 等非 Ubuntu
主机上，工具链会在内存中替换宿主检查；详见工具链 `docs/fedora-compatibility.md`。

## 持久数据

应用私有文件放在 `FUSIONUI_APP_DATA_DIR` 指向的目录（见 `app-src/storage.ts`）；
临时文件使用 `os.tmpdir()`。不要从安装目录推导路径。
