## 2026-09-15 - Task: 排查 macOS 无法对话及影响运行使用的问题

### What was done

- 核对本机 0.2.34 安装包、macOS/CLI 版本与最近运行日志，定位首次中转向导的固定模型值和误报崩溃链路。
- 审查当前 main 的启动、配置、账号、会话回滚、工作区绑定、辅助工具依赖与社区反馈，形成 10 项分级问题及证据边界。
- 通过临时隔离交互测试复现 4 项错误行为；仅新增审计文档，不修复产品代码、不修改本机账号配置。

### Testing

- 锁文件安装、生产前端构建、ESLint、项目代码质量门禁通过。
- 完整前端测试：649 个文件通过、2 个 suite 初始化超时，7516 passed / 6 skipped；两个超时 suite 单 worker 复测 16/16 通过。
- 临时故障复现 4/4 通过；执行后删除临时源码测试文件，原稿留在 /tmp 供本次诊断复查。
- Cargo 不可用，未运行 Rust 测试或构建 DMG；未进行真实付费推理或多平台真机验收。
- 报告中的源码位置、问题数量及相对路径经检查；最终 diff --check 通过。测试成功不代表本次发现的缺陷已修复。

### Notes

- `docs/qa/runtime-audit-2026-09-15.md`：新增故障根因、10 项缺陷、证据等级、验证结果及逐项验收条件。
- `progress.md`：新建本轮进度记录，后续只追加。
- 施工基线：`f21ad3f23b229e24a703788196dfef5aa288606c`；产品代码、package.json、pnpm-lock.yaml 未变。
- 回滚：本轮仅新增两个文档，未追加后续记录前可执行 `rm docs/qa/runtime-audit-2026-09-15.md progress.md`；如后续已有新记录，仅删除本轮新增报告和本条记录，保留后续内容。node_modules/dist 为验证生成的忽略目录，不属于提交内容。

## 2026-09-15 - Task: B01 首次中转配置使用明确模型

### What was done

- 向导要求填写真实模型 ID，保存时同步替换该向导通道的模型目录，避免旧 `default` 目录覆盖新选择。
- 复用现有模型字段翻译与表单样式；存量用户可在自定义提供商中纠正模型，不猜测迁移值。

### Testing

- SetupWizard 中转交互与 providerModelConfig：11/11 通过。
- `pnpm typecheck` 通过；未使用用户真实服务发起推理。实际连接验证在 B03 补齐。

### Notes

- `src/components/SetupWizard.tsx`：新增必填模型字段并持久化明确的模型目录。
- `src/components/SetupWizard.relay.test.tsx`：新增空模型阻止保存、明确模型保存的交互回归。
- `docs/llm-wiki/setup.md`：说明真实模型要求与存量修复方式。
- `progress.md`：追加 B01 实现与验证记录。
- 回滚点：施工前 `f21ad3f2`；本项独立提交标题 `fix(setup): require explicit relay model`，可通过 `git revert <该提交SHA>` 回滚，保留后续独立改动。

## 2026-09-15 - Task: B02 模型不可用错误不再误报崩溃

### What was done

- Host 将模型不存在/不支持归为提供商错误，前端为当前及旧 Host 的错误包装显示明确模型提示，主操作打开提供商设置。
- 保留实际进程退出、401、429、5xx 的恢复路径，补齐 15 种语言。

### Testing

- 错误卡片与国际化目录：58/58 通过；TypeScript 检查通过。
- 临时 Rust 工具链完成 Host 编译；错误分类回归 9/9 通过。

### Notes

- `src-tauri/src/acp_client.rs`：修正模型错误分类并增加 Host 回归测试。
- `src/lib/errorDeck.ts`：模型错误卡片及旧错误码修正。
- `src/lib/errorDeck.test.ts`：验证配置入口与真实崩溃分类。
- `docs/llm-wiki/providers.md`：说明模型错误的处理方式。
- `src/i18n/messages/en/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/de/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/es/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/fil/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/fr/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/id/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/it/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/ja/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/ko/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/pt-BR/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/ru/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/ta/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/uk/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/zh/errors.ts`：新增模型不可用标题与恢复说明。
- `src/i18n/messages/zh-TW/errors.ts`：新增模型不可用标题与恢复说明。
- `progress.md`：追加 B02 记录。
- 回滚：`git revert <fix(errors): distinguish unavailable provider models 的提交SHA>`。

## 2026-09-15 - Task: B03 中转验证失败不再显示成功

### What was done

- 保存前按选定协议验证具体模型；验证失败留在可编辑表单，不写入或激活失败配置。
- 网络异常和 API 拒绝显示错误，可纠正后重试；验证期间锁定表单，账号仍可在空闲时明确跳过。

### Testing

- 中转交互与 setup gate：36/36 通过，覆盖 401、模型不存在、网络错误、Promise 拒绝及重试成功。
- `pnpm typecheck` 通过；请求参数与先验证后持久化顺序经测试确认。

### Notes

- `src/components/SetupWizard.tsx`：以模型推理验证替换 catalog ping，修正失败及 busy 行为。
- `src/components/SetupWizard.relay.test.tsx`：验证错误不持久化、不进入成功页，纠正后可继续。
- `docs/llm-wiki/setup.md`：记录验证含义、失败保留表单和可跳过行为。
- `progress.md`：追加 B03 记录。
- 回滚：`git revert <fix(setup): verify relay before activation 的提交SHA>`。

## 2026-09-15 - Task: B04 新会话继承已保存工作区
### What was done
- 创建会话时绑定当前项目对应的最近工作区，并保存根目录快照与能力；其他项目、无项目和已删除工作区不误绑定。
### Testing
- Rust 工作区相关测试 11 项通过，覆盖持久化、沙箱选择及不匹配项目。
### Notes
- `src-tauri/src/store.rs`：创建时继承匹配工作区并增加回归测试。
- `src-tauri/src/workspace_store.rs`：统一会话能力标签。
- `src-tauri/src/commands/workspace.rs`：复用能力标签。
- `docs/llm-wiki/session-continuity.md`：记录新会话绑定规则。
- `progress.md`：追加本轮记录。
- 回滚：提交后执行 `git revert <B04提交哈希>`，提交标题为 `fix(workspace): bind saved workspace before first session`。

## 2026-09-15 - Task: B05 移动会话清除旧工作区权限
### What was done
- 跨项目移动清除旧工作区；拒绝不匹配绑定，重连不使用历史错误绑定。
- 工作区目录权限按会话替换和撤销，保留其他会话及单独选文件的授权。
### Testing
- Rust 工作区测试 12 项及移动会话回归 1 项通过；覆盖拒绝错绑、旧元数据清除及权限独立撤销。
### Notes
- `src-tauri/src/store.rs`：绑定校验、移动清除和回归测试。
- `src-tauri/src/path_scope.rs`：会话级工作区权限及撤销测试。
- `src-tauri/src/commands/workspace.rs`：保存成功后更新权限。
- `src-tauri/src/session_manager/connect.rs`：按匹配项目选择沙箱及权限。
- `docs/llm-wiki/session-continuity.md`：说明移动后的绑定规则。
- `progress.md`：追加验证记录。
- 回滚：`git revert <B05提交哈希>`，提交标题 `fix(workspace): revoke stale bindings when moving chats`。

## 2026-09-15 - Task: B06 回退失败保留对话记录
### What was done
- Agent 回退失败、超时或会话未连接时终止本地截断，确认成功才更新历史。
### Testing
- Rust rewind 相关测试 13 项通过；新增实际日志保存/读取回归验证三类失败均保留消息、成功才截断。
### Notes
- `src-tauri/src/session_manager/journal.rs`：确认后写日志及回归测试。
- `docs/llm-wiki/session-continuity.md`：记录失败保留历史规则。
- `progress.md`：追加本轮记录。
- 回滚：`git revert <B06提交哈希>`，提交标题 `fix(rewind): preserve history when agent rewind fails`。

## 2026-09-15 - Task: B07 官方与同名中转路由冲突
### What was done
- 自定义渠道禁止占用官方 grok ID；切回官方时将历史同名中转无损重命名并同步本地代理 URL。
### Testing
- Rust providers 测试 32 项通过，覆盖保留密钥/模型、重名后缀、代理 URL、再次选择中转及重复切换幂等。
### Notes
- `src-tauri/src/providers.rs`：保留官方别名及旧中转迁移、回归测试。
- `docs/llm-wiki/providers.md`：记录保留 ID 和旧配置兼容规则。
- `progress.md`：追加本轮记录。
- 回滚：`git revert <B07提交哈希>`，提交标题 `fix(providers): preserve official route on alias collisions`；已迁移的渠道仍保留在配置中，不删除密钥。

## 2026-09-15 - Task: B08 退出登录清理全部活动凭据副本
### What was done
- CLI 登出无论成功、失败或超时，都清理活动 OAuth 副本，失败明确返回；保留保存的账号和独立 API key。
- 部分清理失败也回收加载旧凭据的 Agent。
### Testing
- Rust account 测试 15 项通过；假 CLI 成功却不删文件时全部活动副本仍被删除，单个清理失败不跳过后续文件。
- 未退出或修改本机真实账号。
### Notes
- `src-tauri/src/account.rs`：有界登出、完整清理及隔离测试。
- `src-tauri/src/commands/account.rs`：失败时也回收旧 Agent。
- `docs/llm-wiki/account.md`：更新退出登录行为。
- `progress.md`：追加本轮记录。
- 回滚：`git revert <B08提交哈希>`，提交标题 `fix(account): clear every active auth copy on logout`。

## 2026-09-15 - Task: B09 缺少 Node 时辅助工具不再假就绪
### What was done
- 验证 Node 22+ 可启动，使用 GUI 补全路径；缺失时跳过官方 MCP 注入及对应原生工具禁用，普通 MCP 保持可用。
- 设置显示安装提示和重新检测入口；补齐 15 语言文案与成品依赖说明。
### Testing
- Rust official_aux 测试 22 项通过，覆盖空路径、损坏运行时和后续候选。
- 界面、i18n、设置样式测试 54 项通过；typecheck 通过。界面验证缺失时禁用、重新检测后恢复。
- 未在全新 macOS 虚拟机或真实付费辅助工具调用中验收。
### Notes
- `src-tauri/src/official_aux.rs`：运行时检测、状态和注入门闸。
- `src/components/OfficialAuxPanel.tsx`：缺失提示与重新检测。
- `src/components/OfficialAuxPanel.test.tsx`：缺失到恢复的交互回归。
- `src/i18n/messages/{de,en,es,fil,fr,id,it,ja,ko,pt-BR,ru,ta,uk,zh,zh-TW}/providers.ts`：各语言新增 Node 安装提示。
- `README.md`、`README_EN.md`：明确可选辅助工具的 Node 依赖。
- `docs/llm-wiki/model-routing.md`：记录依赖、降级与恢复步骤。
- `progress.md`：追加本轮记录。
- 回滚：`git revert <B09提交哈希>`，提交标题 `fix(tools): gate auxiliary MCP on a working Node runtime`。

## 2026-09-15 - Task: B10 损坏或挂起 CLI 不再显示就绪
### What was done
- 区分成功无版本输出和无法执行、异常退出、探测超时；只保留成功执行的兼容候选。
- 遇到损坏候选继续寻找正常 CLI，全失败时停留在安装/选择步骤。
### Testing
- Rust cli_probe 测试 16 项通过；隔离脚本覆盖正常版本、无输出成功、执行格式错误、非零退出、3 秒超时及多候选回退。
- 未替换本机 CLI。
### Notes
- `src-tauri/src/cli_probe.rs`：执行结果判定及候选回退回归。
- `docs/llm-wiki/setup.md`：更新就绪判定规则。
- `progress.md`：追加本轮记录。
- 回滚：`git revert <B10提交哈希>`，提交标题 `fix(startup): reject CLI candidates that cannot run`。

## 2026-09-15 - Task: 十项运行问题统一验证与交付记录
### What was done
- 汇总 B01–B10 的独立修复提交、验证结果和安装包验收边界，保存原始审计报告。
- 仅整理本轮新增/修改的 Rust 片段；按 Clippy 建议去除回归测试中的两次冗余克隆。
- 在临时独立 worktree 对照复测唯一失败的局域网测试，确认修复前同样失败；已清理对照 worktree。
### Testing
- 前端：653 个测试文件、7,530 项通过；Lint、UI 构建、TypeScript、final 质量门禁均通过。
- Host 完整测试：1,886 通过、1 忽略、1 失败（局域网镜像请求本机检测地址超时）。当前代码单测重跑及修复前 f21ad3f2 对照均复现同一失败，未声称全套通过。
- Rust fmt 检查、Clippy all-targets 零警告通过；CLI 回归在清理克隆后再次验证。
- 依赖结构检查、下载合同 3 项自测、生产依赖审计通过（无已知漏洞）。
- 未进行已签名 macOS 安装包及真实渠道推理验收；未修改真实账号或安装的 CLI/App。
### Notes
- `src-tauri/src/account.rs`、`src-tauri/src/acp_client.rs`、`src-tauri/src/commands/workspace.rs`、`src-tauri/src/official_aux.rs`、`src-tauri/src/path_scope.rs`、`src-tauri/src/providers.rs`、`src-tauri/src/session_manager/connect.rs`、`src-tauri/src/session_manager/journal.rs`、`src-tauri/src/store.rs`：仅整理本轮变更片段格式。
- `src-tauri/src/cli_probe.rs`：整理本轮片段，测试使用引用切片替代冗余克隆。
- `docs/qa/runtime-audit-2026-09-15.md`：保存原始审计并追加十项修复和统一验证结果。
- `progress.md`：追加统一验收记录。
- 回滚：`git revert <本次验证整理提交哈希>`，标题 `chore(qa): record runtime fixes and validation`；产品行为按各 B01–B10 提交单独 `git revert`。所有修复前回滚点为 `f21ad3f23b229e24a703788196dfef5aa288606c`，未推送远端。

## 2026-09-15 - Task: 第二轮使用逻辑与外观审计
### What was done
- 在已修复 B01–B10 的基线上继续审计，确认 B11–B19 共 9 类问题（4 项 P1、5 项 P2），记录触发条件、用户影响、源码依据和最小修复方向。
- 用受控异步请求、模拟 API、真实组件键盘事件和后端日期计算复现；检查工作区弹窗深浅主题与最小窗口，排除未出现的裁切问题。
- 清理临时复现脚本、页面及服务，恢复浏览器尺寸；后端临时测试文件按字节恢复至 HEAD，未修改产品行为或真实用户数据。
### Testing
- 临时前端复现测试 10/10 断言成立，验证的是当前缺陷存在，不是修复验收。
- 临时 Host weekly 排期复现 1/1 断言成立：每周空星期被排至次日。
- 浏览器原组件与 CSS：900×600 深浅主题的按钮样式缺失已确认；滚动和底部操作可达性正常。
- 临时脚本副本及日志留在 `/tmp/grok-ux-audit/`、`/tmp/grok-ux-audit-repro.log`、`/tmp/grok-ux-audit-rust.log`；未跑真实付费推理、创建真实定时任务或改变账号权限。
### Notes
- `docs/qa/ux-logic-audit-2026-09-15.md`：新增第二轮问题清单、复现与验收边界。
- `progress.md`：追加本轮审计记录。
- 临时修改的 `src-tauri/src/automation_runner.rs` 已精确恢复；临时 `src/uxAudit.temp.test.tsx`、`src/uxAudit.temp.tsx`、`ux-audit.temp.html` 均已移出仓库，不进入交付。
- 回滚：`git revert <本轮文档提交哈希>`，提交标题 `docs(qa): record usability and logic audit findings`；审计基线 `b922a2c0`。

## 2026-09-15 - Task: B11 修复确认框 Enter 误操作
### What was done
- Enter 尊重取消/关闭按钮焦点，仅在确认按钮上执行确认；阻止长按连续确认。
### Testing
- useAppDialogs 与 a11yFocus 定向测试：14 项通过（/tmp/grok-b11.log）。
### Notes
- `src/hooks/useAppDialogs.ts`：限制键盘确认目标与重复事件。
- `src/hooks/useAppDialogs.test.tsx`：覆盖取消、关闭、确认、长按和输入法。
- `docs/llm-wiki/dialogs.md`：记录键盘规则。
- `progress.md`：追加修复记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(dialogs): honor focused cancel actions on Enter')`。

## 2026-09-15 - Task: B12 修复每周排期与星期丢失
### What was done
- 每周表单支持星期多选并保留编辑值，旧任务按原定日期的星期继续排期，前后端规则一致。
### Testing
- 前端排期与表单 8 项通过；Host automation_runner 8 项通过，覆盖延迟补跑和历史空星期；TypeScript 通过。
### Notes
- `src/components/AutomationsPage.tsx`：保存、编辑和本地化星期选择。
- `src/components/AutomationsPage.test.tsx`：保留星期及至少一天的交互回归。
- `src/lib/automations.ts`、`src/lib/automations.test.ts`：稳定星期锚点及回归。
- `src-tauri/src/automation_runner.rs`：每周空星期回退及 Host 回归。
- `docs/llm-wiki/automations.md`：说明排期兼容规则。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(automations): preserve weekly schedule days')`。

## 2026-09-15 - Task: B13 防止工作区异步结果串项目
### What was done
- 关闭与重新打开弹窗时使旧请求失效；过期选目录和保存结果不再污染新项目。
- 后端拒绝主目录不匹配及已有工作区跨项目改绑。
### Testing
- 前端受控延迟请求 3 项通过；Host workspace 相关 13 项通过，包括拒绝错误写入、原数据不变和正常重命名；定向 ESLint 通过。
### Notes
- `src/hooks/useMultiRootWorkspace.ts`：请求代次、保存项目校验。
- `src/hooks/useMultiRootWorkspace.test.tsx`：加载、目录选择和保存竞争回归。
- `src-tauri/src/workspace_store.rs`：写入前检查项目归属及主目录。
- `src-tauri/src/store.rs`：临时目录存储回归。
- `docs/llm-wiki/session-continuity.md`：项目隔离约束。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(workspaces): discard stale project requests')`。

## 2026-09-15 - Task: B14 防止自动任务重复提交
### What was done
- 保存使用同步提交锁，忙碌期间禁用编辑与关闭；失败就近显示并保留输入，允许重试。
### Testing
- 自动任务表单 3 项通过，包括连续点击仅创建一次、忙碌不关闭、失败输入保留和重试成功。
### Notes
- `src/components/AutomationsPage.tsx`：提交锁、忙碌反馈、表单错误提示。
- `src/components/AutomationsPage.test.tsx`：受控失败和重试回归。
- `docs/llm-wiki/automations.md`：保存交互约束。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(automations): prevent duplicate form submissions')`。

