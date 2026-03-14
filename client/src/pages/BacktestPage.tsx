import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Play, BarChart2, Layers, Filter, Search, ChevronDown, ChevronUp,
  Trash2, Eye, GitCompare, RefreshCw, CheckSquare, AlertCircle,
  Download, Cpu, SlidersHorizontal, Info
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  STOCK_POOL, SECTOR_LABELS, MARKET_CAP_TIER_LABELS, filterStocks, getMarketCapTier,
  type StockSector, type MarketCapTier
} from "@shared/stockPool";

// ─── Constants ────────────────────────────────────────────────────────────────
type StrategyKey = "standard" | "aggressive" | "ladder_cd_combo" | "mean_reversion" | "macd_volume" | "bollinger_squeeze" | "gemini_ai";

const STRATEGY_COLORS: Record<StrategyKey, string> = {
  standard: "#3b82f6",
  aggressive: "#ef4444",
  ladder_cd_combo: "#f59e0b",
  mean_reversion: "#10b981",
  macd_volume: "#8b5cf6",
  bollinger_squeeze: "#06b6d4",
  gemini_ai: "#f97316",
};

const COMPARE_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#14b8a6"];

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  standard: { stopLossPct: 0.08, takeProfitPct: 0.20, maxHoldingDays: 0 },
  aggressive: { stopLossPct: 0.06, takeProfitPct: 0.12, trailingStopPct: 0.04, maxHoldingDays: 30 },
  ladder_cd_combo: { stopLossPct: 0.07, takeProfitPct: 0.15, trailingStopPct: 0.05, minLadderGap: 0 },
  mean_reversion: { stopLossPct: 0.06, takeProfitPct: 0.10, rsiOversold: 30, rsiOverbought: 70, maxHoldingDays: 20 },
  macd_volume: { stopLossPct: 0.07, takeProfitPct: 0.15, volumeMultiplier: 1.5, trailingStopPct: 0.05 },
  bollinger_squeeze: { stopLossPct: 0.06, takeProfitPct: 0.12, bbPeriod: 20, bbMultiplier: 2, maxHoldingDays: 15 },
  gemini_ai: { stopLossPct: 0.08, takeProfitPct: 0.20, maxHoldingDays: 0 },
};

const PARAM_DEFS: Record<string, Array<{ key: string; label: string; min: number; max: number; step: number; format: (v: number) => string }>> = {
  standard: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.20, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.50, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 0, max: 120, step: 5, format: v => v === 0 ? "不限" : `${v}天` },
  ],
  aggressive: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.30, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "trailingStopPct", label: "追踪止损", min: 0, max: 0.10, step: 0.01, format: v => v === 0 ? "关闭" : `${(v * 100).toFixed(0)}%` },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 5, max: 90, step: 5, format: v => `${v}天` },
  ],
  ladder_cd_combo: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.40, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "trailingStopPct", label: "追踪止损", min: 0, max: 0.10, step: 0.01, format: v => v === 0 ? "关闭" : `${(v * 100).toFixed(0)}%` },
  ],
  mean_reversion: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "takeProfitPct", label: "止盈比例", min: 0.03, max: 0.25, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "rsiOversold", label: "RSI 超卖阈值", min: 15, max: 40, step: 1, format: v => `${v}` },
    { key: "rsiOverbought", label: "RSI 超买阈值", min: 60, max: 85, step: 1, format: v => `${v}` },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 5, max: 60, step: 5, format: v => `${v}天` },
  ],
  macd_volume: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.40, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "volumeMultiplier", label: "量能倍数", min: 1.0, max: 3.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
    { key: "trailingStopPct", label: "追踪止损", min: 0, max: 0.10, step: 0.01, format: v => v === 0 ? "关闭" : `${(v * 100).toFixed(0)}%` },
  ],
  bollinger_squeeze: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.35, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "bbPeriod", label: "布林带周期", min: 10, max: 50, step: 2, format: v => `${v}日` },
    { key: "bbMultiplier", label: "布林带倍数", min: 1.0, max: 3.0, step: 0.1, format: v => `${v.toFixed(1)}σ` },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 5, max: 60, step: 5, format: v => `${v}天` },
  ],
  gemini_ai: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.20, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.50, step: 0.01, format: v => `${(v * 100).toFixed(0)}%` },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 0, max: 120, step: 5, format: v => v === 0 ? "不限" : `${v}天` },
  ],
};

