# 深度使用逻辑审计（2026-09-15）

审计基线：`eb5284eb`，分支 `codex/fix-runtime-audit`。本轮仅检查和复现，以下问题尚未修复。未重复列入此前 B01–B19 或已修复的输入/流式刷新问题。

## 结论

确认 7 项新问题：5 项 P1（可能丢失文件内容、操作错文件或发送错内容），2 项 P2（失败恢复和预览结果错误）。检查聚焦文件编辑/预览、发送队列、语音转写及模型配置更新；不能据此认为其余模块没有问题。

| 编号 | 优先级 | 问题 | 用户影响 |
| --- | --- | --- | --- |
| B20 | P1 | Markdown 可视化编辑丢失图片与表格结构 | 改动无关段落后保存，也会损坏原文件内容 |
| B21 | P1 | 外部文件与项目同名文件身份混淆 | 刷新读错文件，之后编辑保存可能写到错误对象 |
| B22 | P1 | 文件冲突处理没有绑定发生冲突的文件 | 切换标签后，“覆盖”或“重新加载”操作了另一个文件 |
| B23 | P1 | 编辑队列时暂停状态被会话结束清除 | 用户尚未确认修改，旧提示词已自动发出 |
| B24 | P1 | 语音转写结果未绑定发起对话 | 切换对话后串入新草稿；开启自动发送时发到新对话 |
| B25 | P2 | 队列失败后在 ready 状态持续自动重试 | 重复失败/提示错误，无法稳定等待用户纠正 |
| B26 | P2 | 清空草稿后预览仍展示旧内容 | 预览看起来有内容，保存却得到空文件 |

## B20：Markdown 编辑导致内容损坏

- 触发：打开带 Markdown 图片和表格的文件，进入编辑，做一次普通正文修改或点击插入分隔线，然后保存。
- 实测：真实 `MarkdownTiptapEditor` 输入含 `![diagram](https://example.com/diagram.png)` 和两列表格；点击分隔线后，`onChange` 返回 `Intro\n\nItemValueA42\n\nEnd\n\n---`。图片 URL 完全消失，表格被压成普通文字。
- 原因：编辑器 schema 只装载 StarterKit、Link 等，没有 Image/Table 节点；`tiptap-markdown` 不会自动补齐这些 schema。更新时序列化的是已转换的整份文档。
- 依据：`src/components/MarkdownTiptapEditor.tsx:98`、`:141`；实际文件编辑入口 `src/components/resource-viewer/ResourcePreviewBody.tsx:638`；保存写入当前 draft，位于 `useResourceFileTabs.ts`。
- 边界：只读预览不改磁盘；本次实测确认图片和表格，不把未测语法一概算作丢失。
- 修复验收：支持保真的编辑路径，或让不支持的内容使用源码编辑；包含图片/表格的文档修改无关段落并保存后，原结构和 URL 必须保留。

## B21：外部文件刷新与同名路径混淆

- 触发：项目根目录为 `/project`，从对话文件卡打开 `/external/readme.md`，再点击文件栏重新加载；项目内同时存在 `/project/readme.md`。
- 实测：首次读取 `/external/readme.md`，刷新却调用 `fsReadFile('/project', 'readme.md')`，活动标签的绝对路径和草稿一起变成 `/project/readme.md`。后续保存因此可能写到项目文件。没有同名项目文件时，刷新将失败。
- 同源问题：先打开外部文件，再从项目树点击 `readme.md`，复现为复用外部标签，没有读取项目文件。
- 原因：后端绝对路径读取结果的 `relativePath` 实际是 basename；前端刷新把它当作项目相对路径，路径匹配也把它当成全局别名。保存路径有 underProject 校验，刷新没有。
- 依据：`src-tauri/src/fs_browser.rs:583`（注释称相对字段携带绝对路径，但实际传入 name）；`src/components/resource-viewer/useResourceFileTabs.ts:214`、`:530`；`src/components/resource-viewer/helpers.ts:77`；项目树入口 `src/components/side-workbench/FilesWorkspace.tsx:500`。
- 修复验收：标签用明确的文件身份读取和保存；外部同名文件、项目文件分别打开/刷新时保持各自内容及绝对路径。

