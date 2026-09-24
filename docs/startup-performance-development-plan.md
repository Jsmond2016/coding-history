# PM2 启动性能优化开发方案

## 开发分支

`main`

## 方案概览

解决 `pnpm start` / `pnpm restart` 需要等待 1-2 分钟的问题。当前 PM2 通过
`pnpm dev` 间接启动后端 `tsx watch` 和前端 Vite，重启时存在 `PM2 -> pnpm ->
tsx watch/ Vite` 多层进程，旧进程不能及时退出，日志出现
`Previous process hasn't exited yet. Force killing...`。

本次让 PM2 脚本直接执行项目本地的 `tsx` 和 `vite` 启动器：后端运行单次
`tsx src/index.ts`，前端运行 Vite 开发服务器。PM2 负责重启和进程守护，避免
后端 watcher 与 PM2 双重管理；前端仍保留 HMR。Redis 生命周期脚本和应用缓存行为
不在本次变更中调整。前端开发服务器固定绑定 `127.0.0.1:5173` 并启用严格端口；
根启动命令会先检查该端口，避免端口被其他项目占用时 Vite 改绑 IPv6、而用户访问到
其他服务返回 404。

## 需求-方案映射

| 需求 ID | 开发方案 | 影响范围 | 风险与非目标 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- | --- |
| R1 | PM2 后端直接执行本地 `tsx src/index.ts`，前端直接执行本地 `vite`，移除 PM2 启动链路中的 `pnpm dev`；前端固定 IPv4 严格端口并增加启动前端口预检 | `scripts/pm2-backend.sh`、`scripts/pm2-frontend.sh`、`frontend/vite.config.ts`、`scripts/check-frontend-port.sh`、`package.json` | 后端不再由 watcher 自动重启，需执行 `pnpm restart`；5173 被外部服务占用时启动会明确失败，不自动换端口 | Shell/TypeScript 检查、PM2 启停日志、深链 HTTP 验证和端口冲突验证 | 已验证 |

## Decision Delta

| 决策 ID | 旧决策 | 新决策 | 触发证据 | 影响需求 | 状态 |
| --- | --- | --- | --- | --- | --- |
| D1 | PM2 通过 `pnpm dev` 启动 watcher | PM2 直接管理一次性后端进程和 Vite 开发服务器 | PM2 日志出现 `tsx Previous process hasn't exited yet. Force killing...`，前端冷启动日志同时显示 Vite 初始化耗时 | R1 | 已确认 |
| D2 | Vite 可在端口冲突时改绑其他地址/端口 | Vite 固定绑定 `127.0.0.1:5173` 并启用 `strictPort` | 实测 IPv4 5173 被 `web-tool-site` 占用，Coding History 改在 IPv6 5173，用户访问 localhost 得到其他项目 404 | R1 | 已确认 |
| D3 | 端口冲突由 Vite/PM2 启动后才暴露 | `pnpm start/restart` 先执行 `frontend:check-port`，识别非本项目监听进程并中止 | PM2 online 状态不能证明 5173 返回的是本项目页面 | R1 | 已确认 |
| D4 | 5173 冲突时只能停止外部服务 | 支持 `FRONTEND_PORT` 环境变量覆盖前端端口，端口预检和 Vite 使用同一配置 | 用户可能需要同时运行多个前端项目 | R1 | 已确认 |
| D5 | PM2 已有守护进程时不会自动刷新端口环境变量 | 在 ecosystem 配置显式写入 `FRONTEND_PORT`，并在 start/restart 使用 `--update-env` | 备用端口配置必须传递给既有 PM2 应用 | R1 | 已确认 |

## Invalidation

| ID | 被替代项 | 精确路径或符号 | 处置 | 理由与消费者证据 | 验证 |
| --- | --- | --- | --- | --- | --- |
| I1 | PM2 后端链路中的 watcher | `scripts/pm2-backend.sh:exec pnpm dev` | 保留业务开发脚本，替换 PM2 专用入口 | 根目录 `pnpm dev:backend` 仍需要 watcher；只有 PM2 场景需要单进程管理 | 检查 PM2 脚本命令和重启日志 |
| I2 | PM2 前端链路中的 pnpm 包装层 | `scripts/pm2-frontend.sh:exec pnpm dev` | 保留 Vite，移除 pnpm 包装层 | Vite 本身提供 HMR，PM2 不需要再经过 pnpm 脚本 | 检查 PM2 脚本命令和前端 ready 日志 |
| I3 | Vite 非严格端口/地址回退 | `frontend/vite.config.ts:server` | 保留配置文件，改为固定 IPv4 严格端口 | 端口冲突时静默改绑会让用户访问到其他服务 | 深链 HTTP 和端口冲突检查 |
| I4 | 无端口预检的根启动链路 | `package.json:start/restart` | 增加 `frontend:check-port`；不修改或杀死外部进程 | 需要在冲突机器上给出可操作错误 | 端口预检命令 |
| I5 | 前端端口固定为 5173 | `frontend/vite.config.ts:server.port` | 保留默认 5173，允许通过 `FRONTEND_PORT` 覆盖 | 备用端口需要同步访问地址 | 启动与深链验证 |
| I6 | PM2 旧环境未刷新 | `ecosystem.config.cjs`、`package.json:start/restart` | 显式更新 PM2 环境 | 旧守护进程可能继续监听原端口 | 备用端口启动验证 |

## State Ownership

