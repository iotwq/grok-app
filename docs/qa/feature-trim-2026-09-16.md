# Agent 功能入口收缩（2026-09-16）

本轮按 Codex 风格收缩主工作流入口，减少多套跨会话运营视图造成的认知负担。

## 已调整

- 主导航移除 Kanban。
- 命令面板移除 Ops Hub、Agent Dashboard、Task Board、Kanban、Batch Agents。
- 当前会话 Tasks panel 保留，作为运行中工具和会话状态的主要入口。
- Batch Agents 保留实现，但只从设置中的高级工具入口使用。
- Tasks panel 不再提供跳转 Agent Dashboard 的重复按钮。

## 验证

- `pnpm typecheck` 通过。
- 相关 ESLint 通过。
- 33 项相关测试通过。
- 未删除 Dashboard、Task Board、Kanban 组件和数据逻辑，因此旧深链接及后续高级模式仍有恢复空间；本轮只收缩面向普通用户的入口。

## 回滚

执行 `git revert <本轮提交>`，或恢复本轮修改文件后重新运行 typecheck 和相关测试。
