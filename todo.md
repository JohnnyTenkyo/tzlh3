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

## 第九轮：缓存预热页面板块/市值筛选 + Alpaca API 更新
- [x] CachePage.tsx：添加行业板块多选筛选（同 BacktestPage 逻辑）
- [x] CachePage.tsx：添加市值区间多选筛选（同 BacktestPage 逻辑）
- [x] CachePage.tsx：已选条件以标签形式显示，支持单个删除
- [x] CachePage.tsx：预热按钮显示筛选后的股票数量
- [x] env.ts：添加 alpacaEndpoint 字段（默认 https://data.alpaca.markets/v2）
- [x] marketData.ts：更新 fetchAlpacaCandles 和 fetchAlpacaBatchCandles 使用 ENV.alpacaEndpoint
- [x] Alpaca API 密钥和 Endpoint 已更新（webdev_request_secrets）

## 第十轮：缓存预热进度持久化 + 统计面板 + 定时任务 + 回测超时修复
- [x] drizzle/schema.ts：添加 warmingProgress 表（跟踪预热进度）
- [x] drizzle/schema.ts：添加 warmingStats 表（统计数据）
- [x] drizzle/schema.ts：添加 scheduledWarmingTasks 表（定时任务）
- [x] server/db.ts：添加 warmingProgress/warmingStats/scheduledTasks 的 CRUD 函数（所有函数实现）
- [x] server/routers.ts：添加 cache 路由的 6 个新接口（resume/stats/createScheduledTask/listScheduledTasks/updateScheduledTask/deleteScheduledTask）
- [x] server/cacheScheduler.ts：后台定时任务执行引擎（cron 表达式解析、任务执行、进度记录）
- [x] server/backtestEngine.ts：添加全局 5 分钟超时、详细日志、单股票处理超时检查
- [ ] CachePage.tsx：前端 UI 更新（进度条、统计卡片、定时任务管理面板）
- [ ] server/_core：初始化定时任务调度器（在服务器启动时调用）

## 第十一轮：回测时间选择修复 + 快速选择按钮
- [ ] BacktestPage.tsx：修复日期选择无法修改的问题
- [ ] BacktestPage.tsx：添加自定义日期范围输入（开始日期、结束日期）
- [ ] BacktestPage.tsx：添加快速选择按钮（最近一年、最近半年、最近三个月）


## 第十一轮：回测时间选择修复 + 快速选择按钮
- [x] BacktestPage.tsx：修复日期选择无法修改的问题（endDate 从 readOnly 改为可编辑）
- [x] BacktestPage.tsx：添加自定义日期范围输入（开始日期、结束日期）
- [x] BacktestPage.tsx：添加快速选择按钮（最近一年、最近半年、最近三个月，带 toast 提示）



## 第十二轮：微盘股缓存修复 + 交易手续费 + 实时监控面板 + AI 配置管理
- [x] 排查并修复微盘股缓存卡住问题（getCandlesFromCache 添加 LIMIT 10000）
- [x] drizzle/schema.ts：添加 aiConfigs 表、backtestSessions 和 backtestTrades 添加手续费字段
- [x] server/db.ts：添加 AI 配置 CRUD 函数
- [x] server/routers.ts：添加 ai 路由（getConfigs、createConfig、updateConfig、deleteConfig、setDefault）
- [x] server/backtestEngine.ts：添加手续费字段到 TradeRecord 接口
- [x] BacktestDetailPage.tsx：交易日志表格添加佣金、平台费列
- [x] 创建 AIConfigPanel 组件（添加、编辑、删除、设置默认 AI 配置）
- [x] BacktestPage.tsx：添加 AI 配置 Tab，集成 AIConfigPanel 组件
- [ ] 实时回测监控面板：WebSocket 推送交易日志（可先使用 polling 替代）


