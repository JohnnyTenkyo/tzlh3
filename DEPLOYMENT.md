# 量化回测平台 (tzlh-quant) - 完整部署指南

## 📋 项目概述

**量化回测平台 - 黄蓝梯子策略** 是一个专业的美股量化回测系统，支持 6 种交易策略、多数据源集成、AI 智能分析、缓存预热加速等功能。

### 核心特性
- ✅ 6 种交易策略（黄蓝梯子、MACD、RSI、布林带、ATR、CD 策略）
- ✅ 多数据源集成（Stooq/Tiingo/Alpaca 等 9 个源）
- ✅ Gemini AI + OpenAI 双 AI 智能分析
- ✅ 793 只美股股票池 + 行业分类 + 市值分级
- ✅ 缓存预热加速（10-100 倍速度提升）
- ✅ 参数可视化调优 + 多策略对比
- ✅ 实时监控 + 交易日志导出

---

## 🚀 快速部署

### 部署平台：Manus
本项目已部署在 **Manus 平台**，无需自己购买服务器。

**部署优势：**
- ✅ 零服务器成本（Manus 托管）
- ✅ 自动 HTTPS + CDN 加速
- ✅ 数据库自动备份
- ✅ 一键发布 + 版本管理
- ✅ 自定义域名支持

---

## 💰 运维成本分析

### 完全免费方案（推荐）

| 组件 | 方案 | 成本 | 说明 |
|------|------|------|------|
| **托管** | Manus 平台 | ¥0 | 免费托管，无需购买服务器 |
| **数据库** | MySQL/TiDB | ¥0 | Manus 提供免费数据库 |
| **K线数据源** | Stooq + Tiingo | ¥0 | 完全免费，无限制 |
| **AI 分析** | Gemini AI | ¥0 | 免费额度充足（日常使用无压力） |
| **备用 AI** | OpenAI | ¥0 | 可选配置，用户自带 API Key |
| **域名** | manus.space | ¥0 | 免费二级域名 |
| **SSL 证书** | Let's Encrypt | ¥0 | 自动配置 |
| **CDN** | Manus CDN | ¥0 | 内置加速 |
| **总成本** | **¥0/月** | **完全免费** | 无隐藏费用 |

### 可选付费方案（增强功能）

如果需要更多数据源或更高的 API 限额：

| API 提供商 | 免费额度 | 付费价格 | 用途 |
|-----------|--------|--------|------|
| **Alpaca** | 200 次/分钟 | $0（免费） | 美股实时数据 |
| **Finnhub** | 60 次/分钟 | $9.99/月起 | 财务数据补充 |
| **Polygon.io** | 5 次/分钟 | $29/月起 | 高精度数据 |
| **Twelve Data** | 800 次/天 | $9.99/月起 | 备用数据源 |
| **MarketStack** | 100 次/月 | $9.99/月起 | 历史数据补充 |

**建议：** 使用完全免费方案即可满足日常回测需求。

---

## 🔑 API 密钥配置

### 1. 完全免费数据源（无需密钥）

#### Stooq（推荐）
- **特点**：完全免费，无限制，数据质量好
- **覆盖**：793 只美股 + 全球股票
- **延迟**：15 分钟延迟
- **配置**：无需 API Key，已内置
- **调用示例**：
```bash
curl "https://stooq.com/q/l/?s=AAPL&f=sd2t2ohlcv&h&e=json"
```

#### Tiingo（推荐）
- **特点**：免费额度充足，数据准确
- **覆盖**：美股 + 加密货币
- **限额**：5,000 次/月（足够日常使用）
- **配置**：需要 API Key（免费申请）
- **申请地址**：https://www.tiingo.com/
- **调用示例**：
```bash
curl "https://api.tiingo.com/tiingo/daily/AAPL?token=YOUR_API_KEY"
```

### 2. 可选付费数据源

#### Alpaca（可选）
- **特点**：美股实时数据，支持期权
- **限额**：200 次/分钟（免费）
- **配置**：需要 API Key + Secret Key
- **申请地址**：https://alpaca.markets/
- **环境变量**：
```bash
ALPACA_API_KEY=your_key_here
ALPACA_SECRET_KEY=your_secret_here
ALPACA_ENDPOINT=https://data.alpaca.markets/v2
```