## 2026-09-15 - Task: B15 修复下拉框错误显示模型
### What was done
- 已移除或未匹配的选项显示真实保存值，不再伪装成第一个可用模型。
### Testing
- Select 与自动任务表单 6 项通过，覆盖未知值、空值、正常选择；上一任务测试参数清理后 TypeScript 通过。
### Notes
- `src/components/Select.tsx`：删除误导性的首项回退。
- `src/components/Select.test.tsx`：真实值展示与主动选择回归。
- `docs/llm-wiki/dialogs.md`：未匹配值约定。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(select): display unmatched values honestly')`。

## 2026-09-15 - Task: B16 保留解除绑定失败提示
### What was done
- 解除绑定返回明确成功结果，失败时保持弹窗与错误；重试开始清除旧错误，过期结果不影响新项目。
### Testing
- 工作区 Hook 4 项通过，包括失败后可见、恢复可操作及重试成功才关闭。
### Notes
- `src/hooks/useMultiRootWorkspace.ts`：明确返回结果与过期保护。
- `src/app/WorkbenchComposerColumn.tsx`：只在成功后关闭。
- `src/hooks/useMultiRootWorkspace.test.tsx`：失败重试回归。
- `docs/llm-wiki/session-continuity.md`：失败交互规则。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(workspaces): keep detach failures visible')`。

## 2026-09-15 - Task: B17 修复 Esc 同时关闭多层弹窗
### What was done
- 仅顶层弹窗接收键盘和初始焦点，同一 Esc 只消费一次；子层关闭后回到父层操作按钮。
### Testing
- 焦点工具、真实叠加 GlassModal 与确认框共 16 项通过；覆盖反向注册、逐层关闭与焦点恢复。
### Notes
- `src/lib/a11yFocus.ts`：共享层栈、事件归属及焦点恢复。
- `src/components/GlassModal.focus.test.tsx`：真实叠层和注册顺序回归。
- `docs/llm-wiki/dialogs.md`：顶层焦点规则。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(dialogs): route keyboard events to the top layer')`。

## 2026-09-15 - Task: B18 补齐下拉键盘导航与弹窗协作
### What was done
- 下拉菜单自动聚焦可用项，支持方向键、首尾、选择、取消及 Tab 离开；焦点与实际值分离，禁用项不可选择。
- 弹窗识别自己控制的 portal 菜单，不抢菜单键盘或初始焦点；Tab 继续遵守弹窗边界。
### Testing
- Select、叠加弹窗、自动任务表单与焦点工具 21 项通过，包括捕获/冒泡两种弹窗监听、未知值、禁用项、焦点恢复与 Tab 边界。
- TypeScript 与定向 ESLint 通过（菜单初始焦点竞争补丁在统一检查再次验证）。
### Notes
- `src/components/Select.tsx`：键盘交互、单一可 Tab 选项及 ARIA。
- `src/lib/a11yFocus.ts`：所属菜单事件归属，排除负 tabindex。
- `src/components/Select.test.tsx`：真实弹窗键盘回归。
- `src/components/AutomationsPage.test.tsx`：按正确 option 角色选择星期频率。
- `docs/llm-wiki/dialogs.md`：下拉键盘契约。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(select): support keyboard navigation inside dialogs')`。

## 2026-09-15 - Task: B19 恢复工作区和外观按钮样式
### What was done
- 工作区主次按钮、外观重置小按钮改用实际存在的变体，目录卡片复用实心设置卡片。
- 清理临时验证页、恢复浏览器尺寸并关闭测试标签。
### Testing
- 原组件 + 原 CSS 在 900×600 深浅主题均完成视觉检查：主按钮有强调色，次按钮有边框，目录卡片有实心背景，四个附加目录可滚动且底部操作可达。
- 真实 AppearanceChromeCard 恢复按钮深浅主题已检查；Esc 关闭子弹窗后焦点回到恢复按钮。
- 真实浏览器 Select 验证：方向键跳过禁用项、Enter 保存 Beta、Tab 回到弹窗关闭按钮、Esc 仅收起菜单并返回触发按钮。
- 临时样例全为模拟数据，未修改用户偏好或真实项目；夹具留于 /tmp/grok-ux-fixes/。
### Notes
- `src/components/MultiRootWorkspaceModal.tsx`：既有按钮变体和实心卡片。
- `src/components/settings/AppearanceChromeCard.tsx`：恢复默认小按钮样式。
- `src/components/settings/AppearanceSection.tsx`：字体重置小按钮样式。
- `docs/llm-wiki/dialogs.md`：按钮及目录卡片约定。
- `progress.md`：追加记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(appearance): use supported button and card styles')`。

## 2026-09-15 - Task: B11–B19 统一验收与收尾
### What was done
- 汇总九项独立修复、交互验证和交付边界，保留审计原文。
- 收尾修正本轮星期按钮在窄表单中的换行；仅格式化本轮新增 Rust 片段，逐块确认未触及历史代码。
- 临时 UI 样例已移出仓库，测试标签关闭，窗口尺寸恢复，开发服务停止。
### Testing
- 前端全量：658 个文件、7,552 项通过；最后星期换行调整后，表单 3 项定向回归与 TypeScript/UI 构建再次通过。
- 浏览器：900×600 深浅工作区、外观按钮；真实父子弹窗、Select 方向键/Enter/Esc/Tab；窄表单英文星期七天完整显示并换行。
- Host 全量：1,888 通过、1 忽略、1 失败。唯一失败是上一轮已在 f21ad3f2 对照复现的局域网镜像地址超时，不声称全套通过。
- ESLint、Rust fmt、Clippy all-targets 零警告、final 质量门禁、git diff --check 通过；未增长 App/AppWorkbench。
- 日志位于 /tmp/grok-ux-*.log；未进行签名安装包或真实付费任务验证。
### Notes
- `src/components/AutomationsPage.tsx`：星期选择允许换行，避免窄表单横向溢出。
- `src-tauri/src/automation_runner.rs`、`src-tauri/src/store.rs`：仅整理本轮新增代码格式。
- `docs/llm-wiki/automations.md`：补充星期布局规则。
- `docs/qa/ux-logic-audit-2026-09-15.md`：追加九项修复、提交和统一验证结果。
- `progress.md`：追加收尾记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='chore(qa): record usability fixes and validation')`；产品修复可按审计表逐项 revert，整轮修复前基线为 `27dbda6f`。未推送远端。

## 2026-09-15 - Task: 制作包含运行与交互修复的 macOS 安装包
### What was done
- 从干净源码 ba5e835f 制作 Apple Silicon release app/dmg，文件名附带提交号，与旧 0.2.35 安装包区分。
- 发现默认本地包仅有链接器签名后，以 Tauri 临时签名重新封装并验证；生成 SHA256 清单和构建说明。
- 从交付镜像复制应用，以独立数据启动到主界面；清理测试进程和挂载，恢复窗口位置记录。
### Testing
- TypeScript、Vite、Rust release 编译与 app/dmg 打包通过。
- Mach-O arm64、Info.plist、原 App 与镜像内 App 的 strict codesign 校验、DMG 校验均通过。
- 实际包启动到主界面，检测到 Grok Build CLI 1.0.25，持续运行超过两分钟未退出；未登录或执行真实付费会话。
- SHA256：aca48a7d25fda51d9dfd84d8e5b186b2be753948cb21ce88bd0765fe5e6590ae。
- 无 Apple Developer ID 证书，未公证；未将临时签名完整性验证称为 Apple 信任验证。
### Notes
- `dist-installers/Grok_0.2.35_ba5e835f_aarch64.dmg`：本地 ARM64 安装包，20,455,415 字节，git 忽略。
- `dist-installers/SHA256SUMS-ba5e835f.txt`：包哈希，git 忽略。
- `src-tauri/target/aarch64-apple-darwin/release/bundle/`：原始 app/dmg 构建产物，git 忽略。
- `docs/BUILD.md`：补充本地临时签名重新打包与校验命令。
- `docs/qa/macos-package-2026-09-15.md`：来源、验证结果、安装与公证边界。
- `progress.md`：追加本轮记录。
- 回滚文档：`git revert $(git log -1 --format=%H --grep='docs(build): record verified macOS repair installer')`；移除产物：`rm dist-installers/Grok_0.2.35_ba5e835f_aarch64.dmg dist-installers/SHA256SUMS-ba5e835f.txt`。未安装覆盖正式 App，未推送、打 tag 或发布。

## 2026-09-15 - Task: 修复流式文字持续到达时界面停止刷新
### What was done
- 将 Markdown 流式刷新从反复延期改为固定截止时间读取最新内容，保留长文本解析限频及结束立即展示。
- 新增持续输出、尾部刷新、结束及卸载的真实组件回归。
### Testing
- 三组短/中/长文本持续输出用例修复前均失败，修复后通过。
- MarkdownChat、streamRenderPolicy、softStreamBuffer 共 24 项通过；定向 ESLint 通过。
- 模拟时钟验证刷新逻辑，不代表安装版帧率；未调用真实模型。
### Notes
- `src/components/lobe-chat/MarkdownChat.tsx`：固定刷新截止时间、最新内容引用和计时器清理。
- `src/components/lobe-chat/MarkdownChat.test.tsx`：持续分片与结束/卸载回归。
- `docs/qa/stream-input-performance-2026-09-15.md`：记录原因、显示约定与验证边界。
- `progress.md`：追加本轮记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(chat): keep streaming markdown paints on schedule')`。未推送或替换安装版。

## 2026-09-15 - Task: 合并提示词输入框重复布局并验证性能修复
### What was done
- 输入、受控草稿回传和换行共用每帧一次的尺寸测量，草稿立即提交，滚动在测量后执行。
- 中文输入法预编辑暂停排队布局，卸载清理任务；减少普通输入路径重复序列化。
- 完成真实组件的隔离浏览器验证，关闭测试标签与开发服务。
### Testing
- 新增连续输入和 IME 测量回归在修复前失败，修复后通过；三次连续输入由六次同步测量减少为下一帧一次。
- 编辑器换行、IME、光标、布局共 21 项通过；全量前端 659 个文件、7,561 项通过。
- TypeScript + Vite 构建、全量 ESLint、git diff --check 通过；App/AppWorkbench 行数未增长。
- 隔离浏览器 12,500 字符起始正文、每 60 ms 一段、500 段持续输出期间出现 101 次正文 DOM 更新，尾部完整；中英文输入、Shift+Enter 和清空正常。
- 未测安装版 WKWebView 帧率或系统输入法候选窗口；未调整网络、模型或推理强度，未调用真实模型。
### Notes
- `src/components/ComposerEditor.tsx`：合并尺寸测量和光标滚动，保留 IME 边界，减少重复序列化。
- `src/components/ComposerEditor.layout.test.tsx`：连续输入、IME、卸载、增长/收缩和换行回归。
- `docs/qa/stream-input-performance-2026-09-15.md`：追加输入修复、统一验收与安装版验证边界。
- `progress.md`：追加本轮记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(composer): coalesce input layout per animation frame')`。前一项流式修复可独立回滚 bd584a62；未推送、发布或替换安装版。

## 2026-09-15 - Task: 深度审计剩余使用逻辑与内容一致性问题
### What was done
- 围绕文件编辑和预览、发送队列、语音转写检查真实操作结果，确认 7 项新问题并记录触发步骤、影响、代码依据和修复验收标准。
- 排除模型切换丢失高级配置的疑点；本轮只审计，未修复产品代码或替换已安装软件。
### Testing
- 在临时目录引用真实组件/hook，模拟文件接口、发送与转写结果；5 个测试文件、9 个诊断用例通过，含 Markdown 内容损坏、错文件刷新/覆盖、队列提前发送/重复失败、语音跨对话和空草稿预览。
- “诊断用例通过”表示确认缺陷存在，不表示修复完成。结果见 `/private/tmp/grok-deep-audit/results.log`；未写用户文件、操作麦克风或调用付费模型。
- `git diff --check` 通过；仅新增审计文档、追加本日志，无需产品构建或全量测试。
### Notes
- `docs/qa/deep-usage-audit-2026-09-15.md`：记录 B20–B26、复现结果、验证边界及排除项。
- `progress.md`：追加本轮审计记录，不改写历史。
- 回滚：本轮基线为 `eb5284eb` 且开工时工作区干净；尚无后续修改时执行 `git restore -- progress.md`，并执行 `rm docs/qa/deep-usage-audit-2026-09-15.md`。未提交、推送或发布。

## 2026-09-15 - Task: 修复 B20 Markdown 编辑丢失图片与表格
### What was done
- 为现有可视化编辑补齐图片与表格节点，保持图片 URL、标题及表格结构，配套现有主题样式。
- 加载/撤销与权限切换不再回传为用户编辑，避免改写未操作的草稿。
### Testing
- 两项真实组件回归修复前失败，修复后通过；验证图片标题与路径、表格单元格、无关正文及外部加载回调。
- 定向 ESLint、git diff --check 通过；依赖通过 pnpm 更新，仅增加两个相同版本的 TipTap 扩展。
### Notes
- `src/components/MarkdownTiptapEditor.tsx`：补齐图片/表格、消除重复 Link，并关闭外部同步的更新事件。
- `src/components/MarkdownTiptapEditor.test.tsx`：内容保留与重载回归。
- `src/styles/composer.part3.css`：图片宽度与表格边框样式。
- `package.json`、`pnpm-lock.yaml`：固定新增扩展为 3.31.3，与现有 TipTap 一致。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B20 修复结果。
- `progress.md`：追加本项记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(editor): preserve markdown images and tables')`，随后 `pnpm install --frozen-lockfile`。

## 2026-09-15 - Task: 修复 B21 外部同名文件身份混淆
### What was done
- 外部文件保留完整路径，仅为项目内文件提供相对别名，修复刷新读错和同名标签误复用。
### Testing
- 两项缺陷回归修复前失败、修复后通过；验证外部文件刷新/保存、同名文件独立、项目内绝对/相对入口复用。
- 文件相关 38 项测试、定向 ESLint、git diff --check 通过。
### Notes
- `src/components/resource-viewer/useResourceFileTabs.ts`：外部文件标签键保留绝对路径。
- `src/components/resource-viewer/useResourceFileTabs.test.tsx`：文件身份、刷新和保存回归。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B21 修复结果。
- `progress.md`：追加本项记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(files): keep external file paths distinct')`。

## 2026-09-15 - Task: 修复 B22 文件冲突操作对象错位
### What was done
- 将冲突覆盖和重载绑定到冲突标签 ID，允许用户在保存等待期间切换文件而不误操作其他草稿。
### Testing
- 延迟保存后切换标签的覆盖/重载回归修复前均失败，修复后通过；确认 B 草稿和 mtime 未被更改。
- 两项实际弹窗按钮接线回归通过，相关文件 hook/工作区/编辑栏共 11 项通过；定向 ESLint、git diff --check 通过。
### Notes
- `src/components/resource-viewer/useResourceFileTabs.ts`：读写允许显式指定目标标签。
- `src/components/resource-viewer/useResourceFileTabs.test.tsx`：冲突期间切换文件回归。
- `src/components/side-workbench/FilesWorkspace.tsx`：弹窗传递冲突标签 ID。
- `src/components/side-workbench/FilesWorkspace.editor-chrome.test.tsx`：实际重载与覆盖按钮接线回归。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B22 修复结果。
- `progress.md`：追加本项记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(files): target conflict actions at the original tab')`。

## 2026-09-15 - Task: 修复 B23 编辑队列期间旧消息提前发送
### What was done
- 将编辑窗口持有的暂停绑定到原会话，避免回复完成和等待授权状态变化提前放行。
- 保存/取消后恢复队列，切换对话后关闭编辑也释放正确会话的暂停。
### Testing
- 保存、取消及跨会话关闭三项真实组合 hook 回归修复前均失败、修复后通过。
- 队列/弹窗 41 项测试、定向 ESLint、git diff --check 通过。
### Notes
- `src/hooks/useSendQueue.ts`：记录编辑暂停归属，保护暂停并响应解除。
- `src/hooks/useSendQueue.test.tsx`：忙碌/授权/就绪转换与编辑确认、取消、导航回归。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B23 修复结果。
- `progress.md`：追加本项记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(queue): retain pause while editing a queued prompt')`。

## 2026-09-15 - Task: 修复 B24 语音转写跨对话插入与发送
### What was done
- 复用现有导航标记，将录音、转写与自动发送绑定到发起视图，离开后取消并忽略旧结果。
- 清理卸载时的录音资源，保留同一对话的正常听写和自动发送。
### Testing
- 三项串对话/草稿与自动发送竞态回归修复前失败，修复后通过。
- 语音、导航及文件弹窗 61 项测试通过，覆盖发送开关、取消、失败和卸载；TypeScript、定向 ESLint、git diff --check 通过。
- 模拟音频和转写，不操作麦克风或付费服务；App/AppWorkbench 总行数不增长。
### Notes
- `src/hooks/useVoiceDictation.ts`：绑定录音来源视图、校验异步结果、取消与卸载清理。
- `src/hooks/useVoiceDictation.test.tsx`：新增八项真实 hook 回归。
- `src/app/AppWorkbench.tsx`：将现有 currentViewFocus 传入语音 hook。
- `src/components/side-workbench/FilesWorkspace.editor-chrome.test.tsx`：移除本轮 B22 测试中无效的查询选项，修正类型检查错误。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B24 修复结果。
- `progress.md`：追加本项记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(voice): bind dictation results to the originating view')`。

## 2026-09-15 - Task: 修复 B25 发送队列失败后自动重试循环
### What was done
- 返回失败或异常都将消息放回队列并稳定暂停，停止由就绪/断开状态转换触发的自动重试。
- 保留现有显式恢复入口，并验证恢复不会绕过仍打开的队列编辑窗口。
### Testing
- 返回 false 与抛错的两项回归修复前失败、修复后通过；验证状态转换、导航及重试成功后的队列清空。
- 队列/弹窗 44 项测试、定向 ESLint、git diff --check 通过。
### Notes
- `src/hooks/useSendQueue.ts`：统一失败暂停，删除按会话状态自动清除暂停的 effect。
- `src/hooks/useSendQueue.test.tsx`：失败保留、显式重试及编辑暂停保护回归。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B25 修复结果。
- `progress.md`：追加本项记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(queue): wait for explicit retry after send failures')`。

## 2026-09-15 - Task: 修复 B26 清空草稿后预览与保存不一致
### What was done
- Markdown、HTML 和 JSON 预览保留合法空草稿，HTML 空白文档不再回读旧文件。
### Testing
- 五项空草稿与 HTML 空白文档回归修复前失败，修复后通过；连同非空预览共八项通过。
- 验证实际 HTML iframe 的 srcDoc；Markdown/代码下游以简单渲染器替代，仅验证父组件取值。定向 ESLint、git diff --check 通过。
### Notes
- `src/components/resource-viewer/ResourcePreviewBody.tsx`：删除对空草稿的错误回退。
- `src/components/resource-viewer/ResourcePreviewBody.test.tsx`：三种文本类型空/非空预览回归。
- `src/components/HtmlBrowser.tsx`：区分未提供内容和有效空文档。
- `src/components/HtmlBrowser.test.tsx`：空字符串及纯空白不回读磁盘的回归。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B26 修复结果。
- `progress.md`：追加本项记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(preview): render empty drafts without stale fallback')`。

