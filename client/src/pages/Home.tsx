import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart2, TrendingUp, Database, Activity, BookOpen, ArrowRight, Cpu } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: cacheData } = trpc.cache.status.useQuery(undefined, { retry: false });
  const { data: healthData } = trpc.health.sources.useQuery(undefined, { retry: false });
  const { data: geminiStatus } = trpc.health.geminiStatus.useQuery(undefined, { retry: false });

  const totalCached = cacheData?.cacheEntries?.length || 0;

  const features = [
    { icon: TrendingUp, title: "K线图表", description: "查看股票 K 线图，支持 MACD、黄蓝梯子、CD 抄底等技术指标叠加显示", path: "/chart", color: "text-blue-400" },
    { icon: BarChart2, title: "回测中心", description: "支持6种量化策略回测，包含 Gemini AI 智能策略，一键导出 Excel 报告", path: "/backtest", color: "text-green-400" },
    { icon: BookOpen, title: "股票池", description: "793 只美股，按行业分类筛选，涵盖 AI、半导体、比特币、新能源等热门赛道", path: "/stock-pool", color: "text-yellow-400" },
    { icon: Database, title: "缓存管理", description: "K 线数据本地缓存，支持批量预热，大幅提升回测速度", path: "/cache", color: "text-purple-400" },
    { icon: Activity, title: "数据源健康", description: "监控9个数据源（Alpaca/Tiingo/Finnhub/AV/Polygon/TwelveData 等）的实时状态", path: "/health", color: "text-orange-400" },
    { icon: Cpu, title: "Gemini AI 策略", description: "接入 Google Gemini 2.0 Flash，智能分析技术指标生成交易信号，AI 辅助回测优化", path: "/backtest", color: "text-cyan-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">梯子量化平台</h1>
          <p className="text-muted-foreground mt-1">多数据源聚合 · 6种策略回测 · Gemini AI 智能分析</p>
        </div>
        {!isAuthenticated ? (
          <Button onClick={() => setLocation("/auth")} className="gap-2">
            登录 / 注册 <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <div className="text-sm text-muted-foreground">
            欢迎，<span className="text-foreground font-medium">{user?.name || user?.email}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-400">793</div>
            <div className="text-xs text-muted-foreground mt-1">股票池总量</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-400">7</div>
            <div className="text-xs text-muted-foreground mt-1">回测策略数</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-yellow-400">{totalCached}</div>
            <div className="text-xs text-muted-foreground mt-1">已缓存数据集</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className={`text-2xl font-bold ${geminiStatus?.connected ? "text-cyan-400" : "text-muted-foreground"}`}>
              {geminiStatus?.connected ? "在线" : "检测中"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Gemini AI 状态</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">数据源状态</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["Alpaca", "Stooq", "Yahoo", "Tiingo", "Finnhub", "AlphaVantage", "Polygon", "TwelveData", "MarketStack"].map(source => {
              const health = healthData?.find(h => h.source.toLowerCase() === source.toLowerCase());
              const isHealthy = health && (health.successCount || 0) > 0;
              const hasFailed = health && (health.failCount || 0) > 0;
              return (
                <span key={source} className={`px-2 py-1 rounded text-xs font-medium border ${
                  isHealthy ? "bg-green-500/10 text-green-400 border-green-500/30"
                  : hasFailed ? "bg-red-500/10 text-red-400 border-red-500/30"
                  : "bg-muted text-muted-foreground border-border"
                }`}>{source}</span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map(feature => (
          <Card key={feature.title} className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => setLocation(feature.path)}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${feature.color}`}>
                  <feature.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base font-semibold">{feature.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                进入 <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border border-cyan-500/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Cpu className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-sm text-cyan-400">Gemini AI 集成</div>
              <div className="text-xs text-muted-foreground mt-1">
                模型: <span className="text-foreground">{geminiStatus?.model || "gemini-2.0-flash"}</span>
                {" · "}接入点: <span className="text-foreground">{geminiStatus?.baseUrl || "https://openfly.cc/antigravity"}</span>
                {" · "}状态: <span className={geminiStatus?.connected ? "text-green-400" : "text-yellow-400"}>
                  {geminiStatus?.connected ? "✓ 已连接" : "检测中..."}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
