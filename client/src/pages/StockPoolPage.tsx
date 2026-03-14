import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Search, BookOpen } from "lucide-react";
import { useLocation } from "wouter";

export default function StockPoolPage() {
  const [search, setSearch] = useState("");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
  const PAGE_SIZE = 50;

  const { data: sectorsData } = trpc.stockPool.sectors.useQuery();
  const { data, isLoading } = trpc.stockPool.list.useQuery({
    search: search || undefined,
    sector: selectedSector || undefined,
    page,
    pageSize: PAGE_SIZE,
  }, { keepPreviousData: true } as any);

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const handleSector = (s: string | null) => {
    setSelectedSector(s);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">股票池</h1>
        <span className="text-sm text-muted-foreground">共 {data?.total || 0} 只股票</span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索股票代码或名称..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="pl-9 bg-input border-border"
        />
      </div>

      {/* Sectors */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleSector(null)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
            !selectedSector
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground border-border hover:border-primary/50"
          }`}
        >
          全部
        </button>
        {sectorsData?.map(s => (
          <button
            key={s.name}
            onClick={() => handleSector(s.name)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              selectedSector === s.name
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {s.name} <span className="opacity-60">({s.count})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left py-3 px-4">代码</th>
                    <th className="text-left py-3 px-4">名称</th>
                    <th className="text-left py-3 px-4">行业</th>
                    <th className="text-right py-3 px-4">市值</th>
                    <th className="text-right py-3 px-4">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map(stock => (
                    <tr key={stock.symbol} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-4">
                        <span className="font-mono font-medium text-primary">{stock.symbol}</span>
                      </td>
                      <td className="py-2 px-4 text-foreground">{stock.name}</td>
                      <td className="py-2 px-4">
                        <div className="flex flex-wrap gap-1">
                          {stock.sectors.slice(0, 2).map(s => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="text-xs h-4 cursor-pointer hover:bg-primary/20"
                              onClick={() => handleSector(s)}
                            >
                              {s}
                            </Badge>
                          ))}
                          {stock.sectors.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{stock.sectors.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right text-muted-foreground text-xs">
                        {stock.marketCap > 0
                          ? stock.marketCap >= 1e12
                            ? `$${(stock.marketCap / 1e12).toFixed(1)}T`
                            : stock.marketCap >= 1e9
                            ? `$${(stock.marketCap / 1e9).toFixed(1)}B`
                            : `$${(stock.marketCap / 1e6).toFixed(0)}M`
                          : "-"}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => setLocation(`/chart?symbol=${stock.symbol}`)}
                        >
                          K线
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            第 {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, data.total)} 条，共 {data.total} 条
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= data.total}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
