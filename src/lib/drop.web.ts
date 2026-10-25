import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import type { Picked } from './attach';

/**
 * Desktop app: files dragged anywhere onto the window. Returns true while files are being dragged over it (to show
 * the drop target) and hands the dropped files over as blob: addresses. Only the screen in front listens.
 */
export function useFileDrop(onFiles: (files: Picked[]) => void) {
  const focused = useIsFocused();
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });

  useEffect(() => {
    if (!focused) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) handler.current(files.map((f) => ({ name: f.name, size: f.size, mimeType: f.type || undefined, uri: URL.createObjectURL(f) })));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [focused]);

  return dragging;
}