## 第十三轮：手续费完整集成 + 实时监控面板 + AI 自动切换
- [x] server/backtestEngine.ts：并发加载数据（10并发）+ 优化平仓逻辑（使用已加载数据）
- [x] server/backtestEngine.ts：实现完整的手续费计算逻辑（佣金 + 平台费）
- [x] server/backtestEngine.ts：保存交易手续费到数据库（commissionFee + platformFee）
- [x] BacktestDetailPage.tsx：实时 polling 查询交易日志，显示实时回测进度
- [x] BacktestDetailPage.tsx：添加进度条、当前处理股票名称、预计完成时间
- [x] geminiStrategy.ts：实现 AI 自动切换逻辑（主 AI 失败时切换到备用 AI）
- [x] server/_core/index.ts：在服务器启动时初始化缓存调度器
- [x] server/tigerTradeFees.test.ts：添加手续费计算测试（全部测试通过）


## 第十四轮：AI 配置管理面板前端实现
- [x] client/src/components/AIConfigPanel.tsx：完全重写组件，支持编辑功能和更好的 UI
- [x] client/src/pages/SettingsPage.tsx：创建设置页面，集成 AI 配置管理面板
- [x] client/src/App.tsx：添加 SettingsPage 导入和 /settings 路由
- [x] client/src/components/DashboardLayout.tsx：添加设置菜单项到侧边栏
- [x] 前端测试：验证添加、编辑、删除、设置默认 AI 配置功能正常工作


## 第十五轮：股票数据源自定义配置 + AI 配置验证 + 回测 AI 选择
- [x] drizzle/schema.ts：添加 customDataSources 表（用户自定义数据源配置）
- [x] server/db.ts：添加数据源 CRUD 函数（create/read/update/delete）
- [x] server/routers.ts：添加 datasource 路由（getConfigs/createConfig/updateConfig/deleteConfig）
- [x] server/routers.ts：添加 ai.testConnection mutation（验证 AI 配置是否有效）
- [x] client/src/components/DataSourcePanel.tsx：创建数据源管理面板组件
- [x] client/src/pages/SettingsPage.tsx：集成数据源管理面板和 AI 验证功能
- [x] client/src/pages/BacktestPage.tsx：添加 AI 提供商选择下拉菜单
- [x] 所有测试通过（14/14）、TypeScript 编译无错误、功能已验证


## 第十六轮：数据源健康页面集成 AI 和数据源管理
- [x] HealthPage.tsx：重写集成 AI 配置和数据源管理功能
- [x] HealthPage.tsx：AI 服务状态卡片上添加编辑、删除、添加按钮
- [x] HealthPage.tsx：每个数据源卡片上添加编辑、删除、添加按钮
- [x] HealthPage.tsx：使用 AlertDialog 显示删除确认对话框（替代原生 confirm()）
- [x] server/routers.ts：修复 datasource.deleteConfig 路由支持删除内置数据源
- [x] 浏览器测试：验证添加 AI、添加数据源对话框正常打开，删除功能正常工作
- [x] 所有测试通过（14/14）、TypeScript 编译无错误

## 第十七轮：微盘股缓存修复
- [x] 修复微盘股缓存功能 - 缓存结束后缓存数量没有增加（修复 updateCacheMetadata 中的 COUNT 返回值处理）

## 第十八轮：登录系统改造和完整部署文档
- [x] 修改登录系统从 OAuth 改为用户名/密码登录（已实现）
- [x] 生成完整的项目部署文档（API 配置、数据源、成本分析）
- [ ] 保存检查点并提供发布链接

## 第十九轮：回测卡住和缓存问题排查

- [x] 排查回测卡住原因 - 检查超时设置和并发限制（修复了超时设置）
- [x] 修复缓存更新不完整 - 缓存 787/793 股票，缺少 6 只股票（修复 updateCacheMetadata COUNT 返回值处理）
- [x] 修复缓存后回测依然失败 - 检查缓存数据是否被正确使用

## 第二十轮：失败股票单独缓存 + 回测性能优化

- [x] 在缓存管理页面显示失败/未缓存的股票列表（已实现 failedSymbols 路由）
- [x] 实现单独缓存失败股票的功能（已添加 API 端点）
- [x] 优化回测引擎 - 检查是否正确使用缓存数据（已添加缓存预加载）
- [x] 分析回测耗时原因 - 缓存后为什么仍然很慢（已修复 API 错误）

## 第二十一轮：缓存管理页面和回测性能问题

