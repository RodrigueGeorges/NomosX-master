"use client";

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * StudioX — NomosX Research Studio
 *
 * Context-aware research assistant that knows about published briefs and topics.
 * Appears as a floating button in the bottom-right corner.
 * Streams responses from /api/studiox.
 */
export default function StudioX() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "I'm StudioX - your research assistant at NomosX. Ask me about published briefs, request deeper analysis, or commission new research.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setStreaming(true);
    setStreamContent('');

    // Build message history for API
    const apiMessages = [...messages, userMessage]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/studiox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, stream: true }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamContent(fullContent);
              }
              if (parsed.error) {
                fullContent += `\n\nWarning: ${parsed.error}`;
                setStreamContent(fullContent);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Add completed assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: fullContent || 'I apologize - I was unable to generate a response. Please try again.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamContent('');
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Connection error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setStreamContent('');
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Quick action suggestions
  const quickActions = [
    "What's the latest on my monitored topics?",
    "Summarize my most recent brief",
    "Commission research on a new topic",
  ];

  // Only show for authenticated users
  if (!user) return null;

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:bg-indigo-500 hover:scale-105 transition-all duration-300 flex items-center justify-center group"
        >
          <MessageSquare size={22} className="text-white group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#09090b] animate-pulse" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-48px)] h-[560px] max-h-[calc(100vh-120px)] rounded-2xl border border-white/[0.08] bg-[#0c0c10] shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-gradient-to-r from-indigo-500/[0.06] to-violet-500/[0.04]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">StudioX</h3>
                <p className="text-[10px] text-white/30">Research protocol online</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/30 hover:text-white/60 transition-all"
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-500/15 border border-indigo-500/20 text-white/85'
                      : 'bg-white/[0.03] border border-white/[0.06] text-white/70'
                  }`}
                >
                  {/* Render markdown-lite: bold, line breaks */}
                  {msg.content.split('\n').map((line, li) => (
                    <React.Fragment key={li}>
                      {line.startsWith('**') && line.endsWith('**') ? (
                        <strong className="text-white/90 font-semibold">{line.slice(2, -2)}</strong>
                      ) : line.startsWith('- ') ? (
                        <span className="block pl-3">- {line.slice(2)}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                      {li < msg.content.split('\n').length - 1 && <br />}
                    </React.Fragment>
                  ))}
                  <div className="text-[9px] text-white/15 mt-1.5">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Streaming content */}
            {streaming && streamContent && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-white/[0.03] border border-white/[0.06] text-white/70">
                  {streamContent.split('\n').map((line, li) => (
                    <React.Fragment key={li}>
                      {line.startsWith('**') && line.endsWith('**') ? (
                        <strong className="text-white/90 font-semibold">{line.slice(2, -2)}</strong>
                      ) : line.startsWith('- ') ? (
                        <span className="block pl-3">- {line.slice(2)}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                      {li < streamContent.split('\n').length - 1 && <br />}
                    </React.Fragment>
                  ))}
                  <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
                </div>
              </div>
            )}

            {/* Streaming indicator (no content yet) */}
            {streaming && !streamContent && (
              <div className="flex justify-start">
                <div className="rounded-xl px-4 py-3 bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center gap-2 text-xs text-white/30">
                    <Loader2 size={12} className="animate-spin" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions (show when few messages) */}
          {messages.length <= 2 && !streaming && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              <span className="text-[10px] px-2.5 py-1.5 rounded-lg border border-indigo-400/15 bg-indigo-500/[0.05] text-indigo-200/60">
                citations guarded
              </span>
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(action); }}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-white/35 hover:text-white/60 hover:bg-white/[0.05] transition-all"
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your research..."
                disabled={streaming}
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder-white/20 outline-none focus:border-indigo-500/30 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={streaming || !input.trim()}
                className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center hover:bg-indigo-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {streaming ? <Loader2 size={14} className="animate-spin text-indigo-400" /> : <Send size={14} className="text-indigo-400" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
