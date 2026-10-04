# 输出滚动与渠道错误排查（2026-09-18）

## 输出滚动

复现并修复以下位置争抢：

- 流式输出使视图到达最新内容后，虚拟列表的延迟布局提交会恢复先前保存的底部距离。回归测试稳定复现 scrollTop 从 7500 倒退到 7400，随后自动贴底又把它推回；修复后贴底状态始终使用当前底部。
- 触控板一次上翻不足 10px 时，旧逻辑忽略手势，输出继续增长便将用户拉回。测试复现上翻到 596 后被拉到 700；修复后任何明确向上的 wheel 输入都会解除贴底。
- 切换会话后的下一帧补偿忽略已发生的上翻，重新强制贴底。补偿帧现在尊重用户解除贴底的状态；发送后的补偿帧使用同样规则。

保留当前会话切换、发送时定位到末尾、底部回弹修正及用户主动回到底部的行为。此改动没有改变 token 传输速率。

### 验证

- 修改前：过期虚拟窗口位置回退、细小触控板上翻被覆盖、打开后下一帧抢回三个场景均能失败复现。
- 修改后：滚动相关 4 文件 104 项测试通过，涵盖手动离开底部、触控回弹、虚拟列表和高度变化。
- 定向 ESLint、`pnpm build:ui`（含 TypeScript）和 `git diff --check` 通过；Vite 保留既有大分块提示。
- 验证使用模拟布局与事件交错；没有替换正在运行的安装版，需安装新包后确认用户实际会话中的 WebView 表现。

回滚基线：`81f0ed6f`。可将本轮滚动相关五个源文件与测试恢复到该提交；保留 progress.md 历史并追加回滚说明。

## Agent 崩溃提示（验证完成于 2026-09-19）

在本机 9 月 16 日 23:04:33（UTC+8）日志中发现 Responses 流解析失败：`serialization error: control character ... found while parsing a string at line 2 column 0`，同时出现上游 `stream_read_error`。CLI 随后通过 `session/prompt` 返回 -32603 错误。当前错误分类函数将该消息落入默认的 `AgentCrashed`，可以用相同脱敏错误稳定复现误报。

9 月 17 日及 18 日凌晨还记录了上游连接关闭、代理隧道连接失败的重试。上述证据能定位这些失败属于模型渠道传输或解析问题，不能把所有“Agent 进程异常退出”提示都判断为相同原因，也不能以本次分类修复保证渠道不再中断。

本轮调整：

- Host 将已确认的流读取与格式错误识别为 `NETWORK_PROVIDER`，保留原始错误详情。
- 前端横幅与对话错误气泡使用一致分类；有原始详情的旧 `AGENT_CRASHED` 标签也能纠正。
- 普通进程退出及无关本地序列化错误不匹配该规则。未更改请求发送、流解析、网络代理、鉴权、协议格式或并发控制，也未自动重发可能有费用/副作用的任务。

### 最终验证

- 修改前：Host 原始消息复现误判为 AgentCrashed；前端四种流错误分类与旧崩溃气泡共 5 项失败。
- 修改后：前端完整 666 文件、7,611 项通过；Host `acp_client::classify_rpc_error_tests` 10 项通过。
- `pnpm build:ui`（TypeScript + Vite）、改动文件 ESLint、`git diff --check` 通过。构建保留既有分块体积提示。
- 验证日志：`/tmp/grok-scroll-repro-20260918.log`、`/tmp/grok-stick-repro-20260918.log`、`/tmp/grok-provider-repro-20260918.log`、`/tmp/grok-provider-host-repro-20260918.log`、`/tmp/grok-scroll-provider-tests-20260918.log`、`/tmp/grok-provider-host-fixed-20260918.log`、`/tmp/grok-scroll-provider-build-20260918.log`。
- 没有使用用户密钥发起模型调用，未修改本机渠道配置、更新 CLI、制作 DMG 或替换已安装应用。实际 WebView 滚动和当前渠道端到端稳定性仍需新版本安装后验收。

渠道错误分类回滚：`git restore --source=81f0ed6f -- src-tauri/src/acp_client.rs src/lib/errorDeck.ts src/lib/errorDeck.test.ts src/lib/session/errors.ts src/lib/session.projection-snapshot.test.ts docs/llm-wiki/providers.md`。
