"use client";

import { useEffect } from "react";

export interface OrderRealtimeSession { url: string; token: string; topic: string; expiresAt: string }

export function useOrderRealtime(session: OrderRealtimeSession | undefined, onEvent: () => void): void {
  useEffect(() => {
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return;
    let socket: WebSocket | undefined;
    let stopped = false;
    let attempts = 0;
    const open = () => {
      if (stopped) return;
      socket = new WebSocket(session.url);
      socket.onopen = () => {
        attempts = 0;
        socket?.send(JSON.stringify({ type: "authenticate", token: session.token }));
        socket?.send(JSON.stringify({ type: "subscribe", topics: [session.topic] }));
      };
      socket.onmessage = () => onEvent();
      socket.onclose = () => {
        if (stopped || Date.parse(session.expiresAt) <= Date.now()) return;
        setTimeout(open, Math.min(15_000, 500 * 2 ** Math.min(attempts++, 6)));
      };
    };
    open();
    return () => { stopped = true; socket?.close(); };
  }, [session?.url, session?.token, session?.topic, session?.expiresAt, onEvent]);
}
