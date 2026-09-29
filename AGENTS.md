# 项目规则

- 技术栈：原生 HTML、CSS、JavaScript；Supabase Edge Function (Deno/TypeScript)。
- src/data/roles.js 是从小程序原样复制的规范角色数据；除非用户明确要求，不改名称、能力或数据。
- 仅使用 two_rooms_identity_* 数据表及函数。不得改动 lanlan-cloud-pet 的现有表、RPC 或数据。
- 前端只能持有 anon/publishable key。服务端发牌、服务端保存稳定分配；前端不查询数据库表。
- 静态资源以项目相对路径加载，兼容 GitHub Pages 子路径。
- 发布前检查 .gitignore 与暂存内容、运行角色校验和本地流程验证，并更新 docs/HANDOFF.md。
