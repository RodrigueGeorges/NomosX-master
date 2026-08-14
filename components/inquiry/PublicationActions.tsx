"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ThumbsUp, ThumbsDown, MessageCircle, Share2, Send, Trash2, X, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Reaction = "LIKE" | "DISLIKE" | null;

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  authorId: string;
}

interface PublicationActionsProps {
  publicationId: string;
  publicationTitle?: string;
}

/**
 * PublicationActions — like/dislike, comment, and share bar.
 * Follows the existing ReaderFeedback visual language.
 * Auth required for like/dislike and comment; share is always available.
 */
export function PublicationActions({ publicationId, publicationTitle }: PublicationActionsProps) {
  const { user, isAuthenticated } = useAuth();

  const [reaction, setReaction] = useState<Reaction>(null);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [loadingReaction, setLoadingReaction] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  const [shared, setShared] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);

  // ── Fetch reaction counts + user reaction on mount ───────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/articles/${publicationId}/reactions`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setLikes(data.likes || 0);
        setDislikes(data.dislikes || 0);
        setReaction(data.userReaction || null);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [publicationId]);

  // ── Fetch comments when panel opens ───────────────────────────────────────
  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/articles/${publicationId}/comments?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setComments(data.comments || []);
      setCommentTotal(data.total || 0);
    } catch {
      /* ignore */
    } finally {
      setLoadingComments(false);
    }
  }, [publicationId]);

  useEffect(() => {
    if (showComments) loadComments();
  }, [showComments, loadComments]);

  // ── Reaction toggle ──────────────────────────────────────────────────────
  async function toggleReaction(type: "LIKE" | "DISLIKE") {
    if (!isAuthenticated) {
      setAuthPrompt("Sign in to react to this report.");
      return;
    }
    if (loadingReaction) return;
    setLoadingReaction(true);

    // Optimistic update
    const prevReaction = reaction;
    const prevLikes = likes;
    const prevDislikes = dislikes;

    if (prevReaction === type) {
      // Toggle off
      setReaction(null);
      if (type === "LIKE") setLikes((l) => l - 1);
      else setDislikes((d) => d - 1);
    } else {
      setReaction(type);
      if (type === "LIKE") {
        setLikes((l) => l + 1);
        if (prevReaction === "DISLIKE") setDislikes((d) => d - 1);
      } else {
        setDislikes((d) => d + 1);
        if (prevReaction === "LIKE") setLikes((l) => l - 1);
      }
    }

    try {
      const res = await fetch(`/api/articles/${publicationId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setReaction(data.reaction);
      // Re-fetch counts to ensure accuracy
      const countsRes = await fetch(`/api/articles/${publicationId}/reactions`);
      if (countsRes.ok) {
        const counts = await countsRes.json();
        setLikes(counts.likes || 0);
        setDislikes(counts.dislikes || 0);
      }
    } catch {
      // Revert on error
      setReaction(prevReaction);
      setLikes(prevLikes);
      setDislikes(prevDislikes);
    } finally {
      setLoadingReaction(false);
    }
  }

  // ── Post comment ──────────────────────────────────────────────────────────
  async function postComment() {
    if (!isAuthenticated) {
      setAuthPrompt("Sign in to comment on this report.");
      return;
    }
    if (!commentText.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/articles/${publicationId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to post comment");
      }
      const data = await res.json();
      setComments((prev) => [data.comment, ...prev]);
      setCommentTotal((prev) => prev + 1);
      setCommentText("");
    } catch (err) {
      setAuthPrompt(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  }

  // ── Delete comment ──────────────────────────────────────────────────────────
  async function deleteComment(commentId: string) {
    try {
      const res = await fetch(
        `/api/articles/${publicationId}/comments?commentId=${commentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentTotal((prev) => prev - 1);
    } catch {
      /* ignore */
    }
  }

  // ── Share ──────────────────────────────────────────────────────────────────
  async function handleShare() {
    const shareData = {
      title: publicationTitle || "NomosX Report",
      text: publicationTitle ? `NomosX: ${publicationTitle}` : "NomosX report",
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShared(true);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShared(true);
      }
      setTimeout(() => setShared(false), 2500);
    } catch {
      // User cancelled share — don't show error
    }
  }

  return (
    <div className="mt-8 pt-6 border-t border-white/[0.08]">
      {/* Action bar */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Like */}
        <button
          type="button"
          onClick={() => toggleReaction("LIKE")}
          disabled={loadingReaction}
          className={`group flex items-center gap-2 px-3 py-2 text-sm transition-all border ${
            reaction === "LIKE"
              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]"
              : "text-white/50 border-white/[0.08] hover:text-white/80 hover:border-white/20"
          }`}
          aria-label="Like"
          aria-pressed={reaction === "LIKE"}
        >
          <ThumbsUp size={16} className={reaction === "LIKE" ? "fill-current" : ""} />
          <span className="tabular-nums">{likes}</span>
        </button>

        {/* Dislike */}
        <button
          type="button"
          onClick={() => toggleReaction("DISLIKE")}
          disabled={loadingReaction}
          className={`group flex items-center gap-2 px-3 py-2 text-sm transition-all border ${
            reaction === "DISLIKE"
              ? "text-rose-400 border-rose-500/30 bg-rose-500/[0.06]"
              : "text-white/50 border-white/[0.08] hover:text-white/80 hover:border-white/20"
          }`}
          aria-label="Dislike"
          aria-pressed={reaction === "DISLIKE"}
        >
          <ThumbsDown size={16} className={reaction === "DISLIKE" ? "fill-current" : ""} />
          <span className="tabular-nums">{dislikes}</span>
        </button>

        {/* Comments toggle */}
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          className={`flex items-center gap-2 px-3 py-2 text-sm transition-all border ${
            showComments
              ? "text-white/80 border-white/20"
              : "text-white/50 border-white/[0.08] hover:text-white/80 hover:border-white/20"
          }`}
          aria-label="Comments"
          aria-expanded={showComments}
        >
          <MessageCircle size={16} />
          <span className="tabular-nums">{commentTotal}</span>
        </button>

        {/* Share */}
        <button
          type="button"
          onClick={handleShare}
          className={`flex items-center gap-2 px-3 py-2 text-sm transition-all border ${
            shared
              ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/[0.06]"
              : "text-white/50 border-white/[0.08] hover:text-white/80 hover:border-white/20"
          }`}
          aria-label="Share"
        >
          {shared ? <Check size={16} /> : <Share2 size={16} />}
          <span className="hidden sm:inline">{shared ? "Copied" : "Share"}</span>
        </button>
      </div>

      {/* Auth prompt */}
      {authPrompt && (
        <div className="mt-3 flex items-center justify-between gap-3 px-3 py-2 border border-amber-500/20 bg-amber-500/[0.04] text-amber-300/80 text-xs">
          <span>{authPrompt}</span>
          <div className="flex items-center gap-2">
            <a href="/auth" className="underline hover:text-amber-200">Sign in</a>
            <button
              type="button"
              onClick={() => setAuthPrompt(null)}
              className="text-amber-300/50 hover:text-amber-300"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Comments panel */}
      {showComments && (
        <div className="mt-4 space-y-4">
          {/* Comment input */}
          {isAuthenticated ? (
            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment();
                }}
                placeholder="Add a comment…  (Cmd+Enter to post)"
                rows={2}
                maxLength={2000}
                className="flex-1 px-3 py-2 text-sm bg-white/[0.03] border border-white/[0.08] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/20 resize-none"
              />
              <button
                type="button"
                onClick={postComment}
                disabled={!commentText.trim() || postingComment}
                className="self-end px-3 py-2 text-sm border border-white/20 text-white/80 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Post comment"
              >
                <Send size={16} />
              </button>
            </div>
          ) : (
            <div className="px-3 py-3 border border-white/[0.06] bg-white/[0.02] text-xs text-white/40 text-center">
              <a href="/auth" className="underline text-white/60 hover:text-white/80">Sign in</a> to join the discussion.
            </div>
          )}

          {/* Comments list */}
          {loadingComments ? (
            <div className="text-xs text-white/30 text-center py-4">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="text-xs text-white/30 text-center py-4">
              No comments yet. Be the first to share your perspective.
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="px-3 py-3 border border-white/[0.06] bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white/70">
                        {c.author}
                      </span>
                      <span className="text-[10px] text-white/30 font-mono">
                        {new Date(c.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    {c.authorId === user?.id && (
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        className="text-white/20 hover:text-rose-400 transition-colors"
                        aria-label="Delete comment"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                    {c.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
