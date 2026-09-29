# 两室一弹身份发放网页版

一个手机优先的身份发放工具：选牌、建房、加入、服务端洗牌，再由每位玩家私密查看自己的身份。

## 状态

- **阶段：** MVP 已上线 GitHub Pages，并连接现有 Supabase 项目
- **主要入口：** index.html
- **角色库：** 原样复用已校验的 93 个高级角色和 5 个基础角色类型
- **在线体验：** https://danielsxujiacong-cell.github.io/two-rooms-one-boom-identity-web/
- **公开仓库：** https://github.com/danielsxujiacong-cell/two-rooms-one-boom-identity-web

## 本地运行

依次运行：

    npm install
    npm run build:qr
    npm run validate:roles
    npm run serve

在浏览器打开 http://localhost:4173。联机后端使用现有 `lanlan-cloud-pet` Supabase 项目，数据库迁移和 `two-rooms-identity-game` Edge Function 已部署。前端只有 publishable key；不得配置 service_role 或 secret key。

## 联机验收

- 四人房间真实创建、加入、服务端发牌通过；房主也占一个玩家席位。
- 四名玩家各自读取身份，重复读取后角色与牌实例保持不变；重复发牌不会重新洗牌，发牌后拒绝新玩家。
- 使用 publishable key 直接查询 assignments 表返回 HTTP 401；数据只经 Edge Function 按玩家令牌读取。
- 本轮验收新建两个 QA 房间并保留在 Supabase：一个完成发牌，一个留在等待状态；不含真实玩家资料。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| index.html、src/ | 静态网页 |
| src/data/roles.js | 原小程序角色库原样复用 |
| supabase/migrations/ | 只新增本项目专用表和 RPC 的 SQL |
| supabase/functions/two-rooms-identity-game/ | 服务端建房、加房、洗牌和读取本人身份 |
| assets/vendor/ | 本地二维码库及许可证 |
| docs/PROJECT_CONTEXT.md | 项目边界与技术决策 |
| docs/HANDOFF.md | 当前部署状态和下一步 |

## Git 同步

此项目使用独立 GitHub 仓库。两台电脑继续工作前先检查 Git 状态；干净时安全同步。提交前检查暂存文件，排除本地密钥和机器配置。
