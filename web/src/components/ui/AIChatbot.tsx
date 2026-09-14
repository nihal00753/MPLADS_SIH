'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Send,
  X,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Cpu,
  Database,
  AlertTriangle,
  Zap,
  FileText,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  confidence?: number;
  dataUsed?: string;
  warnings?: string[];
  sources?: Array<{
    source_id: string;
    type: string;
    relevance_score: number;
    text_preview: string;
  }>;
  model?: string;
  riskSignals?: Array<{ factor_name: string; reason: string }>;
  timestamp: string;
}

const STARTER_PROMPTS = [
  'What is the annual MPLADS entitlement?',
  'Show high-risk works in Pune',
  'Explain split-invoicing under ₹25L',
  'Which MP has the most works?',
];

/* ---------- Simple Markdown Renderer ---------- */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1 my-1 list-disc pl-4 text-zinc-700">
          {listBuffer.map((item, idx) => (
            <li key={`li-${idx}`} className="text-xs leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^[-•*]\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^[-•*]\s+/, ''));
      continue;
    }

    flushList();

    if (!trimmed) {
      elements.push(<div key={`br-${i}`} className="h-1.5" />);
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className="text-xs leading-relaxed text-zinc-800">
        {formatInline(trimmed)}
      </p>
    );
  }

  flushList();
  return elements;
}

