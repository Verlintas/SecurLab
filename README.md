[![SecurLab](resources/logo.png)](resources/logo.png)

# SecurLab

本地优先的 Minecraft 服务器安全测试工作台 · 先攻破自己的服务器，别等别人动手 · MIT

[简体中文](README.md) · [English](docs/README.en.md)

[![Latest release](https://img.shields.io/github/v/release/Verlintas/SecurLab)](https://github.com/Verlintas/SecurLab/releases) [![Downloads](https://img.shields.io/github/downloads/Verlintas/SecurLab/total)](https://github.com/Verlintas/SecurLab/releases) [![License](https://img.shields.io/github/license/Verlintas/SecurLab)](LICENSE) [![macOS arm64](https://img.shields.io/badge/macOS-arm64-ff0000?logo=apple&logoColor=white)](#下载与安装)

## 简介

SecurLab 是给 MC 服主与管理员用的**授权渗透测试工作台**：在授权范围内，用自己的服务器跑一遍攻击者的完整链路（扫描 → 认证绕过 → 提权 → 影响验证），拿到带证据链的报告和修复建议。

- **攻击链引擎**：多步链组合侦察、认证攻击与验证，条件分支、逐步证据、可随时中止
- **单项工具模式**：17 个模块可手动单独执行，覆盖 信息收集 / 配置审计 / 身份访问 / 认证测试 / 影响验证
- **内置一次性靶场**：无需 Docker，自动下载 Paper + AuthMe + LuckPerms 并一键起停，服务端控制台实时接入
- **双终端**：左侧攻击引擎日志、右侧目标服务端控制台，同屏看攻防两侧
- **报告**：每次运行自动记录（步骤 / 日志 / 证据 / 发现），导出精美 HTML 或 Markdown
- **日志取证**：导入历史 `latest.log` 重建入侵时间线（注册劫持、权限接管启发式）
- **安全边界**：主动模块仅限白名单目标并需确认授权；破坏性模块由引擎硬门禁为仅本地靶场
- **要求**：macOS（arm64，Windows 计划中）；靶场需要 Java 21（自动检测）

> ⚠️ **仅限授权测试**：只能用于你自己的服务器，或你获得明确书面授权的目标。

## AI 编程提示

本项目由 AI 编程助手（opencode）参与开发：需求、审阅与发布由人类维护者完成，代码主要由 AI 编写。

- 使用、引用或二次开发前，请自行评估代码的正确性与安全性
- 如果你发现 AI 生成代码中的问题，欢迎提 [Issue](https://github.com/Verlintas/SecurLab/issues) 或 PR

## 快速上手

1. **安装**：从 [Releases](https://github.com/Verlintas/SecurLab/releases/latest) 下载 `.dmg` 拖入 Applications。构建未签名，首次打开需右键 → 打开，或执行：

    ```bash
    xattr -cr /Applications/SecurLab.app
    ```

2. **先打靶场**：靶场页一键启动配方 A（Paper 离线服 + AuthMe 6.0.0 漏洞版 + 种子 OP/白名单），服务端控制台会自动接入右侧终端

3. **测试自己的服务器**：设置页把服务器 `IP:port` 加入白名单并勾选授权 → 测试运行页选链/选模块执行。建议从只读的 C0 侦察开始

4. **看结果**：报告页查看证据链与修复建议，导出 HTML / Markdown

试试这些：

- 「总览看板」→ 查看 14 条攻击链 × 8 个靶场配方的全貌
- 「测试运行」→ 选 `C0`（只读侦察）或 `C1`（离线服 OP 接管）打靶场，双终端实时看攻防
- 「单项工具」→ 手动执行任意模块，比如 `recon.slp`（服务器状态查询）、`audit.config`（本地配置审计）、`auth.proxy-forge`（代理免密伪造）
- 命令行并行：`HOST=play.example.com PORT=25565 CHAIN=C0 npm run live:run`

## 攻击链矩阵

| 链 | 用途 | 状态 |
| --- | --- | --- |
| C0 | 侦察全链 —— SLP / Legacy ping / Query / 玩家枚举 / 指纹（只读） | ✅ |
| C0A | 本地配置审计 —— `server.properties`、`ops.json`、插件与代理配置 | ✅ |
| C1 | 离线服 OP 接管 —— 抢注特权名并验证权限 | ✅ |
| C1C | 登录后命令树 —— tab 补全权限枚举 + 只读探针 | ✅ |
| C1V | 身份验证 —— 已知凭据登录并核实 `/seed` 权限 | ✅ |
| C2 | Pre-join 会话竞态 —— AuthMe 受影响版 vs 修复版对照 | ✅ |
| C4 | 代理免密登录 —— 空密钥 `perform.login` 伪造 | ✅ |
| C5 | 弱口令撞库 —— 限速、自定义字典、被踢自动重连 | ✅ |
| C6 / C6S / C6P | 注册劫持扫描 / 登录面扫描 / 认证强制探针 | ✅ |
| C7P | 聊天与广告过滤探针 —— 登录前后消息行为对比 | ✅ |
| C14 | 后渗透升级 —— 群体 OP、坐标提取（仅限靶场） | ✅ |
| C3 · C8–C13 | 代理穿透、RCON、插件 CVE、权限错配、洪泛韧性、模组服 | 计划中 |

## 功能

### 攻击链引擎

- 链 = 带条件分支的有序步骤图（JSON 定义），步骤可 `when` 门控、`continueOnError` 容错
- 结构化事件总线：`run/step/log/evidence/finding` 七类事件驱动终端与报告
- 单运行互斥、随时中止、运行记录持久化

### 单项工具

- 17 个模块按五类分组，参数按模块动态渲染
- 破坏性模块（群体 OP 等）在 UI 标 ⚠「仅限靶场」，引擎拒绝非本地目标
- 与攻击链共用终端、发现面板、报告管线

### 内置靶场

- 配方化：A–H 与 R0/R1 覆盖离线服、代理错误转发、Query 泄露、老版本 CVE、权限错配、会话竞态对照等
- 供给器：PaperMC fill v3 API、GitHub Releases、Jenkins 直链，sha256 校验 + 本地缓存 + 国内镜像回退
- 运行时补丁：启动后按 YAML 路径精准改写插件配置并 reload（对付配置迁移覆盖）
- JDK 多版本自动检测（JAVA_HOME / /Library/Java / Homebrew / PATH）

### 双终端与报告

- xterm 终端 × 2：攻击引擎 + 目标服务端控制台（按端口自动附加）
- 每步产出证据面包屑；报告含严重级别、证据 JSON、步骤时间线
- 导出：自包含深色 HTML（内嵌 logo）与 GitHub 友好 Markdown

### 日志取证

- 解析 Paper / Spigot / BungeeCord 历史日志：进出服、AuthMe 注册登录、OP 变更、危险指令、踢出
- 启发式标记：注册劫持（出现即注册）、权限接管（OP 授予新账号）、破坏爆发（短时间大量危险指令）
- 输出 Markdown 事件报告

## 下载与安装

- **官方**：[GitHub Releases](https://github.com/Verlintas/SecurLab/releases/latest)（附完整更新说明）
- **加速镜像**（第三方服务，国内网络可能更快；失效就换一个）：

    ```
    https://gh-proxy.com/https://github.com/Verlintas/SecurLab/releases/latest/download/SecurLab-arm64.dmg
    https://ghproxy.net/https://github.com/Verlintas/SecurLab/releases/latest/download/SecurLab-arm64.dmg
    ```

    任意 GitHub 代理都可用：把官方下载链接原样拼在代理域名后面即可。

- 构建未签名（ad-hoc 签名）：首次打开若提示"无法验证开发者"，右键 → 打开即可；或 `xattr -cr /Applications/SecurLab.app`（**不要点"移到废纸篓"**）
- 靶场需要 **Java 21**（例如 `brew install openjdk@21`），会自动检测；服务器 jar 与插件在首次使用时从官方源下载并缓存

## 技术栈与架构

Electron · React · TypeScript · Tailwind v4 · `mineflayer` / `node-minecraft-protocol`（协议级仿真）· xterm.js · 原生 Java 进程靶场（无 Docker）· i18next（zh-CN / en）

```
src/main            Electron 主进程：引擎 / 靶场 / 报告 / IPC
  engine/           runner + 事件总线 + 模块注册表 + 攻击链 + 破坏性门禁
    modules/        17 个攻击/侦察模块 + mineflayer 会话库
  lab/              配方 / 供给器（下载+校验+镜像回退）/ JDK 检测 / 进程管理 / YAML 补丁
  report/           运行记录存储 + HTML / Markdown 生成
  settings.ts       白名单 / 授权 / 限速
src/preload         contextBridge API
src/renderer        React UI：总览 / 靶场 / 测试运行 / 报告 / 设置
src/shared          共享类型（引擎事件协议、网络工具）
scripts/            验收测试与实机 CLI（live:run / basefind / forensics / crack）
```

## 构建与开发

需要 Node.js 22+ 与 Java 21（仅靶场功能需要）：

```bash
npm install
npm run dev          # 开发模式启动
npm run typecheck    # 类型检查
npm run build        # 编译产物到 out/
npm run dist:mac     # 打包 macOS arm64（.dmg / .zip）
```

验收测试（大部分会自起靶场，可离线运行）：

```bash
npm run lab:smoke     # 靶场供给 + SLP + 起停
npm run engine:smoke  # 链引擎事件管线
npm run attack:smoke  # C1/C5/C6 打漏洞靶场并断言
npm run race:smoke    # C2 受影响版 vs 修复版对照
npm run impact:smoke  # C14 升级链 + 破坏性门禁校验
npm run report:smoke  # HTML/Markdown 导出
```

实机 CLI：

```bash
HOST=play.example.com PORT=25565 CHAIN=C0 npm run live:run        # 跑一条链
HOST=play.example.com PORT=25565 MODULE=recon.slp npm run live:run # 跑单个模块
LOG=/path/to/latest.log npm run log:forensics                      # 入侵时间线
```

## 里程碑与路线图

- **已完成 · M0 脚手架**：Electron + React + i18n + 五页面壳
- **已完成 · M1 靶场**：配方 / 供给器 / JDK 检测 / 进程管理与控制台流
- **已完成 · M2 引擎**：攻击链引擎、事件总线、双终端运行页
- **已完成 · M3 侦察与审计**：SLP / Legacy / Query / 玩家枚举 / 配置审计 / 日志取证
- **已完成 · M4–M5 攻击链**：C1/C5/C6、C2 对照、C4 代理伪造、报告导出
- **已完成 · v0.1.0 发布**：单项工具模式、macOS 打包、实机测试迭代
- **计划中**：C3 代理穿透（多进程靶场）、C8 RCON、C9 插件 CVE 链、C10 权限错配、C11 正版伪造、C12 洪泛韧性（仅靶场）、C13 模组服、Windows 打包

## 常见问题

**会不会被拿去打别人的服务器？** 设计上做了三层约束：主动模块仅允许白名单目标（默认只有 localhost/靶场）；非本地目标必须显式勾选授权确认；破坏性模块由引擎硬编码拒绝非本地目标。工具面向的是"测自己的服务器"。

**为什么靶场不用 Docker？** 为了"下载即用"：原生 Java 进程 + 自动下载 jar/插件，macOS / Windows 都不需要额外内核级依赖；靶场数据在独立目录，重置只清世界和插件数据。

**支持哪些服务器版本？** 协议层使用 `minecraft-data`，覆盖到 1.21.x 主流版本；老版本（1.8+）同样可测。模组服（Forge/Fabric）的基础探测可用，深层模组攻击面在路线图中。

**报告里为什么没有明文证据？** 有的——证据 JSON 会包含原始响应（如 `/seed` 输出、插件清单），方便复现与修复验证；但不会包含你输入的白名单之外的任何凭据。

**测试会不会影响服务器？** C0/C0A/C6S/C6P 等只读链零修改；C1/C5/C6 会产生注册/登录尝试（可在设置里限速、随时中止）；破坏性演示只有本地靶场能跑。

## 参与贡献

欢迎 [Issue](https://github.com/Verlintas/SecurLab/issues) 与 PR：bug 报告请尽量附上运行日志（报告页可导出 Markdown）；新攻击链/模块请同时提供对应的验收断言。

## License

[MIT](LICENSE) © 2026 Verlintas
