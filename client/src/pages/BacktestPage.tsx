import { useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart2, Plus, Trash2, Download, Eye, Cpu, RefreshCw, Settings2, SlidersHorizontal, Info } from "lucide-react";
import { STOCK_POOL } from "@shared/stockPool";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const DATE_PRESETS = [
  { label: "近1年", start: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; }, end: () => new Date().toISOString().split("T")[0] },
  { label: "近3年", start: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 3); return d.toISOString().split("T")[0]; }, end: () => new Date().toISOString().split("T")[0] },
  { label: "近5年", start: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 5); return d.toISOString().split("T")[0]; }, end: () => new Date().toISOString().split("T")[0] },
];

const QUICK_SYMBOLS = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "SPY", "QQQ", "GOOGL", "META", "AMD"];

// Strategy-specific param definitions
const STRATEGY_PARAM_DEFS: Record<string, Array<{
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  description: string;
}>> = {
  standard: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.20, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止损卖出的亏损百分比" },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.50, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止盈卖出的盈利百分比" },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 0, max: 120, step: 5, format: v => v === 0 ? "不限" : `${v}天`, description: "超过此天数强制卖出（0=不限）" },
  ],
  aggressive: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止损卖出的亏损百分比" },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.30, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止盈卖出的盈利百分比" },
    { key: "trailingStopPct", label: "追踪止损", min: 0, max: 0.10, step: 0.01, format: v => v === 0 ? "关闭" : `${(v * 100).toFixed(0)}%`, description: "从最高点回落此比例时止损" },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 5, max: 90, step: 5, format: v => `${v}天`, description: "超过此天数强制卖出" },
  ],
  ladder_cd_combo: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止损卖出的亏损百分比" },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.40, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止盈卖出的盈利百分比" },
    { key: "trailingStopPct", label: "追踪止损", min: 0, max: 0.10, step: 0.01, format: v => v === 0 ? "关闭" : `${(v * 100).toFixed(0)}%`, description: "从最高点回落此比例时止损" },
    { key: "minLadderGap", label: "最小梯子间距", min: 0, max: 0.05, step: 0.005, format: v => v === 0 ? "不限" : `${(v * 100).toFixed(1)}%`, description: "蓝梯与黄梯之间的最小价差" },
  ],
  mean_reversion: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止损卖出的亏损百分比" },
    { key: "takeProfitPct", label: "止盈比例", min: 0.03, max: 0.25, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止盈卖出的盈利百分比" },
    { key: "rsiOversold", label: "RSI 超卖阈值", min: 15, max: 40, step: 1, format: v => `${v}`, description: "RSI 低于此值触发买入信号" },
    { key: "rsiOverbought", label: "RSI 超买阈值", min: 60, max: 85, step: 1, format: v => `${v}`, description: "RSI 高于此值触发卖出信号" },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 5, max: 60, step: 5, format: v => `${v}天`, description: "超过此天数强制卖出" },
  ],
  macd_volume: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止损卖出的亏损百分比" },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.40, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止盈卖出的盈利百分比" },
    { key: "volumeMultiplier", label: "量能倍数", min: 1.0, max: 3.0, step: 0.1, format: v => `${v.toFixed(1)}x`, description: "成交量需超过均量的倍数才触发" },
    { key: "trailingStopPct", label: "追踪止损", min: 0, max: 0.10, step: 0.01, format: v => v === 0 ? "关闭" : `${(v * 100).toFixed(0)}%`, description: "从最高点回落此比例时止损" },
  ],
  bollinger_squeeze: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.15, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止损卖出的亏损百分比" },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.35, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止盈卖出的盈利百分比" },
    { key: "bbPeriod", label: "布林带周期", min: 10, max: 50, step: 2, format: v => `${v}日`, description: "布林带计算的均线周期" },
    { key: "bbMultiplier", label: "布林带倍数", min: 1.0, max: 3.0, step: 0.1, format: v => `${v.toFixed(1)}σ`, description: "布林带宽度的标准差倍数" },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 5, max: 60, step: 5, format: v => `${v}天`, description: "超过此天数强制卖出" },
  ],
  gemini_ai: [
    { key: "stopLossPct", label: "止损比例", min: 0.02, max: 0.20, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止损卖出的亏损百分比" },
    { key: "takeProfitPct", label: "止盈比例", min: 0.05, max: 0.50, step: 0.01, format: v => `${(v * 100).toFixed(0)}%`, description: "触发止盈卖出的盈利百分比" },
    { key: "maxHoldingDays", label: "最大持仓天数", min: 0, max: 120, step: 5, format: v => v === 0 ? "不限" : `${v}天`, description: "超过此天数强制卖出（0=不限）" },
  ],
};

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  standard: { stopLossPct: 0.08, takeProfitPct: 0.20, maxHoldingDays: 0 },
  aggressive: { stopLossPct: 0.06, takeProfitPct: 0.12, trailingStopPct: 0.04, maxHoldingDays: 30 },
  ladder_cd_combo: { stopLossPct: 0.07, takeProfitPct: 0.15, trailingStopPct: 0.05, minLadderGap: 0 },
  mean_reversion: { stopLossPct: 0.06, takeProfitPct: 0.10, rsiOversold: 30, rsiOverbought: 70, maxHoldingDays: 20 },
  macd_volume: { stopLossPct: 0.07, takeProfitPct: 0.15, volumeMultiplier: 1.5, trailingStopPct: 0.05 },
  bollinger_squeeze: { stopLossPct: 0.06, takeProfitPct: 0.12, bbPeriod: 20, bbMultiplier: 2, maxHoldingDays: 15 },
  gemini_ai: { stopLossPct: 0.08, takeProfitPct: 0.20, maxHoldingDays: 0 },
};