## B22：冲突对话框对错误文件执行操作

- 触发：保存 A，写入尚未完成时切到 B；A 因磁盘内容变化返回冲突。点击弹窗“覆盖”或“重新加载”。远程文件写入延迟会扩大切换窗口。
- 实测：延迟 A 写入，切到 B 后让 A 返回 `CONFLICT:`；状态 `conflictTabId` 指向 A，按实际弹窗回调执行覆盖却调用 `fsWriteFile('/project', 'B.md', 'edited B', null)`，跳过 B 的 mtime 保护。
- 原因：已经记录冲突标签 ID，但弹窗只把它用作开关；两个按钮都操作当前活动标签。重新加载分支同样会丢弃 B 的未保存草稿，A 的冲突则没有解决。
- 依据：`src/components/resource-viewer/useResourceFileTabs.ts:338`；`src/components/side-workbench/FilesWorkspace.tsx:925`，特别是 `:937`、`:947`。
- 边界：动态用例调用真实 hook，按实际 UI 回调执行覆盖，并交叉核对弹窗源码；没有用真实文件触发覆盖，也没有声称做过整机鼠标操作复现。
- 修复验收：延迟 A 保存期间切换 B 后，冲突处理始终明确作用于 A，B 的内容、mtime 保护与草稿均不受影响。

## B23：队列编辑尚未确认就发送旧提示词

- 触发：模型仍在回复时，将下一条消息加入队列，打开队列编辑窗口修改；此时上一轮回复结束。
- 实测：真实 `useSendQueue` 和 `useQueueEditDialog` 组合运行；编辑内容为 `corrected prompt`，窗口仍打开，状态由 streaming 变为 ready 后 40 ms，执行发送收到的是 `old prompt`，队列已移除该条。
- 原因：编辑暂停和失败暂停共用一个 hold；会话从忙碌变为空闲时无条件清除它。
- 依据：`src/hooks/useQueueEditDialog.ts:45`；`src/hooks/useSendQueue.ts:455`、`:465`、自动发送 effect。
- 修复验收：编辑窗口存续期间，任何正常会话状态变化都不能自动发送；确认后发送新内容，取消后的行为符合既有规则。

## B24：语音转写跨对话插入或发送

- 触发：在 A 停止录音、等待转写期间切到 B；开启语音自动发送时尤其明显。
- 实测：模拟录音与延迟转写，运行真实 hook；切换后的草稿为 `B draft`，转写成功后插入 `A private transcript`，调用 B 的 sendRef，A 的发送回调未调用。
- 原因：异步结果只校验录音 generation，不记录发起会话；插入使用当前草稿 setter，自动发送使用当前 sendRef。AppWorkbench 持续挂载该 hook，只传 sessionState，没有传 sessionId；切换对话没有取消转写。
- 依据：`src/hooks/useVoiceDictation.ts:254`、`:264`；`src/app/AppWorkbench.tsx:1931`。
- 边界：使用模拟音频/转写服务，无真实麦克风、账号请求或模型调用；动态验证覆盖回调和草稿错位，导航接线由源码确认。
- 修复验收：切换对话后旧转写不能进入新对话或触发其发送；在切换、取消、转写失败及自动发送关闭时分别验证。

## B25：发送队列失败后的无限自动重试

