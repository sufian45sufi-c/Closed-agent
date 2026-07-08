import Head from "next/head";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, set, push, remove } from "firebase/database";
import { auth, db } from "../lib/firebaseClient";
import { FormattedText, ModelDropdown, ChatListItem } from "../components/ChatWidgets";
import DevWorkspace from "../components/DevWorkspace";

function deriveTitle(text) {
  const trimmed = text.trim();
  return trimmed.length > 40 ? trimmed.slice(0, 40) + "…" : trimmed;
}

const REAL_CODE_LANGUAGES = [
  "javascript", "js", "jsx", "typescript", "ts", "tsx", "python", "py",
  "html", "css", "json", "java", "c", "cpp", "c++", "csharp", "cs",
  "go", "rust", "ruby", "php", "sql", "bash", "shell", "sh", "yaml", "yml",
];

function extractCodeBlocks(text) {
  const blockRegex = /```([a-zA-Z+]*)(?::([^\n`]+))?\n?([\s\S]*?)```/g;
  const blocks = [];
  let match;
  let counter = 0;
  const EXT_MAP = { html: "html", css: "css", javascript: "js", js: "js", python: "py", py: "py", json: "json", typescript: "ts", ts: "ts" };

  while ((match = blockRegex.exec(text)) !== null) {
    const language = (match[1] || "").toLowerCase();
    const explicitName = match[2]?.trim();
    const code = match[3].trim();

    const isRealLanguage = REAL_CODE_LANGUAGES.includes(language);
    const isMultiLine = code.split("\n").length >= 2;
    const isSubstantial = code.length >= 15;

    if (!isRealLanguage || !isMultiLine || !isSubstantial) continue;

    counter += 1;
    const ext = EXT_MAP[language] || language || "txt";
    const filename = explicitName || `file${counter}.${ext}`;
    blocks.push({ filename, code });
  }
  return blocks;
}

const REASONING_START = "\u0002";
const REASONING_END = "\u0003";

const READABLE_EXTENSIONS = [
  "txt", "md", "js", "jsx", "ts", "tsx", "py", "json", "csv", "html", "css",
  "java", "c", "cpp", "cs", "go", "rb", "php", "sh", "yml", "yaml", "xml", "sql",
];

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default function Chat() {
  const [userId, setUserId] = useState(null);
  const [checking, setChecking] = useState(true);

  const [chatsData, setChatsData] = useState({});
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachError, setAttachError] = useState("");

  const [effort, setEffort] = useState("medium");
  const [thinking, setThinking] = useState(false);
  const [persona, setPersona] = useState("pixel");
  const [memorySummary, setMemorySummary] = useState("");

  const [workspaceFiles, setWorkspaceFiles] = useState(null);
  const [devWorkspaceOpen, setDevWorkspaceOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
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

        const requestedChatId = router.query.open;
        if (requestedChatId && data[requestedChatId]) {
          setActiveChatId(requestedChatId);
          setMessages(data[requestedChatId].messages || []);
        } else {
          const sortedIds = Object.keys(data).sort(
            (a, b) => (data[b].updatedAt || 0) - (data[a].updatedAt || 0)
          );
          if (sortedIds.length > 0) {
            const mostRecent = sortedIds[0];
            setActiveChatId(mostRecent);
            setMessages(data[mostRecent].messages || []);
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.open]);

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
    setWorkspaceFiles(null);
    setDevWorkspaceOpen(false);
    setAttachments([]);
  };

  const handleSelectChat = (id) => {
    setActiveChatId(id);
    setMessages(chatsData[id]?.messages || []);
    setWorkspaceFiles(null);
    setDevWorkspaceOpen(false);
    setAttachments([]);
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
      setWorkspaceFiles(null);
      setDevWorkspaceOpen(false);
    }
  };

  const handleOpenWorkspace = (blocks) => {
    const filesObj = {};
    blocks.forEach((b) => {
      filesObj[b.filename] = b.code;
    });
    setWorkspaceFiles(filesObj);
    setDevWorkspaceOpen(true);
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setAttachError("");

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (file.size > 300_000) {
        setAttachError(`"${file.name}" is too large (max ~300KB for text files).`);
        continue;
      }
      if (!READABLE_EXTENSIONS.includes(ext)) {
        setAttachError(`"${file.name}" isn't a supported text-based file type.`);
        continue;
      }

      try {
        const content = await readFileAsText(file);
        setAttachments((prev) => [...prev, { name: file.name, content }]);
      } catch {
        setAttachError(`Couldn't read "${file.name}".`);
      }
    }
  };

  const removeAttachment = (name) => {
    setAttachments((prev) => prev.filter((a) => a.name !== name));
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const fileBlock = attachments
      .map((a) => `[FILE: ${a.name}]\n${a.content}\n[/FILE]`)
      .join("\n\n");

    const fullText = fileBlock ? `${fileBlock}\n\n${text}`.trim() : text;
    const displayText = text || `Attached: ${attachments.map((a) => a.name).join(", ")}`;

    const priorMessages = messages;
    let chatId = activeChatId;
    const isNewChat = !chatId;

    if (isNewChat) {
      const newRef = push(ref(db, `conversations/${userId}`));
      chatId = newRef.key;
      setActiveChatId(chatId);
    }

    setInput("");
    const attachedNames = attachments.map((a) => a.name);
    setAttachments([]);
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: displayText, attachedFiles: attachedNames },
      { sender: "agent", text: "", reasoning: "" },
    ]);

    let accumulated = "";
    let reasoningAccumulated = "";

    try {
      const conversationHistory = [
        ...priorMessages.map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        })),
        { role: "user", content: fullText },
      ];

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
          { sender: "user", text: displayText, attachedFiles: attachedNames },
          { sender: "agent", text: accumulated, reasoning: reasoningAccumulated },
        ];

        const existing = chatsData[chatId];
        const title = isNewChat ? deriveTitle(displayText) : existing?.title || deriveTitle(displayText);
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

        const codeBlocks = extractCodeBlocks(accumulated);
        if (codeBlocks.length > 0) {
          const filesObj = {};
          codeBlocks.forEach((b) => {
            filesObj[b.filename] = b.code;
          });
          setWorkspaceFiles(filesObj);
          setDevWorkspaceOpen(true);
        }

        fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userText: displayText,
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (checking) return null;

  return (
    <>
      <Head>
        <title>Chat | Fabion</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="h-screen bg-zinc-950 text-white flex overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
        <aside
          className={`${
            sidebarOpen ? "w-64" : "w-16"
          } border-r border-zinc-800 flex flex-col h-full bg-zinc-950 p-4 transition-all duration-300 relative shrink-0`}
        >
          <div className="mb-8 px-2 text-xl tracking-tight flex items-center gap-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            {sidebarOpen ? "Fabion." : "F."}
          </div>

          {sidebarOpen ? (
            <>
              <button
                onClick={handleNewChat}
                className="w-full bg-white text-black text-sm font-medium py-2.5 px-4 rounded-full hover:bg-zinc-200 transition-all mb-6 flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                New Chat
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-full py-2 pl-9 pr-4 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              <div className="flex-1 overflow-y-auto">
                {chatList.length === 0 && (
                  <div className="text-zinc-600 text-xs px-2 italic">
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
            </>
          ) : (
            <div className="flex flex-col items-center gap-6 mb-6">
              <button onClick={handleNewChat} className="text-zinc-400 hover:text-white transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}

          <div className="mt-auto border-t border-zinc-800 pt-4 space-y-4 px-2 flex flex-col">
            <button
              onClick={() => router.push("/mind")}
              className={`flex items-center gap-3 text-zinc-500 hover:text-white transition-colors ${
                sidebarOpen ? "" : "justify-center"
              }`}
            >
              <div className="w-5 h-5 rounded-full border border-zinc-600 shrink-0" />
              {sidebarOpen && <span className="text-xs">Fabion Mind</span>}
            </button>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-3 text-zinc-500 hover:text-white transition-colors ${
                sidebarOpen ? "" : "justify-center"
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-zinc-700 shrink-0" />
              {sidebarOpen && <span className="text-xs">Log out</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full relative overflow-hidden">
          <header className="h-16 flex items-center px-4 border-b border-zinc-800 shrink-0">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mr-4 p-2 text-zinc-400 hover:text-white transition">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <div className="text-sm text-zinc-400 flex-1">
              Fabion <span className="text-zinc-600 ml-1">Agent</span>
            </div>
            <button
              onClick={() => setDevWorkspaceOpen(!devWorkspaceOpen)}
              className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors border border-zinc-800 rounded-full px-3 py-1.5"
            >
              {devWorkspaceOpen ? "Close Workspace" : "Dev Workspace"}
            </button>
          </header>

          <div
            className={`flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center ${
              messages.length === 0 ? "justify-center" : ""
            }`}
          >
            <div className="max-w-3xl w-full space-y-8">
              {messages.length === 0 && (
                <h1
                  className="text-4xl text-zinc-200 opacity-90 text-center"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  How can I help you today?
                </h1>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`max-w-2xl ${msg.sender === "user" ? "ml-auto" : ""}`}>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">{msg.sender}</div>

                  {msg.sender === "user" && msg.attachedFiles && msg.attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2 justify-end">
                      {msg.attachedFiles.map((name, idx) => (
                        <span key={idx} className="text-[10px] bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-zinc-300">
                          📎 {name}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.sender === "agent" && msg.reasoning && (
                    <details className="mb-2 text-xs text-zinc-500 border border-zinc-800 rounded-lg px-3 py-2">
                      <summary className="cursor-pointer uppercase tracking-widest text-[10px]">Thinking</summary>
                      <div className="mt-2 whitespace-pre-wrap italic">{msg.reasoning}</div>
                    </details>
                  )}

                  <div
                    className={`text-sm leading-relaxed whitespace-pre-wrap text-zinc-200 ${
                      msg.sender === "user" ? "text-right" : ""
                    }`}
                  >
                    <FormattedText
                      text={msg.text}
                      onOpenWorkspace={(blocks) => handleOpenWorkspace(blocks)}
                    />
                    {isStreaming && msg.sender === "agent" && i === messages.length - 1 && (
                      <span className="inline-block w-1.5 h-4 bg-white ml-1 animate-pulse align-middle" />
                    )}
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>
          </div>

          <div className="p-6 shrink-0">
            <div className="max-w-3xl mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl p-3 shadow-2xl flex flex-col gap-3">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-2">
                  {attachments.map((a) => (
                    <span
                      key={a.name}
                      className="flex items-center gap-2 text-[11px] bg-zinc-800 border border-zinc-700 rounded-full pl-3 pr-2 py-1 text-zinc-300"
                    >
                      📎 {a.name}
                      <button onClick={() => removeAttachment(a.name)} className="text-zinc-500 hover:text-white transition-colors">
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {attachError && <div className="px-2 text-[11px] text-red-400">{attachError}</div>}

              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                className="w-full bg-transparent border-none focus:outline-none text-sm text-white placeholder:text-zinc-600 resize-none px-2 pt-2"
              />

              <div className="flex items-center justify-between px-2 pb-1">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFilesSelected}
                    className="hidden"
                    accept={READABLE_EXTENSIONS.map((e) => `.${e}`).join(",")}
                  />
                  <button
                    onClick={handleAttachClick}
                    className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
                    title="Attach a file"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>

                  <ModelDropdown
                    persona={persona}
                    setPersona={setPersona}
                    effort={effort}
                    setEffort={setEffort}
                    thinking={thinking}
                    setThinking={setThinking}
                  />
                </div>

                <button
                  onClick={sendMessage}
                  disabled={isStreaming}
                  className="bg-white text-black p-2 rounded-full hover:bg-zinc-200 transition disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </main>

        {devWorkspaceOpen && (
          <DevWorkspace initialFiles={workspaceFiles} onClose={() => setDevWorkspaceOpen(false)} />
        )}
      </div>
    </>
  );
}
