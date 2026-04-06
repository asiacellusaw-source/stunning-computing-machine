import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Trash2, Search, Filter, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { formatLatency } from "@/lib/utils";
import type { Proxy, ListProxiesStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { useProxyMutations } from "@/hooks/use-proxy-manager";

interface ProxyTableProps {
  proxies: Proxy[];
  isLoading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: ListProxiesStatus | "all";
  onStatusChange: (s: ListProxiesStatus | "all") => void;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function ProxyTable({
  proxies,
  isLoading,
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  page,
  totalPages,
  totalCount,
  onPageChange,
}: ProxyTableProps) {
  const { deleteProxy, isDeleting } = useProxyMutations();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    setDeletingId(id);
    deleteProxy(id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "working": return <Badge variant="success">Working</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      case "unchecked": return <Badge variant="warning">Unchecked</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/5 bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by IP..." 
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        <div className="flex bg-background rounded-xl p-1 border border-input w-full sm:w-auto overflow-x-auto">
          {(["all", "working", "failed", "unchecked"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg capitalize transition-colors whitespace-nowrap ${
                statusFilter === s 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/10">
            <tr>
              <th className="px-6 py-4 font-semibold">Address</th>
              <th className="px-6 py-4 font-semibold">Status</th>
              <th className="px-6 py-4 font-semibold">Latency</th>
              <th className="px-6 py-4 font-semibold">Last Checked</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-5 bg-white/5 rounded w-32"></div></td>
                  <td className="px-6 py-4"><div className="h-5 bg-white/5 rounded w-20"></div></td>
                  <td className="px-6 py-4"><div className="h-5 bg-white/5 rounded w-16"></div></td>
                  <td className="px-6 py-4"><div className="h-5 bg-white/5 rounded w-24"></div></td>
                  <td className="px-6 py-4 text-right"><div className="h-8 bg-white/5 rounded w-8 ml-auto"></div></td>
                </tr>
              ))
            ) : proxies.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <Filter className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-lg font-medium">No proxies found</p>
                    <p className="text-sm">Try adjusting your filters or import new proxies.</p>
                  </div>
                </td>
              </tr>
            ) : (
              proxies.map((proxy) => (
                <tr key={proxy.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-6 py-4 font-mono font-medium text-foreground max-w-[220px]">
                    <span
                      className="block truncate"
                      title={`${proxy.ip}:${proxy.port}`}
                    >
                      {proxy.ip}:{proxy.port}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(proxy.status)}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-mono">
                    {formatLatency(proxy.latency)}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {proxy.lastChecked 
                      ? formatDistanceToNow(new Date(proxy.lastChecked), { addSuffix: true })
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                      disabled={isDeleting && deletingId === proxy.id}
                      onClick={() => handleDelete(proxy.id)}
                      title="Delete Proxy"
                    >
                      {isDeleting && deletingId === proxy.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-white/5 bg-muted/20 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * 20) + 1}-{Math.min(page * 20, totalCount)} of {totalCount} proxies
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="flex items-center gap-1">
              {generatePageNumbers(page, totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`dots-${i}`} className="px-2 text-muted-foreground text-sm">...</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="min-w-[36px]"
                    onClick={() => onPageChange(p as number)}
                  >
                    {p}
                  </Button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) {
    pages.push("...");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
}
