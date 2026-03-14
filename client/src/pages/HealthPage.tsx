import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Activity, RefreshCw, Cpu, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const SOURCE_INFO: Record<string, { description: string; tier: string; rateLimit: string }> = {
  alpaca: { description: "Alpaca Markets - 实时/历史数据", tier: "付费", rateLimit: "200/min" },
  stooq: { description: "Stooq - 免费历史数据", tier: "免费", rateLimit: "无限制" },
  yahoo: { description: "Yahoo Finance - 免费历史数据", tier: "免费", rateLimit: "2000/hour" },
  tiingo: { description: "Tiingo - 高质量历史数据", tier: "免费/付费", rateLimit: "1000/hour" },
  finnhub: { description: "Finnhub - 实时行情+基本面", tier: "免费/付费", rateLimit: "60/min" },
  alphavantage: { description: "Alpha Vantage - 技术指标+历史", tier: "免费/付费", rateLimit: "5/min" },
  polygon: { description: "Polygon.io - 高质量市场数据", tier: "免费/付费", rateLimit: "5/min" },
  twelvedata: { description: "Twelve Data - 全球市场数据", tier: "免费/付费", rateLimit: "8/min" },
  marketstack: { description: "MarketStack - 全球股票数据", tier: "免费/付费", rateLimit: "100/month" },
};

export default function HealthPage() {
  const { data: sources, isLoading, refetch } = trpc.health.sources.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );
  const { data: geminiStatus, refetch: refetchGemini } = trpc.health.geminiStatus.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );

  const getStatusIcon = (source: any) => {
    const success = source.successCount || 0;
    const fail = source.failCount || 0;
    if (success === 0 && fail === 0) return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    if (success > 0 && fail === 0) return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (success > 0 && fail > 0) return <AlertCircle className="h-4 w-4 text-yellow-400" />;
    return <XCircle className="h-4 w-4 text-red-400" />;
  };

  const getStatusBadge = (source: any) => {
    const success = source.successCount || 0;
    const fail = source.failCount || 0;
    if (success === 0 && fail === 0) return <Badge variant="secondary" className="text-xs">未测试</Badge>;
    if (success > 0 && fail === 0) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">正常</Badge>;
    if (success > 0 && fail > 0) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">部分失败</Badge>;
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">异常</Badge>;
  };

  const allSources = Object.keys(SOURCE_INFO).map(key => {
    const dbRecord = sources?.find(s => s.source.toLowerCase() === key.toLowerCase());
    return { key, info: SOURCE_INFO[key], record: dbRecord };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">数据源健康监控</h1>
        <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchGemini(); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Gemini AI Status */}
      <Card className={`bg-card border-border ${geminiStatus?.connected ? "border-cyan-500/30" : "border-yellow-500/30"}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className={`h-5 w-5 ${geminiStatus?.connected ? "text-cyan-400" : "text-yellow-400"}`} />
              <div>
                <div className="font-medium text-sm">Gemini AI 服务</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  模型: {geminiStatus?.model || "gemini-2.0-flash"} · 接入点: {geminiStatus?.baseUrl || "https://openfly.cc/antigravity"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {geminiStatus?.connected ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">已连接</Badge>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-yellow-400" />
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">检测中</Badge>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-400">{allSources.length}</div>
            <div className="text-xs text-muted-foreground mt-1">数据源总数</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-400">
              {allSources.filter(s => s.record && (s.record.successCount || 0) > 0).length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">正常数据源</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-yellow-400">
              {sources?.reduce((sum, s) => sum + (s.successCount || 0), 0) || 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">成功请求总数</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-red-400">
              {sources?.reduce((sum, s) => sum + (s.failCount || 0), 0) || 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">失败请求总数</div>
          </CardContent>
        </Card>
      </div>

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allSources.map(({ key, info, record }) => (
          <Card key={key} className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(record || {})}
                  <span className="font-medium text-sm capitalize">{key}</span>
                </div>
                {getStatusBadge(record || {})}
              </div>
              <p className="text-xs text-muted-foreground mb-3">{info.description}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">类型: </span>
                  <Badge variant="outline" className="text-xs h-4">{info.tier}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">限速: </span>
                  <span className="text-foreground">{info.rateLimit}</span>
                </div>
                {record && (
                  <>
                    <div>
                      <span className="text-muted-foreground">成功: </span>
                      <span className="text-green-400">{record.successCount || 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">失败: </span>
                      <span className="text-red-400">{record.failCount || 0}</span>
                    </div>

                    {record.lastError && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">最近错误: </span>
                        <span className="text-red-400 text-xs truncate block">{record.lastError}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Activity className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">数据源优先级：</strong>Alpaca (最优) → Tiingo → Finnhub → AlphaVantage → Polygon → TwelveData → Stooq → Yahoo → MarketStack</p>
              <p>系统自动按优先级尝试各数据源，失败时自动切换到下一个，确保数据获取的高可用性。</p>
              <p><strong className="text-foreground">免费配额说明：</strong>Polygon/TwelveData/MarketStack 为额外免费备用数据源，每月/每分钟有请求限制，建议优先使用 Alpaca/Tiingo/Finnhub。</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
