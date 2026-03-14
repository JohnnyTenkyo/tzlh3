# 量化回测平台 (tzlh-quant) - Project TODO

## 数据库 Schema 迁移
- [x] 迁移用户表（users，增加 username/password 字段）
- [x] 迁移回测会话表（backtestSessions）
- [x] 迁移交易记录表（backtestTrades）
- [x] 迁移 K 线缓存表（klineCache）
- [x] 迁移缓存元数据表（cacheMetadata）
- [x] 迁移数据源健康监控表（dataSourceHealth）

## 服务端核心模块迁移
- [x] 迁移 marketData.ts（多数据源 K 线获取：Alpaca/Stooq/Yahoo/Tiingo/Finnhub/AV/Polygon/TwelveData/MarketStack）
- [x] 迁移 indicators.ts（MACD/黄蓝梯子/CD/RSI/布林带/ATR）
- [x] 迁移 backtestEngine.ts（6种策略回测引擎）
- [x] 迁移 cacheManager.ts（缓存读写管理）
- [x] 迁移 shared/stockPool.ts（793只美股股票池）
- [x] 迁移 shared/types.ts 和 shared/const.ts

## API 密钥配置
- [x] 配置 Alpaca API Key + Secret Key
- [x] 配置 AlphaVantage API Key
- [x] 配置 Tiingo API Key
- [x] 配置 Finnhub API Key
- [x] 配置 Gemini AI API Key（GOOGLE_GEMINI_BASE_URL/GEMINI_API_KEY/GEMINI_MODEL）
- [x] 集成额外3个免费股票 API（Polygon.io / Twelve Data / MarketStack）

## Gemini AI 策略集成
- [x] 创建 geminiStrategy.ts（Gemini AI 策略分析模块）
- [x] 实现 AI 策略分析路由（analyzeBacktestResult/generateGeminiStrategy/testGeminiConnection）
- [x] 前端 AI 信号展示（K线图/回测详情/回测中心）

## tRPC 路由迁移
- [x] chart 路由（getCandles/getIndicators/getAISignal）
- [x] backtest 路由（strategies/create/list/detail/progress/delete/batchDelete/exportExcel/aiAnalyze）
- [x] stockPool 路由（list/sectors）
- [x] cache 路由（status/warmDaily）
- [x] health 路由（sources/geminiStatus）
- [x] auth 路由（register/login/changePassword/logout/me）

## 前端界面构建
- [x] 安装 lightweight-charts 依赖
- [x] 深色量化平台主题（index.css）
- [x] DashboardLayout（侧边栏导航，支持未登录访问）
- [x] Home/Dashboard 页面（总览、功能入口、状态监控）
- [x] ChartPage（K线图 + 技术指标 + AI信号）
- [x] BacktestPage（回测配置 + 历史记录 + 批量操作）
- [x] BacktestDetailPage（回测详情 + AI分析 + 交易记录 + Excel导出）
- [x] StockPoolPage（793只美股 + 行业筛选 + 分页）
- [x] CachePage（缓存状态/预热/缓存详情）
- [x] HealthPage（9个数据源健康监控 + Gemini状态）
- [x] AuthPage（登录/注册页面）
- [x] 配置 App.tsx 路由

## 测试
- [x] server/apikeys.test.ts（8项 API 密钥配置测试，全部通过）
- [x] server/auth.logout.test.ts（登出功能测试）

## 部署
- [x] 保存 checkpoint 供用户检查
- [ ] 用户确认后 publish

## Bug 修复（用户反馈）
- [x] 修复登录功能无法正常工作（JWT payload 缺少 appId/openId，修复 createSessionToken + sdk.authenticateRequest）
- [x] 修复缓存管理页面预热按钮不显示（未登录时显示登录提示卡片）
- [x] 回测详情页添加收益率曲线图（与 QQQ/SPY 基准对比，使用 recharts LineChart）
- [x] 修复 Gemini AI 连接状态显示（修正 API URL，区分检测中/服务不可用/已连接三种状态）

## 新功能（第二轮）
- [x] 集成 OpenAI 为 Gemini AI 备用（baseURL: https://openfly.cc/v1，自动故障转移）
- [x] env.ts 添加 openaiApiKey/openaiBaseUrl/openaiModel
- [x] geminiStrategy.ts 添加 OpenAI 备用调用逻辑（Gemini 失败时自动切换）
- [x] 健康监控页面显示双 AI 状态（Gemini + OpenAI）
- [x] 策略参数可视化调优：止损/止盈/持仓天数滑块
- [x] 策略参数实时预览（模拟收益曲线对比图表）
- [x] 回测配置页面集成参数调优面板（Tabs布局：基础配置/参数调优/历史记录）

