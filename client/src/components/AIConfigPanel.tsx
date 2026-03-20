import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";

export function AIConfigPanel() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    provider: "",
    apiEndpoint: "",
    apiKey: "",
    model: "",
  });

  const { data: configs, isLoading, refetch } = trpc.ai.getConfigs.useQuery();
  const createMutation = trpc.ai.createConfig.useMutation({
    onSuccess: () => {
      toast.success("AI 配置已添加");
      setFormData({ provider: "", apiEndpoint: "", apiKey: "", model: "" });
      setShowForm(false);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "添加失败");
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

  const handleSubmit = () => {
    if (!formData.provider || !formData.apiEndpoint || !formData.apiKey || !formData.model) {
      toast.error("请填写所有字段");
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">AI 配置管理</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(!showForm)}
          className="gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          添加配置
        </Button>
      </div>

      {showForm && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                提供商名称
              </label>
              <Input
                placeholder="如: Gemini, OpenAI, 自定义"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="h-8 text-xs"
              />
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
                disabled={createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? "添加中..." : "添加"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-xs">加载中...</div>
        ) : !configs || configs.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-xs">暂无 AI 配置</div>
        ) : (
          configs.map((config: any) => (
            <div
              key={config.id}
              className="flex items-start gap-2 p-2.5 rounded border border-border/50 hover:border-border/80 transition-colors"
            >
              <button
                onClick={() =>
                  setDefaultMutation.mutate({
                    provider: config.provider,
                    configId: config.id,
                  })
                }
                className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors"
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
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      默认
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <div>端点: {config.apiEndpoint}</div>
                  <div>模型: {config.model}</div>
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate({ configId: config.id })}
                disabled={deleteMutation.isPending}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
