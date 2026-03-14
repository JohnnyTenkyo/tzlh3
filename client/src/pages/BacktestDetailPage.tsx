import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, Cpu, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

export default function BacktestDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id || "0");

  const { data, isLoading, error } = trpc.backtest.detail.useQuery({ id }, { enabled: !!id });
  const utils = trpc.useUtils();

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/backtest")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{session.name}</h1>
            <p className="text-xs text-muted-foreground">
              {session.startDate} ~ {session.endDate} · {(session.symbols as string[])?.join(", ")}
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
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-3">时间</th>
                  <th className="text-left py-2 pr-3">股票</th>
                  <th className="text-left py-2 pr-3">方向</th>
                  <th className="text-right py-2 pr-3">数量</th>
                  <th className="text-right py-2 pr-3">价格</th>
                  <th className="text-right py-2 pr-3">金额</th>
                  <th className="text-right py-2 pr-3">盈亏</th>
                  <th className="text-right py-2">盈亏%</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 200).map(trade => {
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
                      <td className="py-1.5 pr-3 text-right">{Number(trade.quantity).toFixed(0)}</td>
                      <td className="py-1.5 pr-3 text-right">${Number(trade.price).toFixed(2)}</td>
                      <td className="py-1.5 pr-3 text-right">${Number(trade.totalAmount).toFixed(0)}</td>
                      <td className={`py-1.5 pr-3 text-right ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                        {pnl !== 0 ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(0)}` : "-"}
                      </td>
                      <td className={`py-1.5 text-right ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                        {pnlPct !== 0 ? `${pnlPct >= 0 ? "+" : ""}${(pnlPct * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  );
                })}
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
