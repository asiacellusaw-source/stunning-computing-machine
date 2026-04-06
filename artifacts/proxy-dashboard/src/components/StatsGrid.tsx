import { motion } from "framer-motion";
import { Activity, CheckCircle2, ShieldAlert, ServerOff, Zap } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { formatLatency } from "@/lib/utils";
import type { ProxyStats } from "@workspace/api-client-react/src/generated/api.schemas";

interface StatsGridProps {
  stats?: ProxyStats;
  isLoading: boolean;
}

export function StatsGrid({ stats, isLoading }: StatsGridProps) {
  const cards = [
    {
      title: "Total Proxies",
      value: stats?.total ?? 0,
      icon: <Activity className="w-5 h-5 text-blue-400" />,
      bg: "bg-blue-500/10",
      border: "border-blue-500/20"
    },
    {
      title: "Working",
      value: stats?.working ?? 0,
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20"
    },
    {
      title: "Failed",
      value: stats?.failed ?? 0,
      icon: <ServerOff className="w-5 h-5 text-rose-400" />,
      bg: "bg-rose-500/10",
      border: "border-rose-500/20"
    },
    {
      title: "Unchecked",
      value: stats?.unchecked ?? 0,
      icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
      bg: "bg-amber-500/10",
      border: "border-amber-500/20"
    },
    {
      title: "Avg Latency",
      value: formatLatency(stats?.avgLatency),
      icon: <Zap className="w-5 h-5 text-purple-400" />,
      bg: "bg-purple-500/10",
      border: "border-purple-500/20"
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
    >
      {cards.map((card, i) => (
        <motion.div key={i} variants={item}>
          <Card className={`overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${card.bg} ${card.border}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                <div className={`p-2 rounded-lg bg-background/50 backdrop-blur-md border border-white/5`}>
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
  );
}
