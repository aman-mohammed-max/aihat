import type { ChatMessage } from '@/api/openai';

const SMALL_TALK = String.raw`(?:how\s*(?:are|r)\s*(?:you|u)(?:\s*doing)?|how'?s\s*it\s*going|what'?s\s*up|wassup|how\s*do\s*you\s*do)`;
const GREETING = new RegExp(
  String.raw`^(?:(?:hi+|hello+|hey+|heya|yo|sup|hola|namaste|salaam|gm|good\s*(?:morning|afternoon|evening|night))(?:\s+(?:there|everyone|all|bot|assistant|buddy|friend|ai))?[\s,!.]*)?(?:${SMALL_TALK})?[\s!.,?]*$|^(?:ok(?:ay)?|test(?:ing)?|thanks?|thank\s*you|thx|bye|\?+|\.+)[\s!.,?]*$`,
  'i',
);

/** Greetings and one-word replies say nothing about the topic, so they never make a chat title. */
export const isTrivial = (text: string) => {
  const s = text.trim();
  return s.length < 4 || GREETING.test(s);
};

/** The title a chat starts with: the first message, unless it is just "hi". */
export const initialTitle = (text: string) => (isTrivial(text) ? 'New chat' : text.replace(/\s+/g, ' ').trim().slice(0, 48));

/**
 * When to re-check an automatic title: after each of the first four replies (so a "hi" start gets a real name
 * as soon as the topic appears), then occasionally as the conversation drifts.
 */
export const shouldRetitle = (replyCount: number, hasTopic: boolean) => hasTopic && (replyCount <= 4 || [6, 10, 16].includes(replyCount));

/** Turn a model's raw reply into a clean title, or '' if it is unusable. */
export function cleanTitle(raw: string) {
  const t = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean) ?? '';
  const cleaned = t.replace(/^(title|name)\s*:\s*/i, '').replace(/^["'“‘`*]+|["'”’`*.!?]+$/g, '').trim().slice(0, 60);
  return /^new chat$/i.test(cleaned) ? '' : cleaned;
}

/** Messages that ask a small model to name (or keep the name of) a conversation. */
export function titleMessages(currentTitle: string, history: { role: string; content: string }[]): ChatMessage[] {
  const convo = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() && !(m.role === 'user' && isTrivial(m.content)))
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'You name conversations. Reply with a title of 3 to 6 words describing what the conversation is about. ' +
        'Greetings and small talk are never the topic. If the current title still fits, reply with it exactly. ' +
        'Reply with the title only: no quotes, no punctuation at the end.',
    },
    { role: 'user', content: `Current title: ${currentTitle === 'New chat' || isTrivial(currentTitle) ? '(none yet)' : currentTitle}\n\nConversation:\n${convo}` },
  ];
}
