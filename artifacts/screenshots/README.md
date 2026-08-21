# UI 验证截图

`NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost npm run test:ui` 会生成：

- `control-window.png`：控制窗口全页视觉复核。
- `pet-window.png`：真实 300×280 透明宠物窗口与投喂姿势复核。

PNG 作为本机验证证据保留在工作树但不提交，避免仓库持续累积二进制截图。
