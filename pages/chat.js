import Head from "next/head";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get, set, push } from "firebase/database";
import { auth, db } from "../lib/firebaseClient";

function deriveTitle(text) {
  const trimmed = text.trim();
  return trimmed.length > 40 ? trimmed.slice(0, 40) + "…" : trimmed;
}

export default function Chat() {
  const [userId, setUserId] = useState(null);
  const [checking, setChecking] = useState(true);

  const [chatsData, setChatsData] = useState({}); // { chatId: { title, messages, createdAt, updatedAt } }
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const bottomRef = useRef(null);
  const router = useRouter();

  // Auth check + load all conversations
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

      setChecking(false);
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
  };

  const handleSelectChat = (id) => {
    setActiveChatId(id);
    setMessages(chatsData[id]?.messages || []);
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
    setMessages((prev) => [...prev, { sender: "user", text }, { sender: "agent", text: "" }]);

    let accumulated = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { sender: "agent", text: accumulated };
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

      const finalMessages = [
        ...priorMessages,
        { sender: "user", text },
        { sender: "agent", text: accumulated },
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
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  if (checking) return null;

  return (
    <>
      <Head>
        <title>Chat | Closed Agent</title>
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Inter:wght@300;400;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        className="flex h-screen bg-white text-neutral-900"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Sidebar */}
        <aside className="w-72 border-r border-neutral-200 flex flex-col h-screen shrink-0">
          <div className="p-6 border-b border-neutral-200">
            <div
              className="text-lg font-bold tracking-tight mb-4"
              style={{ fontFamily: "'EB Garamond', serif" }}
            >
              Closed.
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
              <button
                key={chat.id}
                onClick={() => handleSelectChat(chat.id)}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm truncate mb-1 transition-colors ${
                  chat.id === activeChatId
                    ? "bg-neutral-100 font-medium"
                    : "hover:bg-neutral-50 text-neutral-600"
                }`}
              >
                {chat.title}
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-neutral-200">
            <button
              onClick={handleLogout}
              className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"
            >
              Log out
            </button>
          </div>
        </aside>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col h-screen">
          <header className="shrink-0 p-6 flex justify-between items-center border-b border-neutral-100">
            <div className="text-sm font-medium">
              Model: <span className="text-neutral-500">Agent-Core-4</span>
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
                  <div
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.sender === "user" ? "text-right" : ""
                    }`}
                  >
                    {msg.text}
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
              <div className="relative bg-white border border-neutral-200 shadow-xl rounded-full p-2 flex items-center">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent px-6 py-3 focus:outline-none text-sm"
                />
                <button
                  onClick={sendMessage}
                  disabled={isStreaming}
                  className="bg-neutral-900 text-white p-3 rounded-full hover:bg-neutral-700 transition-all mr-1 disabled:opacity-50"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
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
    </>
  );
}
