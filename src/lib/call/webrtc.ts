"use client";

import { publicEnv } from "@/lib/env";
import type { SignalingChannel } from "@/lib/call/signaling";

export type CallConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "closed";

export interface PeerCallEvents {
  remoteStream: (stream: MediaStream) => void;
  connectionState: (state: CallConnectionState) => void;
}

/**
 * Two-person WebRTC call implementing the perfect-negotiation pattern.
 * Roles come from the database at match time: the callee is the polite peer,
 * the caller impolite and responsible for initiating (re)negotiation.
 * STUN-only by design for the pre-alpha; the ICE server list is config so
 * TURN can be added without code changes.
 */
export class PeerCall {
  private pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private signaling: SignalingChannel,
    private polite: boolean,
    private localStream: MediaStream,
    private events: PeerCallEvents,
  ) {
    this.pc = new RTCPeerConnection({
      iceServers: publicEnv.NEXT_PUBLIC_ICE_SERVERS.map((urls) => ({ urls })),
    });

    for (const track of localStream.getTracks()) {
      this.pc.addTrack(track, localStream);
    }

    this.pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (stream) this.events.remoteStream(stream);
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          await this.signaling.send("sdp", {
            description: this.pc.localDescription.toJSON(),
          });
        }
      } catch {
        // A failed negotiation attempt retries on the next trigger.
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.onicecandidate = ({ candidate }) => {
      void this.signaling.send("ice", {
        candidate: candidate ? candidate.toJSON() : null,
      });
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.closed) return;
      const state = this.pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        this.clearDisconnectTimer();
        this.events.connectionState("connected");
      } else if (state === "disconnected") {
        this.events.connectionState("reconnecting");
        // Give the network 5s to self-heal, then force an ICE restart.
        this.clearDisconnectTimer();
        this.disconnectTimer = setTimeout(() => this.restartIce(), 5000);
      } else if (state === "failed") {
        this.events.connectionState("reconnecting");
        this.restartIce();
      } else if (state === "checking") {
        this.events.connectionState("connecting");
      }
    };

    // Impolite peer opens the ball once signaling is up on both ends;
    // the polite peer only answers.
    this.signaling.on("sdp", (data) => void this.onRemoteDescription(data.description));
    this.signaling.on("ice", (data) => void this.onRemoteCandidate(data.candidate));
  }

  /** The impolite peer calls this when the partner's signaling is present. */
  kickoff() {
    if (this.polite || this.closed) return;
    if (this.pc.signalingState === "stable" && !this.pc.remoteDescription) {
      // Adding tracks already queued negotiationneeded; if that fired before
      // the partner subscribed, re-send the current offer.
      if (this.pc.localDescription?.type === "offer") {
        void this.signaling.send("sdp", {
          description: this.pc.localDescription.toJSON(),
        });
      }
    } else if (this.pc.localDescription?.type === "offer") {
      void this.signaling.send("sdp", {
        description: this.pc.localDescription.toJSON(),
      });
    }
  }

  restartIce() {
    if (this.closed) return;
    if (!this.polite) {
      this.pc.restartIce();
    }
  }

  private async onRemoteDescription(description: RTCSessionDescriptionInit) {
    if (this.closed) return;
    try {
      const offerCollision =
        description.type === "offer" &&
        (this.makingOffer || this.pc.signalingState !== "stable");

      this.ignoreOffer = !this.polite && offerCollision;
      if (this.ignoreOffer) return;

      await this.pc.setRemoteDescription(description);
      await this.flushCandidates();

      if (description.type === "offer") {
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          await this.signaling.send("sdp", {
            description: this.pc.localDescription.toJSON(),
          });
        }
      }
    } catch {
      // Bad SDP from a flaky reconnect; the watchdog handles recovery.
    }
  }

  private async onRemoteCandidate(candidate: RTCIceCandidateInit | null) {
    if (this.closed) return;
    if (!candidate) return;
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      if (!this.ignoreOffer) {
        // Candidates for a discarded offer are expected noise.
      }
    }
  }

  private async flushCandidates() {
    const queued = this.pendingCandidates.splice(0);
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    }
  }

  private clearDisconnectTimer() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  get connected(): boolean {
    return (
      this.pc.iceConnectionState === "connected" ||
      this.pc.iceConnectionState === "completed"
    );
  }

  close() {
    this.closed = true;
    this.clearDisconnectTimer();
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onnegotiationneeded = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.close();
  }
}