- [ ] 修复缓存管理页面 - 未缓存股票卡片没有显示
- [ ] 添加单独缓存失败股票的按钮
- [ ] 修复回测加载数据卡住问题 - 检查并发限制和超时设置

## 第二十二轮：缓存失败股票删除 + 缓存优先策略 + 后台持久性

- [x] CachePage.tsx：未缓存股票列表添加单独删除按钮（删除失败/退市股票）
- [x] server/routers.ts：添加 cache.removeFailedSymbol 路由（从 stockPool 中删除指定股票）
- [x] server/db.ts：添加 removeSymbolFromPool 函数
- [x] backtestEngine.ts：优先调用缓存而不是实时 API（getCandlesWithCache 优先，失败才调用 API）
- [x] server/_core/index.ts：防止后台进程睡眠（定时心跳检测，保持活跃）
- [x] 完整回测测试验证（测试缓存优先、后台持久性、流式加载）
- [x] 保存检查点并提供发布按钮


## 第二十三轮：缓存删除 UI 修复 + 多策略参数微调 + 回测报告细化 + 策略优化

- [x] 修复缓存删除功能 - 删除失败/未缓存股票时实际没有删除
- [x] 修复缓存管理页面 UI - 点击股票后的 UI 显示问题
- [x] 多策略参数微调 - 每个策略独立的参数调优（不只是第一个）
- [x] 多策略滑点设置 - 每个策略独立的滑点配置
- [ ] 回测报告 - 添加月度收益热力图
- [ ] 回测报告 - 交易明细添加盈利/亏损交易列
- [ ] 回测报告 - 交易明细支持自定义排序
- [ ] 回测报告 - 支持 Excel 下载
- [ ] 加入胜率更高的策略（新増 1-2 个策略）
- [x] UI 优化 - 回测报告标题下的股票池缩略显示
- [x] 完整测试验证
- [x] 保存检查点并提供发布按钮


## 第二十四轮：交易明细增强 + 月度收益热力图 + 新策略集成

- [ ] BacktestDetailPage.tsx：交易明细表格添加排序功能（按日期、收益、手续费等排序）
- [ ] BacktestDetailPage.tsx：交易明细表格添加筛选功能（按交易类型、收益/亏损、日期范围筛选）
- [ ] BacktestDetailPage.tsx：交易明细表格支持 Excel 导出（包含所有列数据）
- [ ] BacktestDetailPage.tsx：添加月度收益热力图（按月份统计收益率、胜率、最大回撤）
- [ ] server/backtestEngine.ts：添加 VAMR 策略（波动率调整后的动量反转：QQQ 大盘过滤+RS90 动量选股+RSI(4)超卖买入+ATR 动态止损）
- [ ] server/backtestEngine.ts：添加 RAVTS 策略（市场状态调整趋势得分：SPY 大盘过滤+EMA 斜率趋势+量能确认+ATR 动态止损止盈）
- [ ] server/backtestEngine.ts：添加 RSI 反转策略（RSI 超卖反转：RSI(14)超卖+价格确认+ATR 止损）
- [ ] server/backtestEngine.ts：添加 MACD 背离策略（MACD 背离交易：价格新低但 MACD 不新低+信号线交叉+ATR 止损）
- [ ] shared/const.ts：添加 4 个新策略到 STRATEGY_CONFIGS
- [ ] BacktestPage.tsx：策略选择面板显示 4 个新策略
- [ ] 完整测试验证（测试新策略、排序、筛选、热力图、Excel 导出）
- [ ] 保存检查点并提供发布按钮


## Bug 修复：缓存删除失败

- [x] 调查缓存删除失败原因（检查 removeFailedSymbol API 实现）
- [x] 修复删除逻辑（可能是排除股票表未正确创建或 API 响应错误）
- [x] 测试缓存删除功能


## 第二十五轮：新策略集成 + 月度热力图 + Excel导出增强

