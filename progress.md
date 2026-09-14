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
