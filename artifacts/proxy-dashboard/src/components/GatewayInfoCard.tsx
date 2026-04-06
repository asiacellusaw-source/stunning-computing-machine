import { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Copy, Network, ShieldCheck, Cpu, Lock, Zap, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGatewayTest, useGatewayTestRotate } from "@workspace/api-client-react";
import type { GatewayInfo } from "@workspace/api-client-react";

interface GatewayInfoCardProps {
  gateway?: GatewayInfo;
  isLoading: boolean;
}

export function GatewayInfoCard({ gateway, isLoading }: GatewayInfoCardProps) {
  const { toast } = useToast();
  const testMutation = useGatewayTest();
  const testRotateMutation = useGatewayTestRotate();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    originIp?: string;
    proxyUsed?: string;
    latency?: number;
    error?: string;
  } | null>(null);
  const [rotateTestResult, setRotateTestResult] = useState<{
    success: boolean;
    originIp?: string;
    proxyUsed?: string;
    latency?: number;
    error?: string;
  } | null>(null);

  const apiBase = window.location.origin;
  const apiProxyUrl = `${apiBase}/api/gateway/fetch`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `${label} copied successfully.`,
    });
  };

  const handleTest = () => {
    setTestResult(null);
    testMutation.mutate(undefined, {
      onSuccess: (data: any) => {
        setTestResult(data);
        if (data.success) {
          toast({
            title: "Gateway Test Passed",
            description: `Request routed through ${data.proxyUsed} (${data.latency}ms)`,
          });
        } else {
          toast({
            title: "Gateway Test Failed",
            description: data.error || "No working proxies available",
            variant: "destructive",
          });
        }
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || err?.message || "Test failed";
        setTestResult({ success: false, error: msg });
        toast({
          title: "Gateway Test Failed",
          description: msg,
          variant: "destructive",
        });
      },
    });
  };

  const handleTestRotate = () => {
    setRotateTestResult(null);
    testRotateMutation.mutate(undefined, {
      onSuccess: (data: any) => {
        setRotateTestResult(data);
        if (data.success) {
          toast({
            title: "Rotate Proxy Test Passed",
            description: `IP: ${data.originIp} via ${data.proxyUsed} (${data.latency}ms)`,
          });
        } else {
          toast({
            title: "Rotate Proxy Test Failed",
            description: data.error || "Proxy protocol test failed",
            variant: "destructive",
          });
        }
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || err?.message || "Test failed";
        setRotateTestResult({ success: false, error: msg });
        toast({
          title: "Rotate Proxy Test Failed",
          description: msg,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Card className="relative overflow-hidden border-primary/30 shadow-lg shadow-primary/10">
      <div 
        className="absolute inset-0 z-0 opacity-40 mix-blend-screen"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/gateway-bg.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
      
      <CardContent className="relative z-10 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/20 text-primary rounded-xl border border-primary/30">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-foreground">Master Gateway</h2>
              <p className="text-muted-foreground text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Routes traffic automatically through healthy proxies
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
              REST API Endpoint
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 normal-case tracking-normal font-medium">Recommended</span>
            </label>
            <div className="bg-background/80 backdrop-blur-md border border-primary/20 rounded-xl p-1 flex items-center shadow-inner">
              <div className="px-4 py-3 font-mono text-sm sm:text-base text-primary-foreground flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {isLoading ? (
                  <div className="h-6 w-64 bg-white/10 animate-pulse rounded" />
                ) : (
                  <span className="text-glow">{apiProxyUrl}</span>
                )}
              </div>
              <Button 
                size="icon" 
                variant="secondary" 
                onClick={() => handleCopy(apiProxyUrl, "API endpoint")} 
                disabled={isLoading}
                className="rounded-lg shrink-0"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 px-1">
            <Lock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Send <code className="text-foreground/80 bg-white/5 px-1 rounded">POST</code> requests with <code className="text-foreground/80 bg-white/5 px-1 rounded">{"{ \"url\": \"https://example.com\" }"}</code> to route through the proxy pool. Each request uses a random healthy proxy.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
              TCP Proxy Server <span className="text-primary">(host:port:user:pass)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 normal-case tracking-normal font-medium">Direct TCP</span>
            </label>
            <div className="bg-background/80 backdrop-blur-md border border-blue-500/20 rounded-xl p-1 flex items-center shadow-inner">
              <div className="px-4 py-3 font-mono text-sm sm:text-base text-primary-foreground flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {isLoading ? (
                  <div className="h-6 w-64 bg-white/10 animate-pulse rounded" />
                ) : (
                  <span className="text-glow">{gateway?.tcpAddress ?? "---"}</span>
                )}
              </div>
              <Button 
                size="icon" 
                variant="secondary" 
                onClick={() => handleCopy(gateway?.tcpAddress ?? "", "TCP proxy connection string")} 
                disabled={isLoading || !gateway?.tcpAddress}
                className="rounded-lg shrink-0"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
              Port <span className="text-blue-400 font-mono font-semibold">{gateway?.tcpPort ?? "1080"}</span> — use as HTTP/HTTPS proxy with Proxy-Authorization header.
            </p>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestRotate}
                disabled={testRotateMutation.isPending}
                className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
              >
                {testRotateMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                )}
                Test Rotate Proxy
              </Button>

              {rotateTestResult && (
                <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${
                  rotateTestResult.success
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}>
                  {rotateTestResult.success ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>IP: {rotateTestResult.originIp}</span>
                      {rotateTestResult.proxyUsed && rotateTestResult.proxyUsed !== "unknown" && (
                        <span className="text-muted-foreground">via {rotateTestResult.proxyUsed}</span>
                      )}
                      <span className="text-muted-foreground">({rotateTestResult.latency}ms)</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{rotateTestResult.error || "Failed"}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending}
              className="border-primary/40 text-primary hover:bg-primary/10"
            >
              {testMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5" />
              )}
              Test REST API
            </Button>

            {testResult && (
              <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${
                testResult.success
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}>
                {testResult.success ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>IP: {testResult.originIp}</span>
                    <span className="text-muted-foreground">via {testResult.proxyUsed}</span>
                    <span className="text-muted-foreground">({testResult.latency}ms)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{testResult.error || "Failed"}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 px-6 py-4 bg-background/50 backdrop-blur-xl rounded-2xl border border-white/5 w-full md:w-auto">
          <div className="flex flex-col items-center justify-center">
            <Cpu className="w-5 h-5 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Active Nodes</span>
            <span className="text-2xl font-display font-bold text-foreground mt-1">
              {isLoading ? "-" : gateway?.workingProxies ?? 0}
            </span>
          </div>
          <div className="w-px h-16 bg-white/10" />
          <div className="flex flex-col items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse mb-3" />
            <span className="text-xs text-emerald-500 uppercase tracking-wider font-semibold">Status</span>
            <span className="text-sm font-medium text-foreground mt-1">Online</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