// Simulated preview: generate synthetic equity curve for parameter visualization
function simulateParamImpact(
  stopLoss: number,
  takeProfit: number,
  maxHoldDays: number
): Array<{ day: number; conservative: number; current: number; aggressive: number }> {
  const points = 30;
  const data = [];
  let conservative = 100, current = 100, aggressive = 100;

  for (let i = 0; i <= points; i++) {
    // Simulate how different param combos affect returns (illustrative)
    const noise = (Math.random() - 0.48) * 3;
    const trend = 0.15; // slight upward bias

    // Conservative (wider stop, lower TP): slower gains, fewer cuts
    const cNoise = noise * 0.8 + trend * 0.8;
    conservative = Math.max(70, conservative * (1 + cNoise / 100));

    // Current params
    const curNoise = noise + trend;
    current = Math.max(70, current * (1 + curNoise / 100));

    // Aggressive (tight stop, high TP): more volatile
    const aNoise = noise * 1.3 + trend * 1.2;
    aggressive = Math.max(70, aggressive * (1 + aNoise / 100));

    data.push({
      day: i,
      conservative: Math.round(conservative * 10) / 10,
      current: Math.round(current * 10) / 10,
      aggressive: Math.round(aggressive * 10) / 10,
    });
  }
  return data;
}

