import { useEffect, useMemo, useRef } from "react"
import { Socket } from "socket.io-client";
import { Terminal } from "xterm";
import { FitAddon } from 'xterm-addon-fit';

function ab2str(buf: ArrayBuffer) {
  return new TextDecoder().decode(new Uint8Array(buf));
}

const OPTIONS_TERM = {
    useStyle: true,
    screenKeys: true,
    cursorBlink: true,
    theme: {
        background: "black"
    }
};
export const TerminalComponent = ({ socket }: { socket: Socket }) => {
    const terminalRef = useRef<HTMLDivElement | null>(null);
    const fitAddon = useMemo(() => new FitAddon(), []);

    useEffect(() => {
        if (!terminalRef || !terminalRef.current || !socket) {
            return;
        }

        socket.emit("requestTerminal");
        const term = new Terminal(OPTIONS_TERM)
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        const terminalHandler = ({ data }: { data: ArrayBuffer | string }) => {
          if (data instanceof ArrayBuffer) {
            term.write(ab2str(data));
            return;
          }
          if (typeof data === "string") {
            term.write(data);
          }
        };

        socket.on("terminal", terminalHandler);

        term.onData((data) => {
            socket.emit('terminalData', {
                data
            });
        });

        socket.emit('terminalData', {
            data: '\n'
        });

        return () => {
            socket.off("terminal", terminalHandler);
            term.dispose();
        }
    }, [fitAddon, socket]);

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 320,
          textAlign: "left",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          overflow: "hidden",
          background: "black",
        }}
        ref={terminalRef}
      />
    );
}