# App 内置 Grok Build

## 产品行为

- 桌面安装包包含固定版本 Grok Build；首次启动只检查内置程序是否可运行，账号配置可跳过。
- 本机 Agent、辅助工具、Remote IM 都使用 App 内置程序。不会扫描 PATH、`~/.grok/bin` 或手动指定的 CLI；旧 `manualCliPath` 与 WSL 后端设置不再参与本地运行路径选择。
- 不提供外部 CLI 高级选项。不安装、不升级、不修复终端 CLI；旧安装、更新、旁路修复 IPC 入口返回 `BUNDLED_RUNTIME` 错误。
- 缺失或损坏时提示重新安装 Grok App，不能通过外部 CLI 掩盖损坏。
- 设置 Runtime/About 展示内置程序版本和路径，更新统一走 App 更新。Doctor 指向同一入口，不显示旧外部安装的 checksum 记录。
- 本轮分离的是**可执行程序与更新生命周期**。已有账号、配置和会话的 shared/independent 数据模式保持原规则，不自动搬迁用户数据。远程 SSH/ACP 服务运行在另一台主机，仍由该主机维护。

## 构建与许可

版本、平台 SHA-256 和许可来源提交记录在 `src-tauri/resources/grok-build/runtime.json`，以构建后的 manifest 为准，不在文档手工固定最新版。
正式 `beforeBuildCommand` 和 `beforeBundleCommand` 执行 `prepare-bundled-runtime.mjs --refresh`，普通构建和单独 `tauri bundle` 都会查询官方 GCS `/cli/stable`；有新版本时统一更新五个平台制品和摘要，再准备当前编译目标。版本未变时只检查稳定通道并校验目标缓存，不重复下载。
全部下载及许可核对通过后才替换原有暂存制品，manifest 最后写入；下载失败、稳定版号不合法或许可证变更会中止打包，不静默退回旧版本。
运行时版本在生成安装包前查询并确定，运行中的客户端不单独检查或更新内置程序。终端 CLI 不参与刷新。
摘要来自官方 HTTPS 下载内容，由构建脚本计算并固定，不宣称是官方签名或官方公布的 checksum。固定版本的准备步骤继续严格校验缓存；摘要错误直接中止，不把未知内容带进安装包。

更新运行时时，脚本解析官方公开源码 `main` 的不可变提交，按该提交的文件树更新许可证和第三方声明（包括新出现的声明文件），保留已有额外许可文本。根 `LICENSE` 与已审查版本不一致时停止，需先审查新许可。源码快照与官方预编译制品的私有构建提交仍不保证一一对应。

Tauri `externalBin` 将 `grok-build`（Windows `.exe`）放在 App 主程序同级：macOS `Contents/MacOS`；Windows 安装目录；Linux 包内可执行目录。
发布版按自身位置解析，移动 App 后仍有效。开发/测试使用按编译目标命名的暂存文件。
开发和 Rust CI 使用已固定版本，不自动刷新；正式打包自动刷新。直接 cargo 命令需先执行：

```sh
node scripts/prepare-bundled-runtime.mjs
# 交叉编译必须指定目标，例如：
node scripts/prepare-bundled-runtime.mjs --target x86_64-pc-windows-msvc
# 手动查询最新稳定版并同步所有平台制品/许可：
node scripts/prepare-bundled-runtime.mjs --refresh --target aarch64-apple-darwin
```

支持已固定的 macOS arm64/x64、Windows x64/arm64、Linux x64/arm64；没有对应制品的目标直接构建失败。
Windows portable zip 同样包含运行程序与许可目录，不能只复制 Grok.exe。

许可复核日期：2026-09-25（根许可证与此前已审查文本一致）。
官方 [开源页面](https://x.ai/open-source) 指向 [xai-org/grok-build](https://github.com/xai-org/grok-build)；根许可证为 Apache-2.0，允许按条件分发 Source/Object。
安装包 `grok-build-notices/` 保留官方许可证和第三方声明。
声明取自 manifest 记录的公开源码提交，该快照与运行程序的私有 monorepo 编译提交并非一一对应；不宣称可复现构建或源码与制品完全一致。
升级运行程序时必须同时复核官方许可与声明、更新所有平台摘要并执行启动/握手/打包验证。

## 更新边界

App 调用内置程序时设置 `GROK_INSTALLER=grok-app`；官方 updater 对未知显式 installer 返回外部管理状态，从而不做自更新。ACP 原有 `--no-auto-update` 保留。
普通终端进程不设置此变量；终端的 `grok update` 仍独立运作。

更新包同时包含 App 与内置 Grok Build，无需第二次 CLI 更新。
**一键应用内更新仍要求已配置并签名的正式更新通道**；本地未签名构建沿用下载完整安装包的方式。
macOS/Linux 继续先安装成功，再停止后台服务并重启，安装失败不打断会话。
Windows 的 Tauri `install()` 会启动安装器并直接退出，必须先停止 App 管理的后台服务，再按完整可执行路径停止残留内置运行程序（不按名称误杀终端 CLI）。停止失败则不启动安装器。
Windows 停止后安装失败会提示重启现有 App 恢复后台服务，并阻止直接重试，避免跳过一次性停止逻辑。Windows 安装器接管后自身失败/取消由安装器处理；用户重新打开 App 恢复使用。
安装前沿用 App 的重启确认；后台检查/下载不停止任务。更新停止期间拒绝新 ACP 进程。

## 验证边界

前端覆盖：内置程序正常/缺失/重检、无外部安装选择、Windows 安装顺序/失败恢复/停止失败、macOS 成功和失败。
Rust 覆盖：只定位内置程序、忽略旧路径与 WSL 设置、禁止独立更新/修复、受管环境仅作用于内置程序。
Windows CI 另有真实进程测试，验证按绝对路径停止目标而保留另一目录的同名程序；本机 macOS 不会将该测试视为已执行。
实际平台安装包与线上签名升级的验收结果见 `progress.md`，编译或模拟测试不代表其他系统已实机通过。