export default function BacktestPage() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    name: "",
    strategy: "standard",
    symbols: ["AAPL", "TSLA", "NVDA"],
    startDate: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); return d.toISOString().split("T")[0]; })(),
    endDate: new Date().toISOString().split("T")[0],
    initialCapital: 100000,
    maxPositionPct: 10,
  });
  const [symbolInput, setSymbolInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState("config");

  // Strategy params state
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>(
    () => ({ ...DEFAULT_PARAMS["standard"] })
  );

  const paramDefs = STRATEGY_PARAM_DEFS[form.strategy] || STRATEGY_PARAM_DEFS["standard"];

  // When strategy changes, reset params to defaults
  const handleStrategyChange = (v: string) => {
    setForm(f => ({ ...f, strategy: v }));
    setStrategyParams({ ...(DEFAULT_PARAMS[v] || DEFAULT_PARAMS["standard"]) });
  };

  const updateParam = (key: string, val: number) => {
    setStrategyParams(prev => ({ ...prev, [key]: val }));
  };

  // Simulated preview data based on stopLoss/takeProfit
  const previewData = useMemo(() => {
    const sl = strategyParams.stopLossPct ?? 0.08;
    const tp = strategyParams.takeProfitPct ?? 0.20;
    const mh = strategyParams.maxHoldingDays ?? 0;
    return simulateParamImpact(sl, tp, mh);
  }, [strategyParams.stopLossPct, strategyParams.takeProfitPct, strategyParams.maxHoldingDays]);

  const { data: strategies } = trpc.backtest.strategies.useQuery();
  const { data: sessions, isLoading: sessionsLoading } = trpc.backtest.list.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 5000 }
  );

  const createMutation = trpc.backtest.create.useMutation({
    onSuccess: ({ sessionId }) => {
      toast.success(`回测已启动 (ID: ${sessionId})`);
      utils.backtest.list.invalidate();
      setForm(f => ({ ...f, name: "" }));
      setActiveTab("history");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.backtest.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); utils.backtest.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const batchDeleteMutation = trpc.backtest.batchDelete.useMutation({
    onSuccess: ({ deleted }) => { toast.success(`已删除 ${deleted} 条`); setSelectedIds([]); utils.backtest.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

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
    onSuccess: () => { toast.success("AI 分析完成"); utils.backtest.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const addSymbol = (s: string) => {
    const sym = s.trim().toUpperCase();
    if (sym && !form.symbols.includes(sym)) setForm(f => ({ ...f, symbols: [...f.symbols, sym] }));
    setSymbolInput("");
  };

  const removeSymbol = (s: string) => setForm(f => ({ ...f, symbols: f.symbols.filter(x => x !== s) }));
  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCreate = () => {
    if (!form.name) { toast.error("请填写回测名称"); return; }
    if (form.symbols.length === 0) { toast.error("请至少选择一只股票"); return; }
    createMutation.mutate({ ...form as any, strategyParams });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running": return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">运行中</Badge>;
      case "completed": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">已完成</Badge>;
      case "failed": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">失败</Badge>;
      default: return <Badge variant="secondary">等待中</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">回测中心</h1>
        {!isAuthenticated && (
          <Button variant="outline" onClick={() => setLocation("/auth")} size="sm">
            登录后使用回测功能
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config Panel with Tabs */}
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" /> 新建回测
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full rounded-none border-b border-border bg-transparent h-8">
                <TabsTrigger value="config" className="flex-1 text-xs h-7 data-[state=active]:bg-muted">
                  <Settings2 className="h-3 w-3 mr-1" /> 基础配置
                </TabsTrigger>
                <TabsTrigger value="params" className="flex-1 text-xs h-7 data-[state=active]:bg-muted">
                  <SlidersHorizontal className="h-3 w-3 mr-1" /> 参数调优
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1 text-xs h-7 data-[state=active]:bg-muted">
                  <BarChart2 className="h-3 w-3 mr-1" /> 历史
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Basic Config */}
              <TabsContent value="config" className="p-4 space-y-4 mt-0">
                <div className="space-y-1.5">
                  <Label className="text-xs">回测名称 *</Label>
                  <Input
                    placeholder="例：NVDA 2年标准策略"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="bg-input border-border h-8 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">策略 *</Label>
                  <Select value={form.strategy} onValueChange={handleStrategyChange}>
                    <SelectTrigger className="bg-input border-border h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {strategies?.map(s => (
                        <SelectItem key={s.key} value={s.key}>
                          <div className="flex items-center gap-2">
                            {s.key === "gemini_ai" && <Cpu className="h-3 w-3 text-cyan-400" />}
                            {s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.strategy && strategies && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {strategies.find(s => s.key === form.strategy)?.description}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">股票池 *</Label>
                  <div className="flex gap-1 flex-wrap mb-1">
                    {QUICK_SYMBOLS.map(s => (
                      <button
                        key={s}
                        onClick={() => addSymbol(s)}
                        className={`px-1.5 py-0.5 text-xs rounded border transition-colors ${
                          form.symbols.includes(s)
                            ? "bg-primary/20 text-primary border-primary/30"
                            : "bg-muted text-muted-foreground border-border hover:border-primary/30"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Input
                      placeholder="输入代码后回车"
                      value={symbolInput}
                      onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === "Enter" && addSymbol(symbolInput)}
                      className="bg-input border-border h-7 text-xs"
                    />
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => addSymbol(symbolInput)}>添加</Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.symbols.map(s => (
                      <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs border border-primary/20">
                        {s}
                        <button onClick={() => removeSymbol(s)} className="hover:text-destructive">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">开始日期</Label>
                    <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="bg-input border-border h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">结束日期</Label>
                    <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="bg-input border-border h-8 text-xs" />
                  </div>
                </div>

                <div className="flex gap-1">
                  {DATE_PRESETS.map(p => (
                    <Button key={p.label} variant="outline" size="sm" className="h-6 text-xs px-2 flex-1"
                      onClick={() => setForm(f => ({ ...f, startDate: p.start(), endDate: p.end() }))}>
                      {p.label}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">初始资金 ($)</Label>
                    <Input type="number" value={form.initialCapital} onChange={e => setForm(f => ({ ...f, initialCapital: Number(e.target.value) }))} className="bg-input border-border h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">最大仓位 (%)</Label>
                    <Input type="number" value={form.maxPositionPct} onChange={e => setForm(f => ({ ...f, maxPositionPct: Number(e.target.value) }))} className="bg-input border-border h-8 text-xs" min={1} max={100} />
                  </div>
                </div>

                <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending || !isAuthenticated}>
                  {createMutation.isPending ? "启动中..." : "启动回测"}
                </Button>
              </TabsContent>

              {/* Tab 2: Strategy Params Tuning */}
              <TabsContent value="params" className="p-4 space-y-5 mt-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">{strategies?.find(s => s.key === form.strategy)?.name || form.strategy}</Badge>
                  <span className="text-xs text-muted-foreground">参数调优</span>
                </div>

                {paramDefs.map(def => (
                  <div key={def.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-medium">{def.label}</Label>
                        <span title={def.description}>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </span>
                      </div>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {def.format(strategyParams[def.key] ?? (def.min + def.max) / 2)}
                      </span>
                    </div>
                    <Slider
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={[strategyParams[def.key] ?? (def.min + def.max) / 2]}
                      onValueChange={([v]) => updateParam(def.key, v)}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{def.format(def.min)}</span>
                      <span className="text-muted-foreground/60">默认: {def.format(DEFAULT_PARAMS[form.strategy]?.[def.key] ?? def.min)}</span>
                      <span>{def.format(def.max)}</span>
                    </div>
                  </div>
                ))}

                <Separator />

                {/* Parameter Impact Preview Chart */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">参数影响预览</span>
                    <Badge variant="secondary" className="text-xs h-4">模拟</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    下图展示当前参数（蓝线）与保守/激进参数的模拟收益对比，仅供参考。
                  </p>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={previewData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }}
                          formatter={(v: number) => [`${v.toFixed(1)}`, ""]}
                        />
                        <Line type="monotone" dataKey="conservative" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="保守" />
                        <Line type="monotone" dataKey="current" stroke="#3b82f6" strokeWidth={2} dot={false} name="当前参数" strokeDasharray="0" />
                        <Line type="monotone" dataKey="aggressive" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="激进" />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => setStrategyParams({ ...(DEFAULT_PARAMS[form.strategy] || DEFAULT_PARAMS["standard"]) })}
                  >
                    重置默认
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs h-7"
                    onClick={() => setActiveTab("config")}
                  >
                    应用参数
                  </Button>
                </div>

                {/* Current param summary */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">当前参数摘要</p>
                  {paramDefs.map(def => (
                    <div key={def.key} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{def.label}</span>
                      <span className={
                        strategyParams[def.key] !== DEFAULT_PARAMS[form.strategy]?.[def.key]
                          ? "text-yellow-400 font-medium"
                          : "text-foreground"
                      }>
                        {def.format(strategyParams[def.key] ?? def.min)}
                        {strategyParams[def.key] !== DEFAULT_PARAMS[form.strategy]?.[def.key] && " *"}
                      </span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground mt-1">* 已修改默认值</p>
                </div>

                <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending || !isAuthenticated}>
                  {createMutation.isPending ? "启动中..." : "使用当前参数启动回测"}
                </Button>
              </TabsContent>

              {/* Tab 3: History (compact) */}
              <TabsContent value="history" className="p-3 mt-0">
                {!isAuthenticated ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>请登录后查看回测记录</p>
                  </div>
                ) : sessionsLoading ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">加载中...</div>
                ) : !sessions || sessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>暂无回测记录</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {sessions.slice(0, 10).map(session => (
                      <div key={session.id} className="flex items-center gap-2 p-2 rounded bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-medium text-xs truncate">{session.name}</span>
                            {getStatusBadge(session.status)}
                          </div>
                          {session.status === "completed" && (
                            <span className={`text-xs ${Number(session.totalReturnPct) >= 0 ? "text-gain" : "text-loss"}`}>
                              {(Number(session.totalReturnPct) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {session.status === "completed" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setLocation(`/backtest/${session.id}`)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right: Full Sessions List */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart2 className="h-4 w-4" /> 回测记录
              </CardTitle>
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <Button variant="destructive" size="sm" className="h-7 text-xs"
                    onClick={() => batchDeleteMutation.mutate({ ids: selectedIds })}
                    disabled={batchDeleteMutation.isPending}>
                    <Trash2 className="h-3 w-3 mr-1" /> 删除 {selectedIds.length} 条
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7" onClick={() => utils.backtest.list.invalidate()}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!isAuthenticated ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>请登录后查看回测记录</p>
              </div>
            ) : sessionsLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
            ) : !sessions || sessions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>暂无回测记录，创建第一个回测吧</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map(session => (
                  <div key={session.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Checkbox checked={selectedIds.includes(session.id)} onCheckedChange={() => toggleSelect(session.id)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">{session.name}</span>
                        {getStatusBadge(session.status)}
                        {session.strategy === "gemini_ai" && <Cpu className="h-3 w-3 text-cyan-400" />}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{session.startDate} ~ {session.endDate}</span>
                        <span>{(session.symbols as string[])?.slice(0, 3).join(", ")}{(session.symbols as string[])?.length > 3 ? "..." : ""}</span>
                        {session.status === "completed" && (
                          <>
                            <span className={Number(session.totalReturnPct) >= 0 ? "text-gain" : "text-loss"}>
                              {(Number(session.totalReturnPct) * 100).toFixed(1)}%
                            </span>
                            <span>胜率 {(Number(session.winRate) * 100).toFixed(0)}%</span>
                            <span>夏普 {Number(session.sharpeRatio).toFixed(2)}</span>
                          </>
                        )}
                        {session.status === "running" && session.progress !== null && (
                          <span className="text-blue-400">{session.progressMessage || `${session.progress}%`}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {session.status === "completed" && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLocation(`/backtest/${session.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => exportMutation.mutate({ id: session.id })} disabled={exportMutation.isPending}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-cyan-400"
                            onClick={() => aiAnalyzeMutation.mutate({ id: session.id })} disabled={aiAnalyzeMutation.isPending} title="AI 分析">
                            <Cpu className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: session.id })} disabled={deleteMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
