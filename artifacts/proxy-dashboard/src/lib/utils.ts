import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "---";
  return `${ms.toFixed(0)}ms`;
}