- [x] server/backtestEngine.ts：添加 VAMR 策略（波动率调整动量反转）
- [x] server/backtestEngine.ts：添加 RAVTS 策略（市场状态调整趋势）
- [x] server/backtestEngine.ts：添加 RSI反转策略
- [x] server/backtestEngine.ts：添加 MACD背离策略
- [ ] client/src/pages/BacktestDetailPage.tsx：添加月度收益热力图组件
- [ ] server/routers.ts：添加月度统计 API（收益率、胜率、最大回撤）
- [ ] client/src/pages/BacktestDetailPage.tsx：添加 Excel 导出功能
- [ ] server/routers.ts：实现 Excel 导出 API（交易记录、月度统计、策略参数）
- [ ] 完整测试验证（测试新策略、热力图、Excel导出）
- [ ] 保存检查点并提供发布按钮


## 第二十六轮：Bug 修复 + 功能增强

### 关键 Bug 修复
- [x] Bug 1：多策略选择时，参数调优设置的止盈止损在实际回测中未应用
- [x] Bug 2：缓存删除显示成功但未真正删除，股票池总量也未变少

### 功能增强
- [ ] 月度收益热力图 - 按月份统计收益率、胜率、最大回撤
- [ ] Excel 导出功能 - 完整交易记录、月度统计、策略参数
- [ ] 策略性能对标表 - 新策略与现有策略的性能对比
- [ ] 完整测试验证
- [ ] 保存检查点并提供发布按钮


## 第二十七轮：月度热力图 + Excel导出 + 策略对标

### 月度收益热力图
- [x] server/routers.ts：在 detail 路由中添加月度统计计算
- [ ] client/src/pages/BacktestDetailPage.tsx：添加月度热力图组件（用颜色表示表现）

### Excel 导出增强
- [ ] server/routers.ts：添加 exportBacktestExcel API（交易记录、月度统计、策略参数）
- [ ] client/src/pages/BacktestDetailPage.tsx：添加 Excel 导出按钮

### 策略性能对标
- [ ] client/src/pages/BacktestPage.tsx：在对比模式中添加策略性能对标表
- [ ] 显示新旧策略的收益率、胜率、最大回撤对比

### 完整测试
- [ ] 测试月度热力图显示
- [ ] 测试 Excel 导出功能
- [ ] 测试策略性能对标表


## 第二十八轮：缓存失败股票显示 + 月度盈亏热力图

### 缓存失败股票显示问题
- [x] CachePage.tsx：修复缓存后的失败股票未显示在“未缓存和失败”栏目中
- [x] 确保缓存失败的股票能够显示在列表中，支持单独缓存

### 月度盈亏热力图
- [x] BacktestDetailPage.tsx：参考 meigulianghua3.6 样式，添加月度热力图组件
- [x] 显示盈利/亏损比例和金额
- [x] 用颜色深浅表示各月表现（绿色盈利、红色亏损）

### 完整测试
- [x] 测试缓存失败股票显示
- [x] 测试月度热力图显示


## 第二十九轮：新策略参数 Bug 修复 + UI 优化 + 参数说明完善

### 关键 Bug 修复
- [ ] BacktestPage.tsx：修复新策略（VAMR、RAVTS、RSI反转、MACD背离）参数调优出现 ERROR 的问题
- [ ] 检查 backtestEngine.ts 中新策略的参数定义是否完整

### UI 优化
- [ ] BacktestPage.tsx：新策略前面加彩色点标记（与其他策略一致）
- [ ] DashboardLayout.tsx 或 App.tsx：取消侧栏"K线图表"板块
- [ ] SettingsPage.tsx：将 AI 配置从回测中心移到设置页面

### 参数说明完善
- [ ] 为每个策略编写详细的参数说明文档
- [ ] 标准策略 (4321)：CD评分阈值、评分标准、参数含义
- [ ] VAMR 策略：波动率调整、动量反转参数说明
- [ ] RAVTS 策略：市场状态调整、趋势参数说明
- [ ] RSI 反转策略：RSI 参数、超卖阈值说明
- [ ] MACD 背离策略：MACD 参数、背离判断标准说明

### 仓位调整 UI 改进
- [ ] BacktestPage.tsx：最大仓位比例改为输入+拖动形式（0-100%）

### 完整测试
- [ ] 测试新策略参数调优功能
- [ ] 测试 UI 优化效果
- [ ] 测试参数说明显示
- [ ] 测试仓位调整 UI
