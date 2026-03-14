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
