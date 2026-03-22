import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIConfigPanel } from "@/components/AIConfigPanel";
import { DataSourcePanel } from "@/components/DataSourcePanel";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Settings, Zap, Database } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("ai");
  const [testingConfigId, setTestingConfigId] = useState<number | null>(null);

  const { data: aiConfigs = [] } = trpc.ai.getConfigs.useQuery();
  const testConnectionMutation = trpc.ai.testConnection.useMutation();

  const handleTestConnection = async (config: any) => {
    setTestingConfigId(config.id);
    try {
      const result = await testConnectionMutation.mutateAsync({
        provider: config.provider,
        apiEndpoint: config.apiEndpoint,
        apiKey: config.apiKey,
        model: config.model,
      });

      if (result.success) {
        toast.success("连接成功！");
      } else {
        toast.error(`连接失败: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(error.message || "测试失败");
    } finally {
      setTestingConfigId(null);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        请先登录
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            设置
          </h1>
          <p className="text-sm text-muted-foreground">
            配置应用程序设置、AI 提供商和数据源
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai" className="gap-2">
            <Zap className="h-4 w-4" />
            AI 配置
          </TabsTrigger>
          <TabsTrigger value="datasource" className="gap-2">
            <Database className="h-4 w-4" />
            数据源
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-2">
            <Settings className="h-4 w-4" />
            账户
          </TabsTrigger>
        </TabsList>

        {/* AI Configuration Tab */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                AI 提供商配置
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                配置多个 AI 提供商用于回测和策略分析。您可以添加 Gemini、OpenAI 或自定义 API 端点。
              </p>
            </CardHeader>
            <CardContent>
              <AIConfigPanel />
            </CardContent>
          </Card>

          {/* AI Test Connections */}
          {aiConfigs.length > 0 && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardHeader>
                <CardTitle className="text-sm">🧪 测试连接</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiConfigs.map((config: any) => (
                  <div key={config.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-sm">{config.provider}</p>
                      <p className="text-xs text-muted-foreground">{config.model}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTestConnection(config)}
                      disabled={testingConfigId === config.id}
                    >
                      {testingConfigId === config.id ? "测试中..." : "测试连接"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tips */}
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="text-sm">💡 使用提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                • <strong>Google Gemini</strong>: 推荐使用 openfly.cc 代理，模型默认为 gemini-2.0-flash
              </p>
              <p>
                • <strong>OpenAI</strong>: 推荐使用 openfly.cc/v1 代理，模型默认为 gpt-4
              </p>
              <p>
                • <strong>自定义</strong>: 可以配置任何兼容 OpenAI API 的端点
              </p>
              <p>
                • 点击圆形按钮可以设置默认 AI 提供商，用于回测和策略分析
              </p>
              <p>
                • 使用"测试连接"按钮验证 API 端点和密钥是否有效
              </p>
              <p>
                • API 密钥将被加密存储，不会在客户端暴露
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Source Tab */}
        <TabsContent value="datasource" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-green-500" />
                自定义数据源
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                配置自定义数据源用于股票数据获取。您可以添加自定义 API、CSV 上传或数据库连接。
              </p>
            </CardHeader>
            <CardContent>
              <DataSourcePanel />
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader>
              <CardTitle className="text-sm">💡 使用提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                • <strong>自定义 API</strong>: 配置您自己的数据源 API 端点
              </p>
              <p>
                • <strong>CSV 上传</strong>: 上传 CSV 文件作为数据源
              </p>
              <p>
                • <strong>数据库连接</strong>: 连接到您的数据库
              </p>
              <p>
                • 数据源可以在回测时选择使用
              </p>
              <p>
                • 支持添加、编辑和删除数据源配置
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>账户信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">用户名</label>
                <p className="text-lg font-medium">{user.username || user.name || user.openId}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">邮箱</label>
                <p className="text-lg font-medium">{user.email || "未设置"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">用户 ID</label>
                <p className="text-sm font-mono text-muted-foreground">{user.id}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
