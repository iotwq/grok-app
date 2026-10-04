# Grok App 桌面端构建与发布

支持平台：

| 平台 | Triple | 本地构建 | CI Release 产物 |
|------|--------|----------|-----------------|
| macOS Apple Silicon | `aarch64-apple-darwin` | ✅ | `.dmg` |
| macOS Intel | `x86_64-apple-darwin` | ✅（在 Apple Silicon 上交叉） | `.dmg` |
| Windows x64 | `x86_64-pc-windows-msvc` | ✅ 本机 Windows，或 **macOS/Linux 经 cargo-xwin** | NSIS `*-setup.exe` + **绿色版** `*-portable.zip` |
| Windows ARM64 | `aarch64-pc-windows-msvc` | ✅ Windows runner 交叉构建 | NSIS `*-arm64-setup.exe` + **绿色版** `*-arm64-portable.zip` |
| Linux x64 | `x86_64-unknown-linux-gnu` | ✅ 本机 Linux | **AppImage** + **.deb** + **.rpm** |

> macOS / Linux 交叉打 Windows 安装包使用 Tauri 官方 runner：`cargo-xwin` + `makensis`（NSIS）。  
> 见 [Build Windows apps on Linux and macOS](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)。

## 内置 Grok Build

安装包现在包含 App 管理的 Grok Build，用户无需另行安装终端 CLI。
正式打包钩子自动查询官方 `stable` 通道；有新版时下载全部支持平台的制品、记录
SHA-256 并更新许可快照，再校验当前目标的运行时后编译。无法查询最新版或更新
失败时中止打包，不会静默沿用旧版本。该步骤只更新仓库内制品，不修改终端 CLI。
手动刷新可运行 `node scripts/prepare-bundled-runtime.mjs --refresh --target aarch64-apple-darwin`。
开发或直接 cargo 验证可运行 `node scripts/prepare-bundled-runtime.mjs`，交叉编译添加
`--target <Rust triple>`；不带 `--refresh` 时使用 manifest 固定版本，已有合格缓存
可以离线使用，但不声称是最新稳定版。
运行程序和许可证均随 App 打包，Windows portable 也必须包含二者。
维护与更新规则见 [bundled-runtime.md](llm-wiki/bundled-runtime.md)。

## 窗口 chrome

| 平台 | 配置 | UI |
|------|------|-----|
| macOS | `tauri.macos.conf.json`：`decorations` + `titleBarStyle: Overlay` + 透明侧栏 | 原生 traffic lights |
| Windows | `tauri.windows.conf.json`：`decorations: false`、非透明 | 自绘 min / max / close |

关闭窗口 → 隐藏到托盘；退出请用托盘 **Quit Grok**。

## 1. 本地环境

```bash
# 依赖：Node 22+、pnpm 9、Rust stable、Xcode CLT (macOS)
pnpm install
pnpm setup:cross   # rust targets + (macOS) cargo-xwin / nsis / llvm 检查
```

### `pnpm dev` 与已安装版并排

`pnpm dev` 会 merge [`src-tauri/tauri.dev.conf.json`](../src-tauri/tauri.dev.conf.json)：

- `identifier=com.grokapp.desktop.dev`（single-instance mutex 与正式版 / **grok-app-latest** 隔离）
- `productName=Grok Dev`，Dock / 窗口图标用 `src-tauri/icons/dev`（白色 AppIcon.appiconset，不是从黑标反相）
- Windows AUMID / WinRT toast 跟 bundled identifier，不和正式版抢任务栏分组
- 会话/设置仍默认同一套 App data（`%APPDATA%\grokapp\grok-app`）；可用 `GROK_APP_HOME` 覆盖（`scripts/dev-white-icon.sh` 会指到临时目录）
- **不要**裸跑 `tauri dev` / `pnpm tauri dev`（没有 `--config` 会撞正式版单实例锁）

### macOS

