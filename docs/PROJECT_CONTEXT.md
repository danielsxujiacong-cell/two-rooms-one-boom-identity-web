# 项目上下文

## 目标与范围

通过静态网页版支持选牌、创建牌局、加入牌局、服务端随机发牌和长按私密查看。房主也是玩家；身份发放后固定保存。

不包括两房管理、计时、人质交换、领袖、技能执行、胜负判定、身份交换、埋牌、登录和排行榜。

## 约束

- 角色库从 two-rooms-one-boom-mini/miniprogram/data/roles.js 原样复制，93 个高级角色变体和 5 个基础角色类型。
- 部署复用 Supabase 项目 lanlan-cloud-pet。只新增 two_rooms_identity_* 资源，绝不触碰蓝蓝现有表、RPC 或数据。
- 浏览器只有 publishable key；数据库表无 anon/authenticated 权限，所有访问只经 Edge Function。
- 随机洗牌和分配在 Edge Function/数据库事务完成；每位玩家持有独立随机访问令牌，只能取回该玩家自己的分配记录。
- GitHub Pages 为公开静态站点，所有路由和素材使用仓库相对路径。

## 架构

- two_rooms_identity_rooms：房间状态、座位容量、房主令牌摘要、角色牌组。
- two_rooms_identity_players：成员、昵称、座位和独立令牌摘要。
- two_rooms_identity_assignments：按玩家唯一写入的角色与牌实例；由事务一次锁定。
- two-rooms-identity-game Edge Function：唯一数据入口；随机牌序使用 Web Crypto。
- RPC 只供 service_role 调用，并校验房主、房间容量、牌组和每位玩家单牌约束。
- 页面本地保存玩家和房主随机令牌，刷新后回到服务端已经锁定的同一张牌。

## 验证

- npm run validate:roles
- npm run build:qr
- Deno 2.9.6 check 通过 Edge Function TypeScript 类型检查。
- 浏览器实测了角色库选择、4/4 计数和 390px 手机无横向溢出；控制台没有警告或错误。
- Supabase 迁移已应用于现有 `lanlan-cloud-pet`；只创建 `two_rooms_identity_*` 表和 RPC。
- `two-rooms-identity-game` Edge Function 已部署，publishable key 请求到达函数处理器；网页不含 service_role/secret key。
- 四人云端端到端验收通过：房主加三人、牌组相等、服务端发牌、四位成员单独取身份、身份重复读取稳定、重复开始不重洗、结束后锁房。
- 使用 publishable key 对 assignments 表的直接 REST 查询返回 HTTP 401。
- 云端验收通过独立玩家令牌模拟四个客户端；尚未在四台/四个实体浏览器中完成 UI 实测。