## 2026-09-15 - Task: 补齐 B20 本地图片显示并验证编辑器
### What was done
- 本地图片按 Markdown 所在目录解析，仅显示地址使用现有媒体 HTTP，保存保留原引用。
- 在隔离浏览器验证图片、表格和插入分隔线后的内容保留，关闭验证页与开发服务。
### Testing
- 新增相对图片路径、编码空格和原引用保留回归；编辑器与预览共九项通过。
- 浏览器使用模拟媒体端点，验证真实编辑器布局和序列化，不读取用户图片。
- 补齐 jsdom Range 测量接口后全量 665 文件、7,593 项通过，无未处理异常；build:ui 和 lint 通过。后续队列收尾将另做最终验证。
### Notes
- `src/components/MarkdownTiptapEditor.tsx`：图片节点显示与保存地址分离，复用媒体服务。
- `src/components/MarkdownTiptapEditor.test.tsx`：本地图片引用回归及测试环境 Range 测量接口。
- `src/components/resource-viewer/ResourcePreviewBody.tsx`：传入 Markdown 文件绝对路径。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加本地图片与浏览器验证。
- `progress.md`：追加收尾记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(editor): resolve local images without rewriting markdown')`。

## 2026-09-15 - Task: 补齐 B23 普通发送与编辑暂停入口隔离
### What was done
- 将普通发送的失败恢复与编辑窗口关闭区分，防止同一对话其他发送动作意外放行正在修改的消息。
### Testing
- 新增交叉入口回归修复前失败、修复后通过；队列/弹窗 45 项通过。
- 定向 ESLint、git diff --check 通过；App/AppWorkbench 总行数仍不增长。
### Notes
- `src/hooks/useSendQueue.ts`：独立暴露编辑暂停释放入口。
- `src/hooks/useSendQueue.test.tsx`：普通发送解除失败暂停时保留编辑保护的回归。
- `src/app/AppWorkbench.tsx`：队列编辑窗口接入专用释放入口。
- `docs/qa/deep-usage-audit-2026-09-15.md`：追加 B23 入口复核与修复。
- `progress.md`：追加收尾记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='fix(queue): separate edit release from ordinary send recovery')`。

## 2026-09-16 - Task: 完成 B20–B26 修复统一验收
### What was done
- 汇总七项修复与补充验证，记录提交对应关系、安装版边界及回滚点。
- 产品源码固定在 6988ee18，验证期间未修改用户文件或调用真实模型。
### Testing
- 全量前端 665 文件、7,594 项通过且无未处理异常，新增 33 项回归。
- pnpm build:ui（TypeScript + Vite）、全量 ESLint、git diff --check 通过；保留既有大分块提示。
- 隔离浏览器检查图片和表格布局、正文/分隔线修改后的内容保留，以及模拟媒体服务下的本地图片显示；测试页和服务已关闭。
- App/AppWorkbench 总行数不增长；未修改 Rust、协议、数据库或鉴权，因此未重跑 Rust 套件。
### Notes
- `docs/qa/deep-usage-audit-2026-09-15.md`：标明原始审计与修复状态，追加最终验收、提交表和验证边界。
- `progress.md`：追加统一验收记录。
- 回滚本次文档：`git revert $(git log -1 --format=%H --grep='docs(qa): record verified deep usage repairs')`；产品按报告所列提交逆序 revert，修复前基线 eb5284eb。
- 所有改动仅本地提交；未推送、发布、新增 DMG 或替换 /Applications/Grok.app。

## 2026-09-16 - Task: 调整主页面为更简洁的 Codex 风格
### What was done
- 将新会话欢迎语与输入框集中居中，优化侧栏分组、导航留白、顶栏和账号区视觉层次。
- 输入框改用柔和圆角、轻阴影与焦点边框；较矮桌面窗口收起品牌标识，为长输入保留空间。
- 保留主题、透明度、功能入口及现有设置，保存深浅色实际预览与验收说明。
### Testing
- pnpm build:ui、pnpm lint、git diff --check 通过；构建保留既有大分块提示。
- 输入布局、浮层、宽度、底部避让、输入行数、侧栏密度、窗口布局、流式样式等 8 文件 63 项测试通过。
- 隔离浏览器实测 1280×720 深浅色主页、820×620 多行输入、720×500 十二行输入，以及模型/添加菜单和草稿清空确认框；控件可见、菜单未裁切，测试草稿已清理。
- App/AppWorkbench 未改，总行数 13,472；未增加渲染动画或模糊层。没有真实后端回合、安装包、手机和逐一皮肤实测，不将浏览器验证视为这些场景验收。
### Notes
- `src/styles/chat.part1.css`：欢迎区集中布局、短窗口适配和选择条间距。
- `src/styles/chat.part2.css`：输入框圆角、边框、阴影、内边距与中性焦点样式。
- `src/styles/settings.part5.css`：主页面顶栏减弱分割线、标题增强字重。
- `src/styles/sidebar.part1b.css`：项目分组标签字号与对比度。
- `src/styles/sidebar.part2.css`：当前会话字重。
- `src/styles/sidebar.part4.css`：导航留白与圆角、账号区边界。
- `docs/qa/main-page-style-2026-09-16.md`：记录设计、验收范围、截图和回滚命令。
- `docs/qa/main-page-style-2026-09-16/dark.png`：实际深色主页截图。
- `docs/qa/main-page-style-2026-09-16/light.png`：实际浅色主页截图。
- `progress.md`：追加本轮记录。
- 样式回滚：`git restore --source=9051e234 -- src/styles/chat.part1.css src/styles/chat.part2.css src/styles/settings.part5.css src/styles/sidebar.part1b.css src/styles/sidebar.part2.css src/styles/sidebar.part4.css`；保留文档历史并追加回滚记录。
- 未推送、发布或替换运行中的安装版，本轮没有制作 DMG。

- 截图格式核对：浏览器实际返回 JPEG，上述本轮截图最终文件名为 `docs/qa/main-page-style-2026-09-16/dark.jpg` 和 `docs/qa/main-page-style-2026-09-16/light.jpg`（不是 PNG）；验收文档链接已同步。

## 2026-09-16 - Task: 精简输入框工具栏并将模型选择移入右下角
### What was done
- 将模型／推理强度选择放入输入框右下角、发送按钮左侧，展开菜单不再撑宽父容器。
- 将语音输入与查找技能收进「＋」菜单，保留配置提示、已安装技能调用和语音活动中的停止／取消入口。
- 同步产品布局规范与实测截图；手机入口和语音快捷键沿用现有方式。
### Testing
- pnpm build:ui、pnpm lint、git diff --check 通过；保留既有大分块提示。
- 六个相关测试文件 109 项通过；语音菜单改为 Tab + Space 激活的测试加强后，控件六项复验通过。
- 实际隔离浏览器检查深浅色主页、添加菜单、技能面板打开与收起、语音未配置提示，以及 720×500 模型菜单和子菜单；模型与发送控件位置正常，浮层有背景且未裁切。
- App/AppWorkbench 未修改，总计 13,472 行。没有调用真实语音／模型服务；未执行 Rust 套件或安装包真机回归。
### Notes
- `src/app/WorkbenchComposerColumn.tsx`：通过插槽把原模型菜单移入输入框。
- `src/app/WorkbenchComposerShell.tsx`：收纳技能／语音入口，保留活动语音控制并摆放模型插槽。
- `src/components/ComposerModelMenu.tsx`：增加工具栏紧凑模式，取消该模式下固定宽度与父级展开。
- `src/components/ComposerPlusPanel.tsx`：承载菜单顶部可选工具按钮组。
- `src/styles/chat.part2.css`：输入框内模型容器的自适应宽度。
- `src/styles/chat.part4.css`：菜单顶部工具按钮样式。
- `src/styles/chat.part6.css`：紧凑模型菜单允许收缩并保留可读标签。
- `src/app/WorkbenchComposerShell.controls.test.tsx`：增加工具入口、键盘激活、活动语音控制及互斥回归。
- `src/components/ComposerPortalPop.test.tsx`：验证紧凑模型菜单不撑宽父容器，保留 portal 语义。
- `src/lib/composerColumn.guard.test.ts`：将旧外部模型条和旧圆角断言同步为当前布局规范。
- `docs/llm-wiki/dialogs.md`：追加桌面输入框工具布局规范。
- `docs/qa/composer-controls-2026-09-16.md`：记录使用方式、验证范围、截图和回滚命令。
- `docs/qa/main-page-style-2026-09-16/controls-dark.jpg`：本轮实际深色界面截图。
- `docs/qa/main-page-style-2026-09-16/controls-light.jpg`：本轮实际浅色界面截图。
- `docs/qa/main-page-style-2026-09-16/controls-tools.jpg`：本轮实际更多功能菜单截图。
- `progress.md`：追加本轮完成与验证记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='feat(composer): move model picker inside and tuck tools into add menu')`；本轮前基线 df3573af。
- 仅本地改动，未推送、发布、制作 DMG 或替换 /Applications/Grok.app。

## 2026-09-16 - Task: 主页面品牌改为 Grok 并更新欢迎语
### What was done
- 将主页面原 SuperGrok 展示改为 Grok，欢迎语改为「请开始你的表演」。
- 同步十五种语言的欢迎语、对应动画设置说明，以及新文案的设置搜索词。
### Testing
- pnpm build:ui、改动文件 ESLint、git diff --check 通过；构建保留既有大分块提示。
- 多语言与欢迎动画 2 文件 44 项通过；动画测试内旧布局断言同步为已实施的居中布局，未新增镜像实现的测试。
- 隔离浏览器实际显示 Grok 和「请开始你的表演」，布局正常；未替换安装版、调用模型或录音。
### Notes
- `docs/qa/main-page-style-2026-09-16.md`：追加文案更新与验证、回滚说明。
- `src/app/WorkbenchComposerColumn.tsx`：主页面用现有 Grok 图标和 Grok 文字替代 SuperGrok 字标。
- `src/i18n/messages/de/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/de/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/en/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/en/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/es/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/es/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/fil/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/fil/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/fr/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/fr/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/id/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/id/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/it/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/it/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/ja/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/ja/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/ko/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/ko/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/pt-BR/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/pt-BR/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/ru/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/ru/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/ta/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/ta/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/uk/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/uk/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/zh-TW/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/zh-TW/settings.ts`：同步欢迎动画说明引用的文案。
- `src/i18n/messages/zh/composer.ts`：同步欢迎语文案。
- `src/i18n/messages/zh/settings.ts`：同步欢迎动画说明引用的文案。
- `src/lib/settingsCatalog/entries/appearanceInterface.ts`：新欢迎语可检索到对应动画设置。
- `src/lib/welcomeIntro.guard.test.ts`：将旧间距与下沉布局断言同步为已实施的主页样式。
- `src/styles/chat.part1.css`：设置 Grok 品牌图文间距与字重，沿用主题色。
- `docs/qa/main-page-style-2026-09-16/welcome-copy.jpg`：保存本轮主页实际截图。
- `progress.md`：追加本轮记录。
- 回滚：`git revert $(git log -1 --format=%H --grep='style(welcome): use Grok branding and refresh greeting')`；本轮前基线 c96e37da。
- 仅本地提交，未制作 DMG 或推送发布。

## 2026-09-16 - Task: 制作包含最新修复与首页改版的 macOS 安装包
### What was done
- 基于 e45dde79 产品源码制作 Apple Silicon 本地 DMG，纳入此前性能、使用问题修复及首页、输入框与欢迎文案更新。
- 使用临时 Rust 工具链和 ad-hoc 签名完成打包，保留上一份安装包；未替换运行中的安装版或发布远程版本。
- 完整验证发现旧样式断言未同步；仅更新测试中间距与圆角预期，产品源码不变。
### Testing
- TypeScript、Vite、Rust release、Tauri app/dmg 打包通过。
- 完整前端测试最终 666 文件、7,601 项全部通过；全量 ESLint、测试修改后定向 ESLint、git diff --check 通过。
- 原 app 与交付 DMG 内 app 严格签名验证通过，逐文件一致；arm64 与 Info.plist 检查通过。
- DMG 镜像校验、SHA256 回读通过，安装包 20,466,924 字节；SHA256 为 7ef1bb3b1ea26d0133ef5ab8d89d037489111ecaf1e5bdd326d77e47b2e3c548。
- 镜像内程序使用独立 GROK_APP_HOME 执行 --sessions 返回 []、退出码 0；前端资产包含 e45dde79 与新欢迎语。
- 当前安装版正在运行，共用单实例 socket；本轮未做新包完整 GUI 启动或实际模型推理验收。镜像已卸载。
### Notes
- `src/lib/wallpaperThemeContrast.guard.test.ts`：将旧间距和圆角断言同步为已实施的新版首页样式。
- `docs/qa/macos-package-2026-09-16.md`：记录构建来源、验证、签名限制、安装和回滚方式。
- `dist-installers/Grok_0.2.35_e45dde79_aarch64.dmg`：生成新的 Apple Silicon 安装包，忽略目录内交付物不纳入 Git。
- `dist-installers/SHA256SUMS-e45dde79.txt`：生成交付包校验清单，忽略目录内交付物不纳入 Git。
- `src-tauri/target/`、`dist/`：更新编译与打包产物，均不纳入 Git。
- `progress.md`：追加本轮构建与验证记录。
- 回滚测试：`git restore --source=e45dde79 -- src/lib/wallpaperThemeContrast.guard.test.ts`；回滚安装版：退出 Grok 后使用保留的 `dist-installers/Grok_0.2.35_ba5e835f_aarch64.dmg` 重新安装。
- 本地包未进行 Apple 公证；当前任务不包含 Intel 包或公开发布。

## 2026-09-16 - Task: 收缩 Agent 高级运营入口
### What was done
- 从主导航移除 Kanban/Session Task Board 入口。
- 从命令面板移除 Ops Hub、Agent Dashboard、Task Board、Kanban 和 Batch Agents 动作；保留当前会话 Tasks panel。
- 移除 Tasks panel 内跳转跨会话 Dashboard 的重复按钮；Batch Agents 继续由设置中的高级工具入口提供。
### Testing
- `pnpm typecheck` 通过。
- 相关 ESLint 通过：AppWorkbench、WorkbenchSidebar、WorkbenchChatStage、AgentTasksPanel、palette actions 及测试。
- `src/lib/paletteActions.test.ts`、`src/app/WorkbenchSidebar.footer.test.tsx`、`src/lib/opsEntry.test.ts`：33 项通过。
- `git diff --check` 通过。
### Notes
- `src/lib/paletteActions.ts`：收窄命令面板至核心操作与当前会话 Tasks。
- `src/lib/paletteActions.test.ts`：同步动作清单并确认看板搜索不再返回入口。
- `src/app/WorkbenchSidebar.tsx`：移除 Kanban 主导航按钮。
- `src/app/WorkbenchSidebar.footer.test.tsx`：同步 Sidebar 测试夹具。
- `src/components/AgentTasksPanel.tsx`：移除 Dashboard 跳转按钮。
- `src/app/WorkbenchChatStage.tsx`：移除 Dashboard 回调传递。
- `src/app/AppWorkbench.tsx`：移除对应主导航和命令面板分发路径。
- 回滚：`git revert HEAD`（本轮提交）；恢复后重新运行上述测试。

## 2026-09-16 - Task: 制作功能收缩后的 macOS 安装包
### What was done
- 基于 bac55909 制作 Apple Silicon macOS DMG，包含主导航和命令面板入口收缩。
- 保留上一版安装包，生成带提交标识的新安装包；未替换当前运行中的应用。
- 修正一处仍要求 `open-kanban` 命令入口的旧测试断言，使测试与已实施的入口收缩一致。
### Testing
- 完整前端测试 666 个文件、7,601 项全部通过。
- Tauri UI、Rust release、Apple Silicon app/dmg 构建通过。
- app 严格代码签名验证通过；Mach-O 确认为 arm64，Info.plist 校验通过。
- DMG `hdiutil verify` 及 SHA256 回读通过；镜像内 app 签名通过。
- 镜像内程序使用独立 `GROK_APP_HOME=/tmp/grok-macos-cli-bac55909` 执行 `--sessions` 返回 `[]`、退出码 0。
- Vite 保留已有大分块警告；ad-hoc 签名未进行 Apple 公证。
### Notes
- `src/lib/kanbanBoard.test.ts`：将旧的命令入口存在断言改为入口已移除断言。
- `docs/qa/macos-package-2026-09-16-bac55909.md`：记录本次安装包来源、校验、签名限制和回滚方式。
- `dist-installers/Grok_0.2.35_bac55909_aarch64.dmg`：Apple Silicon 新安装包，SHA256 见校验文件。
- `dist-installers/SHA256SUMS-bac55909.txt`：安装包校验清单。
- 回滚安装：退出 Grok 后使用此前保留的 `Grok_0.2.35_e45dde79_aarch64.dmg`；回滚代码测试：`git restore --source=bac55909 -- src/lib/kanbanBoard.test.ts`。

## 2026-09-18 - Task: 修复流式输出期间滚动位置反复拉扯
### What was done
- 移除虚拟列表延迟提交时恢复过时底部距离的行为，跟随输出时保持当前末尾。
- 触控板小幅向上滚动立即解除贴底，避免输出增长抢回阅读位置；会话打开和发送后的补偿帧尊重已发生的上翻。
### Testing
- 先稳定复现虚拟列表把位置从 7500 拉回 7400、小幅上翻从 596 被拉到 700、打开后补偿帧覆盖上翻三类失败。
- 修复后 useStickToBottom、useChatMessageVirtualizer、stickToBottom 两组辅助测试共 4 文件 104 项通过。
- 定向 ESLint、pnpm build:ui（TypeScript + Vite）、git diff --check 通过；保留既有大分块提示。
- 尚未替换安装版或在真实模型会话验证 WebView；这里的回归证据来自可控 DOM 布局/事件测试。
### Notes
- `src/hooks/useChatMessageVirtualizer.ts`：贴底窗口提交使用当前末尾，删除过期偏移状态。
- `src/hooks/useChatMessageVirtualizer.test.tsx`：新增先贴底后窗口提交的回退复现测试，清理全局测试桩。
- `src/hooks/useStickToBottom.ts`：小幅上翻解除贴底，补偿帧不覆盖用户上翻。
- `src/hooks/useStickToBottom.test.tsx`：覆盖输出增长与小幅/大幅上翻以及打开后下一帧的交错。
- `src/lib/stickToBottom.ts`：同步滚动阈值注释，区分向上解除和向下重新跟随。
- `docs/qa/scroll-provider-errors-2026-09-18.md`：记录复现、修复和验证边界。
- `progress.md`：追加本轮记录。
- 回滚：`git restore --source=81f0ed6f -- src/hooks/useChatMessageVirtualizer.ts src/hooks/useChatMessageVirtualizer.test.tsx src/hooks/useStickToBottom.ts src/hooks/useStickToBottom.test.tsx src/lib/stickToBottom.ts`；文档保留并追加回滚说明。

