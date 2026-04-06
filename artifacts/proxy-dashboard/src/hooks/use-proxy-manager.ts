import { useQueryClient } from "@tanstack/react-query";
import {
  useListProxies,
  useGetStats,
  useGetGatewayInfo,
  useGetReplitNodeStatus,
  useGetRequestStats,
  useUploadProxies,
  useDeleteProxy,
  useCheckAllProxies,
  useCheckActiveProxies,
  useCheckUncheckedProxies,
  useCheckFailedProxies,
  useAddReplitNode,
  useScrapeProxies,
  getListProxiesQueryKey,
  getGetStatsQueryKey,
  getGetGatewayInfoQueryKey,
  getGetReplitNodeStatusQueryKey,
  getGetRequestStatsQueryKey,
} from "@workspace/api-client-react";
import type { ListProxiesParams, UploadProxiesRequest } from "@workspace/api-client-react/src/generated/api.schemas";
import { useToast } from "./use-toast";

const REFETCH_INTERVAL = 30000; // 30 seconds
const NODE_STATUS_INTERVAL = 5 * 60 * 1000; // 5 minutes — matches server-side IP cache TTL

export function useDashboardData(params?: ListProxiesParams) {
  const proxies = useListProxies(params, {
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const stats = useGetStats({
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const gateway = useGetGatewayInfo({
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const replitNodeStatus = useGetReplitNodeStatus({
    query: { refetchInterval: NODE_STATUS_INTERVAL },
  });

  const requestStats = useGetRequestStats({
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  return {
    proxies,
    stats,
    gateway,
    replitNodeStatus,
    requestStats,
  };
}

export function useProxyMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetGatewayInfoQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetReplitNodeStatusQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRequestStatsQueryKey() });
  };

  const upload = useUploadProxies({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        toast({
          title: "Proxies Uploaded",
          description: `Added: ${data.added}, Skipped: ${data.skipped}, Total processed: ${data.total}`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Something went wrong";
        toast({
          title: "Upload Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  const remove = useDeleteProxy({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast({
          title: "Proxy Deleted",
          description: "The proxy has been removed from the pool.",
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to remove proxy";
        toast({
          title: "Delete Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  const checkAll = useCheckAllProxies({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        toast({
          title: "Health Check Triggered",
          description: data.message || `Checking ${data.count} proxies in the background.`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not trigger health check";
        toast({
          title: "Check Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  const addNode = useAddReplitNode({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        toast({
          title: data.added ? "Replit Node Added" : "Node Already Registered",
          description: data.message,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not add Replit node";
        toast({
          title: "Add Node Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  const checkActive = useCheckActiveProxies({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        toast({
          title: "Active Check Triggered",
          description: data.message || `Checking ${data.count} working/unchecked proxies.`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not trigger active check";
        toast({
          title: "Check Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  const checkUnchecked = useCheckUncheckedProxies({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        toast({
          title: "Unchecked Check Triggered",
          description: data.message || `Checking ${data.count} unchecked proxies.`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not trigger unchecked check";
        toast({
          title: "Check Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  const checkFailed = useCheckFailedProxies({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        toast({
          title: "Failed Re-check Triggered",
          description: data.message || `Re-checking ${data.count} failed proxies.`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Could not trigger failed re-check";
        toast({
          title: "Re-check Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  const scrape = useScrapeProxies({
    mutation: {
      onSuccess: (data) => {
        invalidateAll();
        toast({
          title: "Proxy Scraping Complete",
          description: data.message || `Fetched ${data.totalFetched} proxies, added ${data.added} new`,
        });
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to scrape proxies";
        toast({
          title: "Scrape Failed",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  return {
    uploadProxyList: (req: UploadProxiesRequest) => upload.mutate({ data: req }),
    deleteProxy: (id: number) => remove.mutate({ id }),
    triggerCheckAll: () => checkAll.mutate(),
    triggerCheckActive: () => checkActive.mutate(),
    triggerCheckUnchecked: () => checkUnchecked.mutate(),
    triggerCheckFailed: () => checkFailed.mutate(),
    addReplitNode: () => addNode.mutate(),
    scrapeProxies: () => scrape.mutate(),
    isUploading: upload.isPending,
    isDeleting: remove.isPending,
    isChecking: checkAll.isPending,
    isCheckingActive: checkActive.isPending,
    isCheckingUnchecked: checkUnchecked.isPending,
    isCheckingFailed: checkFailed.isPending,
    isAddingNode: addNode.isPending,
    isScraping: scrape.isPending,
  };
}
