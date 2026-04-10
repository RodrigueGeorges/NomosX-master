
"use client";
import React from 'react';
import { useState } from 'react';
/**
 * ClaimFeedback Component
 * 
 * Allows users to provide feedback on claims (thumbs up/down)
 * Implements human-in-the-loop quality improvement
 */



interface ClaimFeedbackProps {
  claimId: string;
  onFeedbackSubmitted?: () => void;
}

export default function ClaimFeedback({ claimId, onFeedbackSubmitted }: ClaimFeedbackProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackType, setFeedbackType] = useState<string>('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showDetailedForm, setShowDetailedForm] = useState(false);

  const handleQuickFeedback = async (thumbsUp: boolean) => {
    setIsSubmitting(true);

    try {
      await fetch('/api/feedback/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId,
          rating: thumbsUp ? 5 : 1,
          feedbackType: thumbsUp ? 'accurate' : 'inaccurate',
        }),
      });

      setRating(thumbsUp ? 5 : 1);
      setIsSubmitted(true);
      onFeedbackSubmitted?.();

      // Auto-hide after 2 seconds
      setTimeout(() => setIsSubmitted(false), 2000);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDetailedFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await fetch('/api/feedback/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId,
          rating,
          feedbackType,
          comment,
        }),
      });

      setIsSubmitted(true);
      onFeedbackSubmitted?.();
      setShowDetailedForm(false);

      // Reset form
      setTimeout(() => {
        setIsSubmitted(false);
        setComment('');
      }, 2000);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted && !showDetailedForm) {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Thanks for your feedback!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Quick Feedback */}
      {!showDetailedForm && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">Was this claim helpful?</span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleQuickFeedback(true)}
              disabled={isSubmitting}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-green-500/20 hover:text-green-400 text-neutral-400 transition-all disabled:opacity-50"
              title="Accurate"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
            </button>

            <button
              onClick={() => handleQuickFeedback(false)}
              disabled={isSubmitting}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 transition-all disabled:opacity-50"
              title="Inaccurate"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => setShowDetailedForm(true)}
            className="text-xs text-indigo-400 hover:underline"
          >
            Provide detailed feedback
          </button>
        </div>
      )}

      {/* Detailed Feedback Form */}
      {showDetailedForm && (
        <form onSubmit={handleDetailedFeedback} className="space-y-3 p-4 bg-neutral-900 rounded-lg border border-neutral-800">
          <div>
            <label className="block text-xs text-neutral-400 mb-2">Rating</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-2xl transition-colors ${
                    rating && rating >= star ? 'text-yellow-400' : 'text-neutral-700 hover:text-neutral-600'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-2">Feedback Type</label>
            <select
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
              required
            >
              <option value="">Select type...</option>
              <option value="accurate">Accurate</option>
              <option value="inaccurate">Inaccurate</option>
              <option value="misleading">Misleading</option>
              <option value="incomplete">Incomplete</option>
              <option value="well_supported">Well Supported</option>
              <option value="poorly_supported">Poorly Supported</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-2">Comment (optional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
              rows={3}
              placeholder="Tell us more..."
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting || !rating || !feedbackType}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
            
            <button
              type="button"
              onClick={() => setShowDetailedForm(false)}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