## 2026-09-19 - Task: 定位并修正渠道流错误被误报为 Agent 崩溃
### What was done
- 从现有本机日志定位 9 月 16 日的 Responses 流解析失败、stream_read_error，以及后续上游连接中断/隧道失败记录。
- 将已确认的渠道流读取/解析错误归类为网络或模型服务异常，保留原始原因；前端横幅和错误气泡同步修正旧崩溃标签。
- 未修改网络传输、鉴权、流协议或线程并发；上游服务的响应损坏与连接故障本身不由本次分类修改解决。
### Testing
- 修改前：脱敏原始 RPC 消息在 Rust 测试复现 AgentCrashed 误判，前端 5 项新回归验证失败。
- 修改后：前端完整 666 文件 7,611 项通过，Host 错误分类 10 项通过；真实进程退出仍保持崩溃分类。
- pnpm build:ui（TypeScript + Vite）、改动文件 ESLint、git diff --check 通过；Vite 保留既有分块体积提示。
- 未调用真实模型、更新 CLI、修改用户配置、制作 DMG 或替换安装版；端到端渠道稳定性未验证。
### Notes
- `src-tauri/src/acp_client.rs`：错误分类识别已观测的渠道流格式/读取错误，补回归测试并保留错误详情。
- `src/lib/errorDeck.ts`：前端识别相同流错误，纠正带原始详情的旧崩溃标签。
- `src/lib/errorDeck.test.ts`：覆盖四种流错误与真实退出/无关错误不误判。
- `src/lib/session/errors.ts`：错误气泡遵循渠道错误细化结果，避免横幅与正文矛盾。
- `src/lib/session.projection-snapshot.test.ts`：覆盖旧崩溃标签的中文气泡文案修正。
- `docs/llm-wiki/providers.md`：记录渠道流错误分类和恢复边界。
- `docs/qa/scroll-provider-errors-2026-09-18.md`：追加日志证据、验证及不能保证上游稳定的限制。
- `progress.md`：追加本轮记录。
- 回滚：`git restore --source=81f0ed6f -- src-tauri/src/acp_client.rs src/lib/errorDeck.ts src/lib/errorDeck.test.ts src/lib/session/errors.ts src/lib/session.projection-snapshot.test.ts docs/llm-wiki/providers.md`；QA 文档保留并追加回滚说明。

## 2026-09-19 - Task: 将选中文字操作改为添加到对话和侧边提问
### What was done
- 选中正文后仅显示“添加到对话｜在侧边聊天中提问”，移除旧评论框、复制入口和另一套右键菜单；保留键盘复制。
- 主操作添加引用卡并保留草稿；侧边操作带引用打开独立输入区，明确发送后才创建会话和调用模型，支持继续提问、停止、错误与交互请求。
- 修复真实浏览器中菜单在右下边缘被挤成竖排的问题，并适配明暗主题与窄聊天区域。
- 本轮只修改选择菜单及其侧边聊天路径；保留此前滚动和渠道错误分类的未提交修复，未修改核心协议、网络包、鉴权或后端并发。
### Testing
- 完整前端套件 668 文件 / 7,621 项通过；最后调整后的定向套件 7 文件 / 75 项通过（包含 15 语言目录一致性）。
- 定向测试覆盖只在发送时创建会话、会话 ID 隔离、流片段完成不提前解锁、后续追问、连接失败保留草稿、停止和快速完成、导航后不继续发送、主/侧输入快捷键隔离。
- 本地浏览器实测拖选、两个操作文案、引用转移、输入焦点、浅/深色主题、右下边缘定位及 620px 窄窗口；临时验证页面已删除。
- TypeScript + Vite 生产构建、定向 ESLint、git diff --check 通过；Vite 保留已有大分块提示。
- 验证日志：`/tmp/grok-selection-full-tests-20260919.log`、`/tmp/grok-selection-final-tests-20260919.log`、`/tmp/grok-selection-final-build-20260919.log`、`/tmp/grok-selection-final-lint-20260919.log`。
- 未调用真实模型或替换正在运行的安装版；真实 macOS WebView 与模型服务的端到端验证仍需新安装包。
### Notes
- `src/app/WorkbenchChatStage.tsx`：接入侧边聊天容器，保留主输入组件身份。
- `src/components/TranscriptSelectionToolbar.tsx`：将旧评论菜单替换为两个紧凑操作并限制窗口内定位。
- `src/components/TranscriptSelectionToolbarHost.tsx`：统一拖选和右键入口，传递引用并取消过期焦点任务。
- `src/components/TranscriptSelectionToolbarHost.test.tsx`：验证引用、主草稿隔离、失败重试、关闭及导航行为。
- `src/components/TranscriptSideChat.tsx`：实现独立侧边输入、引用、回复、停止、错误、授权和提问表单。
- `src/components/AskUserBar.tsx`：主会话提问快捷键忽略侧边输入区域。
- `src/components/AskUserForm.tsx`：为同时出现的侧边问题表单提供独立无障碍元素 ID。
- `src/components/AskUserBar.sideChat.test.tsx`：验证侧边 Enter 不提交主会话问题。
- `src/components/lobe-chat/ConversationThread.tsx`：移除旧选中右键菜单并接入统一的新操作。
- `src/hooks/useTranscriptSideChat.ts`：复用现有 Host API 管理独立侧边会话及流式事件。
- `src/hooks/useTranscriptSideChat.test.tsx`：验证会话路由、异步失败、停止、快速完成与导航清理。
- `src/lib/transcriptSelectionBar.ts`：按选区中心定位并要求两个端点均处于正文。
- `src/lib/transcriptSelectionBar.test.ts`：同步定位和跨区域选区验证。
- `src/lib/transcriptSelectionToolbarPref.ts`：同步现有选中工具栏开关的行为说明。
- `src/styles/chat.part2b.css`：替换旧菜单样式并增加侧边面板及窄列布局。
- `src/i18n/messages/de/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/de/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/en/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/en/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/es/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/es/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/fil/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/fil/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/fr/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/fr/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/id/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/id/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/it/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/it/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/ja/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/ja/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/ko/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/ko/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/pt-BR/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/pt-BR/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/ru/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/ru/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/ta/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/ta/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/uk/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/uk/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/zh/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/zh/settings.ts`：更新现有选中工具栏开关的说明。
- `src/i18n/messages/zh-TW/chat.ts`：增加双操作和侧边聊天文案，移除已废弃的选中评论文案。
- `src/i18n/messages/zh-TW/settings.ts`：更新现有选中工具栏开关的说明。
- `docs/llm-wiki/transcript-selection.md`：记录菜单和侧边聊天的使用行为、生命周期及验证边界。
- `progress.md`：追加本轮实现与验证记录。
- 本轮前置文件快照位于 `/tmp/grok-selection-before-20260919/`，不包含密钥或模型数据。
- 回滚本轮且保留此前修复：在仓库运行 `python3 /tmp/grok-selection-before-20260919/rollback-selection.py`；脚本恢复本轮原有代码/语言文件，移除本轮新建组件、测试和说明文档，并向 progress.md 追加回滚记录。快照仅在本机临时目录有效。


## 2026-09-19 - Task: 统一回答中链接、图片及资源的左右键操作

### What was done
- 主对话与侧边聊天的普通链接、自动识别网址及行内网址统一打开与复制菜单；保留系统浏览器默认行为、外链确认设置和既有 ChatCut 路由。
- 图片左键查看原图，右键显示查看、复制、另存为、复制地址／路径与本地显示位置；大图预览不再右键立即复制。复制和保存都使用原图。
- 修复远程 Markdown 图片被误渲染成网址、旧文字选区拦截资源右键、菜单层级和多个菜单堆叠问题。补齐文件／视频动作的错误提示。
- 原图另存为复用现有桌面导出接口，处理中限制重复动作，取消不报错；提示不占对话高度。
- 同步 15 种语言文案与行为文档；未改后端协议、网络下载实现或鉴权路径，未制作／安装新的 macOS 包。

### Testing
- 最终 `pnpm test` 通过：672 个测试文件、7,648 项测试；日志 `/tmp/grok-resource-final-tests-20260919.log`。
- 最终 `pnpm build:ui` 通过（TypeScript + Vite）；仅有既存的大 chunk 提示，日志 `/tmp/grok-resource-final-build-20260919.log`。
- 本轮组件、辅助逻辑及测试文件的定向 ESLint 与 `git diff --check` 通过；日志 `/tmp/grok-resource-lint-20260919.log`。
- 本地浏览器实测浅色／深色菜单、窗口右下角定位、链接菜单回调、原图预览、大图右键、逐层 Escape、保留选区时的图片右键，以及复制图片地址成功提示；临时页面和服务已清理。
- App shell 与 AppWorkbench 合计从 13,424 行降至 13,421 行，满足增长冻结。
- 验证边界：桌面打开、Finder 与保存面板使用现有 API 的模拟回归，未实测新代码的 macOS WebView。Codex 自身窗口读取被工具限制，不能声称已核对其当前版本的每个菜单细节。远程原图若不允许跨域读取，复制／保存会明确报错。

