# 第二轮审计：使用逻辑、交互与外观

检查基线：`b922a2c0`，分支 `codex/fix-runtime-audit`。上一轮 B01–B10 已包含在基线中。本轮只检查并记录新发现，不修改产品行为；下列项目均为**尚未修复**。

## 业务结论

确认 9 类明显问题，其中 4 项 P1、5 项 P2。优先处理取消误确认、每周任务变每日、跨项目工作区串数据及重复创建任务；这些会执行用户未预期的操作。另有错误模型显示、失败无提示、弹窗键盘冲突和按钮样式失效，影响日常使用。

P1：可能执行错误操作、污染配置或产生重复任务；P2：明显的操作障碍、错误反馈或显示不一致。没有把个人审美偏好、未完成的整机验证或已有问题重复计数。

| 编号 | 优先级 | 问题及用户影响 | 证据 |
|---|---|---|---|
| B11 | P1 | “取消”按钮获得焦点后按 Enter，仍执行确认；影响删除、外链确认、权限确认等公共对话框 | 实际 Hook + DOM 键盘事件复现 |
| B12 | P1 | “每周”任务未保存星期，Host 后续排期按每天执行；编辑已有指定星期的任务也会清空星期 | 编辑交互测试 + 前后端日期计算复现 |
| B13 | P1 | 关闭项目 A 的工作区弹窗、打开 B 后，A 的慢请求覆盖 B 草稿；保存会混用 A 工作区 ID/目录与 B 项目 ID | 控制请求完成顺序的 Hook 测试 |
| B14 | P1 | 自动化保存没有进行中锁；连点“创建”发出两次创建请求，可能重复运行、重复消耗额度 | 两次点击、首请求未完成时确认两次 API 调用；Host 每次创建新 UUID |
| B15 | P2 | 原模型不在当前选项中时，选择框显示第一个模型，实际保存的仍是旧模型 | 编辑器显示 Grok 4.6，实际请求仍携带 removed-relay |
| B16 | P2 | 解除工作区绑定失败仍关闭弹窗，并清除错误，用户以为已解除 | 模拟保存失败后按生产调用链执行，确认 open=false/error=null |
| B17 | P2 | 两层弹窗同时打开时，一次 Esc 触发两层关闭，无法只退出最上层 | 两个真实 GlassModal 的关闭回调均被调用 |
| B18 | P2 | 弹窗内下拉选项在焦点限制之外，Tab 回到弹窗关闭按钮；缺少方向键选项导航 | 真实 GlassModal + Select 的键盘事件复现 |
| B19 | P2 | 工作区弹窗的“保存/取消/解除”等使用无效样式名，主次操作缺少区别；外观页部分按钮同样受影响 | 深浅主题浏览器渲染 + computed CSS + 样式定义对照 |

## 触发与技术依据（按需阅读）

### B11 — 取消键盘操作变成确认

- 触发：打开公共 confirm 对话框，Tab 到“取消”（或关闭按钮），按 Enter。
- 现状：document 捕获监听不检查焦点目标，直接调用 `onConfirm`。隔离测试用空的 spy 回调验证，没有执行真实删除或权限更改。
- 依据：`src/hooks/useAppDialogs.ts:142`–150；实际使用包含 `src/app/AppWorkbench.tsx:6789` 的删除空间确认，以及 `:4408` 的权限确认。
- 最小修复：尊重当前按钮的键盘语义；仅在明确的默认确认场景触发全局 Enter，并避免按住 Enter 连续通过多级确认。

### B12 — 每周任务的前后端语义不一致

- 触发一：手工新建“每周”任务。表单没有星期字段，提交 `weekdays: []`。首次排期由前端按当前星期计算；Host 执行后重新排期却将空星期匹配任意一天，变成每天执行。
- 触发二：编辑通过自然语言或接口创建的周一/三/五任务，仅改标题或直接保存，原 `[1,3,5]` 被清空。
- 复现：以本地 2026-09-15 周二 10:00 为起点，weekly / 09:00 / [] 的 Host 下一次返回 9 月 16 日，而非 9 月 22 日。前端和 Host 都运行了真实计算函数。
- 依据：`src/components/AutomationsPage.tsx:564` 未装载星期，`:597`、`:609` 强制空数组；`src/lib/automations.ts:94`–97 与 `src-tauri/src/automation_runner.rs:484`–489 语义不同；Host `:424` 用此函数计算后续排期。
- 最小修复：编辑保留星期；创建 weekly 时明确选择/固定星期；前后端共享一致规则并覆盖首轮后排期。

### B13 — 工作区异步请求串项目