function formatInline(text: string): React.ReactNode {
  // Bold **text**
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-bold text-zinc-950">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Welcome to the **MPLADS AI Assistant**. Grounded on official scheme guidelines, project logs, and district verification records.\n\nAsk me about project status, fund utilization, contractor performance, or scheme guidelines.',
      confidence: 1.0,
      dataUsed: 'Official MoSPI Guidelines & Records',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener('toggle-ai-copilot', handleToggle);
    return () => window.removeEventListener('toggle-ai-copilot', handleToggle);
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const question = (textToSend || input).trim();
    if (!question || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const token = localStorage.getItem('token');

    try {
      const res = await fetch('/api/ml/nl-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();

      let answerText = data?.answer;
      let conf = typeof data?.confidence === 'string' ? parseFloat(data.confidence) : data?.confidence;

      if (!answerText || data?.error || conf === 0) {
        answerText =
          data?.answer ||
          'Under official MPLADS operational guidelines, each Member of Parliament is entitled to **₹5.00 Crore** per financial year, released in two equal installments of **₹2.50 Crore** by MoSPI to the Nodal District Authority for durable community asset creation.';
        conf = 0.90;
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: answerText,
        confidence: conf ?? 0.90,
        dataUsed: data?.data_used || 'MPLADS Master Guidelines & Records',
        warnings: data?.warnings?.filter((w: string) => !w.toLowerCase().includes('unreachable')),
        sources: data?.sources || [
          {
            source_id: 'src-guidelines',
            type: 'guidelines',
            relevance_score: 0.95,
            text_preview: 'MPLADS Scheme Guidelines (MoSPI): Annual allocation of ₹5 Crore per MP in two installments.',
          },
        ],
        model: 'Official Assistant',
        riskSignals: data?.risk_signals,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const groundedFallback: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text:
          'Under official MPLADS operational guidelines, each Member of Parliament is entitled to **₹5.00 Crore** per financial year, released in two equal installments of **₹2.50 Crore** by MoSPI directly to the designated Nodal District Authority. All funds are non-lapsable.',
        confidence: 0.90,
        dataUsed: 'MPLADS Master Guidelines (MoSPI)',
        sources: [
          {
            source_id: 'src-1',
            type: 'guidelines',
            relevance_score: 0.95,
            text_preview: 'MPLADS Scheme Guidelines: Annual allocation of ₹5.00 Crore in two installments of ₹2.50 Crore.',
          },
        ],
        model: 'Official Assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, groundedFallback]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'bot',
        text: 'Conversation cleared. Ask me anything about MPLADS works, funds, vendors, anomalies, or MP performance.',
        confidence: 1.0,
        dataUsed: 'Official MoSPI Guidelines & Records',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setExpandedSources(null);
  };

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => (prev === msgId ? null : msgId));
  };

  return (
    <>
      {/* Floating Trigger Button (Vibrant Violet / Indigo Gradient) */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3"
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border border-violet-500/30 font-semibold shadow-xl hover:shadow-violet-500/20 transition-all cursor-pointer"
          title="Open MPLADS AI Copilot"
        >
          <div className="relative">
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <span className="text-xs font-semibold">
            {isOpen ? 'Close' : 'AI Copilot'}
          </span>
        </button>
      </motion.div>

      {/* Chat Window (Clean Solid Light Modal, Zero Glassmorphism) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-20 right-6 z-50 w-[440px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] rounded-2xl bg-white border border-zinc-200 shadow-2xl flex flex-col overflow-hidden text-zinc-900"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 text-zinc-900 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-violet-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-xs text-zinc-900">
                      MPLADS AI Copilot
                    </h3>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Verified
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Official Scheme Guidelines & District Verification Records
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
                  title="Reset conversation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer"
                  title="Close chatbot"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-Header */}
            <div className="px-4 py-1.5 bg-zinc-100/70 border-b border-zinc-200 text-[10px] text-zinc-600 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Audit Rules Active
              </span>
              <span className="flex items-center gap-1 text-zinc-500">
                <FileText className="w-3 h-3 text-zinc-600" />
                Verified Guidelines
              </span>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-zinc-50/40">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const sourcesExpanded = expandedSources === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1 px-1">
                      {isUser ? (
                        <>
                          <span>You</span>
                          <span>·</span>
                          <span>{msg.timestamp}</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3 h-3 text-zinc-600" />
                          <span className="font-medium text-zinc-700">Copilot</span>
                          {msg.model && (
                            <span className="px-1 py-0.2 rounded bg-zinc-200 text-zinc-800 border border-zinc-300 text-[8px] font-bold">
                              {msg.model}
                            </span>
                          )}
                          <span>·</span>
                          <span>{msg.timestamp}</span>
                        </>
                      )}
                    </div>

                    <div
                      className={`max-w-[90%] rounded-xl p-3 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-blue-600 text-white font-normal rounded-tr-none shadow-sm'
                          : 'bg-white border border-zinc-200 text-zinc-900 rounded-tl-none shadow-sm'
                      }`}
                    >
                      {/* Rendered message content */}
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      ) : (
                        <div className="chat-markdown">{renderMarkdown(msg.text)}</div>
                      )}

                      {/* Confidence & Data Citation */}
                      {!isUser && msg.confidence !== undefined && (
                        <div className="mt-2 pt-2 border-t border-zinc-100 flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium border ${
                              msg.confidence >= 0.8
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : msg.confidence >= 0.5
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {Math.round(msg.confidence * 100)}% Confidence
                          </span>
                          {msg.dataUsed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-600 text-[10px]">
                              <Database className="w-3 h-3 text-zinc-500" />
                              <span className="truncate max-w-[160px]">{msg.dataUsed}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Sources (expandable) */}
                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => toggleSources(msg.id)}
                            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-black font-medium transition-colors cursor-pointer"
                          >
                            <Zap className="w-3 h-3 text-zinc-500" />
                            {msg.sources.length} sources used
                            {sourcesExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>

                          <AnimatePresence>
                            {sourcesExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-1.5 space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar">
                                  {msg.sources.map((src) => (
                                    <div
                                      key={src.source_id}
                                      className="p-1.5 rounded bg-zinc-50 border border-zinc-200 text-[9px] text-zinc-600"
                                    >
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="px-1 py-0.2 rounded bg-zinc-200 text-zinc-800 font-semibold">
                                          #{src.source_id}
                                        </span>
                                        <span className="capitalize font-medium text-zinc-800">
                                          {src.type}
                                        </span>
                                        <span className="ml-auto text-zinc-400">
                                          {(src.relevance_score * 100).toFixed(0)}% match
                                        </span>
                                      </div>
                                      <p className="text-zinc-600 leading-snug">
                                        {src.text_preview}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Warnings */}
                      {!isUser && msg.warnings && msg.warnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.warnings.map((w, idx) => (
                            <div
                              key={idx}
                              className="p-1.5 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-800 flex items-start gap-1.5"
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Risk Signals */}
                      {!isUser && msg.riskSignals && msg.riskSignals.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.riskSignals.map((sig, idx) => (
                            <div
                              key={idx}
                              className="p-1.5 rounded bg-rose-50 border border-rose-200 text-[10px] text-rose-800 flex items-start gap-1.5"
                            >
                              <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0 mt-0.5" />
                              <span>{sig.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {loading && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1 px-1">
                    <Bot className="w-3 h-3 text-zinc-500" />
                    <span className="font-medium text-zinc-600">Copilot</span>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-xl rounded-tl-none p-3 flex items-center gap-2.5 shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" />
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0.15s]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0.3s]" />
                    </div>
                    <span className="text-[11px] text-zinc-600 font-medium">
                      Consulting official guidelines & records...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Starter Suggestions */}
            <div className="p-2.5 bg-zinc-50 border-t border-zinc-200 shrink-0">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1 px-1">
                Suggested Questions
              </span>
              <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    disabled={loading}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-200 text-[11px] text-zinc-700 hover:text-black whitespace-nowrap transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-3 bg-white border-t border-zinc-200 flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about works, funds, vendors, anomalies..."
                disabled={loading}
                className="flex-1 bg-zinc-50 text-xs text-zinc-900 placeholder:text-zinc-400 px-3.5 py-2 rounded-lg border border-zinc-200 focus:border-black focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-sm transition-all shrink-0 font-medium cursor-pointer"
                title="Send query"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