#### Finnhub（可选）
- **特点**：财务数据 + 新闻
- **限额**：60 次/分钟（免费）
- **配置**：需要 API Key
- **申请地址**：https://finnhub.io/
- **环境变量**：
```bash
FINNHUB_API_KEY=your_key_here
```

#### Polygon.io（可选）
- **特点**：高精度美股数据
- **限额**：5 次/分钟（免费）
- **配置**：需要 API Key
- **申请地址**：https://polygon.io/
- **环境变量**：
```bash
POLYGON_API_KEY=your_key_here
```

#### Twelve Data（可选）
- **特点**：全球股票 + 加密货币
- **限额**：800 次/天（免费）
- **配置**：需要 API Key
- **申请地址**：https://twelvedata.com/
- **环境变量**：
```bash
TWELVE_DATA_API_KEY=your_key_here
```

#### MarketStack（可选）
- **特点**：历史数据补充
- **限额**：100 次/月（免费）
- **配置**：需要 API Key
- **申请地址**：https://marketstack.com/
- **环境变量**：
```bash
MARKETSTACK_API_KEY=your_key_here
```

### 3. AI 分析配置

#### Gemini AI（推荐 - 完全免费）
- **特点**：Google 官方 AI，免费额度充足
- **限额**：每分钟 60 次请求（足够日常使用）
- **配置**：需要 API Key
- **申请地址**：https://ai.google.dev/
- **环境变量**：
```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
```

#### OpenAI（可选 - 备用）
- **特点**：备用 AI，Gemini 失败时自动切换
- **限额**：按使用量计费（可选）
- **配置**：需要 API Key
- **申请地址**：https://platform.openai.com/
- **环境变量**：
```bash
OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://openfly.cc/v1
OPENAI_MODEL=gpt-4o-mini
```

---

## 📊 数据源对比表

| 数据源 | 成本 | 限额 | 数据质量 | 延迟 | 推荐指数 |
|-------|------|------|--------|------|--------|
| **Stooq** | ¥0 | 无限 | ⭐⭐⭐⭐ | 15分钟 | ⭐⭐⭐⭐⭐ |
| **Tiingo** | ¥0 | 5000次/月 | ⭐⭐⭐⭐⭐ | 实时 | ⭐⭐⭐⭐⭐ |
| **Alpaca** | ¥0 | 200次/分钟 | ⭐⭐⭐⭐⭐ | 实时 | ⭐⭐⭐⭐ |
| **Finnhub** | ¥9.99/月 | 60次/分钟 | ⭐⭐⭐⭐ | 实时 | ⭐⭐⭐ |
| **Polygon.io** | ¥29/月 | 5次/分钟 | ⭐⭐⭐⭐⭐ | 实时 | ⭐⭐⭐ |
| **Twelve Data** | ¥9.99/月 | 800次/天 | ⭐⭐⭐⭐ | 实时 | ⭐⭐⭐ |
| **MarketStack** | ¥9.99/月 | 100次/月 | ⭐⭐⭐ | 1小时延迟 | ⭐⭐ |

**推荐组合（完全免费）：**
- 主数据源：**Stooq**（无限制，数据稳定）
- 备用数据源：**Tiingo**（免费额度充足，数据准确）
- AI 分析：**Gemini AI**（完全免费，效果好）

---

## 🔐 登录系统

### 简易用户名/密码登录

本项目使用**简易用户名/密码登录系统**，无需 OAuth，更加轻量化。

#### 用户注册
```bash
POST /api/trpc/auth.register
Content-Type: application/json

{
  "username": "trader123",
  "password": "your_secure_password"
}
```

#### 用户登录
```bash
POST /api/trpc/auth.login
Content-Type: application/json

{
  "username": "trader123",
  "password": "your_secure_password"
}
```

#### 修改密码
```bash
POST /api/trpc/auth.changePassword
Content-Type: application/json

{
  "oldPassword": "old_password",
  "newPassword": "new_password"
}
```

#### 登出
```bash
POST /api/trpc/auth.logout
```

#### 获取当前用户
```bash
GET /api/trpc/auth.me
```

### 密码安全建议
- ✅ 使用至少 8 个字符的密码
- ✅ 包含大小写字母、数字、特殊符号
- ✅ 定期更改密码
- ✅ 不要使用简单密码（如 123456、password）

