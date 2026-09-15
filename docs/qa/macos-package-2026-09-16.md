# macOS 本地安装包（2026-09-16）

已制作包含此前性能与使用问题修复、最新首页与输入框改版的 Apple Silicon 安装包。

- 产品源码：`codex/fix-runtime-audit`，`e45dde79`，构建启动时工作区干净。
- 版本：`0.2.35`，本地构建标识 `e45dde79`，未创建正式版本 tag。
- 平台：macOS Apple Silicon / `aarch64-apple-darwin`；不适用于 Intel Mac。
- 安装包：`dist-installers/Grok_0.2.35_e45dde79_aarch64.dmg`。
- 大小：20,466,924 字节（约 19.5 MiB）。
- SHA256：`7ef1bb3b1ea26d0133ef5ab8d89d037489111ecaf1e5bdd326d77e47b2e3c548`。
- 校验文件：`dist-installers/SHA256SUMS-e45dde79.txt`。
- 签名：ad-hoc 临时签名，包标识 `com.grokapp.desktop`；没有 Developer ID 或 Apple 公证。

## 包含的更新

- 输入和流式 Markdown 输出卡顿修复，以及后续文件编辑、队列、语音归属和预览等问题修复。
- 首页间距、侧栏层级、居中欢迎区域和圆角输入框调整。
- 模型选择移入输入框右下角，技能与语音入口收进加号菜单。
- 默认品牌改为 Grok，中文欢迎语改为“请开始你的表演”，同步十五种语言。

## 构建与验证

系统默认 PATH 未提供 rustc，使用上一轮已验证的临时 Rust 工具链完成构建，不修改系统工具链：

```bash
env CARGO_HOME=/tmp/grok-rust/cargo \
  RUSTUP_HOME=/tmp/grok-rust/rustup \
  PATH="/tmp/grok-rust/cargo/bin:$PATH" \
  CARGO_BUILD_JOBS=4 APPLE_SIGNING_IDENTITY=- pnpm build:mac-arm
```

- TypeScript、Vite、Rust release 和 Tauri app/dmg 打包通过。Vite 保留已有大分块提示。
- 完整前端测试首次发现一处旧样式断言：仍要求改版前的 4px 间距和菜单圆角。仅将该测试同步为已实施的 3px 间距与 20px 输入框圆角；未改变产品代码。重跑全部 666 个文件、7,601 项测试通过。
- 全量 ESLint 通过；测试断言更新后的定向 ESLint 与 `git diff --check` 通过。
- `file` 确认 Mach-O arm64，Info.plist 校验通过且版本为 0.2.35。生产前端资产包含构建标识 `e45dde79` 和最新中文欢迎语。
- 原始 app 与交付 DMG 只读挂载后的 app 均通过 `codesign --verify --deep --strict`；逐文件比较一致。
- `hdiutil verify`、交付 DMG SHA256 回读校验通过。镜像包含 Grok.app 和指向 `/Applications` 的快捷方式。
- 直接执行镜像内程序，设置独立 `GROK_APP_HOME=/tmp/grok-macos-cli-e45dde79`，`--sessions` 正常返回空数组，退出码 0。
- 当前已安装 Grok 正在运行；macOS 单实例插件共享固定 socket，独立数据目录不能隔离 GUI 实例。本轮未启动完整 GUI、调用模型或验收实际流式输出；上述命令行检查不等同于完整窗口启动验收。
- 验证结束已卸载测试镜像，未替换或停止已安装应用。
- 日志：`/tmp/grok-macos-e45dde79-build.log`、`/tmp/grok-macos-e45dde79-tests.log`、`/tmp/grok-macos-e45dde79-tests-final.log`、`/tmp/grok-macos-e45dde79-lint.log`、`/tmp/grok-macos-e45dde79-dmg-verify.log`。

## 安装与回滚

退出旧版 Grok，打开新 DMG，将 Grok.app 拖入 Applications。此为本地临时签名包，未公证；若 macOS 阻止打开，可在系统“隐私与安全性”中允许。

上一份 `dist-installers/Grok_0.2.35_ba5e835f_aarch64.dmg` 保留，可在退出应用后重新安装该包回滚应用文件。本轮未改变数据格式。安装后应检查窗口启动和实际模型会话。

测试断言回滚：`git restore --source=e45dde79 -- src/lib/wallpaperThemeContrast.guard.test.ts`。如需撤销本轮交付记录，删除本 QA 文档和新 DMG/校验文件，并在 progress.md 追加撤销说明，保留历史记录。未推送、创建 tag 或发布 GitHub Release。
