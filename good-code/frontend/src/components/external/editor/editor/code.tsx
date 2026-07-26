import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useRef } from "react";
import { File } from "../utils/file-manager";
import { Socket } from "socket.io-client";

export const Code = ({ selectedFile, socket }: { selectedFile: File | undefined, socket: Socket }) => {
  const filePath = selectedFile?.path ?? "";
  const code = selectedFile?.content ?? "";
  const filename = selectedFile?.name ?? "";

  let language = filename.split('.').pop()

  if (language === "js" || language === "jsx")
    language = "javascript";
  else if (language === "ts" || language === "tsx")
    language = "typescript"
  else if (language === "py" )
    language = "python"

  const lastValueRef = useRef<string>(code ?? "");

  useEffect(() => {
    lastValueRef.current = code ?? "";
  }, [filePath, code]);

  function debounce(func: (value: string) => void, wait: number) {
    let timeout: number;
    return (value: string) => {
      clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        func(value);
      }, wait);
    };
  }

  function computePatch(prev: string, next: string) {
    if (prev === next) return null;

    let start = 0;
    const prevLen = prev.length;
    const nextLen = next.length;
    const minLen = Math.min(prevLen, nextLen);

    while (start < minLen && prev.charCodeAt(start) === next.charCodeAt(start)) {
      start++;
    }

    let prevEnd = prevLen;
    let nextEnd = nextLen;
    while (
      prevEnd > start &&
      nextEnd > start &&
      prev.charCodeAt(prevEnd - 1) === next.charCodeAt(nextEnd - 1)
    ) {
      prevEnd--;
      nextEnd--;
    }

    return {
      start,
      end: prevEnd,
      text: next.slice(start, nextEnd),
      expected: prev.slice(start, prevEnd),
    };
  }

  const sendUpdate = useMemo(() => {
    return debounce((nextValue: string) => {
      if (!filePath) return;
      const prevValue = lastValueRef.current ?? "";
      const patch = computePatch(prevValue, nextValue);

      if (!patch) return;

      socket.emit(
        "updateContent",
        { path: filePath, patch },
        (res?: { ok?: boolean; needsFull?: boolean }) => {
          if (res?.needsFull) {
            socket.emit("updateContent", { path: filePath, content: nextValue });
          }
        }
      );

      lastValueRef.current = nextValue;
    }, 450);
  }, [filePath, socket]);

  if (!selectedFile) return null;

  return (
      <Editor
        height="100vh"
        language={language}
        value={code}
        theme="vs-dark"
        onChange={(value) => {
          sendUpdate(value ?? "");
        }}
      />
  )
}
