// Desktop app: text fields show focus with the caret and their own styling, so the browser's focus ring around them
// is dropped. Buttons and links keep theirs for keyboard use.
if (typeof document !== 'undefined') {
  const el = document.createElement('style');
  el.textContent = 'input:focus, textarea:focus { outline: none; }';
  document.head.appendChild(el);

  // Right-click opens the app's own menus (see contextMenu.ts), so the web view's menu (Reload, Inspect…) stays away.
  // In text fields and over selected text it stays, for cut, copy and paste.
  document.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, [contenteditable="true"]')) return;
    if (window.getSelection()?.toString()) return;
    e.preventDefault();
  });
}

export {};
