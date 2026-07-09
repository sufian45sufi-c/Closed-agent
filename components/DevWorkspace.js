import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { WebContainer } from '@webcontainer/api';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

// Ensure WebContainer only boots once to prevent memory leaks
let webcontainerInstance = null;

export default function DevWorkspace() {
  const terminalRef = useRef(null);
  const [booting, setBooting] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const [activeFile, setActiveFile] = useState('index.js');
  
  // Default files to load into the WebContainer
  const [files, setFiles] = useState({
    'package.json': {
      file: {
        contents: `
{
  "name": "fabion-preview",
  "type": "module",
  "dependencies": {
    "express": "latest"
  },
  "scripts": {
    "start": "node index.js"
  }
}
        `.trim(),
      },
    },
    'index.js': {
      file: {
        contents: `
import express from 'express';
const app = express();
const port = 3111;

app.get('/', (req, res) => {
  res.send('Hello from Fabion WebContainers!');
});

app.listen(port, () => {
  console.log(\`App is live at http://localhost:\${port}\`);
});
        `.trim(),
      },
    },
  });

  useEffect(() => {
    let term;
    let fitAddon;

    const initWorkspace = async () => {
      // 1. Initialize Terminal (White Theme for your aesthetic)
      if (terminalRef.current && !term) {
        term = new Terminal({
          convertEol: true,
          theme: {
            background: '#ffffff',
            foreground: '#000000',
            cursor: '#000000',
            selectionBackground: '#e5e7eb',
          },
          fontFamily: 'Inter, monospace',
        });
        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        term.writeln('Booting Fabion Workspace Environment...');
      }

      // 2. Boot WebContainer
      try {
        if (!webcontainerInstance) {
          webcontainerInstance = await WebContainer.boot();
        }
        await webcontainerInstance.mount(files);
        
        setBooting(false);
        term.writeln('\x1b[32mEnvironment ready.\x1b[0m');
        term.writeln('Type "npm install" then "npm run start" to boot the server.');

        // Listen for the server opening a port
        webcontainerInstance.on('server-ready', (port, url) => {
          term.writeln(`\x1b[34mServer ready on port ${port}\x1b[0m`);
          setPreviewUrl(url);
        });

        // 3. Connect Terminal to WebContainer shell
        const shellProcess = await webcontainerInstance.spawn('jsh');
        
        shellProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              term.write(data);
            },
          })
        );

        const input = shellProcess.input.getWriter();
        term.onData((data) => {
          input.write(data);
        });

      } catch (error) {
        if (term) term.writeln(`\x1b[31mError booting container: ${error.message}\x1b[0m`);
      }
    };

    initWorkspace();

    // Resize terminal on window resize
    const handleResize = () => {
      if (fitAddon) fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (term) term.dispose();
    };
  }, []); // Empty dependency array ensures this runs once

  const handleEditorChange = async (value) => {
    // Update React state
    setFiles((prev) => ({
      ...prev,
      [activeFile]: { file: { contents: value } },
    }));

    // Update actual WebContainer file system
    if (webcontainerInstance) {
      await webcontainerInstance.fs.writeFile(activeFile, value);
    }
  };

  return (
    <div className="flex h-[80vh] w-full bg-white text-black border border-gray-200 font-sans shadow-sm">
      
      {/* 1. File Explorer (Left Panel) */}
      <div className="w-48 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="p-3 text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200">
          Explorer
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {Object.keys(files).map((fileName) => (
            <button
              key={fileName}
              onClick={() => setActiveFile(fileName)}
              className={\`w-full text-left px-4 py-1.5 text-sm transition-colors \${
                activeFile === fileName 
                  ? 'bg-gray-200 font-medium text-black' 
                  : 'text-gray-600 hover:bg-gray-100'
              }\`}
            >
              {fileName}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Editor & Terminal (Center Panel) */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
        {/* Monaco Editor */}
        <div className="flex-1 relative">
          <div className="absolute top-0 w-full p-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 z-10 flex justify-between items-center">
            <span>{activeFile}</span>
            {booting && <span className="animate-pulse text-gray-400">Booting environment...</span>}
          </div>
          <div className="h-full pt-8">
            <Editor
              height="100%"
              language={activeFile.endsWith('.json') ? 'json' : 'javascript'}
              theme="vs-light"
              value={files[activeFile].file.contents}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: 'monospace',
                wordWrap: 'on',
                padding: { top: 16 },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>

        {/* Xterm.js Terminal */}
        <div className="h-1/3 border-t border-gray-200 bg-white flex flex-col">
          <div className="px-3 py-1 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
            Terminal
          </div>
          <div className="flex-1 p-2 overflow-hidden" ref={terminalRef}></div>
        </div>
      </div>

      {/* 3. Live Preview (Right Panel) */}
      <div className="w-1/3 bg-gray-50 flex flex-col">
        <div className="p-2 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Preview</div>
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
              Open in New Tab ↗
            </a>
          )}
        </div>
        <div className="flex-1 bg-white relative">
          {previewUrl ? (
            <iframe src={previewUrl} className="w-full h-full border-none" title="Live Preview" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Run 'npm start' to view
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
