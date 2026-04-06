import { useState } from "react";
import { useDashboardData, useProxyMutations } from "@/hooks/use-proxy-manager";
import { GatewayInfoCard } from "@/components/GatewayInfoCard";
import { StatsGrid } from "@/components/StatsGrid";
import { RequestStatsGrid } from "@/components/RequestStatsGrid";
import { ProxyTable } from "@/components/ProxyTable";
import { UploadProxiesModal } from "@/components/UploadProxiesModal";
import { BulkDeleteButtons } from "@/components/BulkDeleteButtons";
import { Button } from "@/components/ui/button";
import { Activity, Shield, ServerCrash, Loader2, Globe, Download, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ListProxiesStatus } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListProxiesStatus | "all">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { proxies, stats, gateway, replitNodeStatus, requestStats } = useDashboardData({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit: pageSize,
  });

  const { triggerCheckAll, triggerCheckActive, triggerCheckUnchecked, triggerCheckFailed, isChecking, isCheckingActive, isCheckingUnchecked, isCheckingFailed, addReplitNode, isAddingNode, scrapeProxies, isScraping } = useProxyMutations();
  const anyChecking = isChecking || isCheckingActive || isCheckingUnchecked || isCheckingFailed;

  const nodeAlreadyRegistered = replitNodeStatus.data?.exists === true;
  const showAddNodeButton =
    !replitNodeStatus.isLoading &&
    !replitNodeStatus.isError &&
    !nodeAlreadyRegistered;

  const paginatedData = proxies.data;
  const proxyList = paginatedData?.data ?? [];
  const pagination = paginatedData?.pagination;

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const handleStatusChange = (s: ListProxiesStatus | "all") => {
    setStatusFilter(s);
    setPage(1);
  };

  const handleExport = (format: string, status: string) => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (status !== "all") params.set("status", status);
    const url = `${window.location.origin}/api/proxies/export?${params.toString()}`;
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-background/80 border-b border-white/5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(13,148,136,0.3)]">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h1 className="font-display font-bold text-xl tracking-tight">Nexus<span className="text-primary">Gateway</span></h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {showAddNodeButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addReplitNode()}
                disabled={isAddingNode}
                title="Register this server's IP as a proxy node"
                className="hidden sm:flex gap-2 text-muted-foreground hover:text-foreground"
              >
                {isAddingNode ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ServerCrash className="w-4 h-4" />
                )}
                {isAddingNode ? "Adding..." : "Add Replit Node"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={anyChecking}
                  className="hidden sm:flex gap-2"
                >
                  <Activity className={`w-4 h-4 ${anyChecking ? "animate-spin text-primary" : ""}`} />
                  {anyChecking ? "Checking..." : "Check Health"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => triggerCheckActive()} disabled={isCheckingActive}>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
                  Re-check Working Proxies
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => triggerCheckUnchecked()} disabled={isCheckingUnchecked}>
                  <HelpCircle className="w-4 h-4 mr-2 text-yellow-400" />
                  Check Unchecked Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => triggerCheckFailed()} disabled={isCheckingFailed}>
                  <AlertTriangle className="w-4 h-4 mr-2 text-red-400" />
                  Re-check Failed Proxies
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => triggerCheckAll()} disabled={isChecking}>
                  <Activity className="w-4 h-4 mr-2 text-blue-400" />
                  Check All Proxies
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => scrapeProxies()}
              disabled={isScraping}
              className="hidden sm:flex gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500"
            >
              {isScraping ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Globe className="w-4 h-4" />
              )}
              {isScraping ? "Fetching..." : "Fetch Free Proxies"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex gap-2 border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500"
                >
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>TXT (ip:port)</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => handleExport("txt", "all")}>All Proxies</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("txt", "working")}>Working Only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("txt", "failed")}>Failed Only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("txt", "unchecked")}>Unchecked Only</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>CSV</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => handleExport("csv", "all")}>All Proxies</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("csv", "working")}>Working Only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("csv", "failed")}>Failed Only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("csv", "unchecked")}>Unchecked Only</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>JSON</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => handleExport("json", "all")}>All Proxies</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("json", "working")}>Working Only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("json", "failed")}>Failed Only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("json", "unchecked")}>Unchecked Only</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <UploadProxiesModal />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
          <GatewayInfoCard gateway={gateway.data} isLoading={gateway.isLoading} />
        </section>

        <section className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
          <div className="mb-4">
            <h2 className="text-lg font-display font-semibold text-foreground">Network Analytics</h2>
            <p className="text-sm text-muted-foreground">Real-time overview of your proxy pool.</p>
          </div>
          <StatsGrid stats={stats.data} isLoading={stats.isLoading} />
        </section>

        <section className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200 fill-mode-both">
          <div className="mb-4">
            <h2 className="text-lg font-display font-semibold text-foreground">Request Statistics</h2>
            <p className="text-sm text-muted-foreground">Gateway request counts and target sites.</p>
          </div>
          <RequestStatsGrid stats={requestStats.data} isLoading={requestStats.isLoading} />
        </section>

        <section className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">Proxy Nodes</h2>
              <p className="text-sm text-muted-foreground">Manage and monitor individual proxy instances.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 sm:hidden">
                {showAddNodeButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => addReplitNode()}
                    disabled={isAddingNode}
                    title="Register this server's IP as a proxy node"
                  >
                    {isAddingNode ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ServerCrash className="w-4 h-4" />
                    )}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      disabled={anyChecking}
                    >
                      <Activity className={`w-4 h-4 ${anyChecking ? "animate-spin text-primary" : ""}`} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => triggerCheckActive()}>
                      <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
                      Re-check Working
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerCheckUnchecked()}>
                      <HelpCircle className="w-4 h-4 mr-2 text-yellow-400" />
                      Check Unchecked
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerCheckFailed()}>
                      <AlertTriangle className="w-4 h-4 mr-2 text-red-400" />
                      Re-check Failed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerCheckAll()}>
                      <Activity className="w-4 h-4 mr-2 text-blue-400" />
                      Check All
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => scrapeProxies()}
                  disabled={isScraping}
                  title="Fetch Free Proxies"
                  className="border-emerald-500/40 text-emerald-400"
                >
                  {isScraping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <BulkDeleteButtons />
            </div>
          </div>
          <ProxyTable 
            proxies={proxyList} 
            isLoading={proxies.isLoading}
            search={search}
            onSearchChange={handleSearchChange}
            statusFilter={statusFilter}
            onStatusChange={handleStatusChange}
            page={pagination?.page ?? 1}
            totalPages={pagination?.totalPages ?? 1}
            totalCount={pagination?.totalCount ?? 0}
            onPageChange={setPage}
          />
        </section>

      </main>
    </div>
  );
}
