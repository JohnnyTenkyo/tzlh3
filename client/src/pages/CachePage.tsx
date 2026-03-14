import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Database, RefreshCw, Zap } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { STOCK_POOL } from "@shared/stockPool";

const QUICK_WARM_GROUPS = [
  { label: "AI & 科技 TOP 20", symbols: ["NVDA", "MSFT", "AAPL", "GOOGL", "META", "AMZN", "TSLA", "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "LRCX", "KLAC", "TSM", "ASML", "ARM", "SMCI", "PLTR"] },
  { label: "ETF 指数", symbols: ["SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "ARKK", "SOXL", "TQQQ", "SQQQ"] },
  { label: "比特币相关", symbols: ["MSTR", "COIN", "MARA", "RIOT", "CLSK", "IREN", "HUT", "BTBT", "CIFR", "WULF"] },
];

export default function CachePage() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: cacheStatus, isLoading, refetch } = trpc.cache.status.useQuery(
    undefined,
    { refetchInterval: 3000 }
  );

  const warmMutation = trpc.cache.warmDaily.useMutation({
    onSuccess: ({ message }) => { toast.success(message); utils.cache.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const warming = cacheStatus?.warming;
  const entries = cacheStatus?.cacheEntries || [];

  const groupedEntries = entries.reduce((acc: Record<string, any[]>, entry: any) => {
    const key = entry.symbol || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">缓存管理</h1>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-400">{Object.keys(groupedEntries).length}</div>
            <div className="text-xs text-muted-foreground mt-1">已缓存股票</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-400">{entries.length}</div>
            <div className="text-xs text-muted-foreground mt-1">缓存数据集</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-yellow-400">
              {entries.reduce((sum: number, e: any) => sum + (e.candleCount || 0), 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">总K线条数</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className={`text-2xl font-bold ${warming?.isWarming ? "text-orange-400" : "text-muted-foreground"}`}>
              {warming?.isWarming ? "预热中" : "空闲"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">预热状态</div>
          </CardContent>
        </Card>
      </div>

      {/* Warming Progress */}
      {warming?.isWarming && (
        <Card className="bg-card border-border border-orange-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-orange-400">缓存预热进行中</span>
              <span className="text-xs text-muted-foreground">
                {warming.completed}/{warming.total}
              </span>
            </div>
            <Progress value={warming.total > 0 ? (warming.completed / warming.total) * 100 : 0} className="h-2" />
            {warming.current && (
              <p className="text-xs text-muted-foreground mt-1">当前: {warming.current}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Warm Groups */}
      {!isAuthenticated ? (
        <Card className="bg-card border-border">
          <CardContent className="py-6 text-center">
            <p className="text-muted-foreground text-sm">请先<a href="/auth" className="text-primary hover:underline mx-1">登录</a>后使用缓存预热功能</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" /> 快速预热
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_WARM_GROUPS.map(group => (
                <Button
                  key={group.label}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => warmMutation.mutate({ symbols: group.symbols })}
                  disabled={warmMutation.isPending || warming?.isWarming}
                >
                  {group.label} ({group.symbols.length})
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                onClick={() => warmMutation.mutate({ symbols: STOCK_POOL.map(s => s.symbol) })}
                disabled={warmMutation.isPending || warming?.isWarming}
              >
                全部股票 ({STOCK_POOL.length})
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              预热后的数据将缓存到数据库，回测时无需重新请求 API，速度提升 10-100 倍。
            </p>
          </CardContent>
        </Card>
      )}

      {/* Cache Entries */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" /> 缓存详情
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无缓存数据</p>
              <p className="text-xs mt-1">使用上方快速预热功能来缓存常用股票数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 pr-3">股票</th>
                    <th className="text-left py-2 pr-3">时间框架</th>
                    <th className="text-right py-2 pr-3">K线数</th>
                    <th className="text-left py-2 pr-3">数据范围</th>
                    <th className="text-left py-2 pr-3">数据源</th>
                    <th className="text-left py-2">更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 100).map((entry: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 font-mono font-medium text-primary">{entry.symbol}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="secondary" className="text-xs h-4">{entry.timeframe}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 text-right">{(entry.candleCount || 0).toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {entry.oldestDate} ~ {entry.newestDate}
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{entry.source || "-"}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {entry.updatedAt ? new Date(Number(entry.updatedAt)).toLocaleDateString("zh-CN") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entries.length > 100 && (
                <p className="text-xs text-muted-foreground text-center mt-2">仅显示前 100 条</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
