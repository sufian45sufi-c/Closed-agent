import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const DEFAULT_FILES = {
  "package.json": {
    file: {
      contents: JSON.stringify(
        { name: "fabion-workspace", type: "module", scripts: { dev: "vite" }, dependencies: {}, devDependencies: { vite: "^5.0.0" } },
        null,
        2
      ),
    },
  },
  "index.html": {
    file: {
      contents: `<!DOCTYPE html>\n<html>\n<head><title>Fabion Workspace</title></head>\n<body>\n  <h1>Hello from Fabion</h1>\n  <script type="module" src="/main.js"></script>\n</body>\n</html>`,
    },
  },
  "main.js": {
    file: { contents: `console.log("Fabion workspace ready.");` },
  },
};

const EXT_LANGUAGE_MAP = {
  html: "html", css: "css", js: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
};

function languageFromFilename(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  return EXT_LANGUAGE_MAP[ext] || "plaintext";
}

// Converts a flat { "src/App.js": "..." } map into a nested tree for rendering + WebContainer mount
function buildTree(fileMap) {
  const tree = {};
  Object.entries(fileMap).forEach(([path, contents]) => {
    const parts = path.split("/");
    let node = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = { file: { contents } };
      } else {
        node[part] = node[part] || { directory: {} };
        node = node[part].directory;
      }
    });
  });
  return tree;
}

