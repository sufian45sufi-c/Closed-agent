import { useState, useMemo } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const EXT_LANGUAGE_MAP = {
  html: "html", css: "css", js: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", py: "python", json: "json", md: "markdown",
};

function languageFromFilename(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  return EXT_LANGUAGE_MAP[ext] || "plaintext";
}

const PREVIEWABLE_EXTENSIONS = ["html", "css", "js", "jsx"];

function canPreview(fileMap) {
  const names = Object.keys(fileMap);
  return names.some((n) => n.toLowerCase().endsWith(".html")) ||
    names.some((n) => PREVIEWABLE_EXTENSIONS.includes(n.split(".").pop()?.toLowerCase()));
}

function buildPreviewDoc(fileMap) {
  const names = Object.keys(fileMap);
  const htmlFile = names.find((n) => n.toLowerCase().endsWith(".html"));
  const cssFiles = names.filter((n) => n.toLowerCase().endsWith(".css"));
  const jsFiles = names.filter((n) => n.toLowerCase().endsWith(".js") || n.toLowerCase().endsWith(".jsx"));

  let doc = htmlFile
    ? fileMap[htmlFile]
    : "<!DOCTYPE html><html><head></head><body></body></html>";

  const styleTags = cssFiles.map((f) => `<style>\n${fileMap[f]}\n</style>`).join("\n");
  const scriptTags = jsFiles.map((f) => `<script>\n${fileMap[f]}\n<\/script>`).join("\n");

  if (doc.includes("</head>")) {
    doc = doc.replace("</head>", `${styleTags}\n</head>`);
  } else {
    doc = styleTags + doc;
  }

  if (doc.includes("</body>")) {
    doc = doc.replace("</body>", `${scriptTags}\n</body>`);
  } else {
    doc = doc + scriptTags;
  }

  return doc;
}

function FileTree({ fileMap, activeFile, onSelect }) {
  const paths = Object.keys(fileMap).sort();

  return (
    <div className="w-44 border-r border-zinc-800 overflow-y-auto shrink-0 p-2 text-[11px]">
      <div className="text-zinc-500 uppercase tracking-widest text-[9px] px-2 mb-1">Files</div>
      {paths.map((path) => (
        <button
          key={path}
          onClick={() => onSelect(path)}
          className={`w-full text-left px-2 py-1.5 rounded truncate mb-0.5 ${
            activeFile === path ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"
          }`}
        >
          {path}
        </button>
      ))}
    </div>
  );
}

export default function DevWorkspace({ initialFiles, onClose }) {
  const [fileMap, setFileMap] = useState(initialFiles && Object.keys(initialFiles).length > 0 ? initialFiles : { "untitled.js": "" });
  const [activeFile, setActiveFile] = useState(Object.keys(fileMap)[0]);
  const [view, setView] = useState("code"); // "code" | "preview"

  const isMultiFile = Object.keys(fileMap).length > 1;
  const previewAvailable = useMemo(() => canPreview(fileMap), [fileMap]);
  const previewDoc = useMemo(() => (previewAvailable ? buildPreviewDoc(fileMap) : ""), [fileMap, previewAvailable]);

  const handleEditorChange = (value) => {
    setFileMap((prev) => ({ ...prev, [activeFile]: value ?? "" }));
  };

  return (
    <div className="w-[55%] min-w-[480px] border-l border-zinc-800 flex flex-col h-screen shrink-0 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Dev Workspace</span>
          {previewAvailable && (
            <div className="flex rounded-full border border-zinc-800 overflow-hidden text-[10px]">
              <button
                onClick={() => setView("code")}
                className={`px-3 py-1 uppercase tracking-widest transition-colors ${
                  view === "code" ? "bg-white text-black" : "text-zinc-400"
                }`}
              >
                Code
              </button>
              <button
                onClick={() => setView("preview")}
                className={`px-3 py-1 uppercase tracking-widest transition-colors ${
                  view === "preview" ? "bg-white text-black" : "text-zinc-400"
                }`}
              >
                Preview
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-sm">✕</button>
      </div>

      {view === "preview" && previewAvailable ? (
        <iframe title="preview" srcDoc={previewDoc} sandbox="allow-scripts" className="flex-1 w-full bg-white" />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {isMultiFile && (
            <FileTree fileMap={fileMap} activeFile={activeFile} onSelect={setActiveFile} />
          )}
          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              key={activeFile}
              height="100%"
              theme="vs-dark"
              path={activeFile}
              language={languageFromFilename(activeFile)}
              value={fileMap[activeFile] || ""}
              onChange={handleEditorChange}
              options={{
                fontSize: 13,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