### Notes
- `src/components/OutputLink.tsx`：统一正文、自动网址与行内网址的打开、侧边浏览和复制菜单，保留外链确认。
- `src/components/OutputLink.test.tsx`：验证主对话及侧边聊天入口、真实地址、确认取消、错误反馈与菜单互斥。
- `src/components/ResourceActionNotice.tsx`：提供不占对话高度的处理中／成功／失败提示并限制重复操作。
- `src/hooks/useImageResourceActions.tsx`：让缩略图与大图共用原图复制、另存为、地址／路径及位置菜单。
- `src/lib/saveOutputImage.ts`：通过现有导出接口保存原始图片字节，处理取消、格式和大小限制。
- `src/lib/saveOutputImage.test.ts`：验证原始 GIF 字节、保存取消、下载失败、错误页面与保存失败。
- `src/components/MarkdownBody.tsx`：让侧边聊天和预览中的链接、行内网址使用统一操作。
- `src/components/lobe-chat/MarkdownChat.tsx`：统一链接入口并修复网络图片被渲染成网址的问题。
- `src/components/lobe-chat/MarkdownChat.test.tsx`：覆盖链接显示与远程 Markdown 图片预览。
- `src/components/ImageUi.tsx`：接入共用图片菜单，支持键盘预览并保留稳定的缩略图尺寸。
- `src/components/ImageUi.interactions.test.tsx`：覆盖原图操作、地址不泄露媒体令牌、失败反馈和保存忙碌／取消。
- `src/components/ImageViewer.tsx`：将大图右键直接复制改为显式菜单，并保持原图来源。
- `src/components/ImageViewer.test.tsx`：验证大图右键不会立即复制、原图路径与 Escape 菜单关闭。
- `src/components/ContextMenu.tsx`：处理 Escape、方向键、另一处右键、滚动和窗口变化，避免菜单堆叠。
- `src/components/FilePathCard.tsx`：为复制路径增加明确反馈，并标记资源菜单优先级。
- `src/components/VideoUi.tsx`：补齐远程视频打开／复制菜单及文件操作反馈。
- `src/components/TranscriptSelectionToolbarHost.tsx`：保留文字选区时让资源自己的右键菜单优先。
- `src/components/TranscriptSelectionToolbarHost.test.tsx`：覆盖有文字选区时右击链接与图片的行为。
- `src/app/AppWorkbench.tsx`：外链启动失败显示提示，Escape 优先交由菜单处理；总行数减少。
- `src/styles/sidebar.part3.css`：确保图片菜单与反馈高于大图，补充图片键盘焦点样式。
- `src/lib/externalLinkPref.ts`：提供可等待并向界面报告失败的外链打开入口。
- `docs/llm-wiki/output-resources.md`：记录交互基线、原图保存、跨域限制与验证边界。
- `progress.md`：追加本轮实施、验证、文件清单及回滚方式。
- `src/i18n/messages/de/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/en/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/es/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/fil/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/fr/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/id/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/it/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/ja/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/ko/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/pt-BR/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/ru/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/ta/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/uk/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/zh-TW/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- `src/i18n/messages/zh/core.ts`：同步资源菜单、处理状态、错误提示与图片右键说明。
- 本轮回滚点：`/tmp/grok-resource-interactions-before-20260919/`。如需在继续其他修改前撤销本轮，执行 `python3 /tmp/grok-resource-interactions-before-20260919/rollback.py`；恢复本轮前的文件快照并删除本轮新增文件，保留此前尚未提交的滚动、异常分类和选区／侧聊改动。不要使用 `git reset --hard` 撤销本轮。

## 2026-09-19 - Task: 为本机 Grok Agent 接入应用内浏览器自动化

### What was done
- 按用户“参考 Codex，先打通浏览器自动化”的要求，完成随应用二进制发布的 `grok-browser` stdio MCP；无需另装 Node、Chromium 或修改用户 Grok 配置。
- 官方 Grok（包括 grok-4.6）和自定义本机 Agent 均自动获得打开、观察、点击、填写、选择、滚动、返回、关闭 8 项工具；每个连接操作独立的可见右侧标签，地址栏跟随网页导航。
- 复用现有 loopback 监听与 token 校验，固定脚本操作网页 DOM；旧引用、遮挡、禁用、只读、非法地址、关闭与加载失败返回明确工具错误。点击后强制重新观察，密码值不进入快照，滚动后的可见文字可读取。
- 接入时同时过滤 SSH／WSL／远程 ACP 的本机浏览器入口，覆盖连接与 MCP 热更新，避免把本机路径及 loopback 凭据注入远程；没有改动 ACP 协议、认证算法或数据库结构。
- 复用现有侧栏样式和交互，没有新增设置或 App/AppWorkbench 状态；同步说明首版边界，不宣称已具备截图或完整桌面 Computer Use。

### Testing
- 前端全量 Vitest：674 个文件、7656 项全部通过；后续快照字段完善后，定向 8 项再次通过。
- Rust 浏览器相关测试 18/18、已有 token header 测试 2/2 通过；覆盖协议握手／工具错误、远程过滤、地址／标签限制和平台结果解码。
- TypeScript、定向 ESLint、Rust fmt 检查、Clippy all-targets 零警告、git diff --check 通过；Tauri UI 和 macOS 调试版编译通过。
- 在 `/tmp/grok-browser-smoke-home` 隔离数据目录启动真实 macOS WKWebView，执行 `node scripts/browser-automation-smoke.mjs '/tmp/Grok Browser Test.app/Contents/MacOS/grok-app' /tmp/grok-browser-smoke-home`：MCP 握手、无 token 拒绝、打开／快照、输入及回读、失效引用拒绝、选项选择、点击更新页面、链接跳转、返回、滚动读取页面尾部、非法 scheme 拒绝、关闭／重开均通过；通过桌面截图确认右侧嵌入页与地址栏可见、布局正常。
- Grok Build 1.0.30 在独立临时 GROK_HOME 执行 `mcp doctor grok-browser --json`：healthy=true，握手成功，发现 8 个工具；未发送模型推理请求。
- 验证日志：`/tmp/grok-browser-{full-tests,vitest,rust-tests,token-tests,typecheck,eslint,fmt,clippy,dev-build,native-build,native-smoke,cli-doctor}.log`。Windows/Linux、真实 grok-4.6 推理调用尚未验收；没有制作 DMG 或覆盖已安装版本。

### Notes
- `src-tauri/src/browser_mcp.rs`：原生 stdio MCP 入口、工具描述、应用连接注入及远程过滤回归。
- `src-tauri/src/browser_automation.rs`：浏览器标签生命周期、导航等待与固定 DOM 动作调度。
- `src-tauri/src/browser_automation.js`：页面观察、元素引用、表单动作与视口文字提取。
- `src-tauri/src/lib.rs`：在 GUI／单实例初始化前分流 MCP 进程。
- `src-tauri/src/session_api.rs`：复用既有鉴权增加浏览器动作路由，并登记当前进程 endpoint。
- `src-tauri/src/extensions.rs`：为本机官方／自定义 Agent 添加内置浏览器 MCP 定义。
- `src-tauri/src/acp_client.rs`：在连接及 MCP 热更新时剔除不适用于远程执行的浏览器入口；保留之前的错误分类改动。
- `src/hooks/useAgentBrowser.ts`：接收 Host 事件并打开／关闭独立浏览器标签。
- `src/hooks/useAgentBrowser.test.ts`：验证与用户标签隔离、重用、关闭及非法输入。
- `src/app/WorkbenchResourcesAside.tsx`：在资源侧栏挂接浏览器事件监听。
- `src/components/side-workbench/BrowserTab.tsx`：同步 Agent／链接导航后的地址栏。
- `src/components/side-workbench/SideTabBody.tsx`：本机 Agent 浏览器不套用当前项目的 SSH 转发。
- `src/lib/browserAutomation.test.ts`：验证 DOM 快照、表单事件、引用失效、遮挡和参数编码。
- `scripts/browser-automation-smoke.mjs`：可复现的真实桌面 MCP→WebView 自动化验收。
- `docs/llm-wiki/browser-automation.md`：能力、使用方式、安全边界、限制和验收步骤。
- `docs/llm-wiki/chatcut.md`：更新已有浏览器能力差距说明，保留 ChatCut 默认交接策略。
- `docs/llm-wiki/session-api.md`：记录浏览器内部桥接路由与校验约定。
- `progress.md`：仅追加本轮实施与验证记录。
- 回滚：执行 `python3 /tmp/grok-browser-before-20260919/rollback.py`。脚本恢复本轮前的 9 个已有文件并删除本轮 8 个新增文件，保留之前未提交改动与日志历史；如相关文件在本轮后又有变化，会拒绝覆盖。回滚后另追加一条日志记录。

## 2026-09-19 - Task: 实现 macOS 浏览器截图与跨域 iframe 自动化

### What was done
- 按用户指定补齐浏览器截图和跨域 iframe 操作：新增 `browser_screenshot`、`browser_frames`，现有快照／点击／填写／选择／滚动支持原生框架文档 ID。
- 使用 macOS WKWebView 公共 API 截取当前浏览器视口，包含跨域 iframe 像素；输出独立 MCP PNG 图片块与一致的本地文件，限制最大尺寸 1600×1600，不放大小图。纯文本自定义模型自动仅返回路径，亦可显式 `includeImage=false`。
- 在 WebKit 独立内容世界登记主页面与嵌套子框架，通过原生 WKFrameInfo 执行固定 DOM 脚本；保持网站同源保护，不向网页暴露 token、Host 操作或任意脚本执行入口。
- 框架导航／移除／标签关闭后拒绝旧目标；历史缓存恢复重新登记，不以主页面 pageshow 清空先恢复的子框架。同网址可能恢复旧子框架状态，验收按实际页面观察，不假定重置。
- 关闭标签清理原生框架引用；复用锁定版本的 Foundation／AppKit／WebKit Rust 绑定作为 macOS 直接依赖，没有更改鉴权算法、ACP 协议、数据库或 App/AppWorkbench 状态。
- 本轮为 macOS 实现，框架 API 要求 macOS 11+；Windows/Linux 的新增工具明确返回平台限制，旧主页面 DOM 功能保留。未制作安装包，未覆盖用户正在使用的安装版本。

### Testing
- `cargo test --manifest-path src-tauri/Cargo.toml browser_ --lib`：21/21 通过，新增框架参数校验、工具 schema、截图图片块／路径分离及纯文本模型回归。
- 定向 Vitest：原有 DOM 与标签生命周期 8/8 通过；无前端业务代码改动，未重复全量前端测试。
- `cargo check`、`cargo fmt --check`、Clippy all-targets 零警告、macOS 调试二进制构建、`node --check scripts/browser-automation-smoke.mjs`、`git diff --check` 通过。
- 隔离 App 数据目录中的真实 WKWebView 通过完整 smoke：双端口跨域 + `sandbox="allow-scripts"` 子框架 + 嵌套跨域框架；中文输入回读、选择、点击、滚动；框架跳转／移除拒绝旧 ID；导航返回恢复框架；关闭重开；网页不能访问独立世界桥接、同源保护仍生效。
- 截图验收：校验 PNG 签名、尺寸边界、MCP 图片与落盘字节完全相同、仅路径模式不发送图片块；人工读取 `/tmp/grok-browser-smoke-home/browser-screenshot-proof.png`，确认包含 iframe 中输入的「iframe 世界」、选项 Beta、点击结果和嵌套按钮「Nested clicked」，没有桌面其他窗口。
- Grok Build 1.0.30 `mcp doctor grok-browser --json`：healthy=true，握手成功并发现 10 个工具。未执行真实模型推理；未验证 Windows/Linux 原生新增能力。
- 日志位于 `/tmp/grok-browser-frames-{check,build,rust-tests,vitest,clippy,fmt,smoke,cli-doctor}.log`。测试使用隔离数据与临时本机网页，没有访问外部网站、修改真实认证或发送付费请求。

### Notes
- `src-tauri/Cargo.toml`：仅在 macOS 引入现有锁定版本的 WebKit／AppKit／Foundation 绑定与所需 feature。
- `src-tauri/Cargo.lock`：登记三项直接依赖，无版本升级。
- `src-tauri/src/lib.rs`：按 macOS 条件加载原生浏览器模块。
- `src-tauri/src/browser_webkit.rs`：原生视口截图、独立世界注册、框架发现／执行和生命周期清理。
- `src-tauri/src/browser_automation.rs`：新增截图／框架调度、PNG 保存与缩放、框架参数检查。
- `src-tauri/src/browser_mcp.rs`：扩充到 10 项工具、frame 参数、MCP 图片块及纯文本路由兼容。
- `src-tauri/src/side_browser_host.rs`：关闭标签时释放框架注册。
- `scripts/browser-automation-smoke.mjs`：扩展真实跨域／嵌套／历史恢复／截图验收。
- `docs/llm-wiki/browser-automation.md`：同步新能力、平台要求、调用流程、图片策略及边界。
- `docs/llm-wiki/chatcut.md`：更新与 Codex 浏览器能力的差距说明。
- `progress.md`：仅追加本轮实施和验证记录。
- 回滚：执行 `python3 /tmp/grok-browser-frames-before-20260919/rollback.py`，恢复本轮前文件并移除本轮新原生模块，保留上一轮浏览器基础功能及其他未提交工作。若文件已有后续改动会拒绝覆盖；日志历史保留，回滚后另追加记录。

## 2026-09-19 - Task: 补齐 Windows/Linux 浏览器截图与跨域 iframe 操作
### What was done
- 将截图、跨域及嵌套 iframe 工具扩展到 Windows/Linux，三平台沿用同一组 MCP 工具及参数；截图统一缩放、保存并按模型能力返回图片。
- Windows 使用 WebView2 原生框架句柄递归发现子框架并校验文档标记，通过内置方法获取视口 PNG，不开放调试端口；旧 WebView2 明确提示更新。
- Linux 使用 WebKitGTK 隔离内容世界和原生消息回复唤醒各文档，完成输入、点击、选择、滚动、导航失效及历史恢复；没有后台定时轮询。
- 修复普通 HTTP 页面缺少 crypto.randomUUID 时无法生成元素引用的问题，补充对应回归并同步平台要求与使用边界文档。
### Testing
- macOS 完整项目 cargo check、cargo clippy --all-targets -- -D warnings、cargo fmt -- --check 通过；browser_ Rust 测试 21/21，DOM/标签前端回归 9/9，git diff --check 通过。
- macOS 隔离开发 App 的实际 MCP smoke 通过：鉴权、主页面交互、跨域/sandbox/嵌套 iframe、导航和移除后拒绝旧 ID、历史恢复、截图字节与本地 PNG 一致、关闭重开。日志 /tmp/grok-browser-platforms-mac-smoke.log；没有调用付费模型或改动已安装 App。
- Linux（Docker Debian 12 ARM64 / WebKitGTK 2.50.6 / Xvfb）完整项目 cargo check 与严格 clippy 通过；调用仓库原生模块的 GTK 图形验收程序通过真实页面交互、框架生命周期、隔离桥接和 PNG 截图。日志 /tmp/grok-browser-platforms-linux-smoke.log，截图 /tmp/grok-browser-linux-proof.png。此项为实际内核与原生模块验收，不等同于 Linux 安装包/完整工作台验收。
- Windows 新原生模块使用实际 windows 0.61、webview2-com 0.38 依赖，在 x86_64-pc-windows-msvc 目标类型检查及严格 clippy 通过（Tauri 调度以同签名桩接入）。日志 /tmp/grok-browser-platforms-win-check.log、/tmp/grok-browser-platforms-win-clippy.log。没有可用 Windows GUI；未宣称完整 Windows 项目构建或真机交互通过。
- macOS 仍要求 11+ 的框架公共 API，Windows 要求支持 Frame7 的新版 WebView2，Linux 构建与运行要求 WebKitGTK 4.1 ≥ 2.40。
### Notes
- src-tauri/src/browser_windows.rs：新增 Windows 原生框架发现、操作和截图。
- src-tauri/src/browser_linux.rs：新增 Linux 隔离文档回调、生命周期管理和截图。
- src-tauri/src/browser_linux.js：新增 Linux 全框架固定操作循环及页面恢复/退出处理。
- src-tauri/src/browser_automation.rs：按平台分发动作并复用 PNG 保存输出逻辑。
- src-tauri/src/browser_automation.js：元素引用不再依赖仅安全上下文可用的 randomUUID。
- src-tauri/src/browser_mcp.rs：工具描述更新为三平台能力。
- src-tauri/src/side_browser_host.rs：关闭时清理新增平台的原生框架记录。
- src-tauri/src/lib.rs：按平台注册原生模块。
- src-tauri/Cargo.toml、src-tauri/Cargo.lock：添加与现有 Tauri 相同版本的 Linux WebKitGTK/JSC/Cairo 直接依赖及所需特性。
- src/lib/browserAutomation.test.ts：验证普通 HTTP 环境能生成有效且不同的元素引用。
- docs/llm-wiki/browser-automation.md：更新平台支持、实现差异、验证证据和未验收边界。
- docs/llm-wiki/chatcut.md：更新浏览器能力差异表。
- docs/BUILD.md：补充 Linux WebKitGTK 最低版本。
- progress.md：仅追加本轮记录。
- 回滚：运行 python3 /tmp/grok-browser-platforms-before-20260919/rollback.py，按本轮前快照恢复已修改文件并仅删除本轮新增的三个平台文件；脚本校验修改后哈希，防止覆盖后续工作。保留进度日志历史；回滚后需重新构建。之前已完成的 macOS 浏览器与其他未提交改动不受影响。

## 2026-09-19 - Task: 制作包含三平台浏览器自动化实现的 macOS 安装包
### What was done
- 使用当前工作区制作 Grok 0.2.35 Apple Silicon 安装包，包含本轮与前序已经完成的修改；未发布远程 Release，未覆盖用户已安装或运行中的应用。
- 交付 dist-installers/Grok_0.2.35_20260919_browser-platforms_aarch64.dmg，并生成独立 SHA256 校验文件。
### Testing
- APPLE_SIGNING_IDENTITY=- pnpm exec tauri build --target aarch64-apple-darwin --bundles app,dmg 成功，包含前端 TypeScript/Vite 构建及 Rust release 编译。
- codesign --verify --deep --strict 通过；hdiutil verify 校验 DMG 通过。只读挂载后核对应用版本为 0.2.35、标识为 com.grokapp.desktop，包内可执行文件与 release App 哈希一致，挂载副本签名校验通过。
- 从打包 App 的可执行文件启动 --browser-mcp，initialize 和 tools/list 返回成功，包含全部 10 项浏览器工具。
- 本地临时签名，未进行 Apple 公证；仅交付 Apple Silicon macOS 包，没有生成 Windows/Linux 安装包。
### Notes
- dist-installers/Grok_0.2.35_20260919_browser-platforms_aarch64.dmg：本次安装包（构建产物，不提交 git）。
- dist-installers/SHA256SUMS-20260919-browser-platforms.txt：本包 SHA256 校验值（构建产物，不提交 git）。
- progress.md：仅追加制作与验证结果。
- 回滚：当前已安装软件未改变，无需回滚；若安装后需退回，可重新安装此前保留的 dist-installers/Grok_0.2.35_bac55909_aarch64.dmg。若仅撤销本次交付文件，可删除上述两个新产物；代码回滚使用上一条记录的哈希保护脚本。

## 2026-09-20 - Task: 修复新闻页面广告 iframe 触发下载弹窗导致应用不可用
### What was done
- 从实际新闻查询会话及 2026-09-19 运行日志确认：浏览器加载 Reuters 后广告/同步 iframe 被下载兼容脚本拦截，出现 31 次保存对话框打开及连续 browser_open 失败；未据此声称是 Agent 进程崩溃。
- 普通网站的 iframe 设置、插入不再触发下载；只保留 ChatCut 主页面的特定导出/文件路径兼容。URL 查询参数不再充当文件类型判断依据。
- 下载链接只有点击才触发兼容下载，不再因插入 DOM 自动下载；未改变下载鉴权、网络包处理或线程并发路径。
### Testing
- 新增实际执行 Rust 内嵌脚本的行为回归：修复前 4 失败/1 通过，修复后 5/5 通过；覆盖新闻广告 iframe、append/insert、普通预览、下载链接点击、data 下载、ChatCut 导出与仿冒域名。
- 连同现有 DOM/标签测试共 14/14 通过；Rust side_browser_blob 4/4 通过。TypeScript 与真实 macOS 图形回归在后续综合验证记录补充。
### Notes
- src-tauri/src/side_browser_blob.rs：限定 iframe 下载意图及移除 anchor 插入时的下载副作用。
- src/lib/sideBrowserDownload.test.ts：新增下载意图行为回归。
- docs/llm-wiki/chatcut.md：记录兼容范围及修复原因。
- progress.md：仅追加本轮记录。
- 回滚：本轮前快照 /tmp/grok-browser-routing-before-20260920；恢复其中同名 side_browser_blob.rs、chatcut.md，删除新增 sideBrowserDownload.test.ts，再重新构建。其余前序未提交改动不受影响；综合收尾提供哈希保护的 rollback.py。

## 2026-09-20 - Task: 明确后台检索与可见浏览器的工具选择规则并综合验收
### What was done
- 新闻、时事、资料研究与公开 URL 阅读优先使用当前连接实际暴露的 web_search/x_*/web_fetch；明确只有用户要求展示网页、真实网页交互、截图/布局/UI 验收才使用右侧浏览器。
- 搜索工具缺失或失败时说明能力缺口，不默认用可见浏览器或另起无头浏览器代替；确实需要交互页时按已有授权执行，否则先与用户确认。页面连续失败时观察一次后停止重复重开。
- 相同规则覆盖本机 Agent 启动规则、MCP 初始化说明、browser_open 工具描述，使工具发现前后都具备边界。没有变更 ACP/MCP 协议结构、用户通道、鉴权或并发实现。
- 核对故障会话：搜索设置未关闭，实际为 custom generic Responses 通道，native_grok_proxy=false，会话只注入一组浏览器 MCP。未把模型名当作搜索/Deep Research 能力证明，也未擅自把通道转换成原生代理模式。
### Testing
- Rust browser_ 21/21、启动规则合并 1/1 通过；前端浏览器及下载行为回归 14/14 通过；pnpm typecheck、定向 ESLint、cargo clippy --all-targets -- -D warnings、cargo fmt -- --check、git diff --check 通过。
- 构建并启动隔离 macOS 开发 App，通过实际 stdio MCP 执行完整 browser-automation-smoke，新增动态插入 12 个跨域框架、未点击的下载链接及 /v1/health 检查。所有框架 URL 保留，主服务 HTTP 200；本轮隔离原生日志中 save dialog open / http download start / blob pull start 均为 0。
- 保留原有主页面读写、跨域/sandbox/嵌套 iframe、滚动、导航/移除失效、历史恢复、PNG 字节与落盘一致、关闭重开的验收，全部通过。证据 /tmp/grok-routing-smoke.log、/tmp/grok-browser-smoke-home/logs/app.log.2026-09-20。
- 规则分发测试证明启动规则和 MCP 初始化均携带策略；没有运行付费模型新闻查询，不能把提示词策略声称为不可绕过的硬路由或真实模型行为保证。未验证当前中转的服务端搜索/Deep Research 能力。
- 本轮没有制作新安装包，也没有覆盖已安装应用；更新程序并重新启动 Agent 会话后，新的启动规则才完整生效。
### Notes
- src-tauri/src/browser_mcp.rs：集中定义浏览器用途规则，并修改打开工具与初始化说明。
- src-tauri/src/official_aux.rs：在现有本机会话规则合并入口加入浏览器边界，覆盖冷启动与预热；补传播回归断言。
- scripts/browser-automation-smoke.mjs：增加动态广告框架、仅呈现下载链接与主服务健康回归。
- docs/llm-wiki/browser-automation.md：记录场景选择、模型名与通道能力区别、策略限制及生效方式。
- progress.md：仅追加规则与综合验证结果；上轮下载修复的 TypeScript/真实图形验证在此完成。
- 一并回滚本轮两项修复：python3 /tmp/grok-browser-routing-before-20260920/rollback.py。脚本哈希检查防止覆盖后续修改，恢复本轮前六个文件并删除本轮新增下载测试；保留此前未提交的浏览器实现与进度日志。预检查可加 --check，已通过。回滚后重新构建。
- 验证证据补充：首次隔离 App 默认日志级别过滤了 side_browser INFO，因此仅凭原生日志中的零计数不足以证明没有下载。已使用 RUST_LOG=info 重新运行同一完整 MCP smoke，通过后在 /tmp/grok-routing-app-verified.log 确认真实 WebView 创建记录存在，且保存弹窗/HTTP 下载/blob 下载计数均为 0；/tmp/grok-routing-smoke-verified.log 为最终实测结果。上述下载零计数结论以这组 INFO 日志为准。

## 2026-09-20 - Task: 内置 Grok Build 并统一桌面更新，修复 Windows 更新交接
### What was done
- 将官方稳定版 Grok Build 1.0.34 纳入桌面安装包，覆盖 macOS arm64/x64、Windows x64、Linux x64/arm64 的固定制品与 SHA-256；首启不再要求另装 CLI。
- 桌面本机 Agent 和辅助进程仅使用内置程序，忽略旧外部路径及 WSL 后端设置，移除外部 CLI 的选择、安装、修复和单独更新界面；终端安装不被改写。
- 核实官方开源仓库 Apache-2.0 分发条款，随包保留许可证和第三方声明；说明声明快照与稳定制品编译提交并非可复现的一一对应关系。
- 按用户明确授权一并修复 Windows 更新：安装器启动前停止后台服务及完整路径匹配的内置进程，失败后要求重启恢复，阻止跳过清理直接重试。macOS/Linux 保持安装成功后停止会话。
- 更新说明、设置搜索和十五种语言文案；本轮不迁移 shared/independent 账号与会话数据，不发布 Release 或替换已安装 App。
### Testing
- `node --test scripts/prepare-bundled-runtime.test.mjs`：2/2；`bash -n scripts/package-windows-portable.sh`：通过。
- `pnpm typecheck`、本轮前端文件定向 ESLint、Rust 定向 rustfmt、`git diff --check`：通过。
- 前端八文件回归 157/157（首启、relay、更新状态机、i18n、设置锚点、错误卡片、更新通道、What's New）；最后更新与错误卡片复跑 26/26。日志：`/tmp/grok-bundled-ui-tests.log`、`/tmp/grok-bundled-final-ui-tests.log`。
- Rust `cli_probe` 15/15、`bundled_runtime::tests` 3/3；`cargo clippy --all-targets -- -D warnings` 通过。
- 全量 `cargo test --lib` 首次 1898 通过/2 失败/1 忽略；Node 探测单独复跑通过，最终全量 1899 通过/1 失败/1 忽略。剩余 `mirror::lan_bind_test::lan_bind_accepts_detected_ipv4` 连接本机探测地址 `172.18.0.1` 超时，本轮未改该网络逻辑，不能宣称全绿。日志：`/tmp/grok-bundled-rust-tests-final.log`。
- 用隔离的临时 App 配置（包含失效外部路径及 WSL 设置）实际启动内置 1.0.34，ACP 初始化与会话创建约 499ms 通过；未发起模型推理。日志：`/tmp/grok-bundled-live-handshake.log`。
- Windows 新模块及其 Windows 专用测试在独立 harness 中通过 `cargo check --target x86_64-pc-windows-msvc --tests --offline`；依赖的 App 接口用 stub，仅证明该模块 Windows 编译可行，不代表完整 Windows App/安装器已实机通过。真实同名进程隔离测试已接入 Windows CI，未在本机运行。
- 最终 `pnpm exec tauri build --target aarch64-apple-darwin --bundles app --no-sign --ci` 成功；生成 `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Grok.app`。包内主程序与 Grok Build 均为 arm64，内置 `--version` 正常，SHA-256 与固定清单一致，12 个声明/清单资源逐个核对一致。日志：`/tmp/grok-bundled-macos-build-final.log`。
- 尚未进行 Windows 安装器实机升级或线上签名升级；本地未签名包仍使用完整安装包更新，不宣称已启用签名一键升级。
### Notes
- 任务内跨平台更新生命周期改动来自用户本轮明确追加授权；其余改动仅覆盖内置运行时、打包、界面与对应文档。保留仓库此前浏览器和交互等未提交修改。
- 文件清单：
  - `.github/workflows/ci.yml`：将固定运行时准备和打包脚本测试接入 CI。
  - `.gitignore`：忽略按目标暂存的内置二进制。
  - `CHANGELOG.md`：仅在 Unreleased 记录内置运行时和统一更新。
  - `README.md`：说明安装包已包含 Grok Build，终端 CLI 独立管理。
  - `README_EN.md`：说明安装包已包含 Grok Build，终端 CLI 独立管理。
  - `README_RU.md`：说明安装包已包含 Grok Build，终端 CLI 独立管理。
  - `README_ZH.md`：说明安装包已包含 Grok Build，终端 CLI 独立管理。
  - `docs/BUILD.md`：补充内置运行时准备步骤、平台目标和包体规则。
  - `docs/desktop-auto-update.md`：记录 Windows 安装前停止及失败重启恢复顺序。
  - `docs/llm-wiki/bundled-runtime.md`：记录分发依据、运行隔离、构建、更新和验证边界。
  - `docs/llm-wiki/providers.md`：将运行设置说明更新为内置程序。
  - `docs/llm-wiki/release.md`：补充 Windows 内置运行时更新边界。
  - `docs/llm-wiki/setup.md`：将首启流程改为内置程序检测与 App 重装恢复。
  - `progress.md`：追加本轮实现、验证证据、文件清单与回滚点。
  - `scripts/package-windows-portable.sh`：便携包纳入内置程序和许可文件。
  - `scripts/prepare-bundled-runtime.mjs`：从官方源准备固定版本、核验 SHA-256 并按目标暂存。
  - `scripts/prepare-bundled-runtime.test.mjs`：覆盖目标选择和损坏制品拒绝。
  - `src-tauri/build.rs`：传入编译目标以定位开发和测试运行时。
  - `src-tauri/resources/grok-build/LICENSE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/MERMAID-LICENSE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/THIRD-PARTY-NOTICES`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/TOOLS-NOTICES.md`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/VENDORED-NOTICE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/crates/codegen/xai-ratatui-inline/NOTICE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/crates/codegen/xai-ratatui-textarea/NOTICE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/runtime.json`：固定官方稳定版 1.0.34、五个平台摘要与声明来源版本。
  - `src-tauri/resources/grok-build/third_party/dagre_rust/LICENCE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/third_party/graphlib_rust/LICENCE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/third_party/mermaid-to-svg/THIRD_PARTY_NOTICES`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/resources/grok-build/third_party/ordered_hashmap/LICENCE`：随包保留官方许可证或第三方许可声明原文。
  - `src-tauri/src/acp_client.rs`：更新停止期间拒绝启动 Agent，并用内置程序执行真实握手测试。
  - `src-tauri/src/bundled_runtime.rs`：统一内部路径、禁止独立更新并清理 Windows 更新残留进程。
  - `src-tauri/src/cli_install.rs`：拒绝旧独立安装入口。
  - `src-tauri/src/cli_probe.rs`：只探测内置程序并覆盖旧外部路径忽略行为。
  - `src-tauri/src/cli_update.rs`：拒绝旧独立检查和更新入口。
  - `src-tauri/src/commands/doctor_p1.rs`：诊断指向 App 重装，并停止使用旧 CLI 安装校验记录。
  - `src-tauri/src/commands/session_p1.rs`：禁用外部 CLI 文件选择入口。
  - `src-tauri/src/integration_test.rs`：将集成探测预期改为内置程序。
  - `src-tauri/src/lib.rs`：注册内置运行时模块。
  - `src-tauri/src/process_util.rs`：仅给 App 内置程序注入外部管理更新标记。
  - `src-tauri/src/remote_im/grok_agent.rs`：Remote IM 改用内置程序及相同更新边界。
  - `src-tauri/src/updater.rs`：暴露停止状态并在 Windows 交接安装器前清理残留内置进程。
  - `src-tauri/src/wsl_backend.rs`：停用旧本地 WSL CLI 路径选择。
  - `src-tauri/tauri.conf.json`：将内置程序、许可资源和准备钩子接入桌面打包。
  - `src/app/AppWorkbench.tsx`：移除独立 CLI 更新提示条并减少主壳代码。
  - `src/components/BundledRuntimeInfo.tsx`：提供内置版本、路径及损坏恢复说明。
  - `src/components/CliRepairPanel.test.tsx`：删除已移除修复面板的测试。
  - `src/components/CliRepairPanel.tsx`：删除本轮失去入口的外部 CLI 修复面板。
  - `src/components/CliUpdateOfferBar.tsx`：删除独立 CLI 更新提示组件。
  - `src/components/CliUpdateRow.tsx`：删除独立 CLI 更新设置组件。
  - `src/components/DoctorModal.tsx`：诊断恢复操作引导到 App 更新。
  - `src/components/SetupWizard.bundled.test.tsx`：覆盖内置准备成功、缺失及重检恢复。
  - `src/components/SetupWizard.tsx`：首启改为内置探测、App 下载恢复和重检。
  - `src/components/settings/AboutSection.tsx`：关于页展示内置程序信息。
  - `src/components/settings/AboutUpdateRow.tsx`：展示 Windows 更新失败后的重启恢复并禁用更新重试。
  - `src/components/settings/RuntimeSection.tsx`：运行设置替换为只读内置信息和 App 更新。
  - `src/components/settings/WslBackendField.tsx`：删除本轮失去入口的外部 WSL CLI 设置组件。
  - `src/hooks/useUpdater.bundled.test.tsx`：覆盖五种跨平台更新和失败恢复路径。
  - `src/hooks/useUpdater.ts`：按平台调整安装时序并实现 Windows 失败后的重启恢复状态。
  - `src/i18n/messages/de/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/de/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/en/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/en/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/es/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/es/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/fil/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/fil/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/fr/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/fr/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/id/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/id/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/it/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/it/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/ja/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/ja/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/ko/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/ko/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/pt-BR/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/pt-BR/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/ru/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/ru/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/ta/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/ta/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/uk/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/uk/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/zh-TW/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/zh-TW/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/i18n/messages/zh/settings-ui.ts`：更新安装确认文案，说明 App 与内置程序一起更新及任务停止。
  - `src/i18n/messages/zh/settings.ts`：同步内置程序、App 恢复和重启文案。
  - `src/lib/errorDeck.ts`：运行时错误文案改为内置程序及 App 更新。
  - `src/lib/settingsCatalog/entries/about.ts`：将关于页搜索指向内置信息。
  - `src/lib/settingsCatalog/entries/runtime.ts`：移除外部 CLI 搜索项并登记内置信息。
