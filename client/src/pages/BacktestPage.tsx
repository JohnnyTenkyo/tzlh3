import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { BarChart2, Plus, Trash2, Download, Eye, Cpu, RefreshCw } from "lucide-react";
import { STOCK_POOL } from "@shared/stockPool";

const DATE_PRESETS = [
  { label: "近1年", start: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; }, end: () => new Date().toISOString().split("T")[0] },
  { label: "近3年", start: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 3); return d.toISOString().split("T")[0]; }, end: () => new Date().toISOString().split("T")[0] },
  { label: "近5年", start: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 5); return d.toISOString().split("T")[0]; }, end: () => new Date().toISOString().split("T")[0] },
];

const QUICK_SYMBOLS = ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "SPY", "QQQ", "GOOGL", "META", "AMD"];

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
    createMutation.mutate(form as any);
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
        {/* Create Form */}
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" /> 新建回测
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <Select value={form.strategy} onValueChange={v => setForm(f => ({ ...f, strategy: v }))}>
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
                <p className="text-xs text-muted-foreground">
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
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="bg-input border-border h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">结束日期</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="bg-input border-border h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex gap-1">
              {DATE_PRESETS.map(p => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2 flex-1"
                  onClick={() => setForm(f => ({ ...f, startDate: p.start(), endDate: p.end() }))}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">初始资金 ($)</Label>
                <Input
                  type="number"
                  value={form.initialCapital}
                  onChange={e => setForm(f => ({ ...f, initialCapital: Number(e.target.value) }))}
                  className="bg-input border-border h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">最大仓位 (%)</Label>
                <Input
                  type="number"
                  value={form.maxPositionPct}
                  onChange={e => setForm(f => ({ ...f, maxPositionPct: Number(e.target.value) }))}
                  className="bg-input border-border h-8 text-xs"
                  min={1} max={100}
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={createMutation.isPending || !isAuthenticated}
            >
              {createMutation.isPending ? "启动中..." : "启动回测"}
            </Button>
          </CardContent>
        </Card>

        {/* Sessions List */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart2 className="h-4 w-4" /> 回测记录
              </CardTitle>
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => batchDeleteMutation.mutate({ ids: selectedIds })}
                    disabled={batchDeleteMutation.isPending}
                  >
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
                  <div
                    key={session.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <Checkbox
                      checked={selectedIds.includes(session.id)}
                      onCheckedChange={() => toggleSelect(session.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">{session.name}</span>
                        {getStatusBadge(session.status)}
                        {session.strategy === "gemini_ai" && (
                          <Cpu className="h-3 w-3 text-cyan-400" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setLocation(`/backtest/${session.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => exportMutation.mutate({ id: session.id })}
                            disabled={exportMutation.isPending}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-cyan-400"
                            onClick={() => aiAnalyzeMutation.mutate({ id: session.id })}
                            disabled={aiAnalyzeMutation.isPending}
                            title="AI 分析"
                          >
                            <Cpu className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: session.id })}
                        disabled={deleteMutation.isPending}
                      >
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
