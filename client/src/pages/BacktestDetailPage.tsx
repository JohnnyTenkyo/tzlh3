import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, Cpu, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useMemo, useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";

// Merge equity curves from strategy, SPY, QQQ into a unified time series
function mergeEquityCurves(
  equityCurve: Array<{ time: number; equity: number }>,
  spyCurve: Array<{ time: number; equity: number }>,
  qqqCurve: Array<{ time: number; equity: number }>,
  initialCapital: number
) {
  // Build maps for quick lookup
  const spyMap = new Map(spyCurve.map(p => [p.time, p.equity]));
  const qqqMap = new Map(qqqCurve.map(p => [p.time, p.equity]));

  // Collect all unique timestamps
  const allTimes = Array.from(
    new Set([
      ...equityCurve.map(p => p.time),
      ...spyCurve.map(p => p.time),
      ...qqqCurve.map(p => p.time),
    ])
  ).sort((a, b) => a - b);

  // Forward-fill values
  let lastStrategy = initialCapital;
  let lastSpy = initialCapital;
  let lastQqq = initialCapital;

  return allTimes.map(time => {
    const strategyPoint = equityCurve.find(p => p.time === time);
    if (strategyPoint) lastStrategy = strategyPoint.equity;
    if (spyMap.has(time)) lastSpy = spyMap.get(time)!;
    if (qqqMap.has(time)) lastQqq = qqqMap.get(time)!;

    return {
      date: new Date(time).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", year: "2-digit" }),
      time,
      strategy: Math.round(lastStrategy),
      spy: Math.round(lastSpy),
      qqq: Math.round(lastQqq),
    };
  });
}

