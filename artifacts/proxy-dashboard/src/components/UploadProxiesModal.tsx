import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { UploadCloud, Server, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUploadProxies, getListProxiesQueryKey, getGetStatsQueryKey, getGetGatewayInfoQueryKey } from "@workspace/api-client-react";

export function UploadProxiesModal() {
  const [open, setOpen] = useState(false);
  const [proxiesText, setProxiesText] = useState("");
  const [result, setResult] = useState<{ added: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const upload = useUploadProxies({
    mutation: {
      onSuccess: (data) => {
        setResult({ added: data.added, skipped: data.skipped, total: data.total });
        setError(null);
        queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGatewayInfoQueryKey() });
      },
      onError: (err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Upload failed. Please try again.";
        setError(message);
        setResult(null);
      },
    },
  });

  const handleUpload = () => {
    if (!proxiesText.trim()) return;
    setResult(null);
    setError(null);
    upload.mutate({ data: { proxies: proxiesText } });
  };

  const handleClose = () => {
    setOpen(false);
    setProxiesText("");
    setResult(null);
    setError(null);
    upload.reset();
  };

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      handleClose();
    }, 2500);
    return () => clearTimeout(timer);
  }, [result]);

  const handleOpenChange = (val: boolean) => {
    if (!val && upload.isPending) return;
    if (!val) handleClose();
    else setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="glow" className="gap-2">
          <UploadCloud className="w-4 h-4" />
          Import Proxies
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Add New Proxies
          </DialogTitle>
          <DialogDescription>
            Paste your proxies here, one per line. Format:{" "}
            <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">ip:port</code>.
            Duplicate entries will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {!result && (
            <Textarea
              value={proxiesText}
              onChange={(e) => setProxiesText(e.target.value)}
              placeholder={"192.168.1.1:8080\n10.0.0.5:3128\n203.0.113.0:1080"}
              className="min-h-[220px] resize-y bg-background font-mono text-sm"
              disabled={upload.isPending}
            />
          )}

          {upload.isPending && (
            <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>Importing proxies…</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-400 font-medium">
                <CheckCircle2 className="w-5 h-5" />
                Import Successful
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mt-2">
                <div className="text-center bg-background/50 rounded-md p-3">
                  <div className="text-2xl font-bold text-green-400">{result.added}</div>
                  <div className="text-muted-foreground text-xs mt-1">Added</div>
                </div>
                <div className="text-center bg-background/50 rounded-md p-3">
                  <div className="text-2xl font-bold text-yellow-400">{result.skipped}</div>
                  <div className="text-muted-foreground text-xs mt-1">Skipped</div>
                </div>
                <div className="text-center bg-background/50 rounded-md p-3">
                  <div className="text-2xl font-bold text-foreground">{result.total}</div>
                  <div className="text-muted-foreground text-xs mt-1">Total</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Upload Failed</p>
                <p className="text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={handleUpload}
              disabled={upload.isPending || !proxiesText.trim()}
            >
              {upload.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing…
                </>
              ) : (
                "Import List"
              )}
            </Button>
          )}
          {result && (
            <Button onClick={() => { setResult(null); setProxiesText(""); upload.reset(); }}>
              Import More
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