- 触发：A 工作区加载慢，关闭后打开 B；B 先加载成功，随后 A 返回。关闭未取消请求，也没有请求序号检查。
- 复现：最终 target.projectId=B，draft.id=A；点击保存提交 A 的 ID、A 的根目录和 B 的项目 ID。
- 依据：`src/hooks/useMultiRootWorkspace.ts:31`、`:39`、`:78`、`:155`；Host `src-tauri/src/workspace_store.rs:190` 只查目标项目存在，`:221` 不核对 primary root 是否为项目目录，`:270` 可替换现有 workspace 的项目归属，不能依赖 Host 自动拦截此混合请求。
- 最小修复：关闭/切换目标后忽略过期结果；保存时核验草稿归属；Host 校验 workspace、主项目和主根一致。

### B14 — 自动化重复提交

- 触发：创建请求响应慢时，双击“创建”或误以为没响应再次点击。
- 复现：首请求保持 pending，两次点击产生两个 `automationCreate` 调用；编辑保存也可重复请求。
- 依据：`src/components/AutomationsPage.tsx:583`–624 没有保存中状态/重入阻止；`:1755`–1761 保存按钮始终可点；`src-tauri/src/store.rs:2872` 每次创建新 UUID，`:2897` 插入新任务，无业务去重。
- 最小修复：请求期间锁定提交入口并显示保存中；失败后允许重试。

### B15 — 显示的模型与实际值不同

- 触发：已有自动化引用的自定义模型被删除，或当前可选模型列表切换后不包含它，再进入编辑。
- 复现：控件显示“Grok 4.6”；不手工重新选模型，直接保存仍发送 `modelId: removed-relay`。
- 依据：`src/components/Select.tsx:44` 未找到当前值就拿 `options[0]` 显示，但不改变 `value`；`src/components/AutomationsPage.tsx:568` 保留旧值，`:605` 原样提交。
- 最小修复：显示“当前模型不可用/需要重新选择”或保留明确的旧值选项；不要用其他值的标签掩盖实际配置。

### B16 — 解除绑定失败被隐藏

- 触发：解除工作区绑定时 Host 写入失败或 IPC 返回错误。
- 现状：clearBinding 捕获错误但仍正常 resolve；外层 `.then(close)` 无条件关闭，close 又清空 error。
- 依据：`src/hooks/useMultiRootWorkspace.ts:179`–188、`:31`–36；`src/app/WorkbenchComposerColumn.tsx:1018`。
- 最小修复：返回明确成功/失败或透传异常；仅成功时关闭，失败保留弹窗和重试入口。

### B17 — Esc 同时关闭父子弹窗

- 场景包括：外观编辑器里再打开恢复默认确认。父编辑器与子 GlassModal 都安装 document 级监听。
- 复现：两个 GlassModal 同时打开，一次 Escape 同时调用两层 onClose。`stopPropagation()` 不会停止同一个 document 上的后续监听，也没有判断当前最上层对话框。
- 依据：`src/lib/a11yFocus.ts:178`–189；`src/components/GlassModal.tsx:94`–104；实际父子入口 `src/components/ThemeEditorModal.tsx:34` 与 `src/components/settings/AppearanceChromeCard.tsx:118`。
- 最小修复：统一最上层弹窗的键盘事件所有权；Esc 只关闭当前层，焦点返回父层。

### B18 — 弹窗下拉键盘无法正常选择

- 触发：在 GlassModal 内用 Enter 打开 Select，继续用 Tab 进入选项；或选项有焦点后按 Tab。
- 复现：焦点回到弹窗“关闭”。Select 将选项 portal 到 body，焦点限制仅认 modal 子树；组件也未提供方向键导航或打开后聚焦选项。
- 依据：`src/components/Select.tsx:61`–94、`:98`–108；`src/lib/a11yFocus.ts:67`–75。下拉与弹窗的 Escape 所有权也存在与 B17 同源的冲突，不另计问题。
- 最小修复：让弹窗识别所属 portal，补齐选项焦点和方向键导航，选中/关闭后返回触发按钮。

### B19 — 按钮样式类失效

- 现状：工作区弹窗使用 `btn primary`、`btn ghost`，实际 CSS 只有 `btn--primary`、`btn--ghost`。主按钮“保存”与“取消/解除”均成为无底色、无边框的文字按钮。
- 外观页的恢复默认等也使用 `btn ghost sm`，未获得预期按钮变体样式。工作区目录卡使用未定义的 `glass-panel`，也没有预期的卡片材质，但它位于有底色的 modal 内，不能描述成整个浮层全透明。
- 依据：`src/components/MultiRootWorkspaceModal.tsx:69`、`:78`、`:86`、`:132`；`src/styles/chat.part4.css:594`–660；`src/components/settings/AppearanceChromeCard.tsx:108`；`src/components/settings/AppearanceSection.tsx:945`、`:993`。
- 验证：原组件与原项目 CSS 在浏览器渲染，900×600 深浅主题均复现；computed background/border 为透明。1280×720 也观察到相同结果。900×600 下滚动到底及底部操作可达性正常，不列为裁切 bug。
- 最小修复：复用已经存在的按钮变体和卡片样式，无需重做设计。

## 验证与边界