---

## 🛠️ 环境变量配置

### 必需环境变量

```bash
# 数据库连接（Manus 自动配置）
DATABASE_URL=mysql://user:pass@host:3306/db_name

# JWT 密钥（Manus 自动生成）
JWT_SECRET=your_jwt_secret_key_here

# 应用配置（Manus 自动配置）
VITE_APP_ID=your_app_id
VITE_APP_TITLE=量化回测平台
VITE_APP_LOGO=https://your-logo-url

# 内置 API（Manus 自动配置）
BUILT_IN_FORGE_API_URL=https://api.manus.im/forge
BUILT_IN_FORGE_API_KEY=your_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im/forge
VITE_FRONTEND_FORGE_API_KEY=your_frontend_key
```

### 可选环境变量（免费数据源）

```bash
# Tiingo（推荐）
TIINGO_API_KEY=your_tiingo_key

# Alpaca（可选）
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
ALPACA_ENDPOINT=https://data.alpaca.markets/v2

# Finnhub（可选）
FINNHUB_API_KEY=your_finnhub_key

# Polygon.io（可选）
POLYGON_API_KEY=your_polygon_key

# Twelve Data（可选）
TWELVE_DATA_API_KEY=your_twelve_data_key

# MarketStack（可选）
MARKETSTACK_API_KEY=your_marketstack_key
```

### AI 配置环境变量

```bash
# Gemini AI（推荐 - 完全免费）
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash
GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/

# OpenAI（可选 - 备用）
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://openfly.cc/v1
OPENAI_MODEL=gpt-4o-mini
```

---

## 📦 API 调用示例

### 1. 获取 K 线数据

```bash
# 获取 AAPL 日 K 线
curl -X POST "https://your-domain/api/trpc/chart.getCandles" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "timeframe": "1d",
    "limit": 100
  }'

# 响应示例
{
  "result": {
    "data": [
      {
        "time": 1704067200000,
        "open": 189.95,
        "high": 191.50,
        "low": 189.50,
        "close": 191.35,
        "volume": 52000000
      }
    ]
  }
}
```

### 2. 回测策略

```bash
# 创建回测
curl -X POST "https://your-domain/api/trpc/backtest.create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "strategy": "huanglantizi",
    "symbols": ["AAPL", "MSFT", "GOOGL"],
    "startDate": "2023-01-01",
    "endDate": "2024-01-01",
    "initialCapital": 100000,
    "stopLoss": 0.05,
    "takeProfit": 0.10
  }'

# 响应示例
{
  "result": {
    "data": {
      "id": "backtest_123",
      "status": "running",
      "progress": 0
    }
  }
}
```

### 3. 获取回测结果

```bash
# 获取回测详情
curl -X GET "https://your-domain/api/trpc/backtest.detail?id=backtest_123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 响应示例
{
  "result": {
    "data": {
      "id": "backtest_123",
      "strategy": "huanglantizi",
      "totalReturn": 0.2534,
      "winRate": 0.65,
      "maxDrawdown": 0.1234,
      "trades": [
        {
          "symbol": "AAPL",
          "entryPrice": 150.00,
          "exitPrice": 155.00,
          "profit": 5.00,
          "profitRate": 0.0333
        }
      ]
    }
  }
}
```

### 4. 缓存预热

```bash
# 开始缓存预热
curl -X POST "https://your-domain/api/trpc/cache.warmDaily" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "symbols": ["AAPL", "MSFT", "GOOGL"],
    "timeframe": "1d"
  }'

# 获取缓存状态
curl -X GET "https://your-domain/api/trpc/cache.status" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🚀 部署步骤

### 1. 在 Manus 平台创建项目

1. 登录 Manus 平台（https://manus.im）
2. 点击"创建项目"
3. 选择"Web App Template (tRPC + Manus Auth + Database)"
4. 填写项目名称：`tzlh-quant`
5. 点击"创建"

### 2. 配置环境变量

1. 进入项目设置 → Secrets
2. 添加以下环境变量：

```bash
# 必需
TIINGO_API_KEY=your_tiingo_key
GEMINI_API_KEY=your_gemini_key