- 回滚点：`/tmp/grok-bundled-runtime-before-20260920/` 保存本轮改动前文件（包含之前未提交工作）。本机执行 `python3 /tmp/rollback-grok-bundled-runtime-20260920.py` 可恢复这些快照并删除本轮新增文件；请在产生后续修改前执行。脚本不会删除 target 构建产物、用户终端 CLI 或用户数据。不要用 `git reset --hard` 回滚本轮。

## 2026-09-20 - Task: 修复并发限流误报 Agent 崩溃及应用重启
### What was done
- 针对本机故障日志中的 `gateway_concurrency_limit → serialization error: missing field output` 链路修复错误呈现；只有明确且归属唯一当前请求的 stderr 证据才显示账号并发超限，证据缺失或多会话歧义时保留服务响应错误。
- 不改上游网络响应或 ACP 线协议，不修改内置二进制、不绕过服务端并发限制；使用现有请求记录关联本地错误证据，避免跨轮次或跨会话误归因。
- 失败时先保存已产生的正文、思考和附件，再追加独立错误记录；错误持久化成功后清理运行租约，避免切回会话时制造应用重启提示。
- 兼容旧版已失败但仍有 Active 租约的记录；恢复历史时将该轮错误放在内容之后，去掉同轮多余 host_exit，保留其他轮次真正的中断。
- 同步十五种语言的账号并发超限提示及使用文档。未访问在线模型、未执行用户动画任务、未改写正在运行应用的会话数据，未重新制作或替换安装包。
### Testing
- 修复前新增前端回归：3 项稳定失败（缺少 output 被归为崩溃、并发超限未识别、错误覆盖部分输出），42 项原有用例通过；日志 `/tmp/grok-turn-failure-before-tests.log`。
- 最终前端 6 文件 118/118 通过：错误分类、消息投影、15 语言目录、消息导航、结束原因和中断继续。包括正文部分输出、先收到非 streaming 状态的思考内容保留。日志 `/tmp/grok-turn-failure-ui-tests-final.log`。
- Rust 相关模块：`session_manager::` 120/120、`acp_client::` 124/124、`cli_sessions::` 32/32、`turn_interrupt::tests` 12/12；覆盖错误落盘后租约清理、重连不误报重启、历史顺序幂等、真正中断保留、请求级限流证据隔离。以上 288 项不重复计数；单独执行的新用例已包含其中。
- `pnpm typecheck`、定向 ESLint、`cargo clippy --all-targets -- -D warnings`、本轮 Rust 文件 `rustfmt --check`、`git diff --check`：通过。
- 测试使用隔离临时数据和错误样本，不声称已解决中转服务实际额度/并发限制；本轮没有触发真实在线限流重放或运行全量仓库测试。
### Notes
- `docs/llm-wiki/session-continuity.md`：记录失败轮次收尾、原始错误保留和历史恢复规则。
- `progress.md`：追加本轮修复、验证及精确回滚说明。
- `src-tauri/src/acp_client.rs`：按当前待处理请求保留明确的中转并发限流原因，修正缺少 output 的错误归类并覆盖跨会话隔离。
- `src-tauri/src/cli_sessions.rs`：修复失败轮次恢复内容与错误的顺序，移除该轮重复的 host_exit 提示。
- `src-tauri/src/session_manager/process.rs`：失败前保留部分输出，将终止错误保存为独立记录。
- `src-tauri/src/session_manager/stream.rs`：错误落盘后清理运行租约，并增加部分输出与失败持久化回归。
- `src-tauri/src/turn_interrupt.rs`：识别已失败轮次并清理旧残留状态，避免误报应用重启。
- `src/i18n/messages/de/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/en/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/es/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/fil/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/fr/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/id/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/it/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/ja/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/ko/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/pt-BR/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/ru/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/ta/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/uk/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/zh-TW/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/i18n/messages/zh/errors.ts`：增加该语言的账号并发超限提示与重试建议。
- `src/lib/errorDeck.test.ts`：覆盖缺少 output 和并发限流覆盖旧崩溃分类。
- `src/lib/errorDeck.ts`：区分并发超限、服务响应解析失败与真实进程退出。
- `src/lib/session.projection-snapshot.test.ts`：覆盖失败消息不覆盖部分输出和已持久化思考。
- `src/lib/session/errors.ts`：独立错误消息保留此前正文、思考及附件。
- 回滚：执行 `python3 /tmp/rollback-grok-turn-failure-20260920.py`，从 `/tmp/grok-turn-failure-before-20260920/` 恢复本轮开始前的上述文件，保留之前的内置运行时及浏览器等改动。此回滚点仅适用于后续尚未修改这些文件时；不要使用全仓库 reset。不会修改用户数据或已安装 App。

## 2026-09-22 - Task: 制作包含最新修复及内置 Grok Build 的 macOS 安装包
### What was done
- 使用当前工作区源码重新构建 Apple Silicon macOS App 和 DMG，包含之前完成的并发限流错误呈现、失败轮次保存及恢复修复。
- 保留应用版本 0.2.35，将内置 Grok Build 1.0.34、许可及第三方声明一起打包；交付文件使用日期区分旧安装包。
- 对主程序、内置程序及 App 完成本地 ad-hoc 签名；本轮未发布在线版本、未替换已安装应用或修改用户会话数据。
### Testing
- `APPLE_SIGNING_IDENTITY=- pnpm exec tauri build --target aarch64-apple-darwin --bundles app,dmg --ci` 成功，包含 TypeScript 检查、Vite 生产构建和 Rust release 编译。使用 `/tmp/grok-rust/` Rust 1.98.1 工具链；日志 `/tmp/grok-macos-installer-20260922-build.log`。Vite 提示部分 chunk 大于 500 kB，未阻止构建。
- 打包前内置二进制 SHA256 与固定 manifest 一致：`9cd26b579840f0f5c9148a8059ad651904c08b41b7f2ef0b4ec04b9ba898844e`。
- 主程序与内置程序均经 `file` 确认为 arm64；内置程序 `--version` 返回 `grok 1.0.34 (3736acbc8658)`。
- 构建目录 App 及 DMG 只读挂载后的 App 均通过 `codesign --verify --deep --strict --verbose=2`；DMG 通过 `hdiutil verify`。
- 从实际 DMG 核对应用版本 0.2.35；主程序与内置程序逐字节匹配构建产物，12 个许可/manifest 文件与源目录一致，Applications 链接正确；检查后已卸载镜像。
- 最终 DMG SHA256：`445772f62abf9286ff8005a667fa6f483906555c23d1d7f38cddbe6deb7e137b`。本轮验证安装包完整性，未运行真实在线模型请求或 GUI 会话；未做 Developer ID 签名或 Apple 公证。
### Notes
- `dist-installers/Grok_0.2.35_20260922_aarch64.dmg`：本轮正式本地交付安装包（约 78 MB，gitignored）。
- `dist-installers/SHA256SUMS-20260922.txt`：交付包 SHA256 校验文件（gitignored）。
- `src-tauri/target/aarch64-apple-darwin/release/bundle/`：重新生成的 App 与原始 DMG 构建产物（gitignored）。
- `dist/`、`src-tauri/target/`：本轮构建更新的前端输出及编译缓存（gitignored）。
- `progress.md`：仅追加本轮构建及验证记录；未改产品源码或部署配置。
- 回滚交付：执行 `rm dist-installers/Grok_0.2.35_20260922_aarch64.dmg dist-installers/SHA256SUMS-20260922.txt` 即可移除本次交付；旧安装包 `dist-installers/Grok_0.2.35_20260919_browser-platforms_aarch64.dmg` 保留，但不包含本次内置运行时和故障修复。构建输出无需回滚，不要全仓库 reset；日志历史保留。

## 2026-09-26 - Task: 修复长回答与代码输出的前端刷新延迟
### What was done
- 将长回答额外增加的 Markdown 等待从 220/280ms 统一为 110ms，连续到达的内容不重置当前刷新期限；完成时立即显示完整答案。
- 将已有 Markdown 分段缓存用于实时尾部和未分段正文，避免等待期间父组件刷新触发重复解析；保持代码块、数学、搜索和资源交互。
### Testing
- 先添加连续 30ms 到达的长文本/开放 HTML 代码块用例，修改前两个用例均在 120ms 可见性断言失败；修改后通过。
- MarkdownChat、streamRenderPolicy、markdownTail、softStreamBuffer、sessionTranscriptStore 共 38/38 回归测试通过，涵盖缓存解析次数、最终刷新及卸载清理。
- `pnpm typecheck`、四个变更 TS/TSX 文件的 ESLint 和局部 `git diff --check` 通过。日志位于 `/tmp/grok-stream-fixes-20260926/step1-*.log`。
- 此验证覆盖前端调度与渲染行为，不代表线上模型响应速度；当前已安装 App 尚未包含本次源码修改。
### Notes
- `src/lib/streamRenderPolicy.ts`：限制长回答的 Markdown 调度等待。
- `src/lib/streamRenderPolicy.test.ts`：约束长回答刷新期限。
- `src/components/lobe-chat/MarkdownChat.tsx`：缓存尚未改变的实时 Markdown 分段。
- `src/components/lobe-chat/MarkdownChat.test.tsx`：新增长文本、代码块及重复解析回归验证。
- `docs/llm-wiki/session-continuity.md`：记录实际前端刷新策略。
- `progress.md`：仅追加本项记录。
- 回滚：后续尚未修改这些文件时，执行 `tar -xf /tmp/grok-stream-fixes-20260926/step1-before.tar -C /Users/wangqiang/Project/codex/grok-app` 恢复本项开始前的文件；保留日志历史，不做全仓库 reset。

## 2026-09-25 - Task: 修复流式保存阻塞与高频段落写入
### What was done
- 中途累计快照进入每会话后台写入器，最多保留一个正在写入及一个最新待写快照；完成、停止、插话及失败边界沿同一写入器同步完成，并拒绝晚到的旧快照。
- 段落换行不再绕过 500ms 保存限频；流式中间快照只保存正文，轮次边界更新会话索引。
- 将进程内全局存储互斥改为按规范化 sidecar 文件路径预留，保留跨进程文件锁；两层等待共享 3 秒期限。
### Testing
- SessionManager 120/120、存储锁 6/6、保存限频 9/9 测试通过；新增最后正文断言后重跑失败边界用例通过。覆盖磁盘占用时提交 40 个快照仍可返回、部分正文先于错误行保存、删除后过期快照不恢复历史。
- 与修改前相同的锁竞争/段落实验：无关文件写入等待约 456ms → 0ms；990ms 内 100 个段落的保存次数 100 → 2。证据 `/tmp/grok-stream-fixes-20260926/step2-contention-result.log`。
- Rust Clippy（lib + tests，`-D warnings`）、局部 rustfmt 检查、局部 `git diff --check` 通过。测试日志 `/tmp/grok-stream-fixes-20260926/step2-*.log`。
- 原临时 Rust 工具链缺少测试/格式化组件，已在 `/tmp/grok-stream-fixes-20260926/rustup` 恢复固定 1.98.1 验证工具；未改项目依赖版本或用户运行数据。
### Notes
- `src-tauri/src/store_lock.rs`：按文件加锁、统一等待期限及锁竞争回归。
- `src-tauri/src/journal_throttle.rs`：修正段落限频及密集输出回归。
- `src-tauri/src/session_manager/journal_writer.rs`：新增有界后台写入与强制保存屏障。
- `src-tauri/src/session_manager/stream.rs`：提交保存快照、版本号与最终正文顺序验证。
- `src-tauri/src/session_manager/types.rs`：会话持有写入器。
- `src-tauri/src/session_manager/mod.rs`：注册写入模块并更新限频说明。
- `src-tauri/src/session_manager/connect.rs`：初始化连接会话的写入器。
- `src-tauri/src/session_manager/process.rs`：初始化进程会话的写入器。
- `src-tauri/src/session_manager/routing_tests.rs`：补齐会话测试夹具字段。
- `src-tauri/src/session_manager/routing_tests_p2.rs`：补齐会话测试夹具字段。
- `src-tauri/src/session_manager/stall_tests.rs`：补齐会话测试夹具字段。
- `docs/llm-wiki/session-continuity.md`：明确中途保存、强制边界及锁等待行为。
- `progress.md`：仅追加本项记录；前一项记录日期及临时目录名使用了机器显示的 2026-09-26，本轮任务日期以 2026-09-25 为准。
- 回滚：仅在后续尚未修改对应文件时，执行 `tar -xf /tmp/grok-stream-fixes-20260926/step2-before.tar -C /Users/wangqiang/Project/codex/grok-app`，再执行 `rm /Users/wangqiang/Project/codex/grok-app/src-tauri/src/session_manager/journal_writer.rs`；保留日志历史和第一项已完成修改。

