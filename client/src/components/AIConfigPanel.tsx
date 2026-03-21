import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Circle, Edit2, Eye, EyeOff } from "lucide-react";

const AI_PROVIDERS = [
  { id: "gemini", name: "Google Gemini", defaultEndpoint: "https://openfly.cc/v1", defaultModel: "gemini-2.0-flash" },
  { id: "openai", name: "OpenAI", defaultEndpoint: "https://openfly.cc/v1", defaultModel: "gpt-4" },
  { id: "custom", name: "自定义", defaultEndpoint: "", defaultModel: "" },
];

export function AIConfigPanel() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});
  const [formData, setFormData] = useState({
    provider: "gemini",
    apiEndpoint: "",
    apiKey: "",
    model: "",
  });

  const { data: configs, isLoading, refetch } = trpc.ai.getConfigs.useQuery();
  
  const createMutation = trpc.ai.createConfig.useMutation({
    onSuccess: () => {
      toast.success("AI 配置已添加");
      resetForm();
      setShowForm(false);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "添加失败");
    },
  });

  const updateMutation = trpc.ai.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("AI 配置已更新");
      resetForm();
      setShowForm(false);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "更新失败");
    },
  });

  const deleteMutation = trpc.ai.deleteConfig.useMutation({
    onSuccess: () => {
      toast.success("AI 配置已删除");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "删除失败");
    },
  });

  const setDefaultMutation = trpc.ai.setDefault.useMutation({
    onSuccess: () => {
      toast.success("默认 AI 已更新");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "更新失败");
    },
  });

  const resetForm = () => {
    setFormData({ provider: "gemini", apiEndpoint: "", apiKey: "", model: "" });
    setEditingId(null);
  };

  const handleOpenForm = (config?: any) => {
    if (config) {
      setEditingId(config.id);
      setFormData({
        provider: config.provider,
        apiEndpoint: config.apiEndpoint,
        apiKey: config.apiKey,
        model: config.model,
      });
    } else {
      resetForm();
    }
    setShowForm(true);
  };

  const handleProviderChange = (provider: string) => {
    const providerConfig = AI_PROVIDERS.find((p) => p.id === provider);
    setFormData((prev) => ({
      ...prev,
      provider,
      apiEndpoint: editingId ? prev.apiEndpoint : providerConfig?.defaultEndpoint || "",
      model: editingId ? prev.model : providerConfig?.defaultModel || "",
    }));
  };

  const handleSubmit = () => {
    if (!formData.provider || !formData.apiEndpoint || !formData.apiKey || !formData.model) {
      toast.error("请填写所有字段");
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        configId: editingId,
        apiEndpoint: formData.apiEndpoint,
        apiKey: formData.apiKey,
        model: formData.model,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">AI 配置管理</h3>
          <p className="text-xs text-muted-foreground mt-0.5">配置多个 AI 提供商，用于回测和策略分析</p>
        </div>
        <Button
          size="sm"
          onClick={() => handleOpenForm()}
          className="gap-1.5 bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
          添加配置
        </Button>
      </div>

      {showForm && (
        <Card className="border-dashed border-2">
          <CardContent className="pt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                AI 提供商
              </label>
              <Select value={formData.provider} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                API 端点
              </label>
              <Input
                placeholder="https://api.example.com/v1"
                value={formData.apiEndpoint}
                onChange={(e) => setFormData({ ...formData, apiEndpoint: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                API 密钥
              </label>
              <Input
                type="password"
                placeholder="输入 API 密钥"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                模型名称
              </label>
              <Input
                placeholder="如: gpt-4, gemini-pro"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {editingId ? (updateMutation.isPending ? "更新中..." : "更新") : (createMutation.isPending ? "添加中..." : "添加")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="flex-1"
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-xs">加载中...</div>
        ) : !configs || configs.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-xs">暂无 AI 配置</div>
        ) : (
          configs.map((config: any) => (
            <div
              key={config.id}
              className="flex items-start gap-2 p-3 rounded border border-border/50 hover:border-border/80 transition-colors bg-card/50"
            >
              <button
                onClick={() =>
                  setDefaultMutation.mutate({
                    provider: config.provider,
                    configId: config.id,
                  })
                }
                className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors"
                title={config.isActive ? "已设为默认" : "点击设为默认"}
              >
                {config.isActive ? (
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium">{config.provider}</span>
                  {config.isActive && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1 bg-blue-500/10 text-blue-700 border-blue-500/30">
                      默认
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <div>端点: {config.apiEndpoint}</div>
                  <div className="flex items-center gap-2">
                    <span>密钥:</span>
                    <span className="font-mono">
                      {showApiKey[config.id]
                        ? config.apiKey
                        : `${config.apiKey.substring(0, 8)}...${config.apiKey.substring(config.apiKey.length - 4)}`}
                    </span>
                    <button
                      onClick={() =>
                        setShowApiKey((prev) => ({
                          ...prev,
                          [config.id]: !prev[config.id],
                        }))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey[config.id] ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <div>模型: {config.model}</div>
                </div>
              </div>
              <div className="shrink-0 flex gap-1">
                <button
                  onClick={() => handleOpenForm(config)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="编辑"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate({ configId: config.id })}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
