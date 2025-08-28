import React, { useEffect, useMemo, useRef, useState } from "react";

// Minimal, single-file React chat UI for your FastAPI+Ollama API.
// - Streams tokens from /generate_stream
// - Persists API base URL + Bearer token in localStorage
// - Simple chat transcript with role labels
// - Enter to send, Shift+Enter for newline
// - Cancel in-flight request

export default function App() {
  const [apiBase, setApiBase] = useLocalStorage("vc_apiBase", import.meta.env.VITE_API_BASE || "http://localhost:8000");
  const [token, setToken] = useLocalStorage("vc_apiToken", import.meta.env.VITE_API_TOKEN || "");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "👋 Ready when you are. Type a prompt and hit Send." },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const canSend = useMemo(() => {
    return Boolean(apiBase && token && input.trim().length > 0 && !isSending);
  }, [apiBase, token, input, isSending]);

  async function send() {
    if (!canSend) return;
    setError("");
    const userMsg = { role: "user", content: input };
    const assistantMsg = { role: "assistant", content: "" };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSending(true);

    try {
      const res = await fetch(`${apiBase}/generate_stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: userMsg.content }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setMessages((m) => {
            const out = [...m];
            out[out.length - 1] = {
              role: "assistant",
              content: out[out.length - 1].content + chunk,
            };
            return out;
          });
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error(e);
        setError(String(e.message || e));
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Fixed: use current apiBase + Bearer token, update UI after success
  const resetChat = async () => {
    setError("");
    try {
      const r = await fetch(`${apiBase}/reset`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMessages([{ role: "assistant", content: "🧹 Chat history cleared. Fresh start!" }]);
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="max-w-4xl mx-auto p-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <input
            className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="API base (e.g., https://your.trycloudflare.com)"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
          />
          <input
            className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Bearer token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
          />
          <button
            onClick={() => {
              localStorage.removeItem("vc_apiBase");
              localStorage.removeItem("vc_apiToken");
              setApiBase("");
              setToken("");
            }}
            className="px-3 py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300"
            title="Clear saved settings"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="max-w-4xl mx-auto p-4 space-y-3 overflow-y-auto"
        style={{ height: "calc(100vh - 210px)" }}
      >
        {messages.map((m, i) => (
          <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={(m.role === "user" ? "bg-indigo-600 text-white" : "bg-white text-zinc-900") + " rounded-2xl px-4 py-2 shadow"}>
              <div className="text-xs opacity-70 mb-1">{m.role}</div>
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="max-w-4xl mx-auto p-4">
        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-2">
            {error}
          </div>
        )}
        <div className="bg-white rounded-2xl shadow p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your prompt... (Enter to send, Shift+Enter for newline)"
            className="w-full h-28 resize-none outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <button onClick={resetChat} className="px-3 py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300">
              Reset Chat
            </button>
            <div className="text-xs text-zinc-500">Streaming via /generate_stream</div>
            <div className="flex gap-2">
              {isSending ? (
                <button onClick={cancel} className="px-4 py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300">
                  Cancel
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!canSend}
                  className={`px-4 py-2 rounded-xl shadow ${
                    canSend ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-zinc-200 text-zinc-500"
                  }`}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- utilities ---
function useLocalStorage(key, initialValue) {
  const [val, setVal] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      if (val === undefined || val === null || val === "") return localStorage.removeItem(key);
      localStorage.setItem(key, String(val));
    } catch {}
  }, [key, val]);
  return [val, setVal];
}