## 2026-09-25 - Task: 修复自定义 Responses 失败事件的运行时兼容问题
### What was done
- 将通用 Responses 自定义供应商接入现有本地兼容代理，仅为 `response.failed` 中缺少 `output` 的失败响应补空数组，保留真实状态、错误码及已有输出。
- 正常数据按完整 SSE 事件及时转发，保留 HTTP 状态、错误正文和 Retry-After；OpenCode 过滤规则及 300 秒空闲期限仍只用于原有供应商范围。
- 启动及供应商列表修复只更新 App 自有配置，保留真实上游地址供设置界面显示；官方订阅及原生 Grok Build relay 模式不走此通用兼容路径。
### Testing
- 兼容代理 18/18、供应商配置 32/32 回归测试通过；Rust Clippy（lib + tests，`-D warnings`）、局部 rustfmt 和局部 diff 检查通过。日志 `/tmp/grok-stream-fixes-20260926/step3-*.log`。
- 实际回环代理集成测试使用隔离 App 配置和本地假上游，验证中文跨字节分片、CRLF、请求方法/路径/查询/正文/授权头、首段在上游完成前到达、失败事件规范化、HTTP 429 与 Retry-After 保留、配置修复幂等及原生 relay 不改写。
- 隔离 CLI 实验中，1.0.30、内置 1.0.34、1.0.40 均在规范化失败后、模拟服务恢复时成功 end_turn；36 段按 30ms 发送的输出平均间隔 31–32ms、最大 33ms，无 missing output。此实验验证 CLI 对规范化事件的行为，生产代理由上述集成测试覆盖。
- 持续模拟并发超限仍会进入 CLI 自身重试，并达到实验 15 秒期限；本项不消除服务端限额、不重发整个对话或工具调用，也不把此场景描述为恢复成功。未修改用户配置、会话或已安装应用。
### Notes
- `src-tauri/src/relay_stream_proxy.rs`：增加失败事件兼容、通用 Responses 路由、传输信息保留及纯函数/回环集成回归。
- `src-tauri/src/providers.rs`：更新通用供应商路由说明，保持原生模式独立。
- `docs/llm-wiki/providers.md`：记录兼容范围、原错误保留及运行时重试边界。
- `progress.md`：仅追加本项记录。
- 回滚：后续尚未修改对应文件时，执行 `tar -xf /tmp/grok-stream-fixes-20260926/step3-before.tar -C /Users/wangqiang/Project/codex/grok-app`；保留日志历史及前两项修复，不做全仓库 reset。

## 2026-09-25 - Task: 修复客户端提前终止运行时重试
### What was done
- 移除第 3 次传输失败即取消以及失败状态只允许使用三分之二预算的规则；临时断网、限流和单次失败按运行时声明的预算处理，最多仍为 15 次。
- 保留运行时明确放弃、预算耗尽、终止状态和配额/信用耗尽的立即失败出口；前台与后台继续共用同一策略，并保留无活动轮次的重连回放保护。
- 不增加 Host 重发对话或工具调用，保留现有重试状态展示与用户停止入口。
### Testing
- 先运行新的重试策略回归，在修改前稳定复现两项失败：传输错误 attempt 3 和 failed 状态 attempt 8 / max 12 被提前终止。日志 `/tmp/grok-stream-fixes-20260926/step4-before-tests.log`。
- 修复后 ACP 125/125（含 6 项重试策略测试）、SessionManager 120/120 通过；覆盖网络恢复预算、429/503、明确终止、额度耗尽、较小运行时预算、15 次上限及重连回放不落错误。日志 `step4-acp-tests.log`、`step4-session-tests.log`。
- Rust Clippy（lib + tests，`-D warnings`）、两个 Rust 文件的 rustfmt 检查及局部 diff 检查通过；日志 `/tmp/grok-stream-fixes-20260926/step4-clippy.log`。
- 本轮四项为源码及隔离验证；未重新打包、安装或改写用户运行数据。真实网络持续不可用和服务端额度限制仍可终止请求，不能由客户端修复消除。
### Notes
- `src-tauri/src/acp_client.rs`：统一有界重试策略，移除不再使用的提前中断识别函数，并调整/增加回归用例。
- `src-tauri/src/session_manager/events.rs`：更新实际尝试次数的说明，去除已取消的提前中断规则注释。
- `docs/llm-wiki/session-continuity.md`：记录重试预算、终止及回放边界，并与前项 Responses 兼容文档保持一致。
- `progress.md`：仅追加本项记录。
- 回滚：后续尚未修改对应文件时，执行 `tar -xf /tmp/grok-stream-fixes-20260926/step4-before.tar -C /Users/wangqiang/Project/codex/grok-app`；保留日志历史及前三项代码修复。若回滚全部四项，应按 step4、step3、step2、step1 的反向顺序恢复各自备份，并按 step2 说明删除新增写入器文件。

## 2026-09-25 - Task: 支持用户全局 ~/.grok/AGENTS.md 规则
### What was done
- 本地原生 Agent 在打开会话前同步真实用户主目录的全局规则；共享模式沿用运行时原生加载，独立、自定义供应商及官方辅助 profile 使用独立的 App 管理规则文件，保留 profile 和项目 AGENTS.md。
- 采用 Grok Build 原生 `rules/*.md` 入口，保留默认系统提示词，不增加开关、不依赖 ACP 下未生效的 `--rules` 标记，也不套用会话 extra_rules 的截断上限。
- 新建会话（含预热进程复用）读取当前规则；源文件删除或清空会清理管理副本，未变更不重写，读取失败或目标为非 App 管理文件时明确返回连接错误。文件操作复用现有锁与原子替换，不阻塞异步执行器。
- 明确原生运行时快照边界：历史、已挂起和恢复会话沿用原规则，规则变更后需新建对话；不重写历史记录，不把本地规则传给 SSH、WSL 或 TCP 远端。
### Testing
- Rust ACP 相关测试 133/133 通过，其中新增全局规则测试 8 项，覆盖缺失、UTF-8/CRLF 和大文本、更新与幂等、删除/清空、共享及符号链接去重、读取失败和非管理文件保护。日志 `/tmp/grok-global-rules-20260925/rust-tests.log`。
- Rust Clippy（lib + tests，`-D warnings`）、修改的 Rust 文件 rustfmt 检查及局部 `git diff --check` 通过。Clippy 日志 `/tmp/grok-global-rules-20260925/clippy.log`。
- 使用已安装的内置 Grok Build 1.0.34、隔离 HOME/profile/项目和本地假 Responses 上游，检查实际推理请求中的规则标记；7 个场景通过：共享新建/预热后更新、独立新建/预热后更新、恢复保留原快照、删除后新建、未信任项目仍加载全局规则且不加载项目规则。每个应加载标记均只出现一次。脚本及日志为 `/tmp/grok-global-rules-20260925/verify-acp.mjs`、`native-acp.log`。
- 隔离实验确认 `--rules` 内容未进入该版本 ACP 推理请求，因此本功能改用已验证的原生规则目录；没有扩改现有其他启动规则通道。恢复会话实验也确认重新连接不会刷新其历史规则快照，已如实记录使用边界。
- 未调用真实付费模型，未修改用户实际规则/配置/认证/会话或已安装软件；上述验证证明规则送入请求，不等同于保证模型每次均遵循所有自然语言规则。未在 Windows/Linux 运行原生二进制，跨平台文件逻辑已编译/静态检查，平台实机验证仍未执行。
### Notes
- `src-tauri/src/acp_client/user_rules.rs`：新增用户全局规则同步、受管理文件保护和 8 项回归测试。
- `src-tauri/src/acp_client.rs`：保存本地 Agent profile 路径，并在打开会话前执行规则同步；远端路径不注入本机规则。
- `docs/llm-wiki/providers.md`：说明固定规则入口、共享/独立行为、快照生效时机及远端边界。
- `progress.md`：仅追加本轮记录。
- 回滚：后续尚未修改对应文件时，执行 `tar -xf /tmp/grok-global-rules-20260925/before.tar -C /Users/wangqiang/Project/codex/grok-app`，再执行 `rm /Users/wangqiang/Project/codex/grok-app/src-tauri/src/acp_client/user_rules.rs`；保留 progress.md 历史及此前所有改动。本轮未运行新构建的客户端，实际用户 profile 中未生成规则副本。
- 本轮仅完成源码、文档和验证；未制作或安装新的 macOS 安装包。

## 2026-09-25 - Task: 制作自动集成最新 Grok Build 的 macOS 安装包
### What was done
- 将普通打包及单独 bundle 的准备钩子接入官方 stable 查询：有新版时下载五个平台制品、固定 SHA-256、按公开源码不可变提交更新许可声明；同版只检查通道和目标缓存。失败时终止打包，终端 CLI 与正在运行的 App 不参与更新。
- 本次官方稳定版为 Grok Build 1.0.41，内置二进制报告 `grok 1.0.41 (4220f3b224a6)`；许可来源提交为 `f0e3be1100ef5252488e3be8bb0e91cf68d8c305`，根许可与已审查文本相同，并补齐 Roboto 字体许可。
- 以当前工作区重新构建 Grok 0.2.35 的 Apple Silicon App 和 DMG，包含用户全局规则及此前流式输出、存储和重试修复。交付包以日期和运行时版本区分，旧安装包保留。
- 生成安装包及 SHA-256 文件；未覆盖已安装 App、未更新用户终端 CLI、未改用户真实账号或会话、未创建 tag 或发布在线 Release。
### Testing
- 打包脚本 9/9 测试通过（新增 7 项）：最新版本与全平台摘要、固定许可来源、同版不重下、通道/下载失败、非法版本、许可变更及声明缺失时保留旧制品。日志 `/tmp/grok-package-20260925/prepare-tests.log`。
- 前端 676 个测试文件、7,672 项测试全部通过，额外 What's New 21/21 通过；TypeScript 检查与 Vite 生产构建成功。日志为同目录 `frontend-tests.log`、`changelog-tests.log`、`ui-build.log`。Vite 的既有大 chunk 提示未阻断构建。
- 固定 Rust 1.98.1 执行 `cargo build --manifest-path src-tauri/Cargo.toml --locked --release --target aarch64-apple-darwin` 成功（6m39s）；再以 `APPLE_SIGNING_IDENTITY=- pnpm exec tauri bundle --target aarch64-apple-darwin --bundles app,dmg --ci` 出包，日志确认 beforeBundle 自动查询 stable 并选中 1.0.41。日志 `rust-release-build.log`、`bundle.log`。
- 第一次全平台下载遇到 180 秒期限，未替换旧 manifest 或制品；根据实际下载量延长至 900 秒后成功。五个平台暂存文件均重新核对 SHA-256 与 manifest 相符，来源为官方 HTTPS 下载摘要而非官方签名。下载日志 `runtime-refresh-retry.log`。
- 在 1.0.41 上重跑 7 个隔离全局规则场景全部通过：共享/独立新建与预热更新、恢复保留快照、删除后的新建、未信任项目边界。日志 `runtime-rules.log`；没有访问真实模型服务。
- 1.0.41 的本地模拟正常流与规范化失败后的恢复均成功 end_turn，36 段文本完整送达，无解码失败；正常流平均间隔 32ms、最大 36ms（上游按 30ms 发送）。日志 `runtime-stream.log`、`runtime-recover.log`；该结果不代表真实网络或模型速度保证。
- App 及最终 DMG 只读挂载后的 App 均通过 `codesign --verify --deep --strict`；DMG 通过 `hdiutil verify`。从交付包确认主程序/运行时均为 arm64、二进制与构建 App 一致、13 个声明/manifest 文件与源目录一致、Applications 链接正确。
- 从实际 DMG 内启动内置运行时完成隔离 ACP/模拟流式会话，确认 1.0.41、end_turn、36 段完整输出（平均 31ms、最大 32ms）；检查后卸载镜像。证据 `installer-verification.json`、`mounted-runtime.log`、`mounted-codesign.log`。未启动生产 GUI 或真实付费模型；没有 Developer ID 证书，本包为本地 ad-hoc 签名，未做 Apple 公证。
- 最终安装包 SHA-256：`2e683d58070654eb5f52d56350b013cc5b6f610bb6a3521407a74c6efc05b6f2`，校验文件复验通过；局部 `git diff --check` 通过。
### Notes
- `scripts/prepare-bundled-runtime.mjs`：新增自动 stable 刷新、完整下载后替换、源码许可快照与失败中止。
- `scripts/prepare-bundled-runtime.test.mjs`：新增自动刷新和失败保留旧制品回归。
- `src-tauri/tauri.conf.json`：构建和单独 bundle 都自动刷新内置运行时。
- `src-tauri/resources/grok-build/runtime.json`：更新 1.0.41、五个平台摘要及许可来源提交。
- `src-tauri/resources/grok-build/crates/codegen/xai-grok-mermaid/assets/Roboto-LICENSE.txt`：补齐新来源快照中的字体许可；其余许可文件复核后内容保持相同。
- `docs/BUILD.md`：说明在线自动刷新与开发/离线固定版本的区别。
- `docs/llm-wiki/bundled-runtime.md`：记录自动刷新、许可复核和用户端更新边界。
- `docs/llm-wiki/providers.md`：补充全局规则在 1.0.41 上的实际验证。
- `CHANGELOG.md`：仅补充 Unreleased 的全局规则和自动打包更新说明，未改已发布版本。
- `src-tauri/binaries/grok-build-aarch64-apple-darwin`、`grok-build-x86_64-apple-darwin`、`grok-build-x86_64-pc-windows-msvc.exe`、`grok-build-x86_64-unknown-linux-gnu`、`grok-build-aarch64-unknown-linux-gnu`：分别更新对应平台的 1.0.41 暂存制品（gitignored）；本轮仅制作/实测 macOS arm64 安装包。
- `dist-installers/Grok_0.2.35_20260925_grok1.0.41_aarch64.dmg`：新的本地交付安装包，约 74 MiB（gitignored）。
- `dist-installers/SHA256SUMS-20260925-grok1.0.41.txt`：交付包 SHA-256（gitignored）。
- `dist/` 与 `src-tauri/target/`：更新前端、编译及 App/DMG 构建产物（gitignored）。
- `progress.md`：仅追加本轮记录。
- 回滚代码与文档（后续尚未修改对应文件时）：在仓库根目录执行 `tar -xf /tmp/grok-package-20260925/before.tar`，再执行 `rm src-tauri/resources/grok-build/crates/codegen/xai-grok-mermaid/assets/Roboto-LICENSE.txt`；保留日志及此前源码修复。
- 回滚运行时缓存：恢复 manifest 后执行 `rm src-tauri/binaries/grok-build-{aarch64-apple-darwin,x86_64-apple-darwin,x86_64-pc-windows-msvc.exe,x86_64-unknown-linux-gnu,aarch64-unknown-linux-gnu}`，然后 `node scripts/prepare-bundled-runtime.mjs --target aarch64-apple-darwin`，按旧固定摘要重新准备本机缓存。
- 撤回本次交付：执行 `rm dist-installers/Grok_0.2.35_20260925_grok1.0.41_aarch64.dmg dist-installers/SHA256SUMS-20260925-grok1.0.41.txt`；不影响旧包或当前安装的软件，不做全仓库 reset。

## 2026-09-26 - Task: 修复 macOS 安装后主窗口空白并重新制作安装包
### What was done
- 复现已安装 App 的空白窗口：原包使用未启用 `tauri/custom-protocol` 的普通 Cargo release 产物，构建输出仍标记 `cfg(dev)`，主窗口依赖未运行的开发服务器；此前内置 CLI、签名和镜像验证不能覆盖这个桌面启动问题。
- 为 release 编译增加缺少内置前端模式时的拦截，明确提示使用完整 Tauri 构建，阻止同类错误产物再次由普通 Cargo release 编译生成。
- 改用完整 `tauri build` 重新生成 Apple Silicon App 和 DMG，生产前端已嵌入；构建和打包钩子均重新检查官方 stable，继续内置 Grok Build 1.0.41。
- 同步构建与交付规范，要求在无开发服务器的环境下，从最终安装包实际验证主页面、输入框和设置；新包单独命名为 startupfix，未覆盖已安装的 App 或旧交付包。
### Testing
- 原包通过原生界面工具复现：只存在空 HTML 内容，没有应用控件；相关编译输出、安装二进制摘要记录于 `/tmp/grok-blank-window-20260926/diagnosis.json`。
- 新拦截对相同的普通 `cargo build --locked --release --target aarch64-apple-darwin` 稳定返回失败，明确提示必须内嵌前端；证据 `reject-dev-release.log`。正确 Tauri 构建通过，编译参数含 `--features tauri/custom-protocol`，最新构建输出没有 `cargo:rustc-cfg=dev`。
- 内置运行时准备脚本 9/9、What's New 21/21 测试通过；TypeScript 与 Vite 生产构建通过；Rust release 编译完成（6m40s），App 和 DMG 打包成功。证据位于同一临时目录的 `prepare-tests.log`、`changelog-tests.log`、`tauri-build.log`。
- 从最终 DMG 只读挂载的 App 实际启动，确认进程路径来自该镜像且端口 1421 无开发服务器；主页面为 `tauri://localhost/`，侧栏、历史会话列表、新会话标题及输入框正常显示，截图人工复核通过。
- 实测中文草稿输入、发送按钮启用、清空测试草稿、设置页面切换和返回应用；未发送对话或调用付费模型。运行时设置页显示 1.0.41 及镜像内 CLI 路径。启动日志出现 main page loaded 和 healthy。测试后正常退出，确认镜像内 App/CLI 进程均结束，卸载 disk14 成功。
- 构建 App 和最终镜像内 App 均通过 `codesign --verify --deep --strict`；DMG 通过 `hdiutil verify`，包内两个二进制均与构建 App 一致。交付文件 83,419,773 字节，SHA-256 为 `8412000978acc163c00b7a140b8c33f02a881e6e5ff611543d767764bad0e7cf`，校验文件复验通过。汇总证据 `installer-verification.json`。
- Rust build.rs 的 rustfmt 检查及局部 diff 检查通过。本轮验证范围为本机 macOS arm64 启动与基本交互，未测试 Windows/Linux 或在线模型完整对话；包仍为本地 ad-hoc 签名，未 Apple 公证。
### Notes
- `src-tauri/build.rs`：拒绝会使用开发页面地址的错误 release 编译方式，保留既有运行时目标及更新配置处理。
- `docs/BUILD.md`：说明空白根因、正确正式构建方式和最终安装包 GUI 验收要求。
- `docs/llm-wiki/release.md`：补充同一正式构建与桌面启动验收约束。
- `CHANGELOG.md`：仅在 Unreleased 增加中英文的错误正式构建拦截说明。
- `progress.md`：仅追加本轮记录，不改写前次交付与验证历史。
- `dist-installers/Grok_0.2.35_20260926_startupfix_grok1.0.41_aarch64.dmg`：修复启动空白的本地 Apple Silicon 交付包（gitignored）。
- `dist-installers/SHA256SUMS-20260926-startupfix.txt`：对应新交付包的 SHA-256 校验文件（gitignored）。
- `dist/`、`src-tauri/target/`：完整 Tauri 流程重新生成的前端、编译及打包产物（gitignored）。
- 回滚本轮源码及文档（对应文件无后续修改时）：在仓库根目录执行 `tar -xf /tmp/grok-blank-window-20260926/before.tar`；保留 progress.md 历史与之前所有其他修复。该回滚只撤销构建拦截与说明，不应继续分发已知空白的旧包。
- 撤回本轮交付：执行 `rm dist-installers/Grok_0.2.35_20260926_startupfix_grok1.0.41_aarch64.dmg dist-installers/SHA256SUMS-20260926-startupfix.txt`；已安装 App 未由本轮替换，无需回滚用户软件或会话数据。

