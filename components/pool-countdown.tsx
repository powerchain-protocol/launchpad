"use client";
import { useEffect, useState } from "react";

function remaining(target: string) {
  const delta = Math.max(0, Date.parse(target) - Date.now());
  const days = Math.floor(delta / 86_400_000);
  const hours = Math.floor((delta % 86_400_000) / 3_600_000);
  const minutes = Math.floor((delta % 3_600_000) / 60_000);
  return { delta, label: `${days}d ${hours}h ${minutes}m` };
}

export function PoolCountdown({ launchAt }: { launchAt?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!launchAt) return;
    const timer = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [launchAt]);
  if (!launchAt) return <span className="muted">Not scheduled</span>;
  const value = remaining(launchAt);
  if (value.delta === 0) return <span>Launch window reached</span>;
  return <span>{value.label}</span>;
}