- Xcode Command Line Tools：`xcode-select --install`
- Apple Silicon 上构建 Intel：`rustup target add x86_64-apple-darwin`（脚本已处理）
- **Windows 交叉编译额外依赖**（`setup:cross` 会检查）：
  ```bash
  brew install llvm makensis
  cargo install --locked cargo-xwin
  # 建议把 clang-cl 放进 PATH（Apple Silicon）：
  export PATH="/opt/homebrew/opt/llvm/bin:$PATH"
  ```
- 首次 Windows 构建会下载 MSVC CRT/SDK 到 `~/.cache/cargo-xwin`（与 GrokGo 可共用缓存）

### Windows（原生）

- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（C++ 工作负载）
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（多数 Win10/11 已带）
- Rust MSVC toolchain：`rustup default stable-x86_64-pc-windows-msvc`

装好上述工具后，可双击仓库根目录 [`install-latest.cmd`](../install-latest.cmd)，把 **已合入的 `origin/main`** 打成并排安装的 **grok-app-latest**。这不是 GitHub Release，也不覆盖正式版 **Grok**。详见下文「Windows：并排安装已合入的 main」。

### Linux（含 Arch / Ubuntu / Debian）

浏览器截图和跨域 iframe 自动化需要 **WebKitGTK 4.1 ≥ 2.40**（构建及运行时），用于独立内容世界中的原生消息回复接口。发行版过旧时需先更新 WebKitGTK；不是安装另一个 Chromium 浏览器。

```bash
# Debian/Ubuntu
# Prefer Ayatana only (libappindicator3-dev conflicts with libayatana-appindicator3-dev).
sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev \
  patchelf libgtk-3-dev libayatana-appindicator3-dev libssl-dev

# Arch
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module \
  libappindicator-gtk3 librsvg
```

然后：

```bash
pnpm build:linux
# 或
./scripts/build-local.sh linux
```

产物：`src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/`  
（`appimage/`、`deb/`、`rpm/` —— 对应 Ubuntu/Debian 系与 Fedora/RHEL 系）。

构建 RPM 需要 `rpm` 工具：`sudo apt install rpm`（Debian/Ubuntu CI 已装）。

#### 已知问题：AppImage 黑屏（AMD + Hyprland / Wayland）

AppImage 内置 Ubuntu 22.04 CI 容器的 WebKitGTK。部分 AMD + Hyprland 环境会报  
`Could not create default EGL display: EGL_BAD_PARAMETER`，窗口全黑，但宿主进程（媒体、ACP、登录）仍正常。