## 2026-10-04 - Task: 修复定制客户端更新来源混用
### What was done
- 本地构建默认不查询上游；正式发布需要构建时指定自身发布 API 和页面，CI 使用当前仓库。
- 关于页面明确显示未配置更新来源，保留已配置签名更新流程。
### Testing
- 更新生命周期 6/6、更新文案映射 41/41、i18n 42/42 通过；TypeScript 检查通过；diff 检查通过。新增回归证明未配置来源时不会调用更新查询或提供安装包。
- 本项 Rust 新增配置单测，随本轮 Host 验证执行；未制作或安装客户端。
### Notes
- `src-tauri/src/app_update.rs`：更新来源必须在构建时明确指定，删除上游默认回退。
- `src-tauri/src/updater.rs`：向界面提供更新来源是否配置及发布页。
- `src-tauri/build.rs`：跟踪并嵌入发布来源构建参数。
- `src/hooks/useUpdater.ts`：未配置来源不请求更新，使用 Host 的发布页。
- `src/hooks/useUpdater.bundled.test.tsx`：验证本地构建不会查询上游或提供安装。
- `src/components/settings/AboutUpdateRow.tsx`：展示未配置来源的明确提示。
- `.github/workflows/release.yml`：官方发布流程使用当前仓库自己的地址。
- `docs/desktop-auto-update.md`：说明本地与正式发布的来源配置。
- `src/i18n/messages/de/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/en/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/es/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/fil/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/fr/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/id/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/it/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/ja/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/ko/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/pt-BR/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/ru/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/ta/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/uk/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/zh/settings.ts`：补充本地构建更新来源提示翻译。
- `src/i18n/messages/zh-TW/settings.ts`：补充本地构建更新来源提示翻译。
- `progress.md`：追加本项验证记录。
- 回滚：在仓库根目录执行 `tar -xzf /tmp/grok-fixes-20261004/before.tar.gz -- <上述需要回滚的文件路径>`；发布流水线执行 `cp /tmp/grok-fixes-20261004/release.yml.before .github/workflows/release.yml`。仅适用于这些文件无后续修改时，保留进度历史及原有改动。

## 2026-10-04 - Task: 修复会话与供应商追加规则未进入模型
### What was done
- 按 Grok Build 公开原生接口，将合并后的追加规则通过 session/new 的 _meta.rules 传入，保留默认系统提示词；不写入跨会话共享文件。
- 保留旧会话规则快照与原有全局 AGENTS.md 机制，明确规则修改后需新建聊天。
### Testing
- 新增 Rust 会话隔离/空规则/不覆盖默认提示词回归通过（1/1）。
- 实际内置 Grok Build 1.0.41 + 隔离 HOME/GROK_HOME + 本机模拟推理服务：两次新建会话的真实推理请求分别包含本会话规则、不含另一会话规则；均正常完成。未调用真实模型。脚本 `/tmp/grok-fixes-20261004/verify-rules.mjs`。
- 第一项补充验证：Host 更新模块 10/10 单测通过，证据 `/tmp/grok-fixes-20261004/rust-tests.log`。
### Notes
- `src-tauri/src/acp_client.rs`：保存进程对应规则，在新会话请求携带原生规则元数据，补回归测试。
- `src-tauri/src/official_aux.rs`：纠正规则通道注释。
- `docs/llm-wiki/providers.md`：记录生效范围、原生接口和真实运行时验证。
- `progress.md`：追加本项记录。
- 回滚：对应文件无后续修改时执行 `tar -xzf /tmp/grok-fixes-20261004/before.tar.gz src-tauri/src/acp_client.rs src-tauri/src/official_aux.rs docs/llm-wiki/providers.md`；保留进度历史。

## 2026-10-04 - Task: 修复后台浏览器打开到错误项目
### What was done
- 从 MCP 创建到动作与界面事件携带工作区归属，操作前确认可见工作区，前端再次过滤异项目事件。
- 切换项目后明确要求返回原工作区继续浏览器操作，不抢占当前项目侧栏；保留现有可见 WebView 工作方式。
### Testing
- 前端 3 文件 8 项通过，包括后台 A 不修改 B 的状态/不展开侧栏、返回 A 后正常接收；TypeScript 检查通过。
- Rust 浏览器相关 21/21 通过，含实际 Host 编译，日志 `/tmp/grok-fixes-20261004/browser-tests.log`；diff 检查通过。未运行三平台 GUI 验收。
### Notes
- `src-tauri/src/browser_mcp.rs`：在 MCP 环境和动作请求中传递工作区。
- `src-tauri/src/extensions.rs`：将当前会话工作目录交给浏览器 MCP。
- `src-tauri/src/browser_automation.rs`：执行前确认前台归属，事件保留归属，检查超时有明确错误。
- `src/hooks/useAgentBrowser.ts`：核对前台工作区并拒绝异项目事件。
- `src/hooks/useAgentBrowser.test.ts`：路径与归属匹配回归。
- `src/hooks/useAgentBrowser.routing.test.tsx`：实际 hook 跨项目事件回归。
- `src/app/WorkbenchResourcesAside.tsx`：传入现有工作区路径。
- `scripts/browser-automation-smoke.mjs`：支持指定目标工作区。
- `docs/llm-wiki/browser-automation.md`：记录归属、后台使用边界及验证范围。
- `progress.md`：追加本项记录。
- 回滚：对应文件无后续修改时，从 `/tmp/grok-fixes-20261004/before.tar.gz` 用 `tar -xzf ... <上述原有文件>` 还原；删除本轮新增 `src/hooks/useAgentBrowser.routing.test.tsx`，保留历史日志。

## 2026-10-04 - Task: 修复切换主会话丢失侧聊草稿
### What was done
- 按主会话分别保留侧聊、引用、草稿及打开状态，切换只隐藏对应面板；侧聊继续绑定创建时的项目及工作目录。
- 保留后台接收回复与已有连接，返回原会话无需重新创建侧聊。
### Testing
- 侧聊交互、事件路由及提问快捷键 3 文件 16/16 通过；新增 A/B 草稿与引用来回切换回归。TypeScript 检查通过。
- 该恢复范围是工作台挂载期间；未增加重启后草稿持久化，也未修改会话存储结构。
### Notes
- `src/components/TranscriptSideChat.tsx`：按源会话保留独立面板状态与生命周期。
- `src/components/TranscriptSelectionToolbarHost.test.tsx`：验证切换恢复，选择器限定到主会话内容。
- `docs/llm-wiki/transcript-selection.md`：说明恢复范围及后台会话行为。
- `progress.md`：追加本项记录。
- 回滚：对应文件无后续修改时执行 `tar -xzf /tmp/grok-fixes-20261004/before.tar.gz src/components/TranscriptSideChat.tsx src/components/TranscriptSelectionToolbarHost.test.tsx docs/llm-wiki/transcript-selection.md`；保留历史日志。

## 2026-10-04 - Task: 修复更新安装包平台与架构匹配
### What was done
- 安装包先严格匹配操作系统及芯片，再对兼容项排序；缺少兼容项时不返回错误平台下载地址，并显示说明。
### Testing
- Host 更新模块 11/11 通过，包括 Mac ARM 缺包、Linux 架构不符、Windows 无包、macOS universal 和 Linux amd64；i18n/更新文案 83/83 通过；TypeScript 检查通过。
### Notes
- `src-tauri/src/app_update.rs`：兼容性前置过滤及缺包回归。
- `src/components/settings/AboutUpdateRow.tsx`：缺少匹配包时显示说明。
- `src/i18n/messages/de/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/en/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/es/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/fil/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/fr/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/id/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/it/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/ja/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/ko/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/pt-BR/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/ru/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/ta/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/uk/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/zh/settings.ts`：新增无兼容安装包的翻译。
- `src/i18n/messages/zh-TW/settings.ts`：新增无兼容安装包的翻译。
- `docs/desktop-auto-update.md`：记录兼容格式与架构策略。
- `progress.md`：追加本项记录。
- 回滚：Host 文件用 `cp /tmp/grok-fixes-20261004/app_update.before-task5.rs src-tauri/src/app_update.rs` 还原；其余文件仅删除本项新增的 `settings.updateNoCompatibleInstaller` 键、对应显示块及文档本节，保留第一项来源修复。

## 2026-10-04 - Task: 补齐浏览器前进后退及当前页面恢复
### What was done
- 工具栏接入 WebView 历史操作、忙状态和错误展示，页面地址同步到项目标签状态供切换后恢复。
- SSH 导航保存远端原地址，避免临时转发端口被错误持久化。
### Testing
- BrowserTab 3/3 回归通过：真实命令参数、错误状态、页面加载地址保存/重建、SSH 映射；项目隔离 4/4 和 i18n 42/42 通过，TypeScript 检查通过。
- 测试模拟 Host；未做本轮原生 WebView 真机验收。只恢复当前 URL，不承诺恢复项目切换前的历史栈或表单。
### Notes
- `src/components/side-workbench/BrowserTab.tsx`：导航按钮、失败提示、加载后地址同步及 SSH 地址还原。
- `src/components/side-workbench/BrowserTab.test.tsx`：新增导航与恢复回归。
- `src/components/side-workbench/SideTabBody.tsx`：传递浏览器地址回调。
- `src/components/side-workbench/SideWorkbench.tsx`：将最新页面地址写入现有标签状态。
- `src/i18n/messages/de/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/en/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/es/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/fil/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/fr/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/id/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/it/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/ja/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/ko/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/pt-BR/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/ru/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/ta/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/uk/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/zh/workspace.ts`：前进/后退按钮翻译。
- `src/i18n/messages/zh-TW/workspace.ts`：前进/后退按钮翻译。
- `docs/llm-wiki/browser-automation.md`：记录导航、恢复及验证边界。
- `progress.md`：追加本项记录。
- 回滚：浏览器组件执行 `cp /tmp/grok-fixes-20261004/BrowserTab.before-task6.tsx src/components/side-workbench/BrowserTab.tsx`；从初始 before.tar.gz 还原本项 SideTabBody、SideWorkbench 及 workspace.ts 翻译文件，删除 BrowserTab.test.tsx 和文档本节；保留第三项归属修复。

## 2026-10-04 - Task: 侧边聊天显示实际工具运行状态
### What was done
- 侧聊按会话接收并合并工具事件，复用主对话工具行显示当前动作、执行中/失败状态及可展开结果。
- 结束与停止清理运行指示，下一轮重置活动；其他会话事件不影响侧聊，不新增看板或轮询。
### Testing
- 侧聊、交互、快捷键及合并队列 4 文件 29/29 通过；新增工具事件隔离、失败保留、下一轮重置、停止及实际组件状态显示回归。TypeScript 检查通过。
### Notes
- `src/hooks/useTranscriptSideChat.ts`：按会话合并工具事件并管理当前轮活动。
- `src/hooks/useTranscriptSideChat.test.tsx`：工具隔离、错误、重置和停止回归。
- `src/components/TranscriptSideChat.tsx`：复用现有工具行，执行工具时不重复显示“思考中”。
- `src/components/TranscriptSelectionToolbarHost.test.tsx`：实际侧聊工具运行与失败 UI 回归。
- `docs/llm-wiki/transcript-selection.md`：记录活动展示与生命周期。
- `progress.md`：追加本项记录。
- 回滚：分别用 `/tmp/grok-fixes-20261004/useTranscriptSideChat.before-task7.ts` 和 `TranscriptSideChat.before-task7.tsx` 复制还原对应源码；删除本项新增测试与文档 Tool activity 节，保留第四项草稿恢复。

## 2026-10-04 - Task: 本轮修复集中回归与更新失败补充
### What was done
- 完成上述五项问题及两项体验优化的集中回归；补齐“签名源失败且没有手动回退源”时保留原始失败提示，不让空闲状态掩盖更新失败。
- 为未配置来源、缺少兼容包的实际设置界面补充交互回归，同步发布规范。
- 本轮未提交 Git、未制作或安装新包，保留所有既有工作区改动。
### Testing
- 最终前端全量：679 文件、7,684 项全部通过，日志 `/tmp/grok-fixes-20261004/frontend-final.log`。
- 最终 TypeScript 与 Vite 生产构建通过，日志 `ui-build-final.log`；Vite 仍有既有大 chunk 提示，不影响成功构建。
- Host 相关模块：更新包 11/11、更新生命周期 4/4、会话规则 1/1、浏览器 21/21 通过；已编译本轮 Host 改动。没有宣称 Host 全量测试或 Windows/Linux 真机验收通过。
- 内置运行时规则隔离真实请求验证通过，使用隔离 HOME 与本地模拟服务，未调用付费模型。
- 本轮修改的前端文件 ESLint、全仓库 diff 空白检查通过；逆向补丁 `git apply --reverse --check /tmp/grok-fixes-20261004/changes.patch` 通过。
### Notes
- `src/hooks/useUpdater.ts`：没有手动源时保留签名更新检查的原始错误。
- `src/hooks/useUpdater.bundled.test.tsx`：补充签名源失败场景回归。
- `src/components/settings/AboutUpdateRow.tsx`：不支持自动更新且未配置手动源时，也正确显示无来源说明。
- `src/components/settings/AboutUpdateRow.test.tsx`：新增无来源及无兼容安装包的实际 UI 测试。
- `docs/llm-wiki/release.md`：补充本项目分发者更新来源的构建要求。
- `progress.md`：仅追加最终证据与回滚入口；其他改动文件已在各任务 Notes 中逐一记录。
- `dist/`、`src-tauri/target/`：验证生成的构建缓存，不是新安装包。
- 本轮整体回滚（无后续修改时）：在仓库根目录先执行 `git apply --reverse --check /tmp/grok-fixes-20261004/changes.patch`，成功后执行 `git apply --reverse /tmp/grok-fixes-20261004/changes.patch`。该补丁只包含本轮 61 个范围内文件，保留之前的未提交改动和完整 progress.md 历史；不执行全仓库 reset。

## 2026-10-04 - Task: 发布 0.2.36 跨平台安装包并启用 Windows ARM64

### What was done
- 将当前累计的桌面端修复、浏览器自动化、资源交互、升级流程和内置运行时改动提交为 `97af9422`。
- 将发布矩阵扩展为 macOS ARM64/Intel 与 Windows ARM64/x64；Windows 两种架构均生成 NSIS 安装版和 portable 绿色版。
- 将内置 Grok Build 运行时扩展为 Windows ARM64，并刷新官方 stable 版本 1.0.46、六个平台校验清单及许可证快照。
- 更新下载契约、发布校验、稳定别名、仓库地址和 0.2.36 双语变更记录。

### Testing
- `pnpm test`：679 个测试文件、7684 项全部通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm build:ui` 通过。
- `node --test scripts/prepare-bundled-runtime.test.mjs`：9/9 通过；网站下载契约自测 3/3 通过。
- `python3 scripts/check-code-quality-gates.py --mode final`：全部门禁通过；`git diff --check` 除上游第三方许可原文的既有尾随空格外通过。
- Windows ARM64、Windows x64 与 Rust 原生编译未在当前 macOS 工作区执行；交由推送后的 GitHub Actions release 矩阵验证。

### Notes
- `.github/workflows/release.yml`：新增 Windows ARM64 构建并统一传递目标架构。
- `scripts/prepare-bundled-runtime.mjs`：加入 `aarch64-pc-windows-msvc` 运行时。
- `scripts/package-windows-portable.sh`：按目标架构打包 Windows portable。
- `scripts/assert-release-assets.sh`：发布门禁要求 Windows ARM64/x64 安装版和 portable。
- `scripts/publish-website-downloads.py`：增加 Windows ARM64 稳定别名和下载清单。
- `src-tauri/resources/grok-build/`：记录 Grok Build 1.0.46 及许可证快照。
- `CHANGELOG.md`、`README*.md`、`docs/BUILD.md`、`docs/llm-wiki/release.md`、`docs/llm-wiki/website-downloads.md`：同步 0.2.36 发布说明、架构和下载地址。
- 回滚方式：代码准备提交为 `97af9422`；如需撤回本轮提交，执行 `git revert 97af9422`，再重新运行验证。

## 2026-10-04 - Task: 固化 macOS 签名与公证，避免发布「已损坏」安装包
### What was done
- 将 macOS 发布门禁改为强制要求 Developer ID Application 证书、签名身份、Team ID 和 App Store Connect API Key；缺少或部分配置时在构建前失败。
- 新增 macOS 发布产物校验脚本，检查 `.app` 的 Developer ID 签名、DMG 完整性、公证票据和 Gatekeeper 评估结果。
- 更新中英文、俄文发布说明及构建文档，明确旧包的 `xattr` 仅是临时绕过，并补充 Apple Secrets 的一次性配置步骤。
### Testing
- `bash -n scripts/verify-macos-release.sh` 通过。
- Ruby YAML 解析 `.github/workflows/release.yml` 通过。
- `pnpm typecheck` 通过。
- `git diff --check` 通过。
- 当前未执行真实签名、公证或安装验证：仓库 Secrets 尚未配置 Apple 凭据，当前机器也没有 Developer ID `.p12` 或 App Store Connect `.p8`。
### Notes
- `.github/workflows/release.yml`：macOS 构建强制签名/公证并调用发布校验。
- `scripts/verify-macos-release.sh`：新增 macOS 产物验证脚本。
- `docs/BUILD.md`：补充 Apple Secrets 表和一次性配置步骤。
- `docs/llm-wiki/release.md`：更新发布门禁与 Gatekeeper 说明。
- `README.md`、`README_EN.md`、`README_ZH.md`、`README_RU.md`：修正 macOS 安装说明。
- `progress.md`：追加本轮施工与验证记录。
- 回滚：提交后执行 `git revert <本轮提交>`；未提交前可用 `git diff` 保存补丁后恢复这 9 个文件。不要删除或轮换现有 updater secrets。
