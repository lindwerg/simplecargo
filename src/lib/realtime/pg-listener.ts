// Dedicated Postgres LISTEN client (MAIL_AI_INTEGRATION §2.1). A single long-lived
// pg.Client per web instance (NOT from the pool — LISTEN holds the connection),
// re-emitting notifications through an in-process EventEmitter that SSE streams
// subscribe to. Reconnects with backoff so it survives a Postgres redeploy.

import { Client } from "pg";
import { EventEmitter } from "node:events";

import { env } from "@/lib/env";
import { REALTIME_CHANNEL, type RealtimeEvent } from "./notify";

const RECONNECT_MS = 3000;

let emitter: EventEmitter | null = null;
let client: Client | null = null;
let connecting = false;

function getEmitter(): EventEmitter {
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(0); // many concurrent SSE streams
  }
  return emitter;
}

function scheduleReconnect(): void {
  setTimeout(() => {
    void connect();
  }, RECONNECT_MS);
}

async function connect(): Promise<void> {
  if (client || connecting) return;
  connecting = true;
  const c = new Client({ connectionString: env.DATABASE_URL });
  try {
    await c.connect();
    await c.query(`LISTEN ${REALTIME_CHANNEL}`); // channel is a constant, not user input
    c.on("notification", (msg) => {
      let ev: RealtimeEvent = { kind: "request" };
      if (msg.payload) {
        try {
          ev = JSON.parse(msg.payload) as RealtimeEvent;
        } catch {
          /* keep default */
        }
      }
      getEmitter().emit("event", ev);
    });
    c.on("error", () => {
      client = null;
      scheduleReconnect();
    });
    c.on("end", () => {
      client = null;
      scheduleReconnect();
    });
    client = c;
  } catch (error: unknown) {
    console.error("[realtime] listen connect failed:", error instanceof Error ? error.message : error);
    try {
      await c.end();
    } catch {
      /* ignore */
    }
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

/** Subscribe to realtime events; lazily starts the LISTEN client. Returns unsub. */
export function subscribeRealtime(listener: (ev: RealtimeEvent) => void): () => void {
  void connect();
  const em = getEmitter();
  em.on("event", listener);
  return () => {
    em.off("event", listener);
  };
}
