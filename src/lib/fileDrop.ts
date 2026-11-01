// Files dragged from Explorer or a mail client onto the window. The webview hands over real file
// paths (the browser's own drag and drop only gives contents), so the Rust core can read or copy
// them like files picked in a dialog.

import { useEffect, useRef, useState } from "react";
import { inDesktopApp } from "@/api/client";

/** Files Claude can read as a booking confirmation (same list as the core accepts). */
export const CONFIRMATION_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "eml",
  "txt",
  "html",
  "htm",
  "md",
];

export const extensionOf = (path: string) => /\.([^.\\/]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Calls `onDrop` with the dropped paths; `hovering` is true while files are dragged over the window. */
export function useFileDrop(onDrop: (paths: string[]) => void, enabled = true): boolean {
  const [hovering, setHovering] = useState(false);
  const handler = useRef(onDrop);
  handler.current = onDrop;
  useEffect(() => {
    if (!inDesktopApp || !enabled) return;
    let unlisten: (() => void) | undefined;
    let gone = false;
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview()
        .onDragDropEvent((e) => {
          const p = e.payload;
          if (p.type === "enter") setHovering(p.paths.length > 0);
          else if (p.type === "leave") setHovering(false);
          else if (p.type === "drop") {
            setHovering(false);
            if (p.paths.length > 0) handler.current(p.paths);
          }
        })
        .then((u) => {
          if (gone) u();
          else unlisten = u;
        }),
    );
    return () => {
      gone = true;
      unlisten?.();
      setHovering(false);
    };
  }, [enabled]);
  return hovering;
}
