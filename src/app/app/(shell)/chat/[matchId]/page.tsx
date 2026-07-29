"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ChatMessage, MatchSummary } from "@/lib/domain/types";
import { Button, Spinner } from "@/components/ui";
import { ReportDialog } from "@/components/report-dialog";

export default function ChatPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const router = useRouter();
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUid(user.id);

      const { data: matchesData } = await supabase.rpc("get_my_matches");
      if (cancelled) return;
      const found = (matchesData as MatchSummary[] | null)?.find(
        (m) => m.match_id === matchId,
      );
      if (!found) {
        router.replace("/app/matches");
        return;
      }
      setMatch(found);

      // Subscribe BEFORE loading history. The other order loses any message
      // sent during the fetch: it is too late for the history query and too
      // early for the subscription, so it never arrives at all.
      channel = supabase
        .channel(`chat:${matchId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `match_id=eq.${matchId}`,
          },
          ({ new: row }) => {
            const msg = row as ChatMessage;
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
            );
          },
        );
      await new Promise<void>((resolve) => {
        channel!.subscribe((status) => {
          if (
            status === "SUBSCRIBED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            resolve();
          }
        });
      });
      if (cancelled) return;

      const { data: history } = await supabase
        .from("messages")
        .select("id, match_id, sender_id, body, created_at")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled) return;
      // Merge rather than replace: live messages may already have landed
      // while the history request was in flight.
      setMessages((prev) => {
        const byId = new Map<string, ChatMessage>();
        for (const m of (history as ChatMessage[]) ?? []) byId.set(m.id, m);
        for (const m of prev) byId.set(m.id, m);
        return [...byId.values()].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        );
      });
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [matchId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !match) return;
    setDraft("");
    setSendError(null);
    const { data, error } = await supabaseBrowser().rpc("send_message", {
      p_match: matchId,
      p_body: body,
    });
    if (error) {
      setDraft(body);
      setSendError(
        error.message.includes("rate_limited")
          ? "You're sending messages very fast — give it a second."
          : "Message didn't send. Try again.",
      );
      return;
    }
    const msg = data as ChatMessage;
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
  }, [draft, match, matchId]);

  async function blockPartner() {
    if (!match) return;
    await supabaseBrowser().rpc("create_block", {
      p_blocked: match.partner.user_id,
      p_reason: null,
    });
    router.replace("/app/matches");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6 text-rose-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-2xl flex-col">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-charcoal-900/8 pb-4">
        <div className="flex items-center gap-3">
          <span className="relative h-11 w-11 overflow-hidden rounded-full border border-blush-300">
            {match?.partner.photo_path ? (
              <Image
                src={`/api/photo?scope=match&id=${matchId}`}
                alt=""
                fill
                sizes="44px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full items-center justify-center bg-blush-100 font-display text-lg text-rose-500">
                {match?.partner.display_name?.[0]}
              </span>
            )}
          </span>
          <div>
            <p className="font-medium text-charcoal-900">
              {match?.partner.display_name}, {match?.partner.age}
            </p>
            <p className="text-xs text-charcoal-700/60">{match?.partner.city}</p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Conversation options"
            aria-expanded={menuOpen}
            className="rounded-full px-3 py-2 text-charcoal-700/70 hover:bg-blush-100"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-charcoal-900/10 bg-white shadow-float">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-blush-100"
              >
                Report
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmBlock(true);
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-danger-600 hover:bg-blush-100"
              >
                Block
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2.5 overflow-y-auto py-5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-charcoal-700/60">
            You matched with {match?.partner.display_name} — say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === uid;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  mine
                    ? "rounded-br-md bg-rose-600 text-cream-50"
                    : "rounded-bl-md bg-blush-100 text-charcoal-900"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {sendError && (
        <p role="alert" className="pb-2 text-xs text-danger-600">
          {sendError}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2.5 border-t border-charcoal-900/8 pt-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          placeholder={`Message ${match?.partner.display_name ?? ""}…`}
          aria-label="Message"
          className="flex-1 rounded-full border border-charcoal-900/15 bg-white/80 px-5 py-3 text-sm outline-none focus:border-rose-500"
        />
        <Button type="submit" disabled={!draft.trim()}>
          Send
        </Button>
      </form>

      {match && (
        <ReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reportedUserId={match.partner.user_id}
          displayName={match.partner.display_name}
        />
      )}

      {confirmBlock && match && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-990/60 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[--radius-soft] bg-cream-50 p-6 shadow-float">
            <h2 className="font-display text-2xl text-charcoal-900">
              Block {match.partner.display_name}?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-charcoal-700/80">
              You&apos;ll never be matched again, this chat closes for good,
              and they won&apos;t be told.
            </p>
            <div className="mt-5 flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmBlock(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={blockPartner}>
                Block
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
