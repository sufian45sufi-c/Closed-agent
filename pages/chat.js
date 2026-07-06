import Head from "next/head";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, set, push, remove } from "firebase/database";
import { auth, db } from "../lib/firebaseClient";

function deriveTitle(text) {
  const trimmed = text.trim();
  return trimmed.length > 40 ? trimmed.slice(0, 40) + "…" : trimmed;
}

function CodeBlock({ code, language, onOpenCanvas }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const extMap = {
      javascript: "js", js: "js", python: "py", html: "html", css: "css",
      json: "json", typescript: "ts", jsx: "jsx", tsx: "tsx", bash: "sh", shell: "sh",
    };
    const ext = extMap[language?.toLowerCase()] || "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-neutral-800">
      <div className="flex items-center justify-between bg-neutral-800 px-4 py-2">
        <span className="text-[10px] uppercase tracking-widest text-neutral-400">
          {language || "code"}
        </span>
        <div className="flex gap-3">
          <button
            onClick={() => onOpenCanvas(code, language)}
            className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-white transition-colors"
          >
            Open editor
          </button>
          <button
            onClick={handleCopy}
            className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-white transition-colors"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            onClick={handleDownload}
            className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-white transition-colors"
          >
            Download
          </button>
        </div>
      </div>
      <pre className="bg-neutral-900 text-neutral-100 p-4 overflow-x-auto text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function FormattedText({ text, onOpenCanvas }) {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.startsWith("```")) {
          const match = segment.match(/```(\w+)?\n?([\s\S]*?)```/);
          const language = match?.[1] || "";
          const code = (match?.[2] || segment.replace(/```/g, "")).trim();
          return (
            <CodeBlock key={i} code={code} language={language} onOpenCanvas={onOpenCanvas} />
          );
        }
        const boldParts = segment.split(/(\*\*[^*]+\*\*)/g);
        return (
          <span key={i}>
            {boldParts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </span>
        );
      })}
    </>
  );
}

const PREVIEWABLE = ["html", "css"];