- 触发：排队发送返回 false 或抛错，且会话保持/恢复 ready；在没有新用户操作的情况下仍满足自动发送条件。
- 实测：真实队列 hook、ready 会话、发送回调固定返回 false；五次推进 40 ms，回调共执行五次，hold 始终为 false。每次失败先放回队列，随后又安排下一次发送。
- 原因：ready 被当作 terminal，从而释放失败暂停；异常分支同样直接释放。`useComposerSend` 的普通失败回滚会把 optimistic streaming 恢复为 ready，形成现实可达的状态组合。
- 依据：`src/hooks/useSendQueue.ts:406`、`:421`、`:436`、`:478`；`src/hooks/useComposerSend.ts:439` 的 failStrip 和 `:678` 的 catch。
- 边界：不是所有服务端错误都会循环；如果会话进入 disconnected 等不满足自动发送的状态，循环会停止。40 ms 是失败处理完成后的排队间隔，不代表真实网络每秒固定发送 25 次；没有确认重复计费。
- 修复验收：一次失败后稳定暂停，保留消息并等待明确重试/恢复动作；继续按钮成功后恢复正常顺序发送。

## B26：空草稿预览显示旧文件

- 触发：清空 Markdown 或 HTML 文件全部内容，再切到预览。
- 实测：真实 `ResourcePreviewBody` 收到 `draftText: ''`、`baselineText: 'OLD CONTENT'`；Markdown 与 HTML 两个分支都将 `OLD CONTENT` 交给下游预览，而保存逻辑写入空串。
- 原因：用逻辑或选择草稿，把合法的空字符串误当成没有草稿。
- 依据：`src/components/resource-viewer/ResourcePreviewBody.tsx:684`、`:692`。
- 边界：用例将下游渲染器替换为展示传入内容的组件，验证实际父组件的数据选择，不涉及 HTML Webview 的渲染行为。
- 修复验收：预览与即将保存的内容一致，空草稿显示为空；非空草稿与初始预览继续正常。

## 验证记录与排除项

- 临时隔离目录：`/private/tmp/grok-deep-audit/`；测试引用当前仓库真实组件/hook，文件、语音、发送接口为 mock，不写用户文件、不调用付费模型、不修改安装版。
- 运行命令（当前本机）：`./node_modules/.bin/vitest run --config /private/tmp/grok-deep-audit/vite.config.mts`。
- 结果：5 个测试文件、9 个诊断用例通过；“通过”表示断言证实缺陷，绝不表示修复通过。完整输出：`/private/tmp/grok-deep-audit/results.log`。临时目录不纳入版本管理，清理后需按上述步骤重建。
- 工具环境曾因 Vite 外部路径访问限制导致用例加载失败；明确允许仓库和临时目录后成功运行。该问题属于诊断环境，不计入产品缺陷。
- 排除：切换模型时遗漏高级 provider 字段的疑点，后端会保留未提供的 providerMode/baseUrlFullPath/appendPrompt/extraHeaders，不能据此报告配置丢失。
- TipTap 提示重复 Link 扩展，但没有单独证明用户影响，不额外凑成问题。
- 本轮没有产品代码改动；未重新构建安装包，未将前一轮全量测试结果当作本轮新增问题不存在的依据。

## 修复记录

### B20 — 已修复

- 补齐与现有 TipTap 同版本的 Image/TableKit，编辑普通正文时保留 Markdown 图片 URL、标题及表格行列；图片自适应宽度，表格沿用现有颜色和边框。
- 重新加载、撤销内容及编辑权限切换不再触发用户编辑回调，避免未操作就改写草稿。
- 两项真实组件回归修复前失败、修复后通过，定向 ESLint 通过。未新增图片上传/表格插入菜单；本项范围是已有图片和表格的内容保留。

### B21 — 已修复

- 项目外文件的标签路径保留后端解析得到的绝对路径，只有实际位于项目内的文件才赋予项目相对别名。
- 外部文件刷新/保存不会转向同名项目文件；同一个项目文件仍可由绝对路径和目录树入口复用。
- 新增三项 hook 回归，其中两项修复前失败；文件标签及编辑辅助回归共 38 项通过，定向 ESLint 通过。
