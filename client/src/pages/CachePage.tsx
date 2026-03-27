import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Activity, Database, RefreshCw, Zap, Clock, Play, Pause, Trash2, Plus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { STOCK_POOL, SECTOR_LABELS, MARKET_CAP_TIER_LABELS, filterStocks, type StockSector, type MarketCapTier } from "@shared/stockPool";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Filter, ChevronDown, ChevronUp, X } from "lucide-react";

const QUICK_WARM_GROUPS = [
  { label: "AI & 科技 TOP 20", symbols: ["NVDA", "MSFT", "AAPL", "GOOGL", "META", "AMZN", "TSLA", "AMD", "INTC", "QCOM", "AVGO", "MU", "AMAT", "LRCX", "KLAC", "TSM", "ASML", "ARM", "SMCI", "PLTR"] },
  { label: "ETF 指数", symbols: ["SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "ARKK", "SOXL", "TQQQ", "SQQQ"] },
  { label: "比特币相关", symbols: ["MSTR", "COIN", "MARA", "RIOT", "CLSK", "IREN", "HUT", "BTBT", "CIFR", "WULF"] },
];

export default function CachePage() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [showPoolFilter, setShowPoolFilter] = useState(false);
  const [selectedSectors, setSelectedSectors] = useState<StockSector[]>([]);
  const [selectedCapTiers, setSelectedCapTiers] = useState<MarketCapTier[]>([]);
  const [filteredSymbols, setFilteredSymbols] = useState<string[]>(STOCK_POOL.map(s => s.symbol));
  const [showFailedSymbols, setShowFailedSymbols] = useState(false);

  // Helper to update filtered symbols
  const updateFiltered = (sectors: StockSector[], tiers: MarketCapTier[]) => {
    if (sectors.length === 0 && tiers.length === 0) {
      setFilteredSymbols(STOCK_POOL.map(s => s.symbol));
    } else {
      const filtered = filterStocks(STOCK_POOL, {
        sectors: sectors.length > 0 ? sectors : undefined,
        marketCapTiers: tiers.length > 0 ? tiers : undefined,
      });
      setFilteredSymbols(filtered.map(s => s.symbol));
    }
  };

  const { data: cacheStatus, isLoading, refetch } = trpc.cache.status.useQuery(
    undefined,
    { refetchInterval: 3000 }
  );

  const { data: failedData, refetch: refetchFailed } = trpc.cache.failedSymbols.useQuery(
    { symbols: filteredSymbols },
    { enabled: false }
  );

  const warmMutation = trpc.cache.warmDaily.useMutation({
    onSuccess: ({ message }) => { toast.success(message); utils.cache.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const warming = cacheStatus?.warming as any;
  const entries = cacheStatus?.cacheEntries || [];

  const groupedEntries = entries.reduce((acc: Record<string, any[]>, entry: any) => {
    const key = entry.symbol || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const failedSymbols = failedData?.failed || [];
  const cachedCount = failedData?.cachedCount || 0;
  const totalCount = failedData?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">缓存管理</h1>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="stats-grid">
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

      {/* Failed Symbols Card */}
      {isAuthenticated && totalCount > 0 && (
        <Card className="bg-card border-border cursor-pointer hover:border-orange-500/50" onClick={() => { refetchFailed(); setShowFailedSymbols(!showFailedSymbols); }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-400">{totalCount - cachedCount}</div>
                <div className="text-xs text-muted-foreground mt-1">未缓存股票 (点击展开)</div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                <div>{cachedCount}/{totalCount}</div>
                <div>已缓存</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed Symbols List */}
      {showFailedSymbols && failedSymbols.length > 0 && (
        <Card className="bg-card border-orange-500/30 border-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-orange-400">未缓存股票列表 ({failedSymbols.length}/{totalCount})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2 max-h-40 overflow-y-auto">
              {failedSymbols.map(symbol => (
                <Badge key={symbol} variant="outline" className="text-xs justify-center">{symbol}</Badge>
              ))}
            </div>
            {isAuthenticated && (
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  warmMutation.mutate({ symbols: failedSymbols });
                  setShowFailedSymbols(false);
                }}
                disabled={warmMutation.isPending}
              >
                <Zap className="h-4 w-4 mr-2" />
                单独缓存这些股票
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Warming Progress */}
      {warming?.isWarming && (
        <Card className="bg-card border-border border-orange-500/30">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-orange-400 flex items-center gap-2">
                <Activity className="h-4 w-4 animate-pulse" /> 缓存预热进行中
              </span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {warming.speed > 0 && (
                  <span className="text-green-400 font-mono">{warming.speed} 只/秒</span>
                )}
                {warming.elapsedSeconds > 0 && (
                  <span>已用 {warming.elapsedSeconds}s</span>
                )}
                <span>{warming.completed}/{warming.total}</span>
              </div>
            </div>
            <Progress value={warming.total > 0 ? (warming.completed / warming.total) * 100 : 0} className="h-2" />
            {warming.current && (
              <p className="text-xs text-muted-foreground font-mono truncate">▶ {warming.current}</p>
            )}
            {/* Source stats */}
            {warming.sourceStats && Object.keys(warming.sourceStats).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(warming.sourceStats as Record<string, { success: number; failed: number }>).map(([src, stat]) => (
                  <div key={src} className="flex items-center gap-1 text-xs bg-muted/30 rounded px-2 py-0.5">
                    <span className="text-muted-foreground capitalize">{src}:</span>
                    <span className="text-green-400">{stat.success}✓</span>
                    {stat.failed > 0 && <span className="text-red-400">{stat.failed}✗</span>}
                  </div>
                ))}
              </div>
            )}
            {warming.retrying > 0 && (
              <p className="text-xs text-yellow-400">🔄 重试中: {warming.retrying} 只</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Last warming result (not warming) */}
      {!warming?.isWarming && warming?.current && warming.current.includes('完成') && (
        <Card className="bg-card border-border border-green-500/20">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-green-400">✓ {warming.current}</p>
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
        <>
          {/* Quick Warm Groups */}
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

          {/* Stock Pool Filter */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowPoolFilter(!showPoolFilter)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4" /> 按板块/市值筛选预热
                </CardTitle>
                {showPoolFilter ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
            {showPoolFilter && (
              <CardContent className="space-y-4 border-t border-border pt-4">
                {/* Sectors */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">行业板块</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(SECTOR_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={`sector-${key}`}
                          checked={selectedSectors.includes(key as StockSector)}
                          onCheckedChange={(checked) => {
                            const newSectors = checked
                              ? [...selectedSectors, key as StockSector]
                              : selectedSectors.filter(s => s !== key);
                            setSelectedSectors(newSectors);
                            updateFiltered(newSectors, selectedCapTiers);
                          }}
                        />
                        <label htmlFor={`sector-${key}`} className="text-xs cursor-pointer">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Market Cap Tiers */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">市值区间</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(MARKET_CAP_TIER_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={`cap-${key}`}
                          checked={selectedCapTiers.includes(key as MarketCapTier)}
                          onCheckedChange={(checked) => {
                            const newTiers = checked
                              ? [...selectedCapTiers, key as MarketCapTier]
                              : selectedCapTiers.filter(t => t !== key);
                            setSelectedCapTiers(newTiers);
                            updateFiltered(selectedSectors, newTiers);
                          }}
                        />
                        <label htmlFor={`cap-${key}`} className="text-xs cursor-pointer">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected tags */}
                {(selectedSectors.length > 0 || selectedCapTiers.length > 0) && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">已选条件</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedSectors.map(s => (
                        <Badge key={s} variant="secondary" className="text-xs gap-1">
                          {SECTOR_LABELS[s]}
                          <button onClick={() => {
                            const newSectors = selectedSectors.filter(x => x !== s);
                            setSelectedSectors(newSectors);
                            updateFiltered(newSectors, selectedCapTiers);
                          }} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                      {selectedCapTiers.map(t => (
                        <Badge key={t} variant="secondary" className="text-xs gap-1">
                          {MARKET_CAP_TIER_LABELS[t]}
                          <button onClick={() => {
                            const newTiers = selectedCapTiers.filter(x => x !== t);
                            setSelectedCapTiers(newTiers);
                            updateFiltered(selectedSectors, newTiers);
                          }} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => warmMutation.mutate({ symbols: filteredSymbols })}
                    disabled={warmMutation.isPending || warming?.isWarming || filteredSymbols.length === 0}
                  >
                    预热 {filteredSymbols.length} 只股票
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={() => {
                      setSelectedSectors([]);
                      setSelectedCapTiers([]);
                      setFilteredSymbols(STOCK_POOL.map(s => s.symbol));
                    }}
                  >
                    清空
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </>
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
