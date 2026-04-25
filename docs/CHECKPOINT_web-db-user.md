# web-db-user 融合检查点（Checkpoint）

## 1) 当前已完成
- 已将登录入口改为**站内用户名/密码登录**，移除默认 OAuth 跳转依赖。
- 服务端启动流程已取消 OAuth callback 注册。
- 首页与登录页品牌已切换为 `web-db-user 融合平台`。
- 首页 AI 状态提示改为：仅使用免费通道，OpenAI 明确禁用。
- 新增 `.env.example`，用于 Manus 部署时配置免费数据源 API。

## 2) 关于“融合 tzlh3 + meigulianghua3.6”
当前仓库仅存在 `tzlh3` 代码，尚未发现 `meigulianghua3.6` 源码目录或 Git remote。
因此本检查点先完成可独立上线的基础架构与认证改造，等待你提供第二个仓库地址（或把源码放入工作区）后执行下一步融合：

- UI 模块融合：页面入口、导航、功能卡片合并
- 数据层融合：统一数据源适配器、缓存与回测入口
- DB 模型融合：新增迁移脚本并保持兼容

## 3) Manus.space 零运维成本部署建议
1. 在 Manus 创建新项目：`web-db-user`
2. 导入本仓库并设置启动命令：
   - Build: `pnpm build`
   - Start: `pnpm start`
3. 在环境变量中填写 `.env.example` 对应字段（仅免费 API）
4. 保持 `OPENAI_API_KEY` 为空，避免触发付费通道
5. 发布到 `*.manus.space` 进行预发布验收

## 4) 你可立即检查的点
- 访问 `/auth`：仅用户名/密码注册登录
- 首页标题：`web-db-user 融合量化平台`
- 首页 AI 提示：OpenAI 已禁用
- 服务日志：不再注册 `/api/oauth/callback`

