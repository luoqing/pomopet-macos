# Pomopet 0.1.16 情感陪伴提醒 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 0.1.15 最新代码上交付带循环提醒、稳定宠物人设、主动陪伴唠嗑、休息结束任务续接和可靠编辑保护的 0.1.16 Apple Silicon 桌面应用。

**Architecture:** 扩展现有纯核心调度器和 Electron `AppRuntime`，保持 UI 通过单一 command/state IPC 通道更新。调度、人格回退文案和任务推荐保持可注入时钟/随机源的纯逻辑；主窗口只维护独立编辑草稿；桌面宠物继续消费统一 presentation 事件。

**Tech Stack:** Electron 35、Vite 6、Vanilla JavaScript、Vitest、Playwright、electron-builder、DeepSeek Chat Completions、Edge TTS。

---

## 文件职责

- `src/core/alarms.js`：单次、每周和间隔提醒的 occurrence 计算、恢复、去重和 snooze。
- `src/core/migrate.js`：0.1.15 数据到 0.1.16 的确定性、幂等迁移。新增。
- `src/core/persona.js`：人格默认值、校验、离线文案档位和提示词上下文。新增。
- `src/core/presentation.js`：展示优先级、有效期和中断/恢复策略。
- `src/core/timer.js`：休息结束事件及上一任务快照。
- `src/core/todos.js`：确定性迁移、推荐下一任务。
- `src/platform/electron/ai-copy.mjs`：带人格上下文的限时 AI 文案。
- `src/platform/electron/runtime.mjs`：调度各核心模块，生成最终文案并发送统一 presentation。
- `src/platform/electron/main.mjs`：系统通知、窗口唤起和宠物窗口布局。
- `src/platform/electron/preload.cjs`：编辑 dirty 状态、主窗口聚焦目标和现有 command/state IPC。
- `src/ui/index.html`、`src/ui/control.js`、`src/ui/styles.css`：实现已确认整体原型与草稿保护。
- `src/ui/pet.html`、`src/ui/pet.js`：提醒操作和休息结束任务选择。
- `tests/*.test.js`、`tests/ui/control.spec.js`：核心、集成与可视化回归。

## Task 1：循环提醒调度与兼容迁移

**Files:**
- Modify: `src/core/alarms.js`
- Create: `src/core/migrate.js`
- Modify: `src/platform/electron/runtime.mjs`
- Modify: `tests/alarms.test.js`
- Create: `tests/migrate.test.js`
- Modify: `tests/runtime.test.js`
- Modify: `tests/soak.test.js`

- [ ] **Step 1：先写 interval 失败测试**

覆盖开始时间锚点、非整除结束时间、星期边界、15 分钟补发边界、同计划只补最近一条、不同计划各补一条、休眠跨多个触发点、去重，以及超过 15 分钟的 snooze 被消费并从持久化列表清理。增加 runtime tick → store save → 新 runtime 重启测试，证明过期 snooze 不会复活。

新增迁移测试覆盖：Todo 默认值和稳定 `createdAt`、失效 active ID 修复、`aiTone` 到 persona 映射、persona 默认值、alarm 默认动作/启用状态/snooze、occurrence ledger 原样保留、过期 once 关闭，以及同一数据重复迁移两次结果相同。

- [ ] **Step 2：运行红灯测试**

Run: `npx vitest run tests/alarms.test.js tests/migrate.test.js tests/runtime.test.js`

Expected: interval 类型和恢复规则相关断言失败，既有 once/weekly 用例保持通过。

- [ ] **Step 3：实现最小调度扩展**

新增 `nextIntervalOccurrence(alarm, after)`；`AlarmScheduler.due()` 按计划收集宽限期内最近 occurrence，并 prune 已过宽限期 snooze。Scheduler 内部维护 mutation flag，提供 `consumeDirty()`；add/update/remove/enable/snooze/dismiss/prune 都置脏，runtime 每次 tick 后消费该 flag 并设置自身 dirty，即使没有 presentation event 也会保存。所有 alarm 保留统一形状：

```js
{
  id, label, type, enabled, pose,
  at, time, weekdays,
  startTime, endTime, intervalMinutes,
  snoozes
}
```

禁用/删除来源计划同步清理 snooze；一次提醒过期关闭；每周/interval 保持启用。

- [ ] **Step 4：补 runtime 命令与视图**

在 `migrate.js` 导出 `migrateTo016(data, now)` 并由 `runtime.init()` 在创建各 ledger 前调用。保持 `alarm:add/update/remove/enabled/snooze/dismiss` IPC 名称兼容，新增字段只通过 payload 扩展；迁移不得创建模板。

- [ ] **Step 5：运行绿灯与 48 小时 soak**

Run: `npx vitest run tests/alarms.test.js tests/migrate.test.js tests/runtime.test.js tests/soak.test.js`

Expected: 全部通过，无重复 occurrence。

## Task 2：人格、AI 回退和主动唠嗑

**Files:**
- Create: `src/core/persona.js`
- Create: `tests/persona.test.js`
- Modify: `src/core/copy.js`
- Modify: `src/platform/electron/ai-copy.mjs`
- Modify: `src/platform/electron/runtime.mjs`
- Modify: `tests/ai-copy.test.js`
- Modify: `tests/companion.test.js`
- Modify: `tests/runtime.test.js`

