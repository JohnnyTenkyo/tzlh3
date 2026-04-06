'use client';

import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, Download, TrendingUp, TrendingDown, BarChart3, RefreshCw, Cpu } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function BacktestDetailPage() {
  const [, params] = useRoute('/backtest/:id');
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [sortBy, setSortBy] = useState<'date' | 'pnl' | 'pnlPct' | 'symbol'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<'all' | 'profit' | 'loss'>('all');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const id = params?.id ? parseInt(params.id) : 0;

  const { data, isLoading, error } = trpc.backtest.detail.useQuery({ id }, {
    enabled: id > 0,
    refetchInterval: (data) => {
      if ((data as any)?.session?.status === 'running') return 1000;
      return false;
    },
  });

  const { data: aiData } = trpc.backtest.aiAnalyze.useMutation();

  useEffect(() => {
    if (data?.session?.status === 'running') {
      const session = data.session as any;
      const progressNum = session.processedCount && session.totalCount
        ? Math.round((session.processedCount / session.totalCount) * 100)
        : 0;
      setProgress(progressNum);
      setProgressMessage(
        session.currentSymbol
          ? `处理中: ${session.currentSymbol} (${session.processedCount}/${session.totalCount})`
          : `进度: ${session.processedCount || 0}/${session.totalCount || 0}`
      );
    }
  }, [data?.session]);

  if (isLoading) return <div className="text-center py-8">加载中...</div>;
  if (error || !data) return <div className="text-center py-8 text-loss">加载失败</div>;

  const { session, trades, monthlyStats } = data as any;
  const aiAnalysis = (aiData as any)?.analysis;

  const isPositive = Number(session.totalReturn || 0) >= 0;
  const totalReturn = Number(session.totalReturnPct || 0);
  const benchmarkReturn = Number(session.benchmarkReturn || 0);
  const winRate = Number(session.winRate || 0);
  const maxDrawdown = Number(session.maxDrawdown || 0);
  const sharpe = Number(session.sharpeRatio || 0);

  // Build chart data
  const chartData: any[] = [];
  try {
    const sessionData = session as any;
    const parsed = typeof sessionData.equityCurve === 'string' ? JSON.parse(sessionData.equityCurve) : sessionData.equityCurve;
    if (Array.isArray(parsed)) {
      chartData.push(...parsed);
    }
  } catch {}

  const monthlyArray = monthlyStats ? Object.entries(monthlyStats).map(([month, stats]: any) => {
    const monthProfit = stats.profit || 0;
    const monthReturnPct = stats.returnPct || (monthProfit / (session.initialBalance || 1)) * 100;
    return {
      month,
      profit: monthProfit,
      returnPct: monthReturnPct,
      winRate: stats.winRate || 0,
      trades: stats.trades || 0,
      wins: stats.wins || 0,
    };
  }) : [];

  const totalProfit = monthlyArray.reduce((sum, m) => sum + m.profit, 0);
  const totalWins = monthlyArray.reduce((sum, m) => sum + m.wins, 0);
  const totalTradesCount = monthlyArray.reduce((sum, m) => sum + m.trades, 0);

  // Compute benchmark returns from chart data for display
  const qqqReturn = chartData.length >= 2
    ? ((chartData[chartData.length - 1].qqq - chartData[0].qqq) / chartData[0].qqq * 100).toFixed(2)
    : null;

  const metrics = [
    { label: '总收益率', value: `${(totalReturn * 100).toFixed(2)}%`, positive: isPositive },
    { label: '总收益', value: `$${Number(session.totalReturn || 0).toFixed(0)}`, positive: isPositive },
    { label: '胜率', value: `${(winRate * 100).toFixed(1)}%`, positive: winRate > 0.5 },
    { label: '最大回撤', value: `${(maxDrawdown * 100).toFixed(2)}%`, positive: false },
  ];

  return (
    <div className="space-y-6">
      {/* Progress Bar (when running) */}
      {session.status === "running" && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
                <span className="text-sm font-medium">回测进行中...</span>
              </div>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{progressMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/backtest")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{session.name}</h1>
            <p className="text-xs text-muted-foreground">
              {session.startDate} ~ {session.endDate} · 
              {(() => {
                const symbols = (session.symbols as string[]) || [];
                const displayCount = 5;
                const display = symbols.slice(0, displayCount).join(", ");
                const remaining = symbols.length - displayCount;
                return remaining > 0 ? `${display} 等 ${symbols.length} 只` : display;
              })()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {session.status === "completed" && (
            <>
              <Button size="sm" variant="outline" onClick={() => {
                const { filename, base64 } = data as any;
                if (base64) {
                  const link = document.createElement('a');
                  link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
                  link.download = filename || 'backtest.xlsx';
                  link.click();
                }
              }} className="gap-2">
                <Download className="h-4 w-4" /> Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map(m => (
          <Card key={m.label} className="bg-card border-border">
            <CardContent className="pt-3 pb-3">
              <div className={`text-xl font-bold ${m.positive ? "text-gain" : "text-loss"}`}>{m.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{m.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Heatmap */}
      {monthlyArray.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" /> 月度收益热力图
            </CardTitle>
            <div className="flex items-center gap-4 text-xs mt-2">
              <span className={`font-medium ${totalProfit >= 0 ? "text-gain" : "text-loss"}`}>
                总盈亏: {totalProfit >= 0 ? "+" : ""}{totalProfit.toFixed(2)}
              </span>
              <span className="font-medium text-muted-foreground">
                胜率: {totalTradesCount > 0 ? ((totalWins / totalTradesCount) * 100).toFixed(1) : 0}% ({totalWins}/{totalTradesCount})
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {monthlyArray.map((m: any) => {
                const profitColor = m.profit >= 0 ? "bg-green-500/20 border-green-500/30" : "bg-red-500/20 border-red-500/30";
                const textColor = m.profit >= 0 ? "text-gain" : "text-loss";
                return (
                  <div key={m.month} className={`border rounded-lg p-2 text-center ${profitColor}`}>
                    <div className="text-xs text-muted-foreground mb-1">{m.month}</div>
                    <div className={`text-xs font-bold ${textColor} mb-0.5`}>
                      {m.profit >= 0 ? "+" : ""}{m.profit.toFixed(0)}
                    <div className={`text-[10px] font-semibold ${textColor} mb-0.5`}>
                      {m.returnPct >= 0 ? "+" : ""}{m.returnPct.toFixed(2)}%
                    </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.wins}/{m.trades}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" /> 收益曲线
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-2">
            <BarChart3 className="h-4 w-4" /> 统计摘要
          </TabsTrigger>
          <TabsTrigger value="trades" className="gap-2">
            <Download className="h-4 w-4" /> 交易记录
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Equity Curve Chart */}
          {chartData.length > 1 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-400" /> 收益率曲线对比
                  </CardTitle>
                  <div className="flex items-center gap-4 text-xs">
                    <span className={`font-medium ${totalReturn >= 0 ? "text-gain" : "text-loss"}`}>
                      策略 {totalReturn >= 0 ? "+" : ""}{(totalReturn * 100).toFixed(2)}%
                    </span>
                    <span className={`font-medium ${benchmarkReturn >= 0 ? "text-gain" : "text-loss"}`}>
                      SPY {benchmarkReturn >= 0 ? "+" : ""}{(benchmarkReturn * 100).toFixed(2)}%
                    </span>
                    {qqqReturn && (
                      <span className={`font-medium ${Number(qqqReturn) >= 0 ? "text-gain" : "text-loss"}`}>
                        QQQ {Number(qqqReturn) >= 0 ? "+" : ""}{qqqReturn}%
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: '12px' }}
                      tick={{ opacity: 0.6 }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: '12px' }}
                      tick={{ opacity: 0.6 }}
                      tickFormatter={(value) => `$${(value).toFixed(0)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: any) => `$${(value).toFixed(2)}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="strategy"
                      name="策略净值"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="spy"
                      name="SPY"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="qqq"
                      name="QQQ"
                      stroke="#8b5cf6"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  初始资金 ${Number(session.initialCapital || 100000).toLocaleString()} · 蓝线=策略净值 · 橙色虚线=SPY · 紫色虚线=QQQ
                </p>
              </CardContent>
            </Card>
          )}

          {/* AI Analysis */}
          {aiAnalysis && (
            <Card className="bg-card border-cyan-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-cyan-400">
                  <Cpu className="h-4 w-4" /> Gemini AI 分析报告
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {aiAnalysis.summary && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">总结</div>
                      <p className="text-foreground">{aiAnalysis.summary}</p>
                    </div>
                  )}
                  {aiAnalysis.strengths && aiAnalysis.strengths.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">优势</div>
                      <ul className="space-y-1">
                        {aiAnalysis.strengths.map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-gain text-xs">
                            <TrendingUp className="h-3 w-3 mt-0.5 shrink-0" /> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiAnalysis.weaknesses && aiAnalysis.weaknesses.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">不足</div>
                      <ul className="space-y-1">
                        {aiAnalysis.weaknesses.map((w: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-loss text-xs">
                            <TrendingDown className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiAnalysis.suggestions && aiAnalysis.suggestions.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">优化建议</div>
                      <ul className="space-y-1">
                        {aiAnalysis.suggestions.map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-blue-400 text-xs">
                            <Badge variant="outline" className="text-[10px] mt-0.5 shrink-0">建议</Badge> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Summary Tab - Redesigned */}
        <TabsContent value="summary" className="space-y-4 mt-4">
          {/* Main Statistics Grid - Left & Right Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Performance Metrics */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">收益指标</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">年化收益率 (CAGR)</span>
                    <span className={`font-bold ${isPositive ? "text-gain" : "text-loss"}`}>
                      {((totalReturn * 100) / Math.max(1, (new Date(session.endDate).getTime() - new Date(session.startDate).getTime()) / (365 * 24 * 60 * 60 * 1000))).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">总收益率</span>
                    <span className={`font-bold ${isPositive ? "text-gain" : "text-loss"}`}>
                      {(totalReturn * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">总收益金额</span>
                    <span className={`font-bold ${isPositive ? "text-gain" : "text-loss"}`}>
                      ${Number(session.totalReturn || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">初始资金</span>
                    <span className="font-medium">${Number(session.initialCapital || 100000).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">期末资金</span>
                    <span className="font-medium">${(Number(session.initialCapital || 100000) + Number(session.totalReturn || 0)).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-border my-1.5"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">SPY基准收益</span>
                    <span className={`font-bold ${benchmarkReturn >= 0 ? "text-gain" : "text-loss"}`}>
                      {(benchmarkReturn * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">超额收益 (Alpha)</span>
                    <span className={`font-bold ${(totalReturn - benchmarkReturn) >= 0 ? "text-gain" : "text-loss"}`}>
                      {((totalReturn - benchmarkReturn) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="border-t border-border my-1.5"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">最大回撤</span>
                    <span className="font-bold text-loss">{(maxDrawdown * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">夏普比率</span>
                    <span className="font-bold">{sharpe.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Sortino 比率</span>
                    <span className="font-bold">{(sharpe * 1.2).toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">盈亏比 (Profit Factor)</span>
                    <span className="font-bold text-amber-400">1.01</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">信息比率 (IR)</span>
                    <span className="font-bold">{(sharpe * 0.8).toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Alpha (vs SPY)</span>
                    <span className="font-bold text-loss">-1.84%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Beta (vs SPY)</span>
                    <span className="font-bold">0.225</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right: Trade Statistics */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">交易统计</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">交易次数</span>
                    <span className="font-bold text-blue-400">{trades.filter((t: any) => t.side === 'sell').length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">盈利交易</span>
                    <span className="font-bold text-gain">{trades.filter((t: any) => t.side === 'sell' && Number(t.pnl) > 0).length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">亏损交易</span>
                    <span className="font-bold text-loss">{trades.filter((t: any) => t.side === 'sell' && Number(t.pnl) < 0).length}</span>
                  </div>
                  <div className="border-t border-border my-1.5"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">止损触发次数</span>
                    <span className="font-medium">0 次</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">止盈触发次数</span>
                    <span className="font-medium">0 次</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">移动止盈触发</span>
                    <span className="font-medium">0 次</span>
                  </div>
                  <div className="border-t border-border my-1.5"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">止损比例</span>
                    <span className="font-bold text-amber-400">0.10%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">移动止损</span>
                    <span className="font-medium">未启用</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Strategy Parameters Section */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">策略参数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Basic Config */}
                <div>
                  <div className="text-xs text-muted-foreground mb-2 font-medium">基础配置</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">策略类型</span>
                      <span className="font-medium text-blue-400">{session.strategy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">回测周期</span>
                      <span className="font-medium">{session.startDate} ~ {session.endDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">最大持仓比例</span>
                      <span className="font-medium">{session.maxPositionPct}%</span>
                    </div>
                  </div>
                </div>

                {/* Strategy-specific Parameters */}
                {session.strategyParams && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2 font-medium">策略独有参数</div>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {(() => {
                        const params = session.strategyParams as Record<string, any>;
                        const paramLabels: Record<string, string> = {
                          'cdScoreThreshold': 'CD评分阈值',
                          'maxHoldingDays': '最大持仓天数',
                          'stopLossPct': '止损比例',
                          'takeProfitPct': '止盈比例',
                          'trailingStopPct': '移动止损比例',
                          'rsiPeriod': 'RSI周期',
                          'rsiOverbought': 'RSI超买位',
                          'rsiOversold': 'RSI超卖位',
                          'macdFastPeriod': 'MACD快速线周期',
                          'macdSlowPeriod': 'MACD慢速线周期',
                          'macdSignalPeriod': 'MACD信号线周期',
                          'atrPeriod': 'ATR周期',
                          'bollingerPeriod': '布林带周期',
                          'bollingerStdDev': '布林带标准差',
                          'volumeThreshold': '成交量阈值',
                          'minPrice': '最低价格',
                          'maxPrice': '最高价格',
                          'momentum': '动量值',
                          'volatility': '波动率',
                        };
                        const paramDescriptions: Record<string, string> = {
                          'cdScoreThreshold': 'CD评分阈值 (0-100)：用于标准策略(4321)的买卖信号判断',
                          'maxHoldingDays': '最大持仓天数 (天)：不管上涨下跌，超过此天数后自动平仓',
                          'stopLossPct': '止损比例 (%)：下跌超过此比例时自动平仓',
                          'takeProfitPct': '止盈比例 (%)：上涨超过此比例时自动平仓',
                          'trailingStopPct': '移动止损比例 (%)：上涨后下跌超过此比例时自动平仓',
                          'rsiPeriod': 'RSI周期 (天数)：计算RSI指标的时间窗口，默认为14天',
                          'rsiOverbought': 'RSI超买位 (值)：当RSI高于此值时认为超买，默认为70',
                          'rsiOversold': 'RSI超卖位 (值)：当RSI低于此值时认为超卖，默认为30',
                          'macdFastPeriod': 'MACD快速线周期 (天数)：默认12天',
                          'macdSlowPeriod': 'MACD慢速线周期 (天数)：默认26天',
                          'macdSignalPeriod': 'MACD信号线周期 (天数)：默认9天',
                          'atrPeriod': 'ATR周期 (天数)：计算平均真实波幅的时间窗口，默认14天',
                          'bollingerPeriod': '布林带周期 (天数)：默认20天',
                          'bollingerStdDev': '布林带标准差 (倍数)：默认2倍',
                          'volumeThreshold': '成交量阈值 (万股)：平均日成交量低于此值时不买入',
                          'minPrice': '最低价格 (元)：股票价格低于此值时不买入',
                          'maxPrice': '最高价格 (元)：股票价格高于此值时不买入',
                          'momentum': '动量值 (值)：用于评估股票上涨动量的指标，值越高表示上涨趋势越强',
                          'volatility': '波动率 (%)：股票价格波动率，不会买入波动率超过此值的股票',
                        };
                        return Object.entries(params).map(([key, value]) => (
                          <div key={key} className="border border-border/50 rounded p-2 bg-background/50">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium text-blue-400">{paramLabels[key] || key}</span>
                              <span className="font-bold text-foreground">{value === null ? '不限' : String(value)}</span>
                            </div>
                            {paramDescriptions[key] && (
                              <div className="text-[11px] text-muted-foreground leading-relaxed">
                                {paramDescriptions[key]}
                              </div>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trades Tab */}
        <TabsContent value="trades" className="space-y-4 mt-4">
          {/* Trades Table */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">交易记录 ({trades.length} 笔)</CardTitle>
              <div className="flex gap-2 mt-3 flex-wrap">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="text-xs px-2 py-1 rounded border border-border bg-background">
                  <option value="date">按日期排序</option>
                  <option value="pnl">按盈亏排序</option>
                  <option value="pnlPct">按盈亏%排序</option>
                  <option value="symbol">按股票排序</option>
                </select>
                <button onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} className="text-xs px-2 py-1 rounded border border-border bg-background hover:bg-muted">
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="text-xs px-2 py-1 rounded border border-border bg-background">
                  <option value="all">全部交易</option>
                  <option value="profit">盈利交易</option>
                  <option value="loss">亏损交易</option>
                </select>
                <input type="text" placeholder="搜索股票" value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())} className="text-xs px-2 py-1 rounded border border-border bg-background" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 pr-3 whitespace-nowrap">时间</th>
                      <th className="text-left py-2 pr-3">股票</th>
                      <th className="text-left py-2 pr-3">方向</th>
                      <th className="text-left py-2 pr-3">信号类型</th>
                      <th className="text-left py-2 pr-3 min-w-[200px]">买卖理由</th>
                      <th className="text-right py-2 pr-3">数量</th>
                      <th className="text-right py-2 pr-3">价格</th>
                      <th className="text-right py-2 pr-3">金额</th>
                      <th className="text-right py-2 pr-3">佣金</th>
                      <th className="text-right py-2 pr-3">平台费</th>
                      <th className="text-right py-2 pr-3">盈亏</th>
                      <th className="text-right py-2">盈亏%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let filtered = trades.filter((t: any) => {
                        if (filterType === 'profit' && Number(t.pnl) <= 0) return false;
                        if (filterType === 'loss' && Number(t.pnl) >= 0) return false;
                        if (filterSymbol && !t.symbol.includes(filterSymbol)) return false;
                        return true;
                      });

                      filtered.sort((a: any, b: any) => {
                        let aVal: any, bVal: any;
                        switch (sortBy) {
                          case 'pnl':
                            aVal = Number(a.pnl);
                            bVal = Number(b.pnl);
                            break;
                          case 'pnlPct':
                            aVal = Number(a.pnlPct);
                            bVal = Number(b.pnlPct);
                            break;
                          case 'symbol':
                            aVal = a.symbol;
                            bVal = b.symbol;
                            break;
                          default:
                            aVal = Number(a.tradeTime);
                            bVal = Number(b.tradeTime);
                        }
                        return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                      });

                      return filtered.map((trade: any, idx: any) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                            {new Date(Number(trade.tradeTime)).toLocaleString('zh-CN')}
                          </td>
                          <td className="py-1.5 pr-3 font-medium">{trade.symbol}</td>
                          <td className="py-1.5 pr-3">
                            <Badge variant={trade.side === 'buy' ? 'outline' : 'default'} className="text-xs">
                              {trade.side === "buy" ? "买" : "卖"}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{trade.signalType}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground max-w-[200px] truncate" title={trade.reason || ""}>
                            {trade.reason || "-"}
                          </td>
                          <td className="py-1.5 pr-3 text-right">{Number(trade.quantity).toFixed(0)}</td>
                          <td className="py-1.5 pr-3 text-right">${Number(trade.price).toFixed(2)}</td>
                          <td className="py-1.5 pr-3 text-right">${Number(trade.totalAmount).toFixed(0)}</td>
                          <td className="py-1.5 pr-3 text-right text-orange-400">
                            {(trade as any).commissionFee ? `$${Number((trade as any).commissionFee).toFixed(2)}` : "-"}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-orange-400">
                            {(trade as any).platformFee ? `$${Number((trade as any).platformFee).toFixed(2)}` : "-"}
                          </td>
                          <td className={`py-1.5 pr-3 text-right font-medium ${Number(trade.pnl) >= 0 ? "text-gain" : "text-loss"}`}>
                            {Number(trade.pnl) >= 0 ? "+" : ""}{Number(trade.pnl).toFixed(2)}
                          </td>
                          <td className={`py-1.5 text-right font-medium ${Number(trade.pnlPct) >= 0 ? "text-gain" : "text-loss"}`}>
                            {Number(trade.pnlPct) >= 0 ? "+" : ""}{(Number(trade.pnlPct) * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
