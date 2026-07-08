import Head from "next/head";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, db } from "../lib/firebaseClient";

function UniverseView({ nodes, onSelect }) {
  const canvasRef = useRef(null);
  const positionsRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    positionsRef.current = nodes.map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const positions = positionsRef.current;

      // faint background stars
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 60; i++) {
        const x = (i * 137.5) % canvas.width;
        const y = (i * 91.3) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
      }

      // connecting lines between nearby nodes
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x;
          const dy = positions[i].y - positions[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            ctx.beginPath();
            ctx.moveTo(positions[i].x, positions[i].y);
            ctx.lineTo(positions[j].x, positions[j].y);
            ctx.stroke();
          }
        }
      }

      positions.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        const size = nodes[i].type === "project" ? 6 : nodes[i].type === "chat" ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }
    draw();

    function handleClick(e) {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const positions = positionsRef.current;
      for (let i = 0; i < positions.length; i++) {
        const dx = positions[i].x - clickX;
        const dy = positions[i].y - clickY;
        if (Math.sqrt(dx * dx + dy * dy) < 14) {
          onSelect(nodes[i]);
          break;
        }
      }
    }
    canvas.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", handleClick);
    };
  }, [nodes, onSelect]);

  return <canvas ref={canvasRef} className="w-full h-full cursor-pointer" />;
}

function ExplorerView({ nodes, onSelect }) {
  const categories = useMemo(() => {
    const groups = {};
    nodes.forEach((n) => {
      const cat = n.type === "chat" ? "Chats" : n.type === "project" ? "Projects" : "Notes";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(n);
    });
    return groups;
  }, [nodes]);

  return (
    <div className="p-8 overflow-y-auto h-full">
      {Object.entries(categories).map(([cat, items]) => (
        <div key={cat} className="mb-10">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">{cat}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="text-left p-4 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors bg-zinc-950"
              >
                <div className="text-sm font-medium mb-1 truncate">{item.title}</div>
                <div className="text-xs text-zinc-500 truncate">{item.summary}</div>
                <div className="text-[10px] text-zinc-600 mt-2">
                  {new Date(item.date).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {nodes.length === 0 && (
        <div className="text-zinc-600 text-sm italic">Nothing here yet — start a chat to build your Mind.</div>
      )}
    </div>
  );
}

function TimelineView({ nodes, onSelect }) {
  const grouped = useMemo(() => {
    const groups = {};
    const sorted = [...nodes].sort((a, b) => b.date - a.date);
    sorted.forEach((n) => {
      const d = new Date(n.date);
      const key = d.toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });
    return groups;
  }, [nodes]);

  return (
    <div className="p-8 overflow-y-auto h-full max-w-2xl mx-auto">
      {Object.entries(grouped).map(([day, items]) => (
        <div key={day} className="mb-10">
          <h3 className="text-sm text-zinc-400 mb-4">{day}</h3>
          <div className="border-l border-zinc-800 pl-6 space-y-4">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="block text-left w-full relative"
              >
                <div className="absolute -left-[29px] top-1.5 w-2 h-2 rounded-full bg-white" />
                <div className="text-sm">{item.title}</div>
                <div className="text-xs text-zinc-500">{item.summary}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {nodes.length === 0 && (
        <div className="text-zinc-600 text-sm italic">No history yet.</div>
      )}
    </div>
  );
}

function DetailPanel({ node, onClose, router }) {
  if (!node) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{node.type}</div>
            <h3 className="text-xl">{node.title}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed mb-4">{node.summary}</p>
        <div className="text-xs text-zinc-600 mb-4">{new Date(node.date).toLocaleString()}</div>
        {node.chatId && (
          <button
            onClick={() => router.push("/chat")}
            className="text-xs uppercase tracking-widest bg-white text-black px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors"
          >
            Open conversation
          </button>
        )}
      </div>
    </div>
  );
}

export default function Mind() {
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState("universe");
  const [nodes, setNodes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }

      const convosRef = ref(db, `conversations/${user.uid}`);
      const snap = await get(convosRef);
      const builtNodes = [];

      if (snap.exists()) {
        const data = snap.val();
        Object.entries(data).forEach(([chatId, convo]) => {
          const firstUserMsg = (convo.messages || []).find((m) => m.sender === "user");
          builtNodes.push({
            id: chatId,
            chatId,
            type: "chat",
            title: convo.title || "Untitled chat",
            summary: firstUserMsg?.text?.slice(0, 100) || "No messages yet",
            date: convo.updatedAt || convo.createdAt || Date.now(),
          });
        });
      }

      setNodes(builtNodes);
      setChecking(false);
    });
    return () => unsubscribe();
  }, [router]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q)
    );
  }, [nodes, searchQuery]);

  if (checking) return null;

  return (
    <>
      <Head>
        <title>Fabion Mind</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="h-screen bg-zinc-950 text-white flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
        <header className="h-16 flex items-center px-6 border-b border-zinc-800 shrink-0 gap-6">
          <button onClick={() => router.push("/chat")} className="text-zinc-400 hover:text-white transition-colors text-sm">
            ← Chat
          </button>
          <div className="text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
            Fabion Mind
          </div>

          <div className="flex gap-1 ml-6">
            {["universe", "explorer", "timeline"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full transition-colors ${
                  view === v ? "bg-white text-black" : "text-zinc-400 hover:text-white border border-zinc-800"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search everything..."
            className="ml-auto bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 text-xs w-64 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </header>

        <div className="flex-1 overflow-hidden">
          {view === "universe" && <UniverseView nodes={filteredNodes} onSelect={setSelectedNode} />}
          {view === "explorer" && <ExplorerView nodes={filteredNodes} onSelect={setSelectedNode} />}
          {view === "timeline" && <TimelineView nodes={filteredNodes} onSelect={setSelectedNode} />}
        </div>

        <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} router={router} />
      </div>
    </>
  );
}
