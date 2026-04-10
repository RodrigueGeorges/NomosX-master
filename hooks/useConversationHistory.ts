import React from 'react';
import { useState,useEffect } from 'react';
/**
 * Conversation History Hook
 * 
 * Utilité : User peut reprendre conversations précédentes
 * UX Impact : Itération +50%, moins de réécriture
 */


export type ConversationItem = {
  id: string;
  question: string;
  mode: "brief" | "council";
  timestamp: number;
};

const STORAGE_KEY = "nomosx_conversation_history";
const MAX_HISTORY = 20; // Keep last 20 conversations

export function useConversationHistory() {
  const [history, setHistory] = useState<ConversationItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setHistory(parsed);
      }
    } catch (error) {
      console.error("Failed to load conversation history:", error);
    }
  }, []);

  // Save conversation
  const saveConversation = (question: string, mode: "brief" | "council") => {
    const newItem: ConversationItem = {
      id: Math.random().toString(36).substring(7),
      question,
      mode,
      timestamp: Date.now()
    };

    const updated = [newItem, ...history]
      .slice(0, MAX_HISTORY) // Keep only MAX_HISTORY items
      .filter((item, index, self) => 
        // Deduplicate by question (keep most recent)
        index === self.findIndex(t => t.question.toLowerCase() === item.question.toLowerCase())
      );

    setHistory(updated);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to save conversation history:", error);
    }
  };

  // Clear history
  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear conversation history:", error);
    }
  };

  // Remove specific item
  const removeItem = (id: string) => {
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to remove conversation item:", error);
    }
  };

  return {
    history,
    saveConversation,
    clearHistory,
    removeItem
  };
}
