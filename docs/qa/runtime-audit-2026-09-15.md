# 运行与使用故障排查 — 2026-09-15

## 业务结论

当前项目存在多项实际影响使用的缺陷。本轮识别 **10 项**：4 项完成了隔离的前端行为复现，其余 6 项通过源码路径核实；其中 2 项同时有本机故障日志佐证。另有 1 项社区反馈尚不能归因到 App。不是“编译不过”，而是配置、错误提示、会话状态与真实引擎行为没有闭环。

**本机这次无法对话的直接原因已经查明：向导把中转模型写死为 `default`，服务返回 `404 model_not_found`；App 将这个请求错误误判为 Agent 崩溃。仅重连或重启不能解决这个配置错误。**

本轮不修复产品代码、不变更账号或中转配置、不执行真实付费推理、不操作用户会话回滚。交付物是本报告与进度记录。

## 检查基线与证据边界

| 项目 | 实际检查结果 |
| --- | --- |
| 源码 | 本地 `main`，`f21ad3f23b229e24a703788196dfef5aa288606c`；package 版本 0.2.35 |
| 本机安装包 | `/Applications/Grok.app`，Info.plist 版本 **0.2.34**，ARM64 |
| 系统 / CLI | macOS 15.7.7、Apple Silicon；`grok 1.0.25` |
| 本机签名 | codesign 显示嵌入签名；未进一步验证公证或 Gatekeeper 信任状态 |
| 故障时间 | 北京时间 2026-09-15 00:38:49，日志 UTC 为 2026-09-14 16:38:49 |
| 社区信息 | 只读检查 `RongleCat/grok-app` 当前 4 条开放 issue，以及最近关闭的问题；本地 origin 是 `iotwq/grok-app` |
| 动态覆盖 | 前端单元测试、隔离 React 交互复现、生产前端构建、lint、项目质量门禁、本机既有日志与包信息 |
| 未覆盖 | 当前源码 Rust 编译/测试和新 DMG 实测、干净 macOS 安装、Intel/Windows/Linux 真机、真实 OAuth/付费推理、远程 SSH/IM 全流程 |

本机没有 Cargo/Rust 工具链，因此不能宣称 Host 测试通过。源码结论与本机已发生故障、社区报告分开列出；本报告不是“已找尽所有 bug”或全平台验收证明。

## 问题清单

P1 表示应优先处理的功能阻断或数据一致性问题；P2 表示误导状态或诊断门槛问题。不是所有问题都会在同一台电脑同时触发。

| 编号 | 优先级 | 触发条件与使用影响 | 证据等级 |
| --- | --- | --- | --- |
| B01 | P1 | 首次向导添加中转后，请求固定使用 `default`；不提供该模型的服务无法完成首轮对话 | 本机日志 + 配置白名单字段 + 交互复现 + 源码 |
| B02 | P1 | 模型不存在等请求错误被显示成“Agent 崩溃”；引导反复重连而不修正配置 | 本机日志 + 前端分类复现 + Host 源码 |
| B03 | P2 | 中转检查返回失败甚至抛异常，向导仍把账号标成已就绪 | 交互复现 + 源码 |
| B04 | P1 | 首条消息前配置附加目录，保存成功但随后新建的会话没有绑定该工作区 | Hook 复现 + 会话创建/连接源码 |
| B05 | P1 | 已绑定多目录的会话移到另一项目后，仍保留旧工作区及其目录授权 | 源码路径确认；未在用户项目上执行移动 |
| B06 | P1 | 回滚 RPC 失败、超时或会话未连接时，仍截断本地聊天记录；引擎上下文/文件没有同步回滚 | 源码路径确认；未删除用户记录 |
| B07 | P1 | 自定义通道 ID 为 `grok` 时，点击使用官方通道仍被识别成自定义通道 | 源码 + 社区 #1214 |
| B08 | P1 | CLI 退出登录返回成功但未删凭证时，App 仍显示过期账号；辅助凭证副本也未清理 | 源码 + 社区 #1213；未退出本机账号 |
| B09 | P1 | 只装成品 App/CLI、未装 Node.js 时，官方辅助搜索/绘图等工具无法启动 | 打包/注入/门闸源码确认；未在干净系统实测 |
| B10 | P2 | 唯一 CLI 候选有执行位但无法启动/版本探测超时，仍被标记为找到并通过运行时就绪检查 | 探测与向导源码确认；未替换本机 CLI |