// Custom tooltip for the chart
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-muted-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium" style={{ color: p.color }}>${p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function BacktestDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id || "0");
  const [isPolling, setIsPolling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  
  // Trade sorting and filtering
  const [sortBy, setSortBy] = useState<'date' | 'pnl' | 'pnlPct' | 'symbol'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterType, setFilterType] = useState<'all' | 'profit' | 'loss'>('all');
  const [filterSymbol, setFilterSymbol] = useState<string>('');

  const { data, isLoading, error } = trpc.backtest.detail.useQuery({ id }, { enabled: !!id });
  const { data: progressData } = trpc.backtest.progress.useQuery({ id }, {
    enabled: !!id && isPolling,
    refetchInterval: 1000, // Poll every 1 second
  });
  const utils = trpc.useUtils();

  // Start polling when session is running
  useEffect(() => {
    if (data?.session?.status === "running") {
      setIsPolling(true);
    } else if (data?.session?.status === "completed" || data?.session?.status === "failed") {
      setIsPolling(false);
    }
  }, [data?.session?.status]);

  // Update progress from polling data
  useEffect(() => {
    if (progressData) {
      setProgress(progressData.progress || 0);
      setProgressMessage(progressData.progressMessage || "");
      if (progressData.status === "completed" || progressData.status === "failed") {
        setIsPolling(false);
        utils.backtest.detail.invalidate({ id });
      }
    }
  }, [progressData, id, utils]);

  const exportMutation = trpc.backtest.exportExcel.useMutation({
    onSuccess: ({ filename, base64 }) => {
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      link.download = filename;
      link.click();
      toast.success("Excel 已下载");
    },
    onError: (e) => toast.error(e.message),
  });

  const aiAnalyzeMutation = trpc.backtest.aiAnalyze.useMutation({
    onSuccess: () => { toast.success("AI 分析完成"); utils.backtest.detail.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  // Build chart data from resultSummary
  const chartData = useMemo(() => {
    if (!data?.session) return [];
    const summary = data.session.resultSummary as any;
    if (!summary?.equityCurve?.length) return [];
    const initialCapital = Number(data.session.initialCapital) || 100000;
    return mergeEquityCurves(
      summary.equityCurve || [],
      summary.spyCurve || [],
      summary.qqqCurve || [],
      initialCapital
    );
  }, [data]);

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  if (error || !data) return <div className="text-center py-12 text-muted-foreground">回测记录不存在或无权访问</div>;

  const { session, trades } = data;
  const totalReturn = Number(session.totalReturnPct) || 0;
  const winRate = Number(session.winRate) || 0;
  const maxDrawdown = Number(session.maxDrawdown) || 0;
  const sharpe = Number(session.sharpeRatio) || 0;
  const benchmarkReturn = Number(session.benchmarkReturn) || 0;
  const isPositive = totalReturn >= 0;

  const metrics = [
    { label: "总收益率", value: `${(totalReturn * 100).toFixed(2)}%`, positive: isPositive },
    { label: "总收益", value: `$${Number(session.totalReturn || 0).toFixed(0)}`, positive: isPositive },
    { label: "胜率", value: `${(winRate * 100).toFixed(1)}%`, positive: winRate >= 0.5 },
    { label: "最大回撤", value: `${(maxDrawdown * 100).toFixed(2)}%`, positive: maxDrawdown < 0.2 },
    { label: "夏普比率", value: sharpe.toFixed(2), positive: sharpe >= 1 },
    { label: "基准(SPY)", value: `${(benchmarkReturn * 100).toFixed(2)}%`, positive: benchmarkReturn >= 0 },
    { label: "总交易数", value: String(session.totalTrades || 0), positive: true },
    { label: "盈利/亏损", value: `${session.winningTrades || 0}/${session.losingTrades || 0}`, positive: true },
  ];

  let aiAnalysis: any = null;
  try {
    if (session.aiAnalysis) aiAnalysis = JSON.parse(session.aiAnalysis as string);
  } catch {}

  // Compute benchmark returns from chart data for display
  const qqqReturn = chartData.length >= 2
    ? ((chartData[chartData.length - 1].qqq - chartData[0].qqq) / chartData[0].qqq * 100).toFixed(2)
    : null;

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
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                onClick={() => aiAnalyzeMutation.mutate({ id })}
                disabled={aiAnalyzeMutation.isPending}
              >
                <Cpu className="h-4 w-4" />
                {aiAnalyzeMutation.isPending ? "分析中..." : "AI 分析"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => exportMutation.mutate({ id })}
                disabled={exportMutation.isPending}
              >
                <Download className="h-4 w-4" />
                导出 Excel
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
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickLine={false}
                  interval={Math.floor(chartData.length / 6)}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                  formatter={(value) => <span style={{ color: "hsl(var(--muted-foreground))" }}>{value}</span>}
                />
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
                      <li key={i} className="text-xs text-foreground">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiAnalysis.riskLevel && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">风险等级:</span>
                  <Badge variant={aiAnalysis.riskLevel === "high" ? "destructive" : aiAnalysis.riskLevel === "medium" ? "secondary" : "default"}>
                    {aiAnalysis.riskLevel === "high" ? "高风险" : aiAnalysis.riskLevel === "medium" ? "中风险" : "低风险"}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
                  let filtered = trades.filter(t => {
                    if (filterType === 'profit' && Number(t.pnl) <= 0) return false;
                    if (filterType === 'loss' && Number(t.pnl) >= 0) return false;
                    if (filterSymbol && !t.symbol.includes(filterSymbol)) return false;
                    return true;
                  });
                  
                  filtered.sort((a, b) => {
                    let aVal: any = a[sortBy as keyof typeof a];
                    let bVal: any = b[sortBy as keyof typeof b];
                    if (sortBy === 'date') { aVal = Number(a.tradeTime); bVal = Number(b.tradeTime); }
                    if (sortBy === 'pnl') { aVal = Number(a.pnl); bVal = Number(b.pnl); }
                    if (sortBy === 'pnlPct') { aVal = Number(a.pnlPct); bVal = Number(b.pnlPct); }
                    return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                  });
                  
                  return filtered.slice(0, 200).map(trade => {
                    const pnl = Number(trade.pnl);
                    const pnlPct = Number(trade.pnlPct);
                    return (
                    <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {new Date(Number(trade.tradeTime)).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="py-1.5 pr-3 font-medium">{trade.symbol}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant={trade.side === "buy" ? "default" : "secondary"} className="text-xs h-4">
                          {trade.side === "buy" ? "买入" : "卖出"}
                        </Badge>
                      </td>
                      {/* Signal type column */}
                      <td className="py-1.5 pr-3">
                        {(trade as any).signalType ? (
                          <Badge variant="outline" className={`text-[10px] h-4 px-1 whitespace-nowrap ${
                            String((trade as any).signalType).includes('buy') || String((trade as any).signalType).includes('entry')
                              ? 'border-green-500/50 text-green-400'
                              : String((trade as any).signalType).includes('stop_loss') ? 'border-red-500/50 text-red-400'
                              : String((trade as any).signalType).includes('take_profit') ? 'border-yellow-500/50 text-yellow-400'
                              : String((trade as any).signalType).includes('trailing') ? 'border-orange-500/50 text-orange-400'
                              : 'border-border/50 text-muted-foreground'
                          }`}>
                            {String((trade as any).signalType).replace(/_/g, ' ')}
                          </Badge>
                        ) : <span className="text-muted-foreground text-[10px]">-</span>}
                      </td>
                      {/* Reason column */}
                      <td className="py-1.5 pr-3 max-w-[220px]">
                        {(trade as any).reason ? (
                          <span
                            className="text-[10px] text-muted-foreground leading-tight block cursor-help"
                            title={(trade as any).reason}
                          >
                            {String((trade as any).reason).length > 55
                              ? String((trade as any).reason).slice(0, 55) + '…'
                              : String((trade as any).reason)}
                          </span>
                        ) : <span className="text-muted-foreground text-[10px]">-</span>}
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
                      <td className={`py-1.5 pr-3 text-right ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                        {pnl !== 0 ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(0)}` : "-"}
                      </td>
                      <td className={`py-1.5 text-right ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                        {pnlPct !== 0 ? `${pnlPct >= 0 ? "+" : ""}${(pnlPct * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
            {trades.length > 200 && (
              <p className="text-xs text-muted-foreground text-center mt-2">仅显示前 200 笔，请导出 Excel 查看全部</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
