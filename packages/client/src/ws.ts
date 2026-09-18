// ================================================================
// 浏览器侧 WebSocket 客户端：直连 Server /ws
// 协议见 @dsh-guild/types/ws（ClientFrame / ServerFrame / EvtHello …）
// ================================================================

import type { ClientFrame, ServerFrame } from "@dsh-guild/types/ws";

export interface GuildSocketEvents {
  onOpen?: () => void;
  /** 收到任意服务端帧（含 ok/error 应答与 evt.* 推送） */
  onFrame?: (frame: ServerFrame) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: unknown) => void;
}

export class GuildSocket {
  private ws: WebSocket | null = null;
  private heartbeat: number | null = null;

  constructor(
    private readonly url: string,
    private readonly events: GuildSocketEvents = {},
  ) {}

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.ws !== null) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.events.onOpen?.();
    };
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(String(ev.data)) as ServerFrame;
        this.events.onFrame?.(frame);
      } catch (error) {
        this.events.onError?.(error);
      }
    };
    ws.onclose = (ev) => {
      this.ws = null;
      this.stopHeartbeat();
      this.events.onClose?.(ev.code, ev.reason);
    };
    ws.onerror = (ev) => {
      this.events.onError?.(ev);
    };
  }

  /** 发送一帧（未连接时静默丢弃）。 */
  send(frame: ClientFrame): boolean {
    if (!this.connected) return false;
    this.ws?.send(JSON.stringify(frame));
    return true;
  }

  /**
   * 心跳：按服务端 EvtHello.heartbeatIntervalSec 开启；
   * 取 interval*0.8 秒发一次 ping。
   */
  startHeartbeat(intervalSec: number): void {
    this.stopHeartbeat();
    const periodMs = Math.max(5000, intervalSec * 800);
    this.heartbeat = window.setInterval(() => {
      this.send({ type: "ping", payload: { clientTime: Date.now() } });
    }, periodMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  close(): void {
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }
}