## 本机故障链路

本机 `logs/app.log.2026-09-14` 的关键顺序：

1. 第 11 行：主页面已加载，窗口焦点正常。
2. 第 53 行：Agent `initialize` 成功，版本为 1.0.25。
3. 第 61 行附近：`session/new` 成功；随后 `session/set_mode`、`session/set_model` 成功。
4. 第 69 行：`404 Not Found`，`model_not_found: Model "default" is not supported by any configured account in this group`。
5. 第 80 行：`session/prompt` 返回带 `http_status:404` 的 RPC 错误。

对应配置仅检查模型相关字段：`[models].default = "relay"`，`[model.relay].model = "default"`，协议为 `responses`。没有在报告中复制密钥、服务域名或聊天内容。

这段日志没有主进程 panic 或 Agent process-exit 记录。因此证据支持“请求失败被误报为崩溃”，不支持“macOS 无法加载应用”或“这次就是 Agent 二进制崩溃”。9 月 10 日的旧日志也有相同模型 404，但以最近日志为直接依据。

## 技术依据与修复验收条件

### B01 — 向导没有真实模型选择

- 依据：`src/components/SetupWizard.tsx:344` 提交 `id: "relay", model: "default"`；表单只有 URL、Key、协议，没有模型字段。通用 Host upsert 会保存这个值。
- 复现：CLI 就绪后进入向导的自定义中转表单，填写 URL/Key 并保存；截获请求的模型仍是 `default`。本机配置和服务 404 与此一致。
- 最小修复：让用户选择/填写真实模型 ID，并验证该模型请求；兼容已经被向导保存为 `default` 的配置。不能替用户猜一个模型名称。
- 验收：对不支持 `default` 的测试服务，选定真实模型后首轮能成功；持久化、重启后仍使用选定值。

### B02 — 请求失败被兜底归为进程崩溃

- 依据：`src-tauri/src/acp_client.rs:4789` 的分类器没有模型不存在/不支持的分支，最终在 `:4873` 返回 `AgentCrashed`。`src/lib/errorDeck.ts:714` 优先接受 Host 已知错误码，不再用正文修正。
- 复现：将本机 404 正文和 `AGENT_CRASHED` 交给真实前端分类器，仍得到崩溃卡片；本机用户看到的文案与之相符。
- 最小修复：区分模型/参数/服务配置错误、进程退出和协议错误，并为配置错误提供对应设置入口。保留经过脱敏的原始详情。
- 验收：404 模型不存在引导更换模型；实际进程退出才显示崩溃；401、429、5xx 的已有分类不回归。

### B03 — 检查失败仍显示账号成功

- 依据：`src/components/SetupWizard.tsx:358` 检查 ping；`:367` 抛异常时写成功状态；`:371` 无论 ping 结果都执行 `setAuthOk(true)`。
- 复现：mock ping 返回 `{ok:false,message:"401 Unauthorized"}`，保存后 ready 清单中的账号行仍为 `is-ok`。
- 最小修复：区分“配置已保存”“连接已验证”“暂未验证”。账号可跳过不等于验证成功。
- 验收：401、网络异常和仅保存配置都不会显示已验证；用户仍可明确跳过账号进入界面。

### B04 — 附加目录未绑定随后创建的会话

