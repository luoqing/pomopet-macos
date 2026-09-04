# Pomopet

Pomopet 是一只陪你工作的桌面小狗。番茄钟、闹钟和下班规则负责记得时间；末末负责安静陪伴、庆祝、叼球催休息，以及在你忘记下班时躺平碰瓷。

当前版本是面向 Apple Silicon Mac 的 Electron 核心版，中文、本地优先，不需要账号或 API key。计时、闹钟 recurrence、事件去重、文案和语音队列与 Electron 平台层分离。

## 已实现

- **时间管理闭环**：25/5、50/10、自定义番茄钟；今日 Todo 支持优先级、预估番茄、用时归档、编辑删除，以及从任意未完成 Todo 直接开始专注。
- **自然续接工作**：一颗番茄完成后默认进入休息并播放庆祝奖励；休息结束可继续刚才的任务、切换 Todo 或先不开始，不会擅自启动下一颗。
- **提醒计划**：支持一次、每周定时和工作时段内间隔循环，可配置星期、起止时间、15–120 分钟间隔、宠物动作、稍后 10 分钟及 macOS 系统通知。
- **稳定情绪陪伴**：温柔陪伴、毒舌关心、机灵侠女、元气夸夸四种性格；支持宠物名字、用户称呼、自定义人设、吐槽浓度和主动唠嗑频率。
- **AI 文案与自然语音**：DeepSeek 生成场景文案，失败或超时自动使用同人设内置文案；Edge TTS 与系统语音均可用，气泡、通知和朗读保持同一句话。
- **可靠编辑体验**：提醒、Todo、下班规则、人设和声音设置使用受保护草稿，计时刷新、AI 返回和提醒触发不会覆盖正在输入的内容。
- 透明置顶、非激活、可拖动并记住位置的宠物窗口；托盘菜单隐藏/恢复。
- 原创手绘位图小狗“末末”，十二组一致角色动图覆盖专注、庆祝、休息、闹钟、下班趴下/装死、两种生气和亲密互动。
- 10–20 秒摸头、投喂、扔球、安慰，无数值、库存、失败或惩罚。
- 工作日下班提醒、稍后提醒、当日关闭、变大遮挡桌面和非阻塞升级动作。

## 本地开发

要求 Node.js 20.17 或更高版本。

~~~bash
npm ci --ignore-scripts
npm run verify
npm run dev
~~~

如果 Electron binary 尚未安装，单独执行：

~~~bash
node node_modules/electron/install.js
npm start
~~~

不要为了补 Electron binary 再运行一次普通 `npm install`。`npm run verify` 会依次执行 ESLint、全部 Vitest 测试和 Vite 生产构建。

## Apple Silicon Mac 打包

推荐在 Apple Silicon Mac 上执行，以便同时做真实窗口与通知验证：

~~~bash
npm ci
npm run verify
npm run package:mac
~~~

产物写入 `dist/release/`。当前配置生成 arm64 DMG 和 ZIP，但没有开发者签名或公证。若在 Linux 交叉打包，能生成的产物仍需在 Mac 上试装，且不能据此宣称透明窗口、通知和登录项已验证。

本轮 Linux 交叉构建已生成 `dist/release/Pomopet-0.1.18-arm64-mac.zip`。在 Apple Silicon Mac 上解压后，将 `Pomopet.app` 拖入“应用程序”，再按下面的未签名首次打开流程试装。DMG 需要在 macOS 打包机上生成。

### 安装与首次打开

1. 打开 DMG，将 Pomopet 拖入“应用程序”。
2. 未签名测试包首次打开时，在 Finder 中右键 Pomopet →“打开”→再次确认；或前往“系统设置 → 隐私与安全性”允许打开。
3. 首次出现通知授权时选择“允许”。若拒绝，应用运行时宠物提醒仍可用，但宠物隐藏时没有系统横幅兜底。无论通知权限如何，完全退出后本版都不能安排新提醒。
4. 在“声音与启动”中打开“登录时启动 Pomopet”，可让日常闹钟和下班提醒保持运行。
5. Pomopet 不需要辅助功能、屏幕录制、麦克风或文件访问权限。

### 卸载

1. 从菜单栏 Pomopet 图标选择“退出 Pomopet”。
2. 删除 `/Applications/Pomopet.app`。
3. 如需清除本地设置，删除 `~/Library/Application Support/Pomopet/`。
4. 如曾开启登录启动，建议先在应用设置中关闭；也可在“系统设置 → 通用 → 登录项”移除 Pomopet。

## 项目结构

- `src/core/`：可注入时钟的纯业务核心。
- `src/platform/electron/`：窗口、托盘、通知、登录项、IPC 和持久化适配。
- `src/ui/`：控制台、宠物窗口、原创资产和本地语音。
- `tests/`：状态机、恢复、闹钟、去重、文案、语音、存储、运行时与加速 soak。
- `docs/superpowers/specs/2026-08-21-pomopet-macos-design.md`：与实现一致的产品/技术设计。
- `OVERNIGHT_REPORT.md`：本轮实现、验证证据、产物和 Mac 待验项。

## 已知边界

完全退出 Electron 后，没有原生 helper 继续安排新的 macOS 本地通知；本版通过“登录时启动 + 进程常驻托盘”保障常规提醒。Linux 已生成可运行目录包，Linux 交叉构建已生成 `dist/release/mac-arm64/Pomopet.app`，但签名、公证、透明非激活窗口、macOS 通知和登录项仍必须在真实 Apple Silicon Mac 上验证。
