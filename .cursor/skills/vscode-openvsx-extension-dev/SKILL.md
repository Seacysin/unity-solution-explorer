---
name: vscode-openvsx-extension-dev
description: Develops VS Code-compatible extensions, packages VSIX, wires contributes.configuration, and publishes to Open VSX with Eclipse authentication. Use when the user works on VS Code or Cursor extensions, VSIX packaging, ovsx CLI, Open VSX, Eclipse publisher agreement, package.json contributes, vsce, extension marketplace release, or create-namespace publish errors.
---

# VS Code / Open VSX 扩展开发

面向本仓库（TypeScript 扩展 + `vsce` 打包 + Open VSX 发布）的可复用流程。实现新功能时优先对齐现有 `package.json`、`src/` 与 `.vscodeignore` 约定。

## 1. 基础开发流程

1. **环境**：安装 **Node.js**（含 npm）。扩展逻辑为 **TypeScript/JavaScript**；与 Unity/C# 宿主工程解耦，**不必**为纯 TS 扩展再装 .NET SDK。
2. **初始化**：可用官方脚手架 `yo code`，或采用本仓库式手写结构：`package.json` + `src/extension.ts` + `tsconfig.json`。
3. **依赖与编译**：
   - `npm install`
   - `npm run compile` 或 `npm run watch`（`tsc` 输出到 `out/`）
4. **调试**：在 Cursor/VS Code 中打开扩展工程 → **运行和调试** → 选择 **Extension Development Host**。`launch.json` 典型配置：`type: extensionHost`，`request: launch`，`args: ["--extensionDevelopmentPath=${workspaceFolder}"]`，`outFiles: ["${workspaceFolder}/out/**/*.js"]`。
5. **打包 VSIX**：
   - `package.json` 中保留 `"vscode:prepublish": "npm run compile"`，确保 `vsce package` / 发布前会先编译。
   - 使用 `@vscode/vsce`：例如 `"package": "vsce package --no-dependencies"`（无运行时 npm 依赖时可用 `--no-dependencies` 减小包体；按需调整）。
6. **本地验证**：扩展视图 → `...` → **从 VSIX 安装** → 选择生成的 `*.vsix` → 按提示重载窗口。

## 2. 使用配置参数控制插件功能

1. **声明**：在 `package.json` 的 `contributes.configuration` 里定义 `properties`。每项提供 `type`、`default`、**`description`**（设置 UI 与搜索依赖）；顶层 `title` 为设置分组标题。
2. **读取**：`vscode.workspace.getConfiguration('<节名>').get('<键名>', 默认值)`。节名常为扩展前缀（本仓库为 `unitySolutionExplorer`）。
3. **工作区 JSON + 用户设置（本仓库模式）**：除用户/工作区设置外，可在 `.vscode/<扩展短名>.json` 读取 JSON，与 `getConfiguration` 结果合并（例如用 `Set` 合并列表）。文件不存在或 JSON 无效时回退，避免抛错打断激活。
4. **热更新（可选）**：订阅 `vscode.workspace.onDidChangeConfiguration`，用 `e.affectsConfiguration('节名')` 判断后刷新树或缓存。
5. **文档**：README 中的「设置」说明应与各属性的 `description` 及设置里可搜到的文案一致。

**清单示例**（节名 `unitySolutionExplorer`，键 `excludeProjects`）：

```json
"configuration": {
  "title": "Unity Solution Explorer",
  "properties": {
    "unitySolutionExplorer.excludeProjects": {
      "type": "array",
      "items": { "type": "string" },
      "default": [],
      "description": "不在 Solution Explorer 中显示的项目（程序集）名称列表，可与工作区 JSON 合并"
    }
  }
}
```

**读取**：`(vscode.workspace.getConfiguration('unitySolutionExplorer').get<string[]>('excludeProjects')) ?? []`，再与工作区文件中的数组合并（见 `src/config.ts` 中的 `getExcludeProjects` 模式）。

## 3. 插件说明、名字与更新说明

| 用途 | 位置 |
|------|------|
| 扩展 ID（小写、无空格） | `package.json` → `name` |
| 市场显示名称 | `displayName` |
| 列表简短说明 | `description` |
| 语义化版本 | `version` |
| 发布者 / Open VSX 命名空间 | `publisher`（须与 Open VSX 上命名空间一致） |
| 扩展图标 | `icon`（如 `resources/icon.png`） |
| 分类 | `categories` |
| 详情与截图 | 根目录 `README.md` |
| 版本更新说明 | 根目录 `CHANGELOG.md`（按版本分节，条目用列表） |
| 源码与问题 | `repository`、`bugs`、`homepage`（推荐） |

**发布前习惯**：递增 `version` → 在 `CHANGELOG.md` 顶部追加该版本要点 → `npm run compile` → `vsce package` 或 `ovsx publish`。

## 4. 项目必须文件与典型结构

```
extension-root/
├── package.json          # main、engines、activationEvents/contributes、scripts
├── tsconfig.json         # rootDir: src, outDir: out
├── src/
│   └── extension.ts      # activate / deactivate
├── out/                  # 编译产物；package.json 的 main 指向此处 .js
├── .vscodeignore         # 排除 src、tsconfig、*.map、node_modules 等
├── README.md
├── CHANGELOG.md
├── LICENSE
├── resources/            # 可选：图标、市场截图
└── .vscode/
    ├── launch.json       # 可选：Extension Development Host
    └── *.json.example    # 可选：工作区配置示例
```

**要点**：

- `main` 必须指向**已编译**的 `./out/extension.js`（或等价路径），不要指向 `.ts`。
- `engines.vscode` 标明最低支持的编辑器版本。
- `activationEvents`（或新版 `activation`）决定何时加载扩展；避免过度 eager 激活。
- `.vscodeignore` 与打包内容：缺少时易把源码与 `node_modules` 打进 VSIX，体积过大或不符合预期。

## 5. 使用 Eclipse 授权在 Open VSX 发布

Open VSX 由 **Eclipse 基金会**运营。完整政策与 CLI 细节见官方 Wiki：<https://github.com/eclipse/openvsx/wiki/Publishing-Extensions>

**推荐流程**：

1. 注册 **Eclipse 账户**：<https://accounts.eclipse.org/user/register>。若使用 **GitHub** 登录 Open VSX，建议 Eclipse 资料中的 GitHub 用户名与实际账号一致。
2. 访问 <https://open-vsx.org>，**GitHub 登录**，完成与 Eclipse 的关联，签署 **Publisher Agreement**。
3. 在站点中创建 **Personal Access Token**。不要将 token 写入仓库；可使用环境变量 `OVSX_PERSONAL_ACCESS_TOKEN`，或命令行 `-p <token>`。
4. **首次发布**若出现 `Unknown publisher: <PublisherName>`：Open VSX 上尚无对应命名空间。执行一次（`<publisher>` 必须与 `package.json` 的 `publisher` 字段完全一致）：
   `npx ovsx create-namespace <publisher> -p <token>`
5. 在扩展仓库根目录（已编译、版本号已更新）执行：`npx ovsx publish -p <token>`。也可先 `vsce package` 生成 `.vsix`，再使用 `ovsx publish` 的指定包路径选项发布（以当前 CLI 帮助为准）。
6. 在 open-vsx.org 搜索扩展确认。**Cursor** 等编辑器常从 Open VSX 获取与 VS Code 兼容的扩展；发布成功后便于用户在市场搜索安装。

**安全**：CI 中用密钥注入 token；禁止将 token 硬编码进 `package.json` 或脚本。
