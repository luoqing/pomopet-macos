# Pomopet 核心版交付报告

日期：2026-08-21
环境：Linux x86_64 DevBox，Node.js 20.17.0；无 Swift、Rust 或 macOS 运行环境

## 完成内容

### 可靠计时与提醒核心

- 番茄钟支持 25/5、50/10、自定义、任务名、开始、暂停、继续、停止、提前完成、休息暂停/继续与跳过。
- 使用持久化目标时间计算剩余时间，不依赖累计 tick。状态包含 session ID、阶段、目标时间、暂停余量和 completion claim。
- 启动恢复会补记已过期专注且只触发一次；15 分钟内可庆祝，超过窗口静默计数；恢复不自动开始休息。完成计入目标结束时所在本地日。
- 一次性闹钟和按星期重复闹钟支持标签、启停、编辑、删除、稍后 10 分钟和关闭。独立 occurrence ledger 防止进程调度与重复轮询产生双发。
- 下班提醒支持工作日、时间、snooze、当日关闭和一次非阻塞升级。没有关机、息屏、全屏遮挡或系统阻断行为。
- 提醒优先级为：用户闹钟 > 番茄完成 > 下班 > 休息 > 互动。高优先级会打断当前低优先级展示，核心事件仍留在队列。

### Electron 桌面壳

- 控制窗口、透明无边框宠物窗口和菜单栏托盘已实现。
- 宠物窗口配置为 always-on-top、focusable false、skipTaskbar、全工作区可见；拖动通过主进程执行并夹紧在显示器工作区内，位置原子持久化。
- 菜单栏支持打开控制台、隐藏/恢复宠物和退出。
- 应用运行且宠物可见时由宠物提醒；宠物隐藏时关键事件走 Electron 系统通知。登录项通过 `app.setLoginItemSettings` 适配。
- 完全退出后没有 native helper 继续安排新通知，这是本版明确限制；建议打开登录启动并常驻菜单栏。

### 角色、文案、互动和语音

- 项目专属手绘位图小狗“末末”替代旧原型的 CSS 几何角色；八张透明 PNG 保持奶油焦糖毛色、红围巾和同一角色比例。
- 实现待机看书呼吸、完成跳跃、抱球休息、闹钟警觉、下班趴下或装死、被忽略后气鼓鼓，以及摸头、投喂、扔球、安慰动作。下班首个动作可由用户选择。
- 四种亲密互动均为 12 秒、可被提醒打断，无亲密度、库存、升级、失败和惩罚。
- 内置中文文案覆盖开始、完成、休息、闹钟、下班、忽略升级和四种互动；同分类不连续重复。
- 预生成并打包 4 条 `zh-CN-XiaoxiaoNeural` 同声线 MP3：完成、休息、闹钟、下班。运行时不联网。语音播放器保证单实例、优先级打断、音量控制和播放失败时静默视觉降级。

## 自动验证证据

最后一次完整验证命令：

~~~text
npm run verify
Test Files  8 passed (8)
Tests       29 passed (29)
vite v6.1.0 production build passed

NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npx playwright test
UI Tests    2 passed (2)
~~~

覆盖范围：

- `tests/timer.test.js`：目标时间、暂停/继续、停止、完成一次性、睡眠/重启恢复、静默过期、跨日归属。
- `tests/alarms.test.js`：一次性、星期重复、跨周末、snooze、不改基础 recurrence、共享 ledger 和过期丢弃。
- `tests/companion.test.js`：文案不重复、展示优先级与中断、去重、语音队列、下班 snooze/升级/关闭。
- `tests/store.test.js`：真实临时目录中的原子写入、父目录创建、损坏数据降级。
- `tests/runtime.test.js`：重启恢复一次性、闹钟到宠物与通知路由、设置/位置/编辑持久化、关闭互动。
- `tests/voice-player.test.js`：浏览器音频不重叠、优先级打断、播放失败降级。
- `tests/assets.test.js`：全部文案语音引用、八张角色姿势和应用图标存在且非空。
- `tests/soak.test.js`：48 小时加速运行，覆盖跨日、持久化重建、睡眠恢复与同时提醒；核心 durable ID 无重复。
- `tests/ui/control.spec.js`：生产构建中的开始/暂停、互动预览、闹钟表单、宠物投喂切图与控制台错误检查。

独立 soak 命令 `npm run test:soak` 已通过。Playwright 使用现有 Chromium 在 1200×900 控制页和真实 300×280 宠物窗口尺寸下通过，截图写入 `artifacts/screenshots/`；PNG 截图本身由 Git 忽略，README 保留验证说明。

## 产物路径

- 生产 renderer：`dist/app/`（本机 `npm run build` 已生成，Git 忽略）。
- Linux x64 可运行目录包：`dist/release/linux-unpacked/`（本机完成构建）。DevBox 没有 Xvfb，Ozone headless 启动又因宿主机全局 `inotify_init(): Too many open files` 后 SIGSEGV，故没有把真实 Electron 窗口启动列为通过。
- Apple Silicon 交叉构建：`dist/release/mac-arm64/Pomopet.app`（约 249 MB，未签名、未在 Mac 启动）。
- Apple Silicon ZIP：`dist/release/Pomopet-0.1.0-arm64-mac.zip`（约 100 MB，ZIP 完整性通过，SHA-256 `c5792c2c148a94eedd870bd59051bbeb426a6559695d9806364f6b346e87f88e`）。
- release 说明：`dist/release/README.md`。
- Apple Silicon 一键打包：`npm run package:mac`，目标为 arm64 DMG + ZIP。
- `file` 确认包内主程序是 `Mach-O 64-bit arm64`；ASAR 清单确认八张宠物姿势、四段语音、图标和主进程入口均已入包。当前 Linux 环境已生成 arm64 `.app` 和 ZIP，但尚未生成签名/公证产物；不能把交叉构建当作 Mac 试装通过。

## Mac 上仍需验证

1. Apple Silicon 上安装、启动、DMG 拖拽、Gatekeeper 未签名打开流程。
2. 透明宠物窗口是否在不同 Mission Control 空间、全屏 App、多个显示器和缩放比例下保持正确层级且不抢键盘焦点。
3. 拖动位置在显示器拔插后夹紧和恢复是否符合预期。
4. 通知授权允许/拒绝、macOS Focus 模式和宠物隐藏时的横幅行为。
5. 登录项开关在系统设置中的实际登记与重启登录后的启动行为。
6. 四条 MP3 的实际扬声器音量、声线一致性和高优先级打断听感。
7. 真实睡眠/唤醒、时区变化和 DST 跳变。纯核心 recurrence 使用 JS Date 本地规则并有周末测试，但 Linux 未模拟 macOS DST 边界。
8. 内存、CPU 与整日后台功耗；本轮只有加速逻辑 soak，未在 Mac 进行 24 小时墙钟 soak。
9. 开发者签名、公证和自动更新尚未配置。

## 已知限制

- 完全退出应用后无法安排新的系统通知；已安排通知的 native 持久化 helper 未实现。本版依赖常驻菜单栏与登录启动。
- Electron 包体大于原生 App；当前 UI 无远程内容和重框架，后台只有 500 ms 调度检查，但真实功耗仍需 Mac 验证。
- 首版仅中文、单宠物、无云同步。
- 角色动作以八张一致位图姿势切换和轻量 CSS 位移完成，不是逐帧骨骼动画。它满足核心状态辨识，但仍值得在 Mac 试用反馈后做专业动画精修。
