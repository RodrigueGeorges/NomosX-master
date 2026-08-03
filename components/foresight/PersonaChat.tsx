"use client";

import { useState } from "react";
import { Send, User } from "lucide-react";
import type { ForesightPersonaSnapshot } from "@/lib/foresight";

interface PersonaChatProps {
  personas: ForesightPersonaSnapshot[];
  question: string;
  publicationId: string;
}

export function PersonaChat({ personas, question, publicationId }: PersonaChatProps) {
  const [selectedId, setSelectedId] = useState(personas[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const persona = personas.find((p) => p.id === selectedId);

  async function handleSend() {
    if (!persona || !message.trim() || loading) return;
    setLoading(true);
    setReply(null);
    try {
      const res = await fetch("/api/foresight/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicationId,
          personaId: persona.id,
          message: message.trim(),
        }),
      });
      const data = await res.json();
      setReply(data.reply ?? data.error ?? "No response.");
    } catch {
      setReply("Connection error.");
    } finally {
      setLoading(false);
    }
  }

  if (!personas.length) {
    return (
      <p className="text-sm text-white/40 font-mono">
        No stakeholder perspective available for this brief.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {personas.slice(0, 12).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSelectedId(p.id);
              setReply(null);
            }}
            className={`px-2.5 py-1 border text-[11px] font-mono transition-colors ${
              selectedId === p.id
                ? "border-white/25 bg-white/10 text-white"
                : "border-white/[0.08] text-white/45 hover:border-white/15"
            }`}
          >
            {p.archetype}
          </button>
        ))}
      </div>

      {persona && (
        <div className="border border-white/[0.06] bg-black/20 p-3 text-[11px] text-white/45 font-mono">
          <div className="flex items-center gap-2 text-white/50 mb-2">
            <User size={12} />
            {persona.id}
          </div>
          {persona.beliefs[1]?.slice(0, 160) ?? persona.beliefs[0]?.slice(0, 160)}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask this stakeholder perspective…"
          className="flex-1 border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white/80 placeholder:text-white/45 focus:outline-none focus:border-white/40"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !message.trim()}
          className="px-3 py-2 border border-white/25 bg-white/10 text-white disabled:opacity-40 hover:bg-white/15 transition-colors"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      {reply && (
        <div className="nx-public-surface p-4 text-sm text-white/75 leading-relaxed">
          {reply}
        </div>
      )}
    </div>
  );
}
