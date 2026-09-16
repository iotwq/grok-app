# macOS 本地安装包（bac55909）

- 源码：`codex/fix-runtime-audit`，`bac55909`，构建启动时工作区干净。
- 版本：`0.2.35`。
- 平台：macOS Apple Silicon / `aarch64-apple-darwin`。
- 安装包：`dist-installers/Grok_0.2.35_bac55909_aarch64.dmg`。
- 大小：20,469,094 字节。
- SHA256：见 `dist-installers/SHA256SUMS-bac55909.txt`。
- 签名：ad-hoc 临时签名，无 Developer ID 和 Apple 公证。

## 包含内容

包含此前修复、Grok 首页与输入框调整，以及本轮入口收缩：主导航和命令面板不再展示 Ops Hub、Agent Dashboard、Task Board、Kanban、Batch Agents；当前会话 Tasks panel 保留，Batch Agents 仍可从设置高级工具进入。

## 验证

- `pnpm test`：666 个测试文件、7,601 项全部通过。
- `pnpm build:mac-arm`：UI、Rust release、Tauri app/dmg 构建通过。
- app 和 DMG 内 app 通过 `codesign --verify --deep --strict`。
- Mach-O 为 arm64，Info.plist 校验通过。
- `hdiutil verify` 和 SHA256 校验通过。
- 镜像内程序设置独立 `GROK_APP_HOME` 后执行 `--sessions` 返回 `[]`；未启动完整 GUI、未调用模型，避免影响正在运行的安装版。
- 日志：`/tmp/grok-macos-bac55909-tests-final.log`、`/tmp/grok-macos-bac55909-build-final.log`、`/tmp/grok-macos-bac55909-dmg-verify.log`。

## 安装与回滚

退出旧版 Grok，打开 DMG，将 Grok.app 拖入 Applications。临时签名包被 macOS 拦截时，在“隐私与安全性”中允许打开。回滚使用 `dist-installers/Grok_0.2.35_e45dde79_aarch64.dmg`。本轮未修改数据格式、未替换运行中的应用、未推送或发布。
