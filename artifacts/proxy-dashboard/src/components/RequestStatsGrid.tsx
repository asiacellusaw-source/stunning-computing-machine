import { motion } from "framer-motion";
import { BarChart3, CheckCircle2, XCircle, Globe2, Zap } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { formatLatency } from "@/lib/utils";
import type { RequestStats } from "@workspace/api-client-react/src/generated/api.schemas";

interface RequestStatsGridProps {
  stats?: RequestStats;
  isLoading: boolean;
}

export function RequestStatsGrid({ stats, isLoading }: RequestStatsGridProps) {
  const cards = [
    {
      title: "Total Requests",
      value: stats?.totalRequests ?? 0,
      icon: <BarChart3 className="w-5 h-5 text-cyan-400" />,
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
    {
      title: "Successful",
      value: stats?.successfulRequests ?? 0,
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      title: "Failed",
      value: stats?.failedRequests ?? 0,
      icon: <XCircle className="w-5 h-5 text-rose-400" />,
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
    {
      title: "Unique Domains",
      value: stats?.uniqueDomains ?? 0,
      icon: <Globe2 className="w-5 h-5 text-indigo-400" />,
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
    },
    {
      title: "Avg Latency",
      value: formatLatency(stats?.avgLatency),
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 24 },
    },
  };

  return (
    <div className="space-y-4">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        {cards.map((card, i) => (
          <motion.div key={i} variants={item}>
            <Card
              className={`overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${card.bg} ${card.border}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <div className="p-2 rounded-lg bg-background/50 backdrop-blur-md border border-white/5">
                    {card.icon}
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  {isLoading ? (
                    <div className="h-8 w-16 bg-white/10 animate-pulse rounded-md"></div>
                  ) : (
                    <h2 className="text-3xl font-display font-bold text-foreground">
                      {card.value}
                    </h2>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {stats && stats.topDomains.length > 0 && (
        <Card className="overflow-hidden bg-indigo-500/5 border-indigo-500/20">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Top Target Domains
            </h3>
            <div className="space-y-2">
              {stats.topDomains.map((d, i) => {
                const maxCount = stats.topDomains[0]?.count ?? 1;
                const widthPercent = Math.max(8, (d.count / maxCount) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-mono text-foreground truncate">
                          {d.domain}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {d.count}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500/60 rounded-full transition-all duration-500"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