## 缓存优化（第三轮）
- [x] 分析现有缓存瓶颈（串行/仅Alpaca批量50只/固定等待500ms）
- [x] cacheManager.ts v3：并发8路 + Semaphore 限流器
- [x] Alpaca 批量从50只提升到200只/批
- [x] 并发兜底：Alpaca 失败的股票并发8路从其他源获取
- [x] 并发保存：所有 DB 写入并行执行
- [x] 速度统计：实时显示 symbols/秒 和已用时间
- [x] 数据源统计：显示各源成功/失败数
- [x] 前端缓存页面：显示并发速度、数据源使用情况、重试状态

## 股票池筛选 + 交易理由（第四轮）
- [ ] stockPool.ts：添加市值分类字段（large/mid/small）和更细化的行业标签
- [ ] 回测引擎：交易记录添加 buyReason/sellReason 字段（基于策略信号生成）
- [ ] 回测配置页面：多维筛选面板（全部/行业分类/市值分类/自选股票）
- [ ] 回测详情页面：交易记录表格显示买入/卖出理由
- [ ] 数据库 schema：backtestTrades 表添加 buyReason/sellReason 字段

## 多策略对比 + 股票池筛选 + 交易理由（第五轮）
- [x] stockPool.ts：添加大/中/小盘分类函数和多维筛选工具
- [x] backtestEngine.ts：交易记录已有 reason/signalType 字段，已在前端展示
- [x] drizzle/schema.ts：backtestTrades 表已有 reason/signalType 字段，无需新增
- [x] routers.ts：添加 backtest.compareStrategies 路由（并行运行多策略）
- [x] routers.ts：添加 backtest.compareRecords 路由（历史记录对比）
- [x] BacktestPage.tsx：多维筛选面板（行业/市值/自选）
- [x] BacktestPage.tsx：多策略对比面板（勾选策略 + 并排结果表格 + 收益曲线对比图）
- [x] BacktestPage.tsx：历史记录对比功能（勾选多条记录 + 参数/条件对比表格）
- [x] BacktestDetailPage.tsx：交易记录显示信号类型 + 买卖理由（悬停显示完整理由）

## 第六轮：止盈止损优化 + 股票池多选叠加 + 缓存增量
- [x] 策略参数：止盈止损支持"不限"（null 表示不设硬性止盈止损，按策略信号出场）
- [x] 策略参数：止盈上限从100%提升到300%，支持手动输入更高值（✎按钮）
- [x] 策略参数：每个策略独立设置移动止盈止损（trailingStop）或关闭（null）
- [x] 回测引擎：止盈止损为null时跳过硬性止盈止损，只按策略信号操作（已验证）
- [x] stockPool.ts：多板块叠加筛选（可同时选多个行业，AND逻辑）
- [x] stockPool.ts：市值分级6档（微盘0-10亿/小盘10-100亿/中盘100-500亿/大盘500-1000亿/超大盘1000-5000亿/独角兽5000亿+）多选叠加
- [x] 前端参数调优面板：止盈止损"不限"开关 + 止盈最高300%可手动输入
- [x] 前端参数调优面板：移动止损开关（每个策略独立，null=关闭）
- [x] 前端股票池筛选：多板块多选 + 市值6档多选叠加（按钮组，支持预览）
- [x] compareRecords 接口：返回 stopLoss/takeProfit/trailingStop 字段
- [x] cacheManager.ts v4：增量更新已实现（已缓存历史数据固定保存，只补充新K线）
- [ ] 数据源补充方案：排查 Stooq/Yahoo/MarketStack 失败原因，考虑添加备用源

## 第七轮：对比表格止盈止损列 + 股票池预设 + 数据源手动测试
- [x] BacktestPage.tsx：历史记录对比表格止损/止盈/移动止损列（已存在，数据格式已验证）
- [x] BacktestPage.tsx：股票池筛选预设保存/加载（localStorage，支持命名、删除，预设面板内嵌在筛选卡片中）
- [x] marketData.ts：添加 testDataSource 导出函数（映射各源fetch函数，拉取30天日K线验证）
- [x] routers.ts：添加 health.testSource mutation 接口
- [x] HealthPage.tsx：重构为 SourceCard 组件，每个数据源卡片添加「测试」按钮，显示 K线数/耗时/错误信息

## 第八轮：回测启动反馈修复
- [x] BacktestPage.tsx：单策略回测 onSuccess 添加 toast 提示"回测已启动"，600ms 后跳转到详情页
- [x] BacktestPage.tsx：多策略对比 onSuccess 添加 toast 提示已启动数量，自动切换到历史记录 Tab
- [x] BacktestPage.tsx：将 Tabs 改为受控模式（activeConfigTab state），支持代码自动切换 Tab
