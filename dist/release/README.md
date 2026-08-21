# Pomopet release 目录

`npm run package:mac` 会在此生成 Apple Silicon DMG 与 ZIP。

当前仓库不提交二进制安装包。Linux 已生成 `linux-unpacked/`，交叉构建的 Apple Silicon 应用位于 `mac-arm64/Pomopet.app`；这些目录被 Git 忽略。源码生产构建位于 `dist/app/`，实际验证结果记录在根目录 `OVERNIGHT_REPORT.md`。