- 依据：`src/hooks/useMultiRootWorkspace.ts:161` 只有已存在 `sessionId` 才绑定工作区；否则只保存 `recentWorkspaceId`。全仓引用检查未发现该字段的消费入口。`src-tauri/src/store.rs:1989` 创建会话固定 `workspace_id: None`。
- 后果：`src-tauri/src/session_manager/connect.rs:1149` 只能根据会话的 `workspace_id` 选择附加目录沙箱；未绑定时回落到默认 profile。界面能重新读出项目工作区，不代表新会话已经使用它。
- 复现：Hook 的目标 `sessionId:null`，保存 workspace 成功，`sessionSetWorkspace` 从未被调用。与社区 [#1209](https://github.com/RongleCat/grok-app/issues/1209) 症状相符，但不能认定该 issue 的全部场景只有这一个原因。
- 最小修复：明确新会话的待绑定工作区，在创建会话后、启动引擎前完成绑定。
- 验收：首条消息前配置附加可写目录，新会话的元数据及实际启动参数都包含对应 profile，真实写入验证成功。

### B05 — 移动项目没有清理旧工作区

- 依据：`src-tauri/src/store.rs:2374` 的项目移动逻辑重置 Agent/worktree，却不清理 `workspace_id`、root snapshot、capability。连接路径 `src-tauri/src/session_manager/connect.rs:1149` 仍按旧 workspace 生成沙箱，并在 `:1157` 授予旧 roots 的 Host 访问。
- 触发：会话绑定项目 A 的多目录 workspace，之后通过移动功能转到项目 B。
- 影响：工作目录成为 B，但附加目录仍来自 A；界面项目归属与实际目录权限不一致，可能在旧项目目录读写文件。
- 最小修复：项目变化时清理或显式重新绑定工作区，验证 workspace 的主项目与会话一致。
- 验收：移动后旧 A 工作区不再影响 B 的启动 profile；A 的额外授权不会随会话静默带入。

### B06 — 回滚失败仍截断本地历史

- 依据：`src-tauri/src/session_manager/journal.rs:285` 等分支记录 `agent_ok=false`，但 `:312`–`:314` 仍无条件截断并替换本地消息；保留原 Agent 会话身份。`src/app/AppWorkbench.tsx:8336` 只在事后 toast 提示本地回滚，没有恢复被删除消息。
- 触发：引擎不支持两个 rewind 方法、RPC 超时、或目标会话不在 live slot；即使用户请求恢复文件也可能进入此路径。
- 影响：可见记录被删，引擎仍持有后续上下文；文件未恢复。继续聊天或历史对账时可能出现旧上下文/消息重新出现。
- 最小修复：引擎回滚未完成时保留原记录；如支持仅本地删历史，应单独明确选择并处理后续上下文，不复用“回滚成功”的流程。
- 验收：故意让 RPC 返回 Method not found/timeout 后，原记录与文件保持可恢复的一致状态；真实回滚成功后再更新本地视图。

### B07 — `grok` 名称冲突阻断官方通道

- 依据：`src-tauri/src/providers.rs:1526` 激活官方写 `default="grok"`；`:1163` 优先将与自定义 ID 匹配的默认值识别为 custom。`:490` 的 ID 规范化允许 `grok`。
- 触发：添加或导入 `[model.grok]` 自定义通道，再点击官方卡片的使用按钮。
- 影响：仍走中转路由，认证准备会按 custom 清理主 Agent 的 OAuth 副本，用户难以切回订阅通道。
- 社区：[#1214](https://github.com/RongleCat/grok-app/issues/1214)，报告版本 0.2.35；当前源码仍有对应路径。
- 最小修复：分离路由身份与模型 ID，或保留官方标识并迁移冲突的已有配置。
- 验收：含冲突 ID 的存量配置也能切到官方；新建和导入入口使用同一校验。

### B08 — 退出登录结果未验证，凭证副本清理不全

- 依据：`src-tauri/src/account.rs:1984` 在 CLI 返回 0 时只记录成功；仅失败分支删除主 auth 文件。`:2004` 调用的清理函数 `:332` 只删除 `agent-home/auth.json`，不清理 `agent-home-official/auth.json`。
- 触发：已过期凭证下，CLI logout 返回成功但保留 auth 文件。
- 影响：App 随后重新读取同一份过期账号，用户看到退出按钮无效；辅助凭证副本也残留。不能仅从残留文件断言退出后仍有有效服务端授权。
- 社区：[#1213](https://github.com/RongleCat/grok-app/issues/1213)，0.2.35 / CLI 1.0.30；本机账号没有执行退出实验。
- 最小修复：校验并完成预期本地清理，统一处理官方辅助凭证；清理失败应报告，不能只信任 CLI 退出码。
- 验收：mock logout 返回 0 但不删文件，最终仍退出；所有预期官方副本都正确清理，其他账号快照按产品约定保留。

### B09 — 成品包存在未声明的 Node.js 运行依赖

- 依据：`README.md:136` 说明预编译包不要求 Node.js；Tauri 包未携带 Node runtime。`src-tauri/src/official_aux.rs:1175` 找不到 Node 后仍注入 `command:"node"` 并返回 `"ok"`。
- 触发：没有 Node 的电脑使用自定义主模型，存在官方凭证且开启默认官方工具注入。
- 影响：官方辅助 MCP 无法启动；`should_inject_mcp_for_main` 未检查 Node 可用性，相关原生 Imagine 工具却仍可能被禁用，用户的搜索/绘图链路失去可执行入口。
- 最小修复：提供明确可用的运行依赖，或检测缺失并给出可操作的安装/降级路径；避免将无法启动的注入标为成功。
- 验收：在只安装成品包与 Grok CLI、未安装 Node 的 macOS 环境完成辅助工具测试；不只验证开发机。

### B10 — 启动探测将“有执行位”当作“能运行”

- 依据：`src-tauri/src/process_util.rs:338` 的 Unix runnable 判断仅看执行位；`src-tauri/src/cli_probe.rs:632`–`:647` 即使 `--version` 无法执行或超时，仍将其作为 found fallback。向导只依据 found 进入下一步。
- 触发：没有其他有效候选，仅有损坏、架构不兼容或挂起的 CLI 文件。
- 影响：运行时被显示为就绪，首轮连接才失败；返回向导仍可能检测成就绪，缺少明确修复入口。此项不是本机这次 404 的原因。
- 最小修复：将启动失败/超时与“可运行但没有版本输出”区分。保留特殊版本 banner 的兼容性，但不要将 spawn 失败当成功。
- 验收：分别覆盖正常 CLI、成功退出但无版本、无法执行、超时和多候选回退。

## 待验证或不计为当前产品 bug 的事项

- **官方 xhigh 长时间没有首字**：[#1215](https://github.com/RongleCat/grok-app/issues/1215) 提供约 126 秒等待、`ttft_ms=null` 和上游 503 的记录。说明使用体验有问题，但尚不能判定 App 丢失流式数据；需在同一请求上对照 CLI/上游事件和 UI。单列，未计入上述 10 项。
- **图片导出测试超时**：完整测试时两个 beforeAll 超时，随后限制为单 worker 重跑两组均通过；暂计为测试运行稳定性问题，不当作“图片导出已坏”的证据。
- **macOS 签名/架构拦截**：本机包为 ARM64 且带签名，已有页面加载与成功握手日志，不是这次故障链的解释。未由此推广为所有发布包均通过系统信任校验。
- **旧反馈已修复的功能**：已关闭 issue 不直接重新计数；例如图片 Esc 和会话排序，当前 HEAD 已包含相关修复提交。关闭 issue 也不等价于已完成本轮真机验收。

## Testing

| 验证 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 成功；未改 package 或 lockfile |
| `pnpm build:ui` | 通过，包含 TypeScript 构建；Vite 有大 chunk 提示，不计为运行错误 |
| `pnpm lint` | 通过，exit 0 |
| `python3 scripts/check-code-quality-gates.py --mode final` | PASS |
| `pnpm test` | 649 个测试文件通过、2 个 suite 超时；7516 passed / 6 skipped，exit 1 |
| 两个图片导出 suite 单 worker 复测 | 2 个文件、16 个测试通过 |
| 隔离故障复现 | 4/4 通过，断言的是 B01/B02/B03/B04 的实际错误行为，不是修复后验收 |
| 前端静态字符串 invoke 与 Host 注册对照 | 本轮未发现缺失的命令名；不包含动态命令名或全部参数契约验证 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 无法运行：本机没有 cargo；未安装全局 Rust 工具链 |
| CLI 只读检查 | `--version`、`agent --help`、临时 GROK_HOME 的 `inspect --json`；未发送推理请求 |

隔离测试曾临时放在 `src/runtimeAudit.temp.test.tsx`，执行后已删除，产品源码保持原样。测试原稿保留在本机 `/tmp/grok-runtime-audit/repro.test.tsx`；临时文件不属于长期交付或 CI 测试。

本机日志输出留在 `/tmp/grok-audit-{vitest,build,lint,gates,export-retest,repro}.log`。复测命令：

```sh
pnpm exec vitest run src/lib/sessionExportImage.pipeline.test.ts src/lib/sessionExportImage.test.ts --maxWorkers=1 --minWorkers=1
```

## 下一步最小动作

先处理 **B01 + B02**，用一个提供真实模型 ID 的测试中转完成“首次配置 → 首次发送 → 失败纠正 → 重连 → 重启后再次发送”闭环。实际进入鉴权、协议或并发路径的修改前，按仓库 AGENTS 的确认要求确定施工范围。B06 的回滚一致性应在下一次对外发布前处理，避免继续损害用户历史记录。

## 2026-09-15 修复与验收结果

审计原始结论保留如上。B01–B10 已按顺序修复于 `codex/fix-runtime-audit`，未推送、发布或替换本机已安装的 App。

| 编号 | 修复后的行为 | 独立回滚提交 |
|---|---|---|
| B01 | 首次中转配置要求填写真实模型，并同步模型目录，消除自动写入 default | `49ad7f28` |
| B02 | 模型不存在显示渠道/模型问题并提供设置入口，不误报 Agent 崩溃 | `be060395` |
| B03 | 保存并激活前验证实际模型请求，失败保留表单，不显示就绪 | `d30ee175` |
| B04 | 新会话继承与项目匹配的最近工作区，首轮即携带绑定信息 | `7e14bf67` |
| B05 | 移动会话清除旧工作区，撤销该会话旧目录授权，拒绝错绑 | `e5bb98b8` |
| B06 | Agent 回退失败/超时/未连接时保留本地记录，确认成功才截断 | `ac0c63fb` |
| B07 | grok 官方别名不再被新中转占用；切回官方时无损重命名旧同名中转 | `5fdafbc9` |
| B08 | 登出不依赖 CLI 成功提示，完整清理活动 OAuth 副本并回收 Agent | `eede5c7d` |
| B09 | 检测可运行的 Node 22+；缺失时明确提示安装，保留普通 MCP，提供重新检测 | `f06406ae` |
| B10 | 无法启动/非零退出/超时的 CLI 不算就绪；成功无版本仍可作为兼容候选 | `12fa6f80` |

### 统一验证

- 前端：653 个测试文件、7,530 项测试通过（限制两个 worker，避免原审计时 canvas 测试的资源竞争）。
- Host：完整测试 1,886 项通过、1 项忽略、1 项局域网镜像测试失败。唯一失败为 `mirror::lan_bind_test::lan_bind_accepts_detected_ipv4`，连接本机检测到的 `172.18.0.1` 超时。
- 对照：临时独立 worktree 的修复前 `f21ad3f2` 运行同一局域网测试，也在相同请求处超时。因此不属于本轮回归；原因仍需在实际网络环境进一步定位，不能把后端全套宣称为全绿。对照 worktree 已移除。
- `pnpm lint`、`pnpm build:ui`（包含 TypeScript 构建）、代码质量 final 门禁、依赖结构检查、下载合同自测、生产依赖审计均通过。
- Rust `cargo fmt --all -- --check`、`cargo clippy --all-targets -- -D warnings` 通过。仅整理本轮改动区域，未全量格式化仓库。

### 使用与发布边界

- 本机已有错误模型配置不会被猜测改写；使用修复版本后，仍需在渠道设置填写中转实际提供的模型 ID。
- 官方辅助 MCP 的可选 Node 依赖已明确披露；缺失时降级保留普通 MCP，不代表辅助绘图功能无需依赖即可运行。
- 本轮未重新发布安装包、未替换 `/Applications/Grok.app`，未执行真实付费推理、真实退出登录或 Windows/Linux 实机验收。
- 下一验收点：构建 macOS 安装包，在干净用户环境测试 CLI 检测、设置中转后的首轮聊天、断线/回退、跨项目移动和可选辅助工具。
