import { useEffect, useRef } from 'react';
import 'xterm/css/xterm.css';

export default function TerminalComponent({ onInit }) {
  const terminalRef = useRef(null);

  useEffect(() => {
    async function init() {
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      
      const term = new Terminal({
        theme: { background: '#ffffff', foreground: '#000000' },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      
      onInit(term); // Pass the terminal instance back to the parent
    }
    init();
  }, [onInit]);

  return <div ref={terminalRef} className="h-full w-full" />;
}