- [ ] **Step 1：写人格和主动唠嗑失败测试**

验证四种预设、名字/称呼替换、吐槽三档、自定义人设仅进入 AI、无 Key/断网/超时回退、专注期 20–35 分钟触发、关闭开关不触发、宠物位置不改变、随机源可注入。验证 `companion:suppress` 在输入/编辑/强制下班遮挡期间持续禁止唠嗑，即使时间跨过多个 5–10 分钟窗口；所有 suppression source 解除后才重新安排下一次。

验证 `ai:test` 三种结果：`connected` 带 sample、`failed` 带稳定 errorCode、`builtin` 表示 AI 关闭或无 Key；运行中状态通过 `view().aiStatus` 暴露，测试请求不触发 TTS。

- [ ] **Step 2：运行红灯测试**

Run: `npx vitest run tests/persona.test.js tests/ai-copy.test.js tests/companion.test.js tests/runtime.test.js`

Expected: persona API、专注期 ambient 和 1.5 秒 AI deadline 相关断言失败。

- [ ] **Step 3：实现人格纯模块**

导出 `defaultPersona()`、`normalizePersona()`、`fallbackLine(scene, context, random)`。预设为 `gentle/witty/clever/sunny`，唠嗑频率为 `quiet/occasional/lively`；离线只解析预设和吐槽档位，不解析自定义全文。

- [ ] **Step 4：接入 AI 和 runtime**

`AiAlarmCopy.generate()` 接收 persona context。runtime 用 1.5 秒 deadline 在 AI 和回退文案间选定唯一文本；迟到结果忽略。主动唠嗑在专注时正常调度、默认静音、高优先级事件出现时丢弃并重排。

新增 runtime 命令：

```js
command('ai:test')
command('companion:suppress', { source: 'typing|editing|blocker', active: true|false })
```

runtime 在内存维护 active source Set，不持久化。Set 非空时 ambient tick 不展示且保持抑制；最后一个 source 解除时用可注入随机源把下一次安排到 5–10 分钟后。control 在输入 focus/blur、编辑开始/结束时发送，main 在 blocker 显示/关闭时发送；窗口销毁时 main 清除对应 source。`ai:test` 更新瞬时 `aiStatus={status,sample,errorCode,checkedAt}`，不持久化 sample。

- [ ] **Step 5：运行绿灯**

Run: `npx vitest run tests/persona.test.js tests/ai-copy.test.js tests/companion.test.js tests/runtime.test.js`

Expected: 全部通过，测试无需真实网络或真实等待。

## Task 3：休息结束任务续接

**Files:**
- Modify: `src/core/timer.js`
- Modify: `src/core/todos.js`
- Modify: `src/platform/electron/runtime.mjs`
- Modify: `src/ui/pet.js`
- Modify: `tests/timer.test.js`
- Create: `tests/todos.test.js`
- Modify: `tests/runtime.test.js`

- [ ] **Step 1：写休息结束和推荐失败测试**

覆盖持久化 `pendingBreakChoice={previousTodoId,focusMinutes,createdAt}`、原任务改名/完成/删除、休息中切换当前任务、P0→P1→P2 推荐顺序、无 Todo、20 秒气泡收起后待选择状态仍保留、应用重启后仍可选择、任何路径不自动开始。

- [ ] **Step 2：运行红灯测试**

Run: `npx vitest run tests/timer.test.js tests/todos.test.js tests/runtime.test.js`

Expected: `break-completed` 事件、推荐方法和 continuation 命令相关断言失败。

- [ ] **Step 3：实现核心状态**

Timer 在进入 break 时保存上一任务 ID 与专注分钟；break 到时进入 idle 并持久化 pending choice，再发出选择事件。TodoLedger 提供确定性 `recommend({ preferredId })`：当前手动选中的未完成 Todo 排在选择列表首位，其余按 P0→P1→P2、创建时间排序。

- [ ] **Step 4：实现 runtime 命令**

新增命令和 payload：

```js
command('break:continue')
command('break:switch', { todoId })
command('break:idle')
```

continue 使用仍存在且未完成的 previousTodoId；switch 校验目标 Todo 后开始；idle 清除 pending 且不开始。原任务完成/删除时 presentation 不发 continue action。无 Todo 时 action 为 `addTodo:true`，pet 调用扩展后的 `showControl({focus:'todo-entry'})`。主窗口计时卡在 pending 存在期间显示同样的续接条，气泡消失后仍可操作。

- [ ] **Step 5：运行绿灯**

Run: `npx vitest run tests/timer.test.js tests/todos.test.js tests/runtime.test.js`

Expected: 全部通过，没有自动启动计时器。

## Task 4：按确认原型实现主窗口和编辑保护

**Files:**
- Modify: `src/ui/index.html`
- Modify: `src/ui/control.js`
- Modify: `src/ui/styles.css`
- Modify: `src/platform/electron/main.mjs`
- Modify: `src/platform/electron/preload.cjs`
- Modify: `tests/ui/control.spec.js`