// ─── Stock Pool Selector ──────────────────────────────────────────────────────
function StockPoolSelector({ selectedSymbols, onChange }: { selectedSymbols: string[]; onChange: (s: string[]) => void }) {
  const [mode, setMode] = useState<"all" | "sector" | "cap" | "custom">("all");
  const [selectedSectors, setSelectedSectors] = useState<StockSector[]>([]);
  const [selectedCapTiers, setSelectedCapTiers] = useState<MarketCapTier[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const sectorStats = useMemo(() => {
    const counts: Partial<Record<StockSector, number>> = {};
    for (const s of STOCK_POOL) {
      for (const sec of s.sectors) counts[sec] = (counts[sec] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([k, v]) => ({ key: k as StockSector, count: v as number, label: SECTOR_LABELS[k as StockSector] || k }));
  }, []);

  const filteredStocks = useMemo(() => {
    if (mode === "all") return STOCK_POOL;
    if (mode === "custom") {
      const syms = customInput.split(/[\s,，\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
      return STOCK_POOL.filter(s => syms.includes(s.symbol));
    }
    return filterStocks(STOCK_POOL, {
      sectors: mode === "sector" && selectedSectors.length > 0 ? selectedSectors : undefined,
      marketCapTiers: mode === "cap" && selectedCapTiers.length > 0 ? selectedCapTiers : undefined,
      searchQuery: searchQuery || undefined,
    });
  }, [mode, selectedSectors, selectedCapTiers, customInput, searchQuery]);

  const apply = useCallback(() => {
    const syms = filteredStocks.map(s => s.symbol);
    onChange(syms);
    toast.success(`已选择 ${syms.length} 只股票`);
  }, [filteredStocks, onChange]);

  const toggleSector = (sec: StockSector) =>
    setSelectedSectors(prev => prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]);

  const toggleCapTier = (tier: MarketCapTier) =>
    setSelectedCapTiers(prev => prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]);

  const capTiers: Array<{ key: MarketCapTier; label: string; sub: string }> = [
    { key: "large", label: "大盘股", sub: ">100亿" },
    { key: "mid", label: "中盘股", sub: "20-100亿" },
    { key: "small", label: "小盘股", sub: "3-20亿" },
    { key: "micro", label: "微盘股", sub: "<3亿" },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          股票池筛选
          <Badge variant="secondary" className="ml-auto text-xs">{selectedSymbols.length} 只已选</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Mode buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "all", label: `全部 (${STOCK_POOL.length})` },
            { key: "sector", label: "按行业" },
            { key: "cap", label: "按市值" },
            { key: "custom", label: "自选" },
          ].map(m => (
            <Button key={m.key} size="sm" variant={mode === m.key ? "default" : "outline"}
              onClick={() => setMode(m.key as any)} className="text-xs h-7">
              {m.label}
            </Button>
          ))}
        </div>

        {/* Sector filter */}
        {mode === "sector" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="搜索股票代码/名称..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="pl-7 h-7 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
              {sectorStats.map(({ key, count, label }) => (
                <button key={key} onClick={() => toggleSector(key)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs border transition-colors ${
                    selectedSectors.includes(key)
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border/40 hover:border-primary/50 text-muted-foreground hover:text-foreground"
                  }`}>
                  <span className="truncate">{label}</span>
                  <span className="ml-1 shrink-0 opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cap tier filter */}
        {mode === "cap" && (
          <div className="grid grid-cols-2 gap-2">
            {capTiers.map(({ key, label, sub }) => (
              <button key={key} onClick={() => toggleCapTier(key)}
                className={`flex flex-col items-start px-3 py-2 rounded border text-xs transition-colors ${
                  selectedCapTiers.includes(key)
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-border/40 hover:border-primary/50"
                }`}>
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground text-[10px]">{sub}</span>
              </button>
            ))}
          </div>
        )}

        {/* Custom input */}
        {mode === "custom" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">输入股票代码（空格/逗号分隔）</Label>
            <textarea value={customInput} onChange={e => setCustomInput(e.target.value)}
              placeholder="例如: AAPL MSFT NVDA TSLA AMZN&#10;GOOGL META AMD NFLX"
              className="w-full h-20 px-3 py-2 text-xs bg-background border border-border/50 rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        )}

        {/* Preview & Apply */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-xs h-7"
            onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            预览 ({filteredStocks.length})
          </Button>
          <Button size="sm" className="text-xs h-7 flex-1" onClick={apply}>
            <CheckSquare className="w-3 h-3 mr-1" />应用筛选
          </Button>
        </div>

        {showPreview && (
          <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1 p-2 bg-muted/30 rounded">
            {filteredStocks.slice(0, 80).map(s => (
              <Badge key={s.symbol} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{s.symbol}</Badge>
            ))}
            {filteredStocks.length > 80 && (
              <Badge variant="secondary" className="text-[10px]">+{filteredStocks.length - 80} 更多</Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Compare Records Panel ────────────────────────────────────────────────────
function CompareRecordsPanel({ sessions }: { sessions: any[] }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data: compareData, isLoading } = trpc.backtest.compareRecords.useQuery(
    { ids: selectedIds },
    { enabled: selectedIds.length >= 2 }
  );

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : prev.length < 10 ? [...prev, id] : prev);

  const completedSessions = sessions.filter(s => s.status === "completed");

  const chartData = useMemo(() => {
    if (!compareData?.sessions) return [];
    const curves = compareData.sessions.filter(s => s.equityCurve?.length > 0);
    if (curves.length === 0) return [];
    const maxLen = Math.max(...curves.map(s => s.equityCurve.length));
    return Array.from({ length: maxLen }, (_, i) => {
      const pt: any = { i };
      for (const s of curves) {
        const idx = Math.min(i, s.equityCurve.length - 1);
        const init = s.initialCapital;
        pt[s.id] = init > 0 ? ((s.equityCurve[idx].equity - init) / init * 100) : 0;
      }
      return pt;
    });
  }, [compareData]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">选择 2-10 条已完成的回测记录进行横向对比</p>

      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {completedSessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />暂无已完成的回测记录
          </div>
        ) : completedSessions.map((s, idx) => {
          const isSelected = selectedIds.includes(s.id);
          const ret = Number(s.totalReturnPct) * 100;
          return (
            <div key={s.id} onClick={() => toggleSelect(s.id)}
              className={`flex items-center gap-2.5 p-2.5 rounded border cursor-pointer transition-colors ${
                isSelected ? "bg-primary/10 border-primary/50" : "border-border/30 hover:border-border/60"
              }`}>
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                isSelected ? "bg-primary border-primary" : "border-muted-foreground"
              }`}>
                {isSelected && <span className="text-[8px] text-primary-foreground font-bold">✓</span>}
              </div>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{s.name}</div>
                <div className="text-[10px] text-muted-foreground">{s.strategy} · {s.startDate}~{s.endDate}</div>
              </div>
              <span className={`text-xs font-mono font-bold shrink-0 ${ret >= 0 ? "text-green-400" : "text-red-400"}`}>
                {ret >= 0 ? "+" : ""}{ret.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {selectedIds.length >= 2 && (
        isLoading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1" />加载对比数据...
          </div>
        ) : compareData ? (
          <div className="space-y-4">
            {/* Metrics table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 pr-3 text-muted-foreground font-normal w-24">指标</th>
                    {compareData.sessions.map((s, i) => (
                      <th key={s.id} className="text-right py-2 px-2 font-medium text-xs" style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>
                        {s.name.replace("[对比] ", "").split(" - ").slice(-1)[0] || s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {[
                    { label: "总收益率", key: "totalReturnPct", fmt: (v: any) => `${(v * 100).toFixed(2)}%`, best: "max" },
                    { label: "胜率", key: "winRate", fmt: (v: any) => `${(v * 100).toFixed(1)}%`, best: "max" },
                    { label: "最大回撤", key: "maxDrawdown", fmt: (v: any) => `-${(v * 100).toFixed(2)}%`, best: "min" },
                    { label: "夏普比率", key: "sharpeRatio", fmt: (v: any) => Number(v).toFixed(3), best: "max" },
                    { label: "总交易数", key: "totalTrades", fmt: (v: any) => String(v), best: null },
                    { label: "股票数量", key: "symbolCount", fmt: (v: any) => `${v} 只`, best: null },
                    { label: "初始资金", key: "initialCapital", fmt: (v: number) => `$${v.toLocaleString()}`, best: null },
                    { label: "最大仓位", key: "maxPositionPct", fmt: (v: number) => `${v}%`, best: null },
                    { label: "开始日期", key: "startDate", fmt: (v: string) => v, best: null },
                    { label: "结束日期", key: "endDate", fmt: (v: string) => v, best: null },
                    { label: "策略参数", key: "strategyParams", fmt: (v: any) => v ? JSON.stringify(v).slice(0, 40) + (JSON.stringify(v).length > 40 ? "..." : "") : "默认", best: null },
                  ].map((metric: { label: string; key: string; fmt: (v: any) => string; best: string | null }) => {
                    const vals = compareData.sessions.map(s => (s as any)[metric.key]);
                    const numVals = vals.filter(v => typeof v === "number") as number[];
                    const bestVal = metric.best === "max" ? Math.max(...numVals) : metric.best === "min" ? Math.min(...numVals) : null;
                    return (
                      <tr key={metric.key}>
                        <td className="py-1.5 pr-3 text-muted-foreground">{metric.label}</td>
                        {compareData.sessions.map((s, i) => {
                          const val = (s as any)[metric.key];
                          const isBest = bestVal !== null && typeof val === "number" && val === bestVal;
                          return (
                            <td key={s.id} className={`py-1.5 px-2 text-right font-mono ${isBest ? "text-green-400 font-bold" : ""}`}>
                              {typeof val === "string" ? val : metric.fmt(val as any)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Equity curve chart */}
            {chartData.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">收益率曲线对比</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="i" hide />
                    <YAxis tickFormatter={v => `${Number(v).toFixed(0)}%`} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v: any, name: any) => {
                        const s = compareData.sessions.find(s => String(s.id) === String(name));
                        return [`${Number(v).toFixed(2)}%`, s?.name.split(" - ").slice(-1)[0] || name];
                      }}
                      contentStyle={{ background: "#1a1a2e", border: "1px solid #333", fontSize: 10 }}
                    />
                    <Legend formatter={(v) => {
                      const s = compareData.sessions.find(s => String(s.id) === String(v));
                      return s?.name.split(" - ").slice(-1)[0] || v;
                    }} wrapperStyle={{ fontSize: 10 }} />
                    {compareData.sessions.map((s, i) => (
                      <Line key={s.id} type="monotone" dataKey={String(s.id)}
                        stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} dot={false} strokeWidth={1.5} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : null
      )}
    </div>
  );
}

// ─── Main BacktestPage ────────────────────────────────────────────────────────
export default function BacktestPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  // Form state
  const [name, setName] = useState(`回测_${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`);
  const [strategy, setStrategy] = useState<StrategyKey>("standard");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(STOCK_POOL.map(s => s.symbol));
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); return d.toISOString().split("T")[0]; });
  const [endDate] = useState(new Date().toISOString().split("T")[0]);
  const [initialCapital, setInitialCapital] = useState(100000);
  const [maxPositionPct, setMaxPositionPct] = useState(10);
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>({ ...DEFAULT_PARAMS["standard"] });

  // Multi-strategy compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareStrategies, setCompareStrategies] = useState<StrategyKey[]>(["standard", "aggressive"]);

  const { data: strategiesData } = trpc.backtest.strategies.useQuery();
  const { data: historyData, isLoading: historyLoading } = trpc.backtest.list.useQuery(undefined, {
    enabled: isAuthenticated, refetchInterval: 5000,
  });

  const createMutation = trpc.backtest.create.useMutation({
    onSuccess: ({ sessionId }) => {
      toast.success("回测已启动！");
      utils.backtest.list.invalidate();
      navigate(`/backtest/${sessionId}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const compareStrategiesMutation = trpc.backtest.compareStrategies.useMutation({
    onSuccess: ({ count }) => {
      toast.success(`已并行启动 ${count} 个策略对比回测！`);
      utils.backtest.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.backtest.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); utils.backtest.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const exportMutation = trpc.backtest.exportExcel.useMutation({
    onSuccess: (data: { filename: string; base64: string }) => {
      const blob = new Blob([Buffer.from(data.base64, "base64")], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const aiAnalyzeMutation = trpc.backtest.aiAnalyze.useMutation({
    onSuccess: () => { toast.success("AI 分析完成！"); utils.backtest.list.invalidate(); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleStrategyChange = (key: StrategyKey) => {
    setStrategy(key);
    setStrategyParams({ ...(DEFAULT_PARAMS[key] || DEFAULT_PARAMS["standard"]) });
  };

  const handleSubmit = () => {
    if (!isAuthenticated) { toast.error("请先登录"); return; }
    if (selectedSymbols.length === 0) { toast.error("请选择至少一只股票"); return; }
    const params = Object.keys(strategyParams).length > 0 ? strategyParams : undefined;
    if (compareMode) {
      if (compareStrategies.length < 2) { toast.error("请选择至少2个策略进行对比"); return; }
      compareStrategiesMutation.mutate({
        name, strategies: compareStrategies, symbols: selectedSymbols,
        startDate, endDate, initialCapital, maxPositionPct, strategyParams: params,
      });
    } else {
      createMutation.mutate({
        name, strategy, symbols: selectedSymbols,
        startDate, endDate, initialCapital, maxPositionPct, strategyParams: params,
      });
    }
  };

  const toggleCompareStrategy = (key: StrategyKey) =>
    setCompareStrategies(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const strategies = strategiesData || [];
  const isSubmitting = createMutation.isPending || compareStrategiesMutation.isPending;

  const getStatusBadge = (status: string) => {
    if (status === "completed") return <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/50 px-1 py-0">完成</Badge>;
    if (status === "running") return <Badge variant="outline" className="text-[10px] text-yellow-400 border-yellow-400/50 px-1 py-0">运行中</Badge>;
    if (status === "failed") return <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/50 px-1 py-0">失败</Badge>;
    return <Badge variant="outline" className="text-[10px] text-muted-foreground px-1 py-0">等待</Badge>;
  };

  // Quick presets
  const PRESETS = [
    { label: "AI科技 TOP", sectors: ["AI", "Semiconductor", "Cloud"] as StockSector[], caps: [] as MarketCapTier[] },
    { label: "大盘价值股", sectors: [] as StockSector[], caps: ["large"] as MarketCapTier[] },
    { label: "中小盘成长", sectors: [] as StockSector[], caps: ["mid", "small"] as MarketCapTier[] },
    { label: "能源+金融", sectors: ["Energy", "Finance"] as StockSector[], caps: [] as MarketCapTier[] },
    { label: "医疗健康", sectors: ["Healthcare", "Biotech"] as StockSector[], caps: [] as MarketCapTier[] },
    { label: "消费+零售", sectors: ["Consumer", "Retail"] as StockSector[], caps: [] as MarketCapTier[] },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />回测中心
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">多维筛选股票池，配置策略参数，运行历史回测</p>
        </div>
        {!isAuthenticated && (
          <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-xs">
            <AlertCircle className="w-3 h-3 mr-1" />请先登录
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: Config (2/3 width) ── */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="config">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="config">基础配置</TabsTrigger>
              <TabsTrigger value="params">
                <SlidersHorizontal className="w-3 h-3 mr-1" />参数调优
              </TabsTrigger>
              <TabsTrigger value="history">历史记录</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Config ── */}
            <TabsContent value="config" className="space-y-4 mt-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-xs">回测名称</Label>
                <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm" />
              </div>

              {/* Stock pool */}
              <StockPoolSelector selectedSymbols={selectedSymbols} onChange={setSelectedSymbols} />

              {/* Quick presets */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">快速预设</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="text-xs h-7"
                    onClick={() => { setSelectedSymbols(STOCK_POOL.map(s => s.symbol)); toast.success(`已选全部 ${STOCK_POOL.length} 只`); }}>
                    全部股票
                  </Button>
                  {PRESETS.map(p => (
                    <Button key={p.label} size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => {
                        const filtered = filterStocks(STOCK_POOL, {
                          sectors: p.sectors.length > 0 ? p.sectors : undefined,
                          marketCapTiers: p.caps.length > 0 ? p.caps : undefined,
                        });
                        setSelectedSymbols(filtered.map(s => s.symbol));
                        toast.success(`${p.label}：已选 ${filtered.length} 只`);
                      }}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Strategy */}
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />策略选择
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">多策略对比</span>
                      <button onClick={() => setCompareMode(!compareMode)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${compareMode ? "bg-primary" : "bg-muted"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${compareMode ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {strategies.map(s => {
                      const isActive = compareMode ? compareStrategies.includes(s.key as StrategyKey) : strategy === s.key;
                      return (
                        <button key={s.key}
                          onClick={() => compareMode ? toggleCompareStrategy(s.key as StrategyKey) : handleStrategyChange(s.key as StrategyKey)}
                          className={`text-left p-3 rounded border transition-colors ${isActive ? "bg-primary/15 border-primary" : "border-border/30 hover:border-border"}`}>
                          <div className="flex items-center gap-2">
                            {compareMode && (
                              <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${
                                isActive ? "bg-primary border-primary" : "border-muted-foreground"
                              }`}>
                                {isActive && <span className="text-[7px] text-primary-foreground font-bold">✓</span>}
                              </div>
                            )}
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STRATEGY_COLORS[s.key as StrategyKey] || "#888" }} />
                            <span className="text-xs font-medium">{s.name}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                        </button>
                      );
                    })}
                  </div>
                  {compareMode && compareStrategies.length >= 2 && (
                    <p className="text-xs text-green-400 mt-2">✓ 已选 {compareStrategies.length} 个策略，将并行运行并生成对比报告</p>
                  )}
                </CardContent>
              </Card>

              {/* Date & Capital */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">开始日期</Label>
                  <Input type="date" value={startDate} onChange={e => { }} className="h-8 text-sm" readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">结束日期</Label>
                  <Input type="date" value={endDate} className="h-8 text-sm" readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">初始资金 ($)</Label>
                  <Input type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">最大仓位 (%)</Label>
                  <Input type="number" min={1} max={100} value={maxPositionPct} onChange={e => setMaxPositionPct(Number(e.target.value))} className="h-8 text-sm" />
                </div>
              </div>

              {/* Submit */}
              <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || !isAuthenticated}>
                {isSubmitting ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />启动中...</>
                ) : compareMode ? (
                  <><GitCompare className="w-4 h-4 mr-2" />启动 {compareStrategies.length} 策略并行对比回测</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" />启动回测</>
                )}
              </Button>
            </TabsContent>

            {/* ── Tab 2: Param Tuning ── */}
            <TabsContent value="params" className="mt-4">
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">策略参数调优</CardTitle>
                  <CardDescription className="text-xs">
                    当前策略：{strategies.find(s => s.key === strategy)?.name || strategy}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(PARAM_DEFS[strategy] || PARAM_DEFS["standard"]).map(def => {
                    const val = strategyParams[def.key] ?? (DEFAULT_PARAMS[strategy] as any)?.[def.key] ?? def.min;
                    const defaultVal = (DEFAULT_PARAMS[strategy] as any)?.[def.key];
                    const isModified = val !== defaultVal;
                    return (
                      <div key={def.key} className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <Label className="text-xs flex items-center gap-1">
                            {def.label}
                            {isModified && <Badge variant="outline" className="text-[10px] px-1 py-0 text-primary border-primary">已修改</Badge>}
                          </Label>
                          <span className="text-xs font-mono text-primary">{def.format(val)}</span>
                        </div>
                        <Slider min={def.min} max={def.max} step={def.step} value={[val]}
                          onValueChange={([v]) => setStrategyParams(prev => ({ ...prev, [def.key]: v }))} />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{def.format(def.min)}</span>
                          <span>默认: {def.format(defaultVal)}</span>
                          <span>{def.format(def.max)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="ghost" className="text-xs w-full"
                    onClick={() => setStrategyParams({ ...(DEFAULT_PARAMS[strategy] || DEFAULT_PARAMS["standard"]) })}>
                    <RefreshCw className="w-3 h-3 mr-1" />重置为默认值
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab 3: History ── */}
            <TabsContent value="history" className="mt-4">
              <Tabs defaultValue="list">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="list">历史记录</TabsTrigger>
                  <TabsTrigger value="compare"><GitCompare className="w-3 h-3 mr-1" />记录对比</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="mt-3 space-y-2">
                  {!isAuthenticated ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">请先登录查看历史记录</div>
                  ) : historyLoading ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1" />加载中...
                    </div>
                  ) : !historyData?.length ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">暂无回测记录</div>
                  ) : (
                    historyData.map(s => {
                      const ret = Number(s.totalReturnPct) * 100;
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 p-3 rounded border border-border/30 hover:border-border/60 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-xs font-medium truncate">{s.name}</span>
                              {getStatusBadge(s.status)}
                              {s.strategy === "gemini_ai" && <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {s.strategy} · {s.startDate}~{s.endDate} · {((s.symbols as string[]) || []).length} 只
                              {s.status === "running" && s.progress !== null && (
                                <span className="text-yellow-400 ml-1">{s.progressMessage || `${s.progress}%`}</span>
                              )}
                            </div>
                          </div>
                          {s.status === "completed" && (
                            <span className={`text-xs font-mono font-bold shrink-0 ${ret >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {ret >= 0 ? "+" : ""}{ret.toFixed(1)}%
                            </span>
                          )}
                          <div className="flex gap-0.5 shrink-0">
                            {s.status === "completed" && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(`/backtest/${s.id}`)}>
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                  onClick={() => exportMutation.mutate({ id: s.id })} disabled={exportMutation.isPending} title="导出Excel">
                                  <Download className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-cyan-400"
                                  onClick={() => aiAnalyzeMutation.mutate({ id: s.id })} disabled={aiAnalyzeMutation.isPending} title="AI 分析">
                                  <Cpu className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                              onClick={() => deleteMutation.mutate({ id: s.id })} disabled={deleteMutation.isPending}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </TabsContent>

                <TabsContent value="compare" className="mt-3">
                  <CompareRecordsPanel sessions={historyData || []} />
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Right: Summary (1/3 width) ── */}
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />配置摘要
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">股票数量</span>
                <span className="font-medium">{selectedSymbols.length} 只</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">策略</span>
                <span className="font-medium text-right max-w-[60%] truncate">
                  {compareMode
                    ? `${compareStrategies.length} 策略并行`
                    : strategies.find(s => s.key === strategy)?.name || strategy}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">回测区间</span>
                <span className="font-medium text-right">{startDate.slice(0, 7)} ~ {endDate.slice(0, 7)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">初始资金</span>
                <span className="font-medium">${initialCapital.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">最大仓位</span>
                <span className="font-medium">{maxPositionPct}%</span>
              </div>
              {Object.entries(strategyParams).some(([k, v]) => v !== (DEFAULT_PARAMS[strategy] as any)?.[k]) && (
                <div className="pt-2 border-t border-border/30 space-y-1.5">
                  <span className="text-muted-foreground">自定义参数</span>
                  {Object.entries(strategyParams)
                    .filter(([k, v]) => v !== (DEFAULT_PARAMS[strategy] as any)?.[k])
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground text-[10px]">{k}</span>
                        <span className="font-medium text-primary text-[10px]">{String(v)}</span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent results */}
          {isAuthenticated && historyData && historyData.filter(s => s.status === "completed").length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">最近完成</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {historyData.filter(s => s.status === "completed").slice(0, 5).map(s => {
                  const ret = Number(s.totalReturnPct) * 100;
                  return (
                    <div key={s.id} className="flex items-center justify-between cursor-pointer hover:opacity-80"
                      onClick={() => navigate(`/backtest/${s.id}`)}>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs truncate">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.strategy}</div>
                      </div>
                      <span className={`text-xs font-mono font-bold ml-2 shrink-0 ${ret >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {ret >= 0 ? "+" : ""}{ret.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