- 前端隔离复现：10/10 断言成立。断言验证的是**缺陷存在**，不表示功能验收通过。其中 Select/自动化模型，以及自动化编辑/创建分别提供交叉证据。
- Host 隔离复现：1/1 断言成立，证实 weekly 空星期在后端排到次日。
- 界面：当前源码开发预览；真实组件 + CSS 的隔离工作区弹窗；深浅主题、900×600 与默认 1280×720。没有改本机已安装 App 的设置、真实账号、项目目录或实际定时任务。
- 复现脚本临时放入仓库以使用原测试配置，结束后全部移出；`automation_runner.rs` 已按字节恢复至 HEAD。保留副本 `/tmp/grok-ux-audit/uxAudit.temp.test.tsx`、`rust-repro.txt`、隔离页面脚本。运行日志为 `/tmp/grok-ux-audit-repro.log`、`/tmp/grok-ux-audit-rust.log`。
- 前端重现命令（从仓库根执行，将临时脚本复制回来后运行，完成后删除）：`pnpm exec vitest run src/uxAudit.temp.test.tsx --maxWorkers=1`。Rust 临时模块需附加至 `automation_runner.rs`，执行 `cargo test --manifest-path src-tauri/Cargo.toml ux_audit_temp -- --test-threads=1` 后恢复文件。
- 上一轮完整测试的局域网镜像超时仍是单独的未决项，本轮未重复计入。没有完成 macOS 安装包、Windows/Linux 实机、真实付费任务的端到端验收。
- 这是已检查路径上的明确发现，不代表项目只剩这 9 类问题。

## 下一步

先修 B11（取消误确认），其后按 B12 → B13 → B14 处理可能执行错误任务或修改错误配置的问题，再处理 B15–B19 的交互与外观问题。

## 修复结果（2026-09-15）

以下为 B11–B19 的后续修复，保留上方历史发现及复现依据。每项按顺序完成实现、定向验证、文档和独立本地提交；未推送或发布安装包。

| 编号 | 修复后的行为 | 本地提交 |
|---|---|---|
| B11 | Enter 尊重取消/关闭焦点，长按不会连续确认 | `a3b458d3` |
| B12 | 每周表单保留并可选择星期，旧空星期任务按原定日期继续每周排期 | `10cab374` |
| B13 | 过期工作区请求不污染新项目；Host 拒绝主目录不匹配和跨项目改绑 | `bb0849b3` |
| B14 | 保存期间阻止重复提交和编辑；失败保留表单，成功才关闭 | `16da582a` |
| B15 | 未匹配模型显示真实值，不冒充首项 | `b27852a5` |
| B16 | 解除绑定失败保留提示和重试入口，只在成功后关闭 | `0f262066` |
| B17 | Esc 只关闭顶层，焦点回到父层；初始聚焦不抢子层 | `541d055f` |
| B18 | 下拉支持方向键、首尾、Enter/Space、Esc、Tab；跳过禁用项并遵守弹窗边界 | `4a9fb19a` |
| B19 | 工作区和外观按钮使用有效样式，目录卡片有实心背景 | `7d11c8ff` |

浏览器验证使用真实组件及项目 CSS、模拟数据：900×600 深浅主题，工作区四个附加目录可滚动、操作栏可达；外观恢复子弹窗 Esc 只关闭一层并恢复焦点；Select 方向键跳过禁用项、Enter 保存选项，Esc/Tab 返回位置正确。临时夹具移至 `/tmp/grok-ux-fixes/`，浏览器尺寸已恢复，测试标签与 Vite 已关闭。

### 统一验证

- 前端完整测试：658 个文件、7,552 项通过（`pnpm exec vitest run --maxWorkers=2`）。最后增加星期选项换行后，表单 3 项定向回归通过，900×600 英文星期按钮全部可见，TypeScript/UI 构建再次通过。
- Host 完整测试：1,888 通过、1 忽略、1 失败。唯一失败仍为 `mirror::lan_bind_test::lan_bind_accepts_detected_ipv4`，请求检测地址 `172.18.0.1` 超时；上一轮已在原始基线 `f21ad3f2` 独立复现，未归因于本轮修复。
- ESLint、TypeScript/UI 构建、Rust fmt、Clippy all-targets `-D warnings`、final 代码质量门禁均通过。最终格式整理仅限本轮新增 Rust 片段。
- 日志：`/tmp/grok-ux-full-fe.log`、`/tmp/grok-ux-full-rust.log`、`/tmp/grok-ux-lint.log`、`/tmp/grok-ux-build.log`、`/tmp/grok-ux-fmt.log`、`/tmp/grok-ux-clippy.log`、`/tmp/grok-ux-gates.log`、`/tmp/grok-ux-wrap.log`。
- 未进行签名 macOS 安装包、Windows/Linux 实机或真实付费推理端到端验收；未替换用户已安装软件或修改真实账号。修复不代表整个项目已无其他问题。