Issue [#539](https://github.com/RongleCat/grok-app/issues/539) 对照实验：相同 env 下仅换用**系统 WebKit** 即可恢复 UI——根因是**内置 WebKit 的 EGL 栈**，不是应用业务代码。`.deb` / `.rpm` 链接系统 WebKit，不受影响。

用户侧缓解：各 README 的「Linux blank/black window」段，或仓库脚本  
`scripts/run-linux-appimage-system-webkit.sh`。

AppImage 宿主进程在启动时若检测到系统 WebKitGTK 4.1，会带 `WEBKIT_EXEC_PATH` / `LD_LIBRARY_PATH` 再 exec 自身（`src-tauri/src/linux_webkit.rs`）。这覆盖 #539 黑屏，也避免退出时 FUSE 卸载仍映射在 squashfs 上的 `WebKitNetworkProcess`（SIGBUS / `BUS_ADRERR`）。`GROK_SKIP_SYSTEM_WEBKIT=1` 可退回内置 WebKit。不要为了此问题单独把 Linux CI 升到 Ubuntu 24.04——会抬高 glibc 底线。

## 2. 本地构建命令

安装包必须通过 `pnpm build:mac-arm` 等脚本或 `pnpm exec tauri build` 构建。
不要将普通 `cargo build --release` 的产物直接交给 `tauri bundle`：缺少
`tauri/custom-protocol` 时，主窗口仍访问开发服务器，安装后会空白。构建脚本
现在会拒绝这种 release 编译。必须拆开步骤时，先生成前端，再执行带
`--features tauri/custom-protocol` 的 Cargo 编译，最后 bundle；优先使用完整 Tauri 流程。

交付前必须在未运行 Vite 开发服务器时，从最终 DMG 启动 App，确认主页面、
输入框和设置可以显示及操作；只校验签名、镜像或内置 CLI 不代表桌面页面可用。

```bash
pnpm build:help         # 打印全部平台命令说明

# —— 按你的电脑（最常用）——
pnpm build              # 当前主机自动选 target（Apple Silicon → aarch64）
pnpm build:mac          # 同上，仅 macOS：为「这台 Mac」打 .app + .dmg

# —— 指定平台 ——
pnpm build:mac-arm      # macOS Apple Silicon（aarch64-apple-darwin）
pnpm build:mac-intel    # macOS Intel（x86_64-apple-darwin）
pnpm build:mac-all      # ARM + Intel 两套 Mac 包（仅 macOS 主机）
pnpm build:win          # Windows x64 NSIS（本机 Windows，或 Mac/Linux 上 cargo-xwin）
pnpm build:linux        # Linux x64 AppImage/deb/rpm（需 Linux 主机）
pnpm build:all          # mac-arm + mac-intel + win（仅 macOS 主机）

# 或直接脚本：
./scripts/build-local.sh mac          # 当前 Apple 芯片 / Intel Mac
./scripts/build-local.sh mac-arm
./scripts/build-local.sh win
./scripts/build-local.sh linux
./scripts/build-local.sh all
```

### Windows：并排安装已合入的 main

给**已经有编译环境**、等不及下一版 GitHub Release 的人：把当前仓库 fast-forward 到 `origin/main`，打一份**未签名** NSIS，静默装到 `%LOCALAPPDATA%\grok-app-latest`。

```bat
install-latest.cmd
```

或：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/install-latest.ps1
```

行为：

- 要求 **tracked 工作区干净**；`git fetch origin --tags` 后把 `main` **fast-forward** 到 `origin/main`（当前在别的分支也会切走）
- Settings → About：HEAD 恰好是 `vX.Y.Z` tag 时显示该版本，否则显示 short commit hash（不要把 main 误当成上一 GitHub Release）
- 临时 Tauri overlay：`productName=grok-app-latest`，`identifier=com.grokapp.desktop.latest`（single-instance mutex 与正式版隔离）
- 只打 NSIS（`--bundles nsis --no-sign --ci`），`/S` 静默安装
- **不覆盖** 正式 **Grok** 安装目录；开始菜单多一项 `grok-app-latest`
- 会话/设置仍走同一套 App data（`%APPDATA%\grokapp\grok-app`，可用 `GROK_APP_HOME` 覆盖）——不要和正式版同时当写入端开着
- 本机 NSIS 仍会注册 `grok://` / `.grokskin`（后装的覆盖系统关联）
- 不是 nightly CI；没有 macOS / Linux 对等脚本

`origin` 应指向你想跟上的 GitHub 仓库（贡献者通常是 `RongleCat/grok-app`）。

### Apple Silicon 本机安装包（示例）

在 M 系列 Mac 上：

```bash
pnpm install
pnpm build:mac
# 或
pnpm build:mac-arm
```

成功后脚本会列出产物，典型路径：

```
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Grok_*.dmg
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Grok.app
```

双击 `.dmg` 安装，或直接运行 `.app`。  
通知 / Dock 等依赖正式 `.app` 的能力在 **安装包或 `.app` 产物** 上验证，不要用 `tauri dev` 裸二进制当生产行为。

### 本地未公证包的签名完整性

没有 Apple Developer ID 证书时，本地编译可能只留下链接器的临时签名，整个 `.app` 的资源封装校验不通过。已有 release 二进制可用临时签名重新打包，无须重复编译：

```bash
APPLE_SIGNING_IDENTITY=- pnpm exec tauri bundle --target aarch64-apple-darwin --bundles app,dmg
codesign --verify --deep --strict --verbose=2 src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Grok.app
hdiutil verify src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Grok_*.dmg
```

Intel 包使用 `x86_64-apple-darwin`。临时签名只保证包内完整性，不是 Developer ID 签名或 Apple 公证；分发后 Gatekeeper 仍可能要求用户在系统“隐私与安全性”中允许打开。正式发布仍按 release 文档配置证书和公证。

`build:win` 在 macOS 上等价于：

```bash
pnpm exec tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
```

产物目录：

```
src-tauri/target/<triple>/release/bundle/
  macos/     # .app / .dmg  （产品名 Grok）
  nsis/      # Windows 安装版（*-setup.exe）
  deb/       # Debian/Ubuntu .deb
  rpm/       # Fedora/RHEL .rpm
  appimage/  # 通用 Linux AppImage
src-tauri/target/<triple>/release/Grok.exe   # Windows 裸二进制 → CI 打成绿色版 zip
```

拷贝测试建议：

```bash
mkdir -p dist-installers
cp src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg dist-installers/
cp src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/*.dmg dist-installers/
cp src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe dist-installers/
# 绿色版：zip release/Grok.exe
cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/appimage/* dist-installers/ 2>/dev/null || true
cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/deb/* dist-installers/ 2>/dev/null || true
cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/rpm/* dist-installers/ 2>/dev/null || true
```

## 3. GitHub Actions 发布（推荐）

> **AI / 维护者完整 checklist：** [docs/llm-wiki/release.md](./llm-wiki/release.md)（发版步骤、CHANGELOG 写法、损坏处理、禁止事项）。

工作流：`.github/workflows/release.yml`  
发版说明：从 `CHANGELOG.md` 对应版本章节生成（`scripts/changelog-for-release.py`），**仅本版变更**；安装 / Gatekeeper 见 README。

### 触发方式

1. **推送版本 tag**（推荐、稳定）  
   ```bash
   # 1) 先在 CHANGELOG.md 写好 ## [X.Y.Z] - YYYY-MM-DD
   # 2) 提交干净 main 后：
   ./scripts/release-tag.sh 0.1.1
   # 或直接推送：
   ./scripts/release-tag.sh 0.1.1 --push
   ```
2. **Actions → release → Run workflow**（手动）

`release-tag.sh` 会：

- 校验 `CHANGELOG.md` 存在该版本章节（否则失败）
- 同步 `package.json` / `tauri.conf.json` / `Cargo.toml`
- 提交 `chore: release vX.Y.Z` 并打 annotated tag
- 可选 `--push` 触发 CI

没有对应 CHANGELOG 章节时，**tag 与 CI release 都会失败**（有意为之）。

### 仓库设置

- **Settings → Actions → General → Workflow permissions**  
  勾选 **Read and write permissions**（用于创建 Release 并上传资产）

### 签名 Secrets

macOS 正式发布必须完成 Apple Developer ID 签名和 Apple 公证；没有这些 Secrets，CI 会在上传安装包前失败，避免发布会被 Gatekeeper 判定为「已损坏」的包。Windows Authenticode 仍为可选配置。

| Secret | 用途 |
|--------|------|
| `APPLE_CERTIFICATE` | Developer ID Application `.p12` 的 base64（`openssl base64 -A -in cert.p12`） |
| `APPLE_CERTIFICATE_PASSWORD` | 上述 `.p12` 的导出密码 |
| `APPLE_SIGNING_IDENTITY` | `security find-identity -v -p codesigning` 引号内整串，如 `Developer ID Application: Name (TEAMID)` |
| `APPLE_TEAM_ID` | 10 位 Team ID |
| `APPLE_API_ISSUER` | App Store Connect Issuer ID（UUID） |
| `APPLE_API_KEY` | App Store Connect Key ID |
| `APPLE_API_KEY_P8` | `AuthKey_<id>.p8` 全文（CI 写成临时文件再设 `APPLE_API_KEY_PATH`） |
| `WINDOWS_CERTIFICATE` | **Windows Authenticode** `.pfx` 的 base64（`certutil -encode` 或 `[Convert]::ToBase64String`） |
| `WINDOWS_CERTIFICATE_PASSWORD` | 上述 `.pfx` 的导出密码 |
| `GROK_UPDATER_PUBLIC_KEY` | 应用内自动更新公钥（与 endpoint 一起嵌入 release 构建） |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater 签名私钥（启用自动更新时必需） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码（可为空） |

#### Apple Secrets 的一次性配置

1. 在 Apple Developer 中创建 **Developer ID Application** 证书，将证书导出为带密码的 `.p12`，并在本地执行 `openssl base64 -A -in cert.p12` 获取 `APPLE_CERTIFICATE`。
2. 在 App Store Connect → Users and Access → Integrations → API Keys 创建下载密钥，分别记录 Issuer ID、Key ID，并将 `AuthKey_<id>.p8` 全文填入 `APPLE_API_KEY_P8`。
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中新增上表的 7 个 `APPLE_*` Secret。名称和值必须完整匹配；不要把证书、私钥或密码提交到仓库，也不要发送到聊天中。
4. 用 `gh secret list --repo iotwq/grok-app` 只核对 Secret 名称。下一次 tag 发布时，CI 会先验证配置，再签名、公证并检查 Gatekeeper 结果；任一步失败都不会把 macOS 构建标记为可发布。

#### Windows Authenticode（正式代码签名）

- **与 Tauri updater minisign 不是一回事**：`TAURI_SIGNING_PRIVATE_KEY` 只签更新包，**不能**消除 SmartScreen「未知发布者」。
- 需要 **代码签名证书**（OV / EV；SSL 证书无效）。EV 通常立刻建立信誉；OV 可能仍短暂显示 SmartScreen，直到证书信誉积累。
- Release CI（`windows-latest`）在两个 secret **都非空** 时会：
  1. 把 base64 解成 `.pfx` 并 `Import-PfxCertificate` 到 `Cert:\CurrentUser\My`
  2. 写出 `src-tauri/tauri.windows.sign.conf.json`（`certificateThumbprint` + sha256 + DigiCert 时间戳）
  3. `tauri build --config …/tauri.windows.sign.conf.json` 让 bundler 调用 `signtool`
- **不要**在 GitHub 填入空的 `WINDOWS_*` secrets；缺省即跳过签名，构建仍成功。
- 本地 Windows 签名：导入 PFX 后按 [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/) 配置 thumbprint，或复用同一 merge config。

应用内自动更新详情见 [desktop-auto-update.md](./desktop-auto-update.md)。  
Release CI 在 secrets 齐全时会生成 `tauri.release.conf.json` 并注入 `GROK_UPDATER_*`。

**注意：** 不要在 workflow 里传入**空**的 `APPLE_*` secrets，否则 codesign 导入会失败。

### Release 内容

矩阵会为以下平台上传安装包到同一 GitHub Release：

- macOS ARM64  
- macOS x64  
- Windows x64  

Release body = 下载表 + 该版本 CHANGELOG + 安装说明（含 `xattr`）。

## 4. 版本号约定

保持一致（`release-tag.sh` 会自动改）：

- `package.json` → `version`
- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `[package].version`

About 页版本（`app.versionFooter` 的 `{version}`）在 Vite 构建时注入：恰好是 `vX.Y.Z` release tag 则显示该 tag，否则显示 short commit hash。

Tag 格式：`v0.1.1`（前缀 `v` + semver）。

## 5. 故障排查

| 现象 | 处理 |
|------|------|
| CI “Resource not accessible by integration” | 打开 workflow 写权限 |
| release job：no CHANGELOG section | 补 `## [X.Y.Z]` 后再 tag |
| macOS Intel build 缺 target | 确认 rustup 安装了 `x86_64-apple-darwin` |
| Windows 交叉缺 makensis / clang-cl | `brew install makensis llvm`；`export PATH="$(brew --prefix llvm)/bin:$PATH"` |
| cargo-xwin 首次很慢 | 正常：在拉 CRT/SDK；缓存目录 `~/.cache/cargo-xwin` |
| Windows 本机无法交叉 | 用 `pnpm build:win`（cargo-xwin）或 CI |
| macOS 下载后打不开 | 未签名：系统设置 → 隐私与安全性 → 仍要打开；或 `xattr -cr /path/to/Grok.app` |
| Windows 内置 Grok Build 无法启动 | 重新安装完整 Grok App；portable 必须包含 `grok-build.exe`，外部 PATH 不再用于修复 |
