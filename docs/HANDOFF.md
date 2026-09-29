# 交接

## 当前状态

- **更新：** 2026-09-29
- **状态：** Supabase `lanlan-cloud-pet` 云端人数限制与 `two-rooms-identity-game` Edge Function 已更新；本地前端改动尚未发布到 GitHub Pages。
- **已完成：** 云端只修改 `two_rooms_identity_rooms` 的容量/牌数校验及 `two_rooms_identity_create_room` RPC 数值限制；容量与牌数范围为 1–40，普通红蓝队上限为 40。未改表结构或其他业务资源。Edge Function 已部署，`verify_jwt=false` 保持不变。
- **真实 1 人房：** 房间 5065，房主单人入座、选择 1 张角色、发牌、刷新恢复本人身份、鼠标按住显示及松开遮挡均通过。
- **真实 4 人房：** QA 房间 7335，4/4、已发牌；刷新后房主能读取并仅查看自己的身份，按住/松开行为通过。房间中的其他玩家只验证名单，未读取其身份。
- **触摸事件：** 在线房间页面的 `touchstart`、`touchend`、`touchcancel` 事件路径通过仿真；未使用实体手机验收。
- **迁移方式：** 该项目云端没有 `supabase_migrations` 历史表，使用已关联项目的 Supabase Management API 直接执行单一新迁移；未创建迁移历史表。不要直接 `db push`，否则旧基线迁移会尝试重新创建现有资源。
- **本地验证：** `npm run validate:roles`、`node --check src/app.js`、`git diff --check` 通过。

## 下一步

1. 如需让公开 GitHub Pages 页面也提供 1–40 人选择，发布当前未提交的前端改动。
2. 如需实体手机验收，在手机浏览器访问已更新的页面，实测按住和松手遮挡。
