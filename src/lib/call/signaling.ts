"use client";

import type {
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Typed signaling transport over the session's private Realtime channel.
 * Channel access is authorized by RLS on realtime.messages: only the two
 * session participants can subscribe or publish, and the channel dies with
 * the session. The server's own session_ended event also arrives here.
 */

export interface SignalEvents {
  /** A peer's signaling is up (sent on subscribe). */
  peer_hello: { tabId: string };
  /** Unified offer/answer — perfect negotiation treats them uniformly. */
  sdp: { description: RTCSessionDescriptionInit };
  /** Trickle ICE. null candidate = end of candidates. */
  ice: { candidate: RTCIceCandidateInit | null };
  /** Partner's mic/cam state for UI. */
  media_state: { mic: boolean; cam: boolean };
  /** Best-effort goodbye before teardown. */
  bye: { reason: "left" | "ended" };
  /** Server-sent (unforgeable): the session is over. */
  session_ended: { reason: string; resolution: string };
  /** Server-sent: both ready, the clock is running. */
  session_started: { starts_at: string; ends_at: string };
}

type EventName = keyof SignalEvents;

interface Envelope {
  from: string;
  tab: string;
  data: unknown;
}

export interface PresencePeer {
  userId: string;
  tabId: string;
}

export class SignalingChannel {
  private channel: RealtimeChannel | null = null;
  private handlers = new Map<EventName, (data: never, from: string) => void>();
  private presenceHandler:
    | ((peers: PresencePeer[], joined: PresencePeer[], left: PresencePeer[]) => void)
    | null = null;

  constructor(
    private supabase: SupabaseClient,
    private sessionId: string,
    private userId: string,
    readonly tabId: string,
  ) {}

  on<E extends EventName>(
    event: E,
    handler: (data: SignalEvents[E], from: string) => void,
  ): this {
    this.handlers.set(event, handler as (data: never, from: string) => void);
    return this;
  }

  onPresence(
    handler: (
      peers: PresencePeer[],
      joined: PresencePeer[],
      left: PresencePeer[],
    ) => void,
  ): this {
    this.presenceHandler = handler;
    return this;
  }

  async subscribe(): Promise<"ok" | "error"> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    if (!session) return "error";
    await this.supabase.realtime.setAuth(session.access_token);

    const channel = this.supabase.channel(`session:${this.sessionId}`, {
      config: {
        private: true,
        broadcast: { self: false },
        presence: { key: `${this.userId}:${this.tabId}` },
      },
    });

    const events: EventName[] = [
      "peer_hello",
      "sdp",
      "ice",
      "media_state",
      "bye",
      "session_ended",
      "session_started",
    ];
    for (const event of events) {
      channel.on("broadcast", { event }, ({ payload }) => {
        const handler = this.handlers.get(event);
        if (!handler) return;
        // Server-sent events (realtime.send) carry the raw payload; peer
        // events are wrapped in an envelope. Ignore echoes from our own tabs.
        if (event === "session_ended" || event === "session_started") {
          (handler as (data: unknown, from: string) => void)(payload, "server");
          return;
        }
        const env = payload as Envelope;
        if (env.from === this.userId) return;
        (handler as (data: unknown, from: string) => void)(env.data, env.from);
      });
    }

    const parsePresence = (): PresencePeer[] => {
      const state = channel.presenceState();
      return Object.keys(state).map((key) => {
        const [userId = "", tabId = ""] = key.split(":");
        return { userId, tabId };
      });
    };

    channel.on("presence", { event: "sync" }, () => {
      this.presenceHandler?.(parsePresence(), [], []);
    });
    channel.on("presence", { event: "join" }, ({ key }) => {
      const [userId = "", tabId = ""] = (key as string).split(":");
      this.presenceHandler?.(parsePresence(), [{ userId, tabId }], []);
    });
    channel.on("presence", { event: "leave" }, ({ key }) => {
      const [userId = "", tabId = ""] = (key as string).split(":");
      this.presenceHandler?.(parsePresence(), [], [{ userId, tabId }]);
    });

    const status = await new Promise<string>((resolve) => {
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED") resolve(s);
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED")
          resolve(s);
      });
    });

    if (status !== "SUBSCRIBED") {
      await this.supabase.removeChannel(channel);
      return "error";
    }

    this.channel = channel;
    await channel.track({ at: new Date().toISOString() });
    return "ok";
  }

  async send<E extends EventName>(event: E, data: SignalEvents[E]) {
    if (!this.channel) return;
    const envelope: Envelope = { from: this.userId, tab: this.tabId, data };
    await this.channel.send({
      type: "broadcast",
      event,
      payload: envelope,
    });
  }

  async close() {
    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      await this.supabase.removeChannel(ch);
    }
  }
}
