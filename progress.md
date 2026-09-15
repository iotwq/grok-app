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
