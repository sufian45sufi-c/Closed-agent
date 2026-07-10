import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

export function CodeBlock({ code, language, onOpenWorkspace }) {
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
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-800">
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2 border-b border-zinc-800">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{language || "code"}</span>
        <div className="flex gap-3">
          <button onClick={onOpenWorkspace} className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
            Open in editor
          </button>
          <button onClick={handleCopy} className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button onClick={handleDownload} className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">
            Download
          </button>
        </div>
      </div>
      <pre className="bg-zinc-950 text-zinc-100 p-4 overflow-x-auto text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function extractBlocksForWorkspace(text) {
  const blockRegex = /```([a-zA-Z]*)(?::([^\n`]+))?\n?([\s\S]*?)```/g;
  const blocks = [];
  let match;
  let counter = 0;
  const EXT_MAP = { html: "html", css: "css", javascript: "js", js: "js", python: "py", json: "json", typescript: "ts" };
  while ((match = blockRegex.exec(text)) !== null) {
    const language = (match[1] || "").toLowerCase();
    const explicitName = match[2]?.trim();
    const code = match[3].trim();
    counter += 1;
    const ext = EXT_MAP[language] || language || "txt";
    const filename = explicitName || `file${counter}.${ext}`;
    blocks.push({ filename, language, code });
  }
  return blocks;
}

export function FormattedText({ text, images, onOpenWorkspace }) {
  const blocks = extractBlocksForWorkspace(text);
  let blockIndex = 0;

  return (
    <div className="fabion-markdown">
      {images && images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {images.slice(0, 4).map((img, i) => (
            <img
              key={i}
              src={typeof img === "string" ? img : img.url}
              alt=""
              className="w-full h-32 object-cover rounded-lg border border-zinc-800"
              loading="lazy"
              onError={(e) => (e.target.style.display = "none")}
            />
          ))}
        </div>
      )}
      <ReactMarkdown
        components={{
          h1: (props) => <h1 className="text-xl font-semibold mt-4 mb-2" {...props} />,
          h2: (props) => <h2 className="text-lg font-semibold mt-4 mb-2" {...props} />,
          h3: (props) => <h3 className="text-base font-semibold mt-3 mb-1.5" {...props} />,
          p: (props) => <p className="mb-3 leading-relaxed" {...props} />,
          ul: (props) => <ul className="list-disc list-outside ml-5 mb-3 space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal list-outside ml-5 mb-3 space-y-1" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          strong: (props) => <strong className="font-semibold text-white" {...props} />,
          a: (props) => <a className="underline text-white hover:text-zinc-300 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
          table: (props) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-left border-collapse text-sm" {...props} />
            </div>
          ),
          th: (props) => <th className="border border-zinc-800 px-3 py-2 bg-zinc-900 font-medium" {...props} />,
          td: (props) => <td className="border border-zinc-800 px-3 py-2" {...props} />,
          code: ({ inline, className, children, ...props }) => {
            if (inline) {
              return (
                <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...props}>
                  {children}
                </code>
              );
            }
            const langMatch = /language-(\w+)/.exec(className || "");
            const language = langMatch ? langMatch[1] : "";
            const code = String(children).replace(/\n$/, "");
            const block = blocks[blockIndex];
            blockIndex += 1;
            return (
              <CodeBlock
                code={code}
                language={language || block?.language || ""}
                onOpenWorkspace={() => onOpenWorkspace(blocks, block?.filename)}
              />
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </ReactMarkdown>
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

export function ModelDropdown({ persona, setPersona, effort, setEffort, thinking, setThinking }) {
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
        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-full text-[11px] text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition"
      >
        <span className="font-medium">{activePersona?.label}</span>
        <span className="text-zinc-500">{activeEffort?.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && !showEffort && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden z-50 p-2 text-[13px]">
          {PERSONAS.map((p) => (
            <div
              key={p.value}
              onClick={() => {
                setPersona(p.value);
                setOpen(false);
              }}
              className={`p-2 rounded-lg cursor-pointer flex justify-between items-center ${persona === p.value ? "bg-zinc-800" : "hover:bg-zinc-800"}`}
            >
              <div>
                <div className="font-medium">{p.label}</div>
                <div className="text-zinc-500">{p.desc}</div>
              </div>
              {persona === p.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </div>
          ))}
          <div onClick={() => setShowEffort(true)} className="p-2 mt-1 border-t border-zinc-800 flex justify-between items-center cursor-pointer hover:bg-zinc-800 rounded-lg">
            <span className="font-medium">Effort</span>
            <span className="text-zinc-500 flex items-center gap-1">
              {activeEffort?.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </div>
        </div>
      )}

      {open && showEffort && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden z-50 p-2 text-[13px]">
          <div onClick={() => setShowEffort(false)} className="p-2 text-zinc-500 cursor-pointer hover:bg-zinc-800 rounded-lg border-b border-zinc-800 mb-1">
            ← Back
          </div>
          {EFFORTS.map((e) => (
            <div
              key={e.value}
              onClick={() => setEffort(e.value)}
              className={`p-2 rounded-lg cursor-pointer flex justify-between items-center ${effort === e.value ? "bg-zinc-800" : "hover:bg-zinc-800"}`}
            >
              <span>
                {e.label}
                {e.isDefault && <span className="text-zinc-500 ml-2">Default</span>}
              </span>
              {effort === e.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </div>
          ))}
          <div className="p-2 mt-1 border-t border-zinc-800 flex items-center justify-between">
            <div>
              <div className="font-medium">Thinking</div>
              <div className="text-zinc-500 text-xs">{isReasoningCapable ? "Show reasoning steps" : "Requires Extra or Max effort"}</div>
            </div>
            <button
              onClick={() => isReasoningCapable && setThinking(!thinking)}
              disabled={!isReasoningCapable}
              className={`w-10 h-5.5 rounded-full transition-colors relative shrink-0 ${thinking && isReasoningCapable ? "bg-white" : "bg-zinc-700"} ${!isReasoningCapable ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <div className={`w-4 h-4 rounded-full absolute top-0.5 transition-transform ${thinking && isReasoningCapable ? "translate-x-5 bg-black" : "translate-x-0.5 bg-white"}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatListItem({ chat, isActive, onSelect, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chat.title);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
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
        className="w-full text-left px-3 py-2 rounded-lg text-xs mb-1 bg-zinc-900 border border-zinc-700 text-white focus:outline-none"
      />
    );
  }

  return (
    <div className={`group relative flex items-center rounded-lg mb-1 transition-colors ${isActive ? "bg-zinc-800" : "hover:bg-zinc-900"}`}>
      <button onClick={() => onSelect(chat.id)} className={`flex-1 text-left px-3 py-2 text-xs truncate ${isActive ? "text-white font-medium" : "text-zinc-400"}`}>
        {chat.title}
      </button>
      <button onClick={() => setMenuOpen(!menuOpen)} className="px-2 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white transition-opacity">
        ⋯
      </button>
      {menuOpen && (
        <div ref={menuRef} className="absolute right-0 top-full mt-1 w-32 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-50 overflow-hidden">
          <button onClick={() => { setRenaming(true); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors">
            Rename
          </button>
          <button onClick={() => { setMenuOpen(false); onDelete(chat.id); }} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-950/40 transition-colors">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