| 状态或对象 | 定义与所有者 | 写入者与时机 | 读取者与用户效果 | 生命周期与隔离 | 证据状态 |
| --- | --- | --- | --- | --- | --- |
| PM2 管理的后端/前端进程 | PM2 负责进程启动、停止、重启和异常拉起 | `ecosystem.config.cjs` 对应脚本 | 用户通过 `pnpm start/restart/stop` 观察服务可用性 | 进程级；不再由后端 `tsx watch` 管理重启 | 已证实 |
| 前端 HMR | Vite 开发服务器负责模块更新 | 文件变更时由 Vite 处理 | 前端开发时保留热更新 | 随前端 PM2 进程结束而结束 | 已证实 |

## Verification Delta

| ID | 原验证及是否失效 | 新验证或可观察 seam | 外部依赖 | 未证实风险 | 状态 |
| --- | --- | --- | --- | --- | --- |
| V1 | 原有 `pnpm start/restart` 可最终启动，但重启存在长等待 | 两个 PM2 脚本已不再调用 `pnpm dev`；`pnpm start` 命令耗时约 3.2 秒并显示两个进程 online；清理旧 watcher 后 `pnpm restart` 命令耗时约 17.4 秒且无新的 `Force killing` | PM2、Node、tsx、Vite | 当前 `pnpm restart` 会按 pnpm 语义先执行 stop，再执行 restart/start；后端优雅关闭日志写入仍可能增加关闭耗时，属于后续优化项 | 已验证 |
| V2 | 后端构建已通过 | `pnpm --filter coding-history-backend build`、`bash -n scripts/pm2-backend.sh scripts/pm2-frontend.sh`、`git diff --check` 均通过 | TypeScript、Bash | 无 | 已验证 |

## 源码 Reconciliation

基线：当前 `main` 工作树及启动日志中的真实进程链路。

| 分类 | 精确路径或符号 | 消费者与业务理由 | 证据状态 | 后续动作 |
| --- | --- | --- | --- | --- |
| 保留 | `package.json` 的 `dev`、`dev:backend`、`dev:frontend` | 交互式开发仍需要 watcher 和 HMR | 已证实 | 不修改 |
| 修改 | `scripts/pm2-backend.sh`、`scripts/pm2-frontend.sh`、`frontend/vite.config.ts`、`scripts/check-frontend-port.sh`、`package.json` | PM2 需要直接持有实际服务进程，Vite 需要稳定监听用户访问地址，根命令需要提前阻止端口误用 | 已证实 | 按 D1/D2/D3 修改 |
| 保留 | `ecosystem.config.cjs` 的 PM2 进程配置 | 继续提供日志、自动重启和资源限制 | 已证实 | 保留 `kill_timeout`，验证重启行为 |

## 实施记录

| 日期 | 代码或方案变更 | 关联需求/决策 | 影响 |
| --- | --- | --- | --- |
| 2026-09-23 | 根据 PM2/tsx 日志创建启动性能优化方案 | R1 / D1 | 明确直接进程管理方案 |
| 2026-09-23 | PM2 脚本改为直接执行 `tsx` 与 `vite` | R1 / D1 | 消除 PM2 与 watcher 的多层进程等待 |
| 2026-09-24 | 复现深链 404，确认 5173 IPv4 被其他项目占用；Vite 增加 IPv4 严格端口配置 | R1 / D2 | 防止 PM2 online 但用户访问到其他项目 |
| 2026-09-24 | 增加 `frontend:check-port` 端口预检并接入 `start/restart` | R1 / D3 | 端口冲突时在 PM2 启动前明确失败 |
| 2026-09-24 | Vite 端口支持 `FRONTEND_PORT` 覆盖 | R1 / D4 | 外部项目占用 5173 时可使用 5174 等备用端口 |
| 2026-09-24 | PM2 配置加入 `FRONTEND_PORT` 并启用 `--update-env` | R1 / D5 | 备用端口配置可刷新到既有 PM2 进程 |

## 验证结果

| 日期 | 需求/验证 ID | 验证项 | 结果 | 证据或未运行原因 |
| --- | --- | --- | --- | --- |
| 2026-09-23 | V1 / V2 | 实际执行 `pnpm start`、`pnpm restart`、`pnpm stop`，检查 PM2 online、后端 `/health` 200 和前端 HTTP 服务；并执行构建、Shell 语法和 diff 检查 | 通过 | 旧进程清理后无新的 `Previous process hasn't exited yet. Force killing...`；Vite ready 日志约 11.4 秒。后端优雅关闭日志写入仍可能增加 pnpm restart 的总耗时 |
| 2026-09-24 | R1 / V3 | 请求 `/git-statistics?start=2023-06-12&end=2026-09-23`；`[::1]:5173` 返回 200，`127.0.0.1:5173` 返回其他项目 404；加入 `host=127.0.0.1`、`strictPort=true` | 已验证 | 当前机器的外部 `web-tool-site` 仍占用 IPv4 5173，因此无法在本机释放该外部端口后复测 | 通过 |
| 2026-09-24 | R1 / V4 | 在当前机器执行 `pnpm frontend:check-port` 和 `pnpm run start`，识别 PID 41860 的 `web-tool-site` 并在 PM2 启动前以非零退出；不修改外部进程 | 已验证 | 端口冲突场景已覆盖；释放外部端口后，Vite 会固定服务 `127.0.0.1:5173` | 通过 |
| 2026-09-24 | R1 / V5 | 使用 `FRONTEND_PORT=5174 pnpm start` 验证备用端口启动和深链访问 | 已验证 | `127.0.0.1:5174/git-statistics?...` 返回 200，Vite 日志显示监听 5174；验证后已执行 `pnpm stop` | 通过 |

## 暂停交接记录

无。