function flattenTree(tree, prefix = "") {
  let out = {};
  for (const [name, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (node.file) out[path] = node.file.contents;
    else if (node.directory) out = { ...out, ...flattenTree(node.directory, path) };
  }
  return out;
}

function FileTree({ fileMap, activeFile, onSelect, onCreate, onRename, onDelete }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const paths = Object.keys(fileMap).sort();

  const commitCreate = () => {
    const trimmed = newName.trim();
    if (trimmed && !fileMap[trimmed]) onCreate(trimmed);
    setNewName("");
    setCreating(false);
  };

  const commitRename = (oldPath) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== oldPath && !fileMap[trimmed]) onRename(oldPath, trimmed);
    setRenaming(null);
  };

  return (
    <div className="w-48 border-r border-zinc-800 overflow-y-auto shrink-0 p-2 text-[11px]">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-zinc-500 uppercase tracking-widest text-[9px]">Files</span>
        <button onClick={() => setCreating(true)} className="text-zinc-500 hover:text-white transition-colors">+</button>
      </div>

      {creating && (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={commitCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitCreate();
            if (e.key === "Escape") setCreating(false);
          }}
          placeholder="path/name.js"
          className="w-full bg-zinc-900 border border-zinc-700 text-white px-2 py-1 rounded mb-1 focus:outline-none"
        />
      )}

      {paths.map((path) => (
        <div key={path} className="group flex items-center">
          {renaming === path ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(path)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(path);
                if (e.key === "Escape") setRenaming(null);
              }}
              className="w-full bg-zinc-900 border border-zinc-700 text-white px-2 py-1 rounded mb-0.5 focus:outline-none"
            />
          ) : (
            <>
              <button
                onClick={() => onSelect(path)}
                onDoubleClick={() => {
                  setRenaming(path);
                  setRenameValue(path);
                }}
                className={`flex-1 text-left px-2 py-1 rounded truncate mb-0.5 ${
                  activeFile === path ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"
                }`}
                title="Double-click to rename"
              >
                {path}
              </button>
              <button
                onClick={() => onDelete(path)}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-opacity px-1"
              >
                ✕
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DevWorkspace({ initialFiles, onClose }) {
  const [status, setStatus] = useState("booting");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileMap, setFileMap] = useState({});
  const [activeFile, setActiveFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [terminalLines, setTerminalLines] = useState([]);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);

  const containerRef = useRef(null);
  const writerRef = useRef(null);
  const bootedRef = useRef(false);
  const terminalEndRef = useRef(null);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    let disposed = false;

    async function boot() {
      try {
        const { WebContainer } = await import("@webcontainer/api");
        const container = await WebContainer.boot();
        if (disposed) return;
        containerRef.current = container;

        const initialFlat =
          initialFiles && Object.keys(initialFiles).length > 0 ? initialFiles : flattenTree(DEFAULT_FILES);
        const treeToMount = buildTree(initialFlat);

        await container.mount(treeToMount);
        setFileMap(initialFlat);
        setActiveFile(Object.keys(initialFlat)[0]);

        container.on("server-ready", (port, url) => setPreviewUrl(url));

        const shellProcess = await container.spawn("jsh", { terminal: { cols: 80, rows: 24 } });

        shellProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              setTerminalLines((prev) => [...prev.slice(-500), data]);
            },
          })
        );

        const input = shellProcess.input.getWriter();
        writerRef.current = input;

        setStatus("ready");
      } catch (err) {
        console.error(err);
        setErrorMsg(
          err?.message?.includes("SharedArrayBuffer")
            ? "This browser blocked the required cross-origin isolation headers. Try a hard refresh, or use Chrome/Edge."
            : err?.message || "Failed to boot the workspace."
        );
        setStatus("error");
      }
    }

    boot();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines]);

  const runCommand = useCallback((cmd) => {
    if (!writerRef.current) return;
    writerRef.current.write(cmd + "\n");
  }, []);

  const handleTerminalSubmit = (e) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    runCommand(terminalInput);
    setTerminalInput("");
  };

  const syncFile = async (path, contents) => {
    if (!containerRef.current) return;
    try {
      // Ensure parent directories exist before writing
      const parts = path.split("/");
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        await containerRef.current.fs.mkdir(dir, { recursive: true }).catch(() => {});
      }
      await containerRef.current.fs.writeFile(path, contents);
    } catch (err) {
      console.error("Write failed:", err);
    }
  };

  const handleEditorChange = (value) => {
    if (!activeFile) return;
    setFileMap((prev) => ({ ...prev, [activeFile]: value ?? "" }));
    syncFile(activeFile, value ?? "");
  };

  const handleCreateFile = (path) => {
    setFileMap((prev) => ({ ...prev, [path]: "" }));
    syncFile(path, "");
    setActiveFile(path);
  };

  const handleRenameFile = async (oldPath, newPath) => {
    setFileMap((prev) => {
      const updated = { ...prev };
      updated[newPath] = updated[oldPath];
      delete updated[oldPath];
      return updated;
    });
    const contents = fileMap[oldPath] || "";
    await syncFile(newPath, contents);
    if (containerRef.current) {
      await containerRef.current.fs.rm(oldPath).catch(() => {});
    }
    if (activeFile === oldPath) setActiveFile(newPath);
  };

  const handleDeleteFile = async (path) => {
    setFileMap((prev) => {
      const updated = { ...prev };
      delete updated[path];
      return updated;
    });
    if (containerRef.current) {
      await containerRef.current.fs.rm(path).catch(() => {});
    }
    if (activeFile === path) {
      const remaining = Object.keys(fileMap).filter((p) => p !== path);
      setActiveFile(remaining[0] || null);
    }
  };

  return (
    <div className="w-[60%] min-w-[520px] border-l border-zinc-800 flex flex-col h-screen shrink-0 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Dev Workspace</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              status === "ready" ? "bg-green-900/40 text-green-400" : status === "error" ? "bg-red-900/40 text-red-400" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {status === "booting" ? "Booting..." : status === "ready" ? "Running" : "Error"}
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-sm">✕</button>
      </div>

      {status === "error" && <div className="p-4 text-sm text-red-400">{errorMsg}</div>}

      {status !== "error" && (
        <>
          <div className="flex flex-1 overflow-hidden">
            <FileTree
              fileMap={fileMap}
              activeFile={activeFile}
              onSelect={setActiveFile}
              onCreate={handleCreateFile}
              onRename={handleRenameFile}
              onDelete={handleDeleteFile}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden" style={{ flexBasis: previewUrl ? "55%" : "100%" }}>
                {activeFile ? (
                  <MonacoEditor
                    key={activeFile}
                    height="100%"
                    theme="vs-dark"
                    path={activeFile}
                    language={languageFromFilename(activeFile)}
                    value={fileMap[activeFile] || ""}
                    onChange={handleEditorChange}
                    options={{ fontSize: 13, minimap: { enabled: true }, scrollBeyondLastLine: false, automaticLayout: true }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                    {status === "booting" ? "Starting workspace..." : "No file selected"}
                  </div>
                )}
              </div>

              {previewUrl && (
                <div className="border-t border-zinc-800 shrink-0" style={{ height: "45%" }}>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Preview</span>
                  </div>
                  <iframe title="live-preview" src={previewUrl} className="w-full h-full bg-white" />
                </div>
              )}
            </div>
          </div>

          <div className={`border-t border-zinc-800 shrink-0 transition-all ${terminalCollapsed ? "h-9" : "h-64"}`}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">Terminal</span>
                {status === "ready" && (
                  <div className="flex gap-2">
                    <button onClick={() => runCommand("npm install")} className="text-[10px] text-zinc-500 hover:text-white transition-colors">
                      npm install
                    </button>
                    <button onClick={() => runCommand("npm run dev")} className="text-[10px] text-zinc-500 hover:text-white transition-colors">
                      npm run dev
                    </button>
                    <button onClick={() => setTerminalLines([])} className="text-[10px] text-zinc-500 hover:text-white transition-colors">
                      clear
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setTerminalCollapsed(!terminalCollapsed)} className="text-zinc-500 hover:text-white transition-colors text-xs">
                {terminalCollapsed ? "▲" : "▼"}
              </button>
            </div>

            {!terminalCollapsed && (
              <div className="h-[calc(100%-30px)] flex flex-col">
                <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap">
                  {terminalLines.join("")}
                  <div ref={terminalEndRef} />
                </div>
                <form onSubmit={handleTerminalSubmit} className="border-t border-zinc-800 flex items-center px-3 py-1.5 shrink-0">
                  <span className="text-zinc-600 mr-2 text-[11px]">$</span>
                  <input
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder="Type a command and press Enter..."
                    className="flex-1 bg-transparent text-[11px] text-white placeholder:text-zinc-600 focus:outline-none font-mono"
                  />
                </form>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
