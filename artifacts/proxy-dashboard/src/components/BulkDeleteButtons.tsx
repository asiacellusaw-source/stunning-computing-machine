import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBulkDeleteProxies } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListProxiesQueryKey,
  getGetStatsQueryKey,
  getGetGatewayInfoQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type FilterOption = "failed" | "unchecked" | "working" | "all";

interface BulkAction {
  label: string;
  shortLabel: string;
  filter: FilterOption;
  description: string;
}

const ACTIONS: BulkAction[] = [
  {
    label: "Delete Not Working",
    shortLabel: "Del. Not Working",
    filter: "failed",
    description: "This will permanently delete all proxies that failed health checks.",
  },
  {
    label: "Delete Working",
    shortLabel: "Del. Working",
    filter: "working",
    description: "This will permanently delete all proxies that are currently working.",
  },
  {
    label: "Delete Untested",
    shortLabel: "Del. Untested",
    filter: "unchecked",
    description: "This will permanently delete all proxies that have never been checked.",
  },
  {
    label: "Delete All",
    shortLabel: "Delete All",
    filter: "all",
    description: "This will permanently delete every proxy in your pool. This cannot be undone.",
  },
];

export function BulkDeleteButtons() {
  const [pending, setPending] = useState<BulkAction | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const bulkDelete = useBulkDeleteProxies({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGatewayInfoQueryKey() });
        toast({
          title: "Proxies Deleted",
          description: data.message || `Removed ${data.deleted} proxy${data.deleted === 1 ? "" : "s"}.`,
        });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to delete proxies.";
        toast({ title: "Delete Failed", description: msg, variant: "destructive" });
      },
    },
  });

  const handleConfirm = () => {
    if (!pending) return;
    bulkDelete.mutate({ params: { filter: pending.filter } });
    setPending(null);
  };

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {ACTIONS.map((action) => (
          <Button
            key={action.filter}
            variant="outline"
            size="sm"
            disabled={bulkDelete.isPending}
            onClick={() => setPending(action)}
            className={`gap-1.5 text-xs h-8 ${
              action.filter === "all"
                ? "border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
                : "text-muted-foreground border-border/50 hover:border-destructive/40 hover:text-destructive"
            }`}
          >
            {bulkDelete.isPending && pending?.filter === action.filter ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{action.label}</span>
            <span className="sm:hidden">{action.shortLabel}</span>
          </Button>
        ))}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