- [ ] **Step 1：写 UI 失败测试**

覆盖四个一级页签、两个提醒模板、三种提醒类型、interval 字段与预览、提醒启停/编辑/删除、四种人格预览、自定义人设、AI 状态与测试文案、Todo 新增/编辑/二次删除。

- [ ] **Step 2：写草稿保护失败测试**

对提醒、下班、人设、声音和 Todo 编辑分别注入连续 state tick、AI 返回和 presentation，断言输入值不变；dirty 切页确认、取消恢复、保存失败保留草稿。验证主窗口休息续接条、Todo chooser、无任务时聚焦新增输入框。

验证 `window:set-dirty` 握手：renderer 任一编辑器 dirty 时通知 main；main 收到窗口关闭事件后显示原生“继续编辑/放弃修改”，前者取消关闭并聚焦窗口，后者通知 renderer 丢弃所有 draft 后隐藏窗口。renderer 保存/取消后清除 dirty。测试浏览器侧 before-close 回调的两条分支，Electron 手工冒烟再验证原生对话框。

- [ ] **Step 3：运行红灯测试**

Run: `npm run build && NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npx playwright test tests/ui/control.spec.js`

Expected: 新页签、interval 表单和人设控件找不到或行为断言失败。

- [ ] **Step 4：实现 UI**

按 `prototypes/integrated-app.html` 与 `prototypes/interval-alarm.html` 落地，不使用 iframe。每个编辑器维护 `{saved, draft, dirty, saving, error}`，`render(state)` 只更新非编辑字段。AI 测试按钮调用 `ai:test`，根据 `state.aiStatus` 渲染连接、失败或内置文案状态。输入和编辑生命周期调用 `companion:suppress` begin/end。

- [ ] **Step 5：验证桌面与窄窗口布局**

Playwright 在 1280×900 和 720×900 截图；确认 Todo 按钮可见、文字不溢出、页签可滚动、没有卡片套卡片和布局跳动。

- [ ] **Step 6：运行绿灯**

Run: `npm run build && NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npx playwright test tests/ui/control.spec.js`

Expected: 全部通过，无 console error。

## Task 5：桌面宠物事件、通知、TTS 与发布验证

**Files:**
- Modify: `src/core/presentation.js`
- Modify: `src/platform/electron/main.mjs`
- Modify: `src/ui/pet.html`
- Modify: `src/ui/pet.js`
- Modify: `src/ui/styles.css`
- Modify: `tests/runtime.test.js`
- Modify: `tests/voice-player.test.js`
- Modify: `tests/ui/control.spec.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1：写 presentation 和宠物 UI 失败测试**

覆盖优先级、同级 FIFO、有效期、AI 文案在气泡/通知/TTS 复用、休息结束三个动作、长气泡向上扩展不遮脸、用户切表情时气泡同步、主动唠嗑默认静音。

- [ ] **Step 2：运行红灯测试**

Run: `npx vitest run tests/runtime.test.js tests/voice-player.test.js && npm run build && NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npx playwright test tests/ui/control.spec.js`

Expected: 新队列和 break actions 断言失败。

- [ ] **Step 3：实现事件展示**

高优先级事件停止低优先级 TTS；显式提醒、番茄奖励、休息选择和普通下班按规格排队；主动唠嗑与用户表情不排队。系统通知只消费 runtime 已选定文案，点击通知唤起窗口但不确认 occurrence。

- [ ] **Step 4：升级版本并执行完整验证**

将版本改为 `0.1.16`。当前 devbox 为 Linux x86_64，先完成 Linux Electron 运行时和全部自动化验证，再执行可行的 macOS arm64 交叉打包与静态验证：

```bash
npm run lint
npm test
npm run test:ui
npm run package:linux
npm run package:mac:zip
```

Expected: 自动化与 Linux 包 exit 0；若 electron-builder 在 Linux 支持当前 mac zip 流程，则生成 `Pomopet-0.1.16-arm64-mac.zip`。DMG、签名和公证不在 Linux 上伪造验证结果。

- [ ] **Step 5：安装包人工验收**

在 devbox 启动 Linux 打包 app，验证番茄倒数、循环提醒测试时钟、TTS 回退、宠物找回、拖动位置持久化、下班遮挡和退出重开。若 mac zip 交叉构建成功，解包并用 `file` 检查 `Pomopet.app/Contents/MacOS/Pomopet` 为 Mach-O arm64，核对版本号和资源完整性。

真正的 macOS 行为（Gatekeeper 首开、通知权限、原生 TTS、登录启动、窗口层级、DMG）必须在用户的 Apple 芯片 Mac 上做最终冒烟。交付一份不超过 2 分钟的测试清单和结果回填位置；用户运行后的结果作为 macOS 最终验收证据，不把 Linux 静态检查冒充 Mac 实机验证。

- [ ] **Step 6：输出交付信息**

报告自动化测试数量、Linux 人工验收结果、macOS 静态包检查结果、尚待 Mac 实机验证项、安装包绝对路径、SHA-256 和内网 HTTP 下载链接；不得声称已签名、公证或完成 Mac 实机验证。