function CanvasPanel({ code, language, onChange, onClose }) {
  const [tab, setTab] = useState("preview");
  const canPreview = PREVIEWABLE.includes((language || "").toLowerCase());

  const previewDoc = useMemo(() => {
    if (!canPreview) return "";
    if (language.toLowerCase() === "html") return code;
    return `<html><head><style>${code}</style></head><body><p style="font-family:sans-serif;color:#888;padding:2rem;">CSS preview — add matching HTML to see it fully rendered.</p></body></html>`;
  }, [code, language, canPreview]);

  return (
    <div className="w-[45%] min-w-[360px] border-l border-neutral-200 flex flex-col h-screen shrink-0 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            {language || "code"}
          </span>
          {canPreview && (
            <div className="flex rounded-full border border-neutral-200 overflow-hidden text-[10px]">
              <button
                onClick={() => setTab("preview")}
                className={`px-3 py-1 uppercase tracking-widest transition-colors ${
                  tab === "preview" ? "bg-neutral-900 text-white" : "text-neutral-500"
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setTab("code")}
                className={`px-3 py-1 uppercase tracking-widest transition-colors ${
                  tab === "code" ? "bg-neutral-900 text-white" : "text-neutral-500"
                }`}
              >
                Code
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-900 transition-colors text-sm"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {canPreview && tab === "preview" ? (
          <iframe
            title="preview"
            srcDoc={previewDoc}
            sandbox=""
            className="w-full h-full bg-white"
          />
        ) : (
          <textarea
            value={code}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="w-full h-full p-4 bg-neutral-900 text-neutral-100 text-xs font-mono leading-relaxed resize-none focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}

const PERSONAS = [
  { value: "thread", label: "Thread 1.0", desc: "Ultra-fast, direct answers" },
  { value: "pixel", label: "Pixel 1.0", desc: "Sharp, structured, code-focused" },
  { value: "cell", label: "Cell 1.0", desc: "Creative, multi-step reasoning" },
];

const EFFORTS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium", isDefault: true },
  { value: "high", label: "High" },
  { value: "extra", label: "Extra" },
  { value: "max", label: "Max" },
];

function ModelDropdown({ persona, setPersona, effort, setEffort, thinking, setThinking }) {
  const [open, setOpen] = useState(false);
  const [showEffort, setShowEffort] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setShowEffort(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activePersona = PERSONAS.find((p) => p.value === persona);
  const activeEffort = EFFORTS.find((e) => e.value === effort);
  const isReasoningCapable = effort === "extra" || effort === "max";

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => {
          setOpen(!open);
          setShowEffort(false);
        }}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-neutral-200 hover:border-neutral-400 transition-colors"
      >
        <span className="font-medium">{activePersona?.label}</span>
        <span className="text-neutral-400">{activeEffort?.label}</span>
        <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !showEffort && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden z-50">
          {PERSONAS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setPersona(p.value);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-xs text-neutral-400">{p.desc}</div>
              </div>
              {persona === p.value && (
                <svg className="w-4 h-4 text-neutral-900 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}

          <div className="border-t border-neutral-100">
            <button
              onClick={() => setShowEffort(true)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors"
            >
              <span className="text-sm font-medium">Effort</span>
              <span className="text-xs text-neutral-400 flex items-center gap-1">
                {activeEffort?.label}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 18l6-6-6-6" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      )}

      {open && showEffort && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden z-50">
          <button
            onClick={() => setShowEffort(false)}
            className="w-full text-left px-4 py-3 text-xs text-neutral-400 hover:bg-neutral-50 transition-colors border-b border-neutral-100"
          >
            ← Back
          </button>
          {EFFORTS.map((e) => (
            <button
              key={e.value}
              onClick={() => setEffort(e.value)}
              className="w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex items-center justify-between"
            >
              <span className="text-sm">
                {e.label}
                {e.isDefault && (
                  <span className="text-xs text-neutral-400 ml-2">Default</span>
                )}
              </span>
              {effort === e.value && (
                <svg className="w-4 h-4 text-neutral-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}

          <div className="border-t border-neutral-100 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Thinking</div>
              <div className="text-xs text-neutral-400">
                {isReasoningCapable ? "Show reasoning steps" : "Requires Extra or Max effort"}
              </div>
            </div>
            <button
              onClick={() => isReasoningCapable && setThinking(!thinking)}
              disabled={!isReasoningCapable}
              className={`w-10 h-5.5 rounded-full transition-colors relative shrink-0 ${
                thinking && isReasoningCapable ? "bg-neutral-900" : "bg-neutral-200"
              } ${!isReasoningCapable ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                  thinking && isReasoningCapable ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatListItem({ chat, isActive, onSelect, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chat.title);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const commitRename = () => {
    const trimmed = draftTitle.trim();
    if (trimmed) onRename(chat.id, trimmed);
    setRenaming(false);
  };

  if (renaming) {
    return (
      <input
        autoFocus
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") setRenaming(false);
        }}
        className="w-full text-left px-4 py-2.5 rounded-lg text-sm mb-1 border border-neutral-300 focus:outline-none"
      />
    );
  }

  return (
    <div
      className={`group relative flex items-center rounded-lg mb-1 transition-colors ${
        isActive ? "bg-neutral-100" : "hover:bg-neutral-50"
      }`}
    >
      <button
        onClick={() => onSelect(chat.id)}
        className={`flex-1 text-left px-4 py-2.5 text-sm truncate ${
          isActive ? "font-medium" : "text-neutral-600"
        }`}
      >
        {chat.title}
      </button>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="px-2 opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-900 transition-opacity"
      >
        ⋯
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <button
            onClick={() => {
              setRenaming(true);
              setMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-xs hover:bg-neutral-50 transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onDelete(chat.id);
            }}
            className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

const REASONING_START = "\u0002";
const REASONING_END = "\u0003";

export default function Chat() {
  const [userId, setUserId] = useState(null);
  const [checking, setChecking] = useState(true);

  const [chatsData, setChatsData] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [effort, setEffort] = useState("medium");
  const [thinking, setThinking] = useState(false);
  const [persona, setPersona] = useState("pixel");
  const [memorySummary, setMemorySummary] = useState("");

  const [canvas, setCanvas] = useState(null); // { code, language }

  const bottomRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setUserId(user.uid);

      const convosRef = ref(db, `conversations/${user.uid}`);
      const snap = await get(convosRef);
      if (snap.exists()) {
        const data = snap.val();
        setChatsData(data);
        const sortedIds = Object.keys(data).sort(
          (a, b) => (data[b].updatedAt || 0) - (data[a].updatedAt || 0)
        );
        if (sortedIds.length > 0) {
          const mostRecent = sortedIds[0];
          setActiveChatId(mostRecent);
          setMessages(data[mostRecent].messages || []);
        }
      }

      const settingsSnap = await get(ref(db, `settings/${user.uid}`));
      if (settingsSnap.exists()) {
        const s = settingsSnap.val();
        setEffort(s.effort || "medium");
        setThinking(!!s.thinking);
        setPersona(s.persona || "pixel");
      }

      const memSnap = await get(ref(db, `memory/${user.uid}`));
      if (memSnap.exists()) {
        setMemorySummary(memSnap.val().summary || "");
      }

      setChecking(false);
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!userId || checking) return;
    set(ref(db, `settings/${userId}`), { effort, thinking, persona });
  }, [effort, thinking, persona, userId, checking]);

  const chatList = useMemo(() => {
    const list = Object.entries(chatsData).map(([id, val]) => ({
      id,
      title: val.title || "New chat",
      updatedAt: val.updatedAt || 0,
    }));
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((c) => c.title.toLowerCase().includes(q));
  }, [chatsData, searchQuery]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setCanvas(null);
  };

  const handleSelectChat = (id) => {
    setActiveChatId(id);
    setMessages(chatsData[id]?.messages || []);
    setCanvas(null);
  };

  const handleRenameChat = async (id, newTitle) => {
    await set(ref(db, `conversations/${userId}/${id}/title`), newTitle);
    setChatsData((prev) => ({
      ...prev,
      [id]: { ...prev[id], title: newTitle },
    }));
  };

  const handleDeleteChat = async (id) => {
    await remove(ref(db, `conversations/${userId}/${id}`));
    setChatsData((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
      setCanvas(null);
    }
  };

  const handleOpenCanvas = (code, language) => {
    setCanvas({ code, language: language || "text" });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    const priorMessages = messages;
    let chatId = activeChatId;
    const isNewChat = !chatId;

    if (isNewChat) {
      const newRef = push(ref(db, `conversations/${userId}`));
      chatId = newRef.key;
      setActiveChatId(chatId);
    }

    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { sender: "user", text },
      { sender: "agent", text: "", reasoning: "" },
    ]);

    let accumulated = "";
    let reasoningAccumulated = "";

    try {
      const conversationHistory = [...priorMessages, { sender: "user", text }].map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationHistory,
          userId,
          effort,
          thinking,
          memorySummary,
          persona,
        }),
      });

      if (res.status === 429) {
        const errData = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { sender: "agent", text: errData.error };
          return updated;
        });
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let inReasoning = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let output = "";
        for (let i = 0; i < buffer.length; i++) {
          const ch = buffer[i];
          if (ch === REASONING_START) {
            inReasoning = true;
          } else if (ch === REASONING_END) {
            inReasoning = false;
          } else if (inReasoning) {
            reasoningAccumulated += ch;
          } else {
            output += ch;
          }
        }
        buffer = "";
        accumulated += output;

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            sender: "agent",
            text: accumulated,
            reasoning: reasoningAccumulated,
          };
          return updated;
        });
      }
    } catch (err) {
      accumulated = "Error reaching the agent. Please try again.";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { sender: "agent", text: accumulated };
        return updated;
      });
    } finally {
      setIsStreaming(false);

      if (accumulated) {
        const finalMessages = [
          ...priorMessages,
          { sender: "user", text },
          { sender: "agent", text: accumulated, reasoning: reasoningAccumulated },
        ];

        const existing = chatsData[chatId];
        const title = isNewChat ? deriveTitle(text) : existing?.title || deriveTitle(text);
        const createdAt = existing?.createdAt || Date.now();
        const updatedAt = Date.now();

        await set(ref(db, `conversations/${userId}/${chatId}`), {
          title,
          messages: finalMessages,
          createdAt,
          updatedAt,
        });

        setChatsData((prev) => ({
          ...prev,
          [chatId]: { title, messages: finalMessages, createdAt, updatedAt },
        }));

        fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userText: text,
            agentText: accumulated,
            existingSummary: memorySummary,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.summary) {
              setMemorySummary(data.summary);
              set(ref(db, `memory/${userId}`), {
                summary: data.summary,
                updatedAt: Date.now(),
              });
            }
          })
          .catch(() => {});
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  if (checking) return null;

  return (
    <>
      <Head>
        <title>Chat | Fabian</title>
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Inter:wght@300;400;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        className="flex h-screen bg-white text-neutral-900"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <aside className="w-72 border-r border-neutral-200 flex flex-col h-screen shrink-0">
          <div className="p-6 border-b border-neutral-200">
            <div
              className="text-lg font-bold tracking-tight mb-4"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Fabian.
            </div>
            <button
              onClick={handleNewChat}
              className="w-full bg-neutral-900 text-white text-xs uppercase tracking-widest py-2.5 rounded-full hover:bg-neutral-700 transition-all"
            >
              + New chat
            </button>
          </div>

          <div className="p-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full border border-neutral-200 bg-transparent px-4 py-2 rounded-full text-sm focus:outline-none focus:border-neutral-400 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {chatList.length === 0 && (
              <div className="text-xs text-neutral-400 px-4 py-2">
                {searchQuery ? "No chats found" : "No chats yet"}
              </div>
            )}
            {chatList.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === activeChatId}
                onSelect={handleSelectChat}
                onRename={handleRenameChat}
                onDelete={handleDeleteChat}
              />
            ))}
          </div>

          <div className="p-4 border-t border-neutral-200 space-y-1">
            <button
              onClick={() => router.push("/settings")}
              className="w-full text-left text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors py-1"
            >
              Settings
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-left text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors py-1"
            >
              Log out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col h-screen">
          <header className="shrink-0 p-6 flex justify-between items-center border-b border-neutral-100">
            <div className="text-sm font-medium">
              Fabian <span className="text-neutral-400">Agent</span>
            </div>
          </header>

          <main
            className={`flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center ${
              messages.length === 0 ? "justify-center" : ""
            }`}
          >
            <div className="max-w-3xl w-full space-y-8">
              {messages.length === 0 && (
                <div className="text-center">
                  <h2
                    className="text-5xl mb-12"
                    style={{ fontFamily: "'EB Garamond', serif" }}
                  >
                    How can I help you today?
                  </h2>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`max-w-2xl ${msg.sender === "user" ? "ml-auto" : ""}`}
                >
                  <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">
                    {msg.sender}
                  </div>

                  {msg.sender === "agent" && msg.reasoning && (
                    <details className="mb-2 text-xs text-neutral-400 border border-neutral-200 rounded-lg px-3 py-2">
                      <summary className="cursor-pointer uppercase tracking-widest text-[10px]">
                        Thinking
                      </summary>
                      <div className="mt-2 whitespace-pre-wrap italic">
                        {msg.reasoning}
                      </div>
                    </details>
                  )}

                  <div
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.sender === "user" ? "text-right" : ""
                    }`}
                  >
                    <FormattedText text={msg.text} onOpenCanvas={handleOpenCanvas} />
                    {isStreaming &&
                      msg.sender === "agent" &&
                      i === messages.length - 1 && (
                        <span className="inline-block w-1.5 h-4 bg-neutral-900 ml-1 animate-pulse align-middle" />
                      )}
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>
          </main>

          <div className="shrink-0 px-6 pb-6">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white border border-neutral-200 shadow-xl rounded-2xl p-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="w-full bg-transparent px-4 py-3 focus:outline-none text-sm"
                />
                <div className="flex items-center justify-between px-2 pb-1">
                  <ModelDropdown
                    persona={persona}
                    setPersona={setPersona}
                    effort={effort}
                    setEffort={setEffort}
                    thinking={thinking}
                    setThinking={setThinking}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={isStreaming}
                    className="bg-neutral-900 text-white p-2.5 rounded-full hover:bg-neutral-700 transition-all disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 12h14M12 5l7 7-7 7"
                      ></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {canvas && (
          <CanvasPanel
            code={canvas.code}
            language={canvas.language}
            onChange={(newCode) => setCanvas({ ...canvas, code: newCode })}
            onClose={() => setCanvas(null)}
          />
        )}
      </div>
    </>
  );
}