# 可选
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
FINNHUB_API_KEY=your_finnhub_key
POLYGON_API_KEY=your_polygon_key
TWELVE_DATA_API_KEY=your_twelve_data_key
MARKETSTACK_API_KEY=your_marketstack_key
OPENAI_API_KEY=your_openai_key
```

### 3. 部署代码

```bash
# 克隆项目
git clone https://github.com/your-repo/tzlh-quant.git
cd tzlh-quant

# 安装依赖
pnpm install

# 运行开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

### 4. 发布到 Manus

1. 在项目目录运行：`pnpm build`
2. 进入 Manus 管理面板
3. 点击"Publish"按钮
4. 选择部署环境和版本
5. 点击"发布"

### 5. 配置自定义域名（可选）

1. 进入项目设置 → Domains
2. 添加自定义域名
3. 按照 DNS 配置指引完成域名绑定
4. 等待 SSL 证书自动配置（通常 5-10 分钟）

---

## 📈 性能优化建议

### 1. 缓存预热加速

```bash
# 预热微盘股（254 只）
POST /api/trpc/cache.warmDaily
{
  "symbols": "micro",  // 微盘股
  "timeframe": "1d"
}

# 预热大盘股（150 只）
POST /api/trpc/cache.warmDaily
{
  "symbols": "large",  // 大盘股
  "timeframe": "1d"
}
```

### 2. 数据库优化

```sql
-- 创建索引加速查询
CREATE INDEX idx_cache_symbol ON historical_candle_cache(symbol, timeframe);
CREATE INDEX idx_backtest_user ON backtest_sessions(user_id, created_at);
CREATE INDEX idx_trade_session ON backtest_trades(session_id);
```

### 3. 并发限制

- 回测并发数：最多 10 个同时运行
- 缓存预热并发数：8 路并发
- API 请求限流：100 次/秒

---

## 🔍 监控和日志

### 查看服务器日志

```bash
# Manus 平台自动提供日志面板
# 进入项目 → Dashboard → Logs
```

### 关键指标监控

| 指标 | 正常范围 | 告警阈值 |
|------|--------|--------|
| **API 响应时间** | < 500ms | > 2s |
| **缓存命中率** | > 80% | < 50% |
| **数据库连接** | < 10 | > 20 |
| **内存使用** | < 500MB | > 1GB |
| **CPU 使用率** | < 50% | > 80% |

---

## 🆘 故障排查

### 问题 1：K 线数据获取失败

**症状**：回测时提示"无法获取数据"

**解决方案**：
1. 检查数据源 API Key 是否正确
2. 检查 API 限额是否超出
3. 尝试切换数据源（Stooq → Tiingo）
4. 查看服务器日志获取详细错误信息

### 问题 2：AI 分析不工作

**症状**：AI 分析返回错误

**解决方案**：
1. 检查 Gemini API Key 是否正确
2. 检查 API 限额是否超出
3. 启用 OpenAI 备用方案
4. 查看 AI 配置页面的连接状态

### 问题 3：缓存预热卡住

**症状**：缓存预热进度不动

**解决方案**：
1. 检查网络连接
2. 检查数据源是否可用
3. 尝试减少预热股票数量
4. 清空缓存重新开始

### 问题 4：登录失败

**症状**：用户名/密码登录失败

**解决方案**：
1. 确认用户名和密码正确
2. 检查用户是否已注册
3. 查看数据库连接是否正常
4. 清除浏览器 Cookie 重试

---

## 📞 技术支持

### 获取帮助

1. **查看文档**：https://docs.manus.im/
2. **提交问题**：https://help.manus.im/
3. **社区论坛**：https://community.manus.im/
4. **邮件支持**：support@manus.im

---

## 📝 更新日志

### v1.0.0 (2026-03-25)

- ✅ 完成项目初始化和所有核心功能
- ✅ 集成 9 个数据源
- ✅ 实现 6 种交易策略
- ✅ 集成 Gemini AI + OpenAI 双 AI
- ✅ 完成缓存预热优化
- ✅ 实现简易登录系统
- ✅ 生成完整部署文档

---

## 📄 许可证

MIT License - 可自由使用和修改

---

**最后更新**：2026-03-25  
**维护者**：Manus 团队  
**项目状态**：✅ 生产就绪
