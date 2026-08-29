export interface ReconnectingSocketOptions {
  maxDelayMs?: number;
  initialDelayMs?: number;
}

export class ReconnectingSolanaWebSocket {
  private socket?: WebSocket;
  private stopped = false;
  private attempts = 0;
  constructor(private readonly url: string, private readonly options: ReconnectingSocketOptions = {}) {}
  connect(onMessage: (data: unknown) => void): void {
    this.stopped = false;
    const open = () => {
      if (this.stopped) return;
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => { this.attempts = 0; };
      socket.onmessage = (event) => {
        try { onMessage(JSON.parse(String(event.data))); } catch { onMessage(event.data); }
      };
      socket.onclose = () => {
        if (this.stopped) return;
        const base = this.options.initialDelayMs ?? 500;
        const max = this.options.maxDelayMs ?? 15_000;
        const delay = Math.min(max, base * 2 ** Math.min(this.attempts++, 6));
        setTimeout(open, delay);
      };
    };
    open();
  }
  close(): void { this.stopped = true; this.socket?.close(); }
}
