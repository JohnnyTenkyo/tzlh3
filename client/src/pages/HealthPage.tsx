import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Activity, RefreshCw, Cpu, CheckCircle, XCircle, AlertCircle, Zap, Play, Clock, Edit2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type TestResult = { success: boolean; candleCount: number; latency: number; error?: string };

function SourceCard({
  sourceKey, info, record, getStatusIcon, getStatusBadge, onEdit, onDelete,
}: {
  sourceKey: string;
  info: { description: string; tier: string; rateLimit: string };
  record: any;
  getStatusIcon: (r: any) => React.ReactNode;
  getStatusBadge: (r: any) => React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [testSymbol, setTestSymbol] = useState("AAPL");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const utils = trpc.useUtils();
  const testMutation = trpc.health.testSource.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      setIsTesting(false);
      if (result.success) toast.success(`${sourceKey} 测试成功：${result.candleCount} 根K线，耗时 ${result.latency}ms`);
      else toast.error(`${sourceKey} 测试失败：${result.error || "无数据返回"}`);
      utils.health.sources.invalidate();
    },
    onError: (err) => { setIsTesting(false); toast.error(`${sourceKey} 测试出错：${err.message}`); },
  });
  const handleTest = () => {
    setIsTesting(true);
    setTestResult(null);
    testMutation.mutate({ source: sourceKey as any, symbol: testSymbol || "AAPL" });
  };
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {getStatusIcon(record || {})}
            <span className="font-medium text-sm capitalize">{sourceKey}</span>
          </div>
          <div className="flex items-center gap-1">
            {getStatusBadge(record || {})}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit}>
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-500" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{info.description}</p>
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div><span className="text-muted-foreground">类型: </span><Badge variant="outline" className="text-xs h-4">{info.tier}</Badge></div>
          <div><span className="text-muted-foreground">限速: </span><span className="text-foreground">{info.rateLimit}</span></div>
          {record && (
            <>
              <div><span className="text-muted-foreground">成功: </span><span className="text-green-400">{record.successCount || 0}</span></div>
              <div><span className="text-muted-foreground">失败: </span><span className="text-red-400">{record.failCount || 0}</span></div>
              {record.lastError && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">最近错误: </span>
                  <span className="text-red-400 text-xs truncate block" title={record.lastError}>{record.lastError}</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t border-border/30 pt-2.5 space-y-2">
          <div className="flex gap-1.5">
            <Input value={testSymbol} onChange={e => setTestSymbol(e.target.value.toUpperCase())}
              placeholder="股票代码" className="h-6 text-xs flex-1 font-mono"
              onKeyDown={e => e.key === "Enter" && handleTest()} />
            <Button size="sm" variant="outline" className="h-6 text-xs px-2 shrink-0" onClick={handleTest} disabled={isTesting}>
              {isTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <><Play className="w-3 h-3 mr-1" />测试</>}
            </Button>
          </div>
          {testResult && (
            <div className={`text-[10px] px-2 py-1.5 rounded flex items-center gap-2 ${
              testResult.success ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              {testResult.success ? <CheckCircle className="w-3 h-3 shrink-0" /> : <XCircle className="w-3 h-3 shrink-0" />}
              <span className="flex-1 truncate">{testResult.success ? `成功 · ${testResult.candleCount} 根K线` : (testResult.error || "无数据返回")}</span>
              <span className="flex items-center gap-0.5 shrink-0 opacity-70"><Clock className="w-2.5 h-2.5" />{testResult.latency}ms</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

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

function AIStatusCard({
  name,
  icon: Icon,
  connected,
  model,
  baseUrl,
  isLoading,
  isPrimary,
  onEdit,
  onDelete,
}: {
  name: string;
  icon: React.ElementType;
  connected: boolean | undefined;
  model: string;
  baseUrl: string;
  isLoading: boolean;
  isPrimary?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const borderColor = connected
    ? "border-cyan-500/30"
    : isLoading
    ? "border-border"
    : "border-red-500/20";

  return (
    <Card className={`bg-card ${borderColor}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <Icon className={`h-5 w-5 ${connected ? "text-cyan-400" : isLoading ? "text-muted-foreground" : "text-red-400"}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{name}</span>
                {isPrimary && <Badge variant="outline" className="text-xs h-4 border-cyan-500/40 text-cyan-400">主要</Badge>}
                {!isPrimary && <Badge variant="outline" className="text-xs h-4 border-yellow-500/40 text-yellow-400">备用</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {model} · {baseUrl}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <>
                <AlertCircle className="h-4 w-4 text-muted-foreground animate-pulse" />
                <Badge variant="secondary" className="text-xs">检测中</Badge>
              </>
            ) : connected ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-400" />
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">已连接</Badge>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-400" />
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">服务不可用</Badge>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit}>
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-500" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HealthPage() {
  const { data: sources, isLoading, refetch } = trpc.health.sources.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );
  const { data: aiStatus, isLoading: aiLoading, refetch: refetchAI } = trpc.health.geminiStatus.useQuery(
    undefined,
    { refetchInterval: 60000 }
  );
  const { data: aiConfigs } = trpc.ai.getConfigs.useQuery();
  const { data: dataSources } = trpc.datasource.getConfigs.useQuery();

  // AI 编辑/删除对话框
  const [aiEditDialog, setAIEditDialog] = useState(false);
  const [selectedAI, setSelectedAI] = useState<number | null>(null);
  const [aiFormData, setAIFormData] = useState({ provider: "", endpoint: "", apiKey: "", model: "" });
  
  // 编辑 AI 的 mutation
  const updateAIMutation = trpc.ai.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("AI 配置已更新");
      setAIEditDialog(false);
      refetchAI();
      utils.ai.getConfigs.invalidate();
    },
    onError: (err) => {
      toast.error(`更新失败: ${err.message}`);
    },
  });
  
  // 创建 AI 的 mutation
  const createAIMutation = trpc.ai.createConfig.useMutation({
    onSuccess: () => {
      toast.success("AI 配置已添加");
      setAIEditDialog(false);
      setAIFormData({ provider: "", endpoint: "", apiKey: "", model: "" });
      refetchAI();
      utils.ai.getConfigs.invalidate();
    },
    onError: (err) => {
      toast.error(`添加失败: ${err.message}`);
    },
  });
  
  // 数据源编辑/删除对话框
  const [dsEditDialog, setDSEditDialog] = useState(false);
  const [selectedDS, setSelectedDS] = useState<number | null>(null);
  const [dsFormData, setDSFormData] = useState({ name: "", provider: "", endpoint: "", apiKey: "", description: "" });
  
  // 编辑数据源的 mutation
  const updateDSMutation = trpc.datasource.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("数据源已更新");
      setDSEditDialog(false);
      refetch();
      utils.datasource.getConfigs.invalidate();
    },
    onError: (err) => {
      toast.error(`更新失败: ${err.message}`);
    },
  });
  
  // 创建数据源的 mutation
  const createDSMutation = trpc.datasource.createConfig.useMutation({
    onSuccess: () => {
      toast.success("数据源已添加");
      setDSEditDialog(false);
      setDSFormData({ name: "", provider: "", endpoint: "", apiKey: "", description: "" });
      refetch();
      utils.datasource.getConfigs.invalidate();
    },
    onError: (err) => {
      toast.error(`添加失败: ${err.message}`);
    },
  });
  
  // 删除确认对话框
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<'ai' | 'ds' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const utils = trpc.useUtils();

  const deleteAIMutation = trpc.ai.deleteConfig.useMutation({
    onSuccess: () => {
      toast.success("AI 配置已删除");
      refetchAI();
      utils.ai.getConfigs.invalidate();
    },
  });

  const deleteDSMutation = trpc.datasource.deleteConfig.useMutation({
    onSuccess: () => {
      toast.success("数据源已删除");
      refetch();
      utils.datasource.getConfigs.invalidate();
    },
    onError: (err) => {
      toast.error(`删除失败: ${err.message}`);
    },
  });

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

  // 内置数据源（始终显示）
  const builtInSources = Object.keys(SOURCE_INFO).map(key => {
    const dbRecord = sources?.find(s => s.source.toLowerCase() === key.toLowerCase());
    return { key, info: SOURCE_INFO[key], record: dbRecord, isBuiltIn: true };
  });

  // 自定义数据源（从 customDataSources 获取）
  const customSources = (dataSources || []).map(ds => ({
    key: ds.name || ds.provider,
    info: {
      description: ds.description || `自定义数据源: ${ds.provider}`,
      tier: "自定义",
      rateLimit: "自定义",
    },
    record: null,
    isBuiltIn: false,
    customSourceId: ds.id,
  }));

  const allSources = [...builtInSources, ...customSources];

  const activeProvider = aiStatus?.activeProvider;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">数据源健康监控</h1>
        <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchAI(); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* AI Status Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-medium">AI 服务状态</h2>
            {activeProvider && activeProvider !== "none" && (
              <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                <Zap className="h-3 w-3 mr-1" />
                当前使用: {activeProvider === "gemini" ? "Gemini" : "OpenAI"}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAIEditDialog(true)}>
            <Plus className="w-3 h-3 mr-1" />
            添加 AI
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {aiConfigs?.map((config) => (
            <AIStatusCard
              key={config.id}
              name={config.provider}
              icon={config.provider === "Google Gemini" ? Cpu : Zap}
              connected={aiStatus?.[config.provider.toLowerCase().includes("gemini") ? "gemini" : "openai"]?.connected}
              model={config.model}
              baseUrl={config.apiEndpoint}
              isLoading={aiLoading}
              isPrimary={config.isActive || false}
              onEdit={() => {
                setSelectedAI(config.id);
                setAIFormData({
                  provider: config.provider,
                  endpoint: config.apiEndpoint,
                  apiKey: config.apiKey,
                  model: config.model,
                });
                setAIEditDialog(true);
              }}
              onDelete={() => {
                setDeleteType('ai');
                setDeleteTarget(config);
                setDeleteConfirmOpen(true);
              }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          系统优先使用默认 AI 配置，若不可用则自动切换至备用服务，确保 AI 分析功能持续可用。
        </p>
      </div>

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
            <div className="text-2xl font-bold text-cyan-400">
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
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">数据源状态</h2>
            <span className="text-xs text-muted-foreground">输入股票代码并点击「测试」可实时验证数据源可用性</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDSEditDialog(true)}>
            <Plus className="w-3 h-3 mr-1" />
            添加数据源
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allSources.map((source) => {
            const { key, info, record, isBuiltIn, customSourceId } = source as any;
            return (
              <SourceCard
              key={key}
              sourceKey={key}
              info={info}
              record={record}
              getStatusIcon={getStatusIcon}
              getStatusBadge={getStatusBadge}
              onEdit={() => {
                if (isBuiltIn) {
                  setSelectedDS(0); // 使用 0 表示编辑模式
                  setDSFormData({ name: key, provider: key, endpoint: "", apiKey: "", description: info.description });
                } else {
                  const customDS = dataSources?.find(ds => ds.id === customSourceId);
                  if (customDS) {
                    setSelectedDS(customDS.id);
                    setDSFormData({
                      name: customDS.name || "",
                      provider: customDS.provider || "",
                      endpoint: customDS.apiEndpoint || "",
                      apiKey: customDS.apiKey || "",
                      description: customDS.description || "",
                    });
                  }
                }
                setDSEditDialog(true);
              }}
              onDelete={() => {
                setDeleteType('ds');
                setDeleteTarget({ key, isBuiltIn, customSourceId });
                setDeleteConfirmOpen(true);
              }}
              />
            );
          })}
        </div>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType === 'ai'
                ? `确定要删除 ${deleteTarget?.provider} AI 配置吗？`
                : deleteTarget?.isBuiltIn
                ? `确定要删除 ${deleteTarget?.key} 数据源配置吗？删除后将显示为"未配置"状态。`
                : `确定要删除自定义数据源 ${deleteTarget?.key} 吗？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => {
                if (deleteType === 'ai') {
                  deleteAIMutation.mutate({ configId: deleteTarget.id });
                } else if (deleteType === 'ds') {
                  if (deleteTarget?.isBuiltIn) {
                    // 内置数据源：删除配置（显示为未配置）
                    deleteDSMutation.mutate({ sourceId: 0, sourceName: deleteTarget.key });
                  } else if (deleteTarget?.customSourceId) {
                    // 自定义数据源：完全删除
                    deleteDSMutation.mutate({ sourceId: deleteTarget.customSourceId });
                  }
                }
                setDeleteConfirmOpen(false);
              }}
            >
              删除
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI 编辑对话框 */}
      <Dialog open={aiEditDialog} onOpenChange={setAIEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAI ? "编辑 AI 配置" : "添加 AI 配置"}</DialogTitle>
          </DialogHeader>
          {selectedAI && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              编辑现有 AI 配置
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">AI 提供商</label>
              <Select value={aiFormData.provider} onValueChange={(v) => setAIFormData({ ...aiFormData, provider: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Google Gemini">Google Gemini</SelectItem>
                  <SelectItem value="OpenAI">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">API 端点</label>
              <Input
                value={aiFormData.endpoint}
                onChange={(e) => setAIFormData({ ...aiFormData, endpoint: e.target.value })}
                placeholder="https://api.example.com"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium">API 密钥</label>
              <Input
                type="password"
                value={aiFormData.apiKey}
                onChange={(e) => setAIFormData({ ...aiFormData, apiKey: e.target.value })}
                placeholder="输入 API 密钥"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium">模型名称</label>
              <Input
                value={aiFormData.model}
                onChange={(e) => setAIFormData({ ...aiFormData, model: e.target.value })}
                placeholder="例如: gemini-2.0-flash"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAIEditDialog(false);
                setSelectedAI(null);
                setAIFormData({ provider: "", endpoint: "", apiKey: "", model: "" });
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (selectedAI) {
                  updateAIMutation.mutate({
                    configId: selectedAI,
                    apiEndpoint: aiFormData.endpoint,
                    apiKey: aiFormData.apiKey,
                    model: aiFormData.model,
                  });
                } else {
                  createAIMutation.mutate({
                    provider: aiFormData.provider,
                    apiEndpoint: aiFormData.endpoint,
                    apiKey: aiFormData.apiKey,
                    model: aiFormData.model,
                  });
                }
              }}
            >
              {selectedAI ? "更新" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 数据源编辑对话框 */}
      <Dialog open={dsEditDialog} onOpenChange={setDSEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDS && selectedDS > 0 ? "编辑数据源" : "添加数据源"}</DialogTitle>
          </DialogHeader>
          {selectedDS === 0 && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              编辑内置数据源配置（留空表示使用默认配置）
            </div>
          )}
          {selectedDS && selectedDS > 0 && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              编辑自定义数据源
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">数据源名称</label>
              <Input
                value={dsFormData.name}
                onChange={(e) => setDSFormData({ ...dsFormData, name: e.target.value })}
                placeholder="数据源名称"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium">提供商类型</label>
              <Input
                value={dsFormData.provider}
                onChange={(e) => setDSFormData({ ...dsFormData, provider: e.target.value })}
                placeholder="例如: alpaca, custom_api"
                className="h-8 text-xs"
                disabled={selectedDS === 0}
              />
            </div>
            <div>
              <label className="text-xs font-medium">API 端点</label>
              <Input
                value={dsFormData.endpoint}
                onChange={(e) => setDSFormData({ ...dsFormData, endpoint: e.target.value })}
                placeholder="https://api.example.com"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium">API 密钥</label>
              <Input
                type="password"
                value={dsFormData.apiKey}
                onChange={(e) => setDSFormData({ ...dsFormData, apiKey: e.target.value })}
                placeholder="输入 API 密钥"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium">说明</label>
              <Input
                value={dsFormData.description}
                onChange={(e) => setDSFormData({ ...dsFormData, description: e.target.value })}
                placeholder="数据源说明"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDSEditDialog(false);
                setSelectedDS(null);
                setDSFormData({ name: "", provider: "", endpoint: "", apiKey: "", description: "" });
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (selectedDS && selectedDS > 0) {
                  updateDSMutation.mutate({
                    sourceId: selectedDS,
                    name: dsFormData.name,
                    provider: dsFormData.provider,
                    apiEndpoint: dsFormData.endpoint,
                    apiKey: dsFormData.apiKey,
                    description: dsFormData.description,
                  });
                } else {
                  createDSMutation.mutate({
                    name: dsFormData.name,
                    provider: dsFormData.provider,
                    apiEndpoint: dsFormData.endpoint,
                    apiKey: dsFormData.apiKey,
                    description: dsFormData.description,
                  });
                }
              }}
            >
              {selectedDS && selectedDS > 0 ? "更新" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-card border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Activity className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong className="text-foreground">数据源优先级：</strong>Alpaca (最优) → Tiingo → Finnhub → AlphaVantage → Polygon → TwelveData → Stooq → Yahoo → MarketStack</p>
              <p>系统自动按优先级尝试各数据源，失败时自动切换到下一个，确保数据获取的高可用性。</p>
              <p><strong className="text-foreground">手动测试说明：</strong>每个数据源卡片底部可输入股票代码（默认 AAPL）并点击「测试」按钮，实时拉取最近30天日K线验证该源可用性，测试结果会更新到健康记录中。</p>
              <p><strong className="text-foreground">免费配额说明：</strong>Polygon/TwelveData/MarketStack 为额外免费备用数据源，每月/每分钟有请求限制，建议优先使用 Alpaca/Tiingo/Finnhub。</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
