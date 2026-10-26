// Text for reading aloud: markup removed, and cut into short pieces the phone's voice can read one at a time.

/** Reading markdown aloud sounds bad: drop code blocks and markup characters. */
export const cleanForSpeech = (t: string) => t.replace(/```[\s\S]*?```/g, ' code block. ').replace(/[`*_#>|]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/\s+/g, ' ').trim();

/** Sentences, joined into pieces of up to about 300 characters (a very long sentence is cut at a space). */
export function splitForSpeech(text: string, max = 300) {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*|[.!?。！？]+\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (let s of sentences) {
    while (s.length > max) {
      const space = s.lastIndexOf(' ', max);
      const cut = space > 40 ? space : max;
      if (cur) {
        out.push(cur.trim());
        cur = '';
      }
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut);
    }
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
