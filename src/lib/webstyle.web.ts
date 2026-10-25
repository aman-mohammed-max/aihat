// Desktop app: text fields show focus with the caret and their own styling, so the browser's focus ring around them
// is dropped. Buttons and links keep theirs for keyboard use.
if (typeof document !== 'undefined') {
  const el = document.createElement('style');
  el.textContent = 'input:focus, textarea:focus { outline: none; }';
  document.head.appendChild(el);
}

export {};
