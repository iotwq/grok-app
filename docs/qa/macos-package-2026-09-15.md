# macOS 修复版安装包（2026-09-15）

已制作包含 B01–B19 修复的本地 ARM64 安装包，未发布到 GitHub，未替换 /Applications 中的已安装应用。

- 源码：`codex/fix-runtime-audit`，`ba5e835f`（构建时工作区干净）。
- 项目版本：`0.2.35`；应用内构建标识为 `ba5e835f`，不是新正式版 tag。
- 平台：macOS Apple Silicon / `aarch64-apple-darwin`，不适用于 Intel Mac。
- 安装包：`dist-installers/Grok_0.2.35_ba5e835f_aarch64.dmg`。
- 大小：20,455,415 字节（约 19.5 MiB）。
- SHA256：`aca48a7d25fda51d9dfd84d8e5b186b2be753948cb21ce88bd0765fe5e6590ae`。
- 校验清单：`dist-installers/SHA256SUMS-ba5e835f.txt`。
- 签名：ad-hoc（临时签名，包标识 `com.grokapp.desktop`），没有 Developer ID 证书或 Apple 公证。

## 构建

使用此前验证过的临时 Rust 工具链，不更改系统 Rust 安装：

```bash
export CARGO_HOME=/tmp/grok-rust/cargo
export RUSTUP_HOME=/tmp/grok-rust/rustup
export PATH="/tmp/grok-rust/cargo/bin:$PATH"
export CARGO_BUILD_JOBS=4
pnpm build:mac-arm
APPLE_SIGNING_IDENTITY=- pnpm exec tauri bundle --target aarch64-apple-darwin --bundles app,dmg
```

首次默认打包的链接器签名未封装应用资源。检查发现后，使用 Tauri 的临时签名重新封装 `.app` 与 `.dmg`；交付文件是重新封装且验证通过的版本。

## 验证

- `pnpm build:mac-arm`：TypeScript、Vite 和 Rust release 编译通过，生成 app/dmg。
- `file` 确认 Mach-O arm64；Info.plist 校验通过；前端资产包含 `ba5e835f`。
- `codesign --verify --deep --strict` 对原 `.app` 和只读挂载 DMG 中的 `.app` 均通过，资源封装完整。
- `hdiutil verify`：镜像校验通过；镜像内包含 `Grok.app` 和 `/Applications` 安装快捷方式。
- 从交付 DMG 复制应用到临时目录，以独立 `GROK_APP_HOME` 启动：运行时检测通过，进入主界面，识别 Grok Build CLI 1.0.25，进程持续超过两分钟未异常退出。
- 未提交真实 API Key、登录或运行付费推理；这次启动检查不能代替真实渠道会话验收。
- 测试结束仅停止此次测试进程组，卸载只读镜像，恢复原窗口位置记录。测试数据保留在 `/tmp/grok-macos-smoke-ba5e835f`。
- 构建与验证日志：`/tmp/grok-macos-package-build.log`、`/tmp/grok-macos-package-bundle.log`、`/tmp/grok-macos-dmg-verify.log`。
- 上轮代码验收：前端 7,552 项通过；Host 1,888 项通过、1 忽略、1 个已在旧基线复现的局域网超时失败，详见 UX 审计报告。

## 安装

退出旧版 Grok，打开 DMG，将 Grok.app 拖入 Applications。此包使用与原版相同的应用标识和数据位置，可替换原 App；重要会话应按平常升级流程保留备份。

本地包未公证，若 macOS 阻止打开，可由用户在系统“隐私与安全性”中允许。未替用户绕过 Gatekeeper。Intel 用户需要另行构建对应架构。
