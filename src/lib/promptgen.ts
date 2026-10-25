import { quickComplete } from './llm';

const SYSTEM =
  'You write system prompts for AI assistants. Given a short description of the assistant someone wants, write a complete, ' +
  'well-structured system prompt in the second person ("You are…"): role, tone, what to do, what to avoid, and how to format answers. ' +
  '80 to 250 words. Do not mention that you are writing a prompt.\n\n' +
  'Reply in exactly this shape:\nNAME: <a 2 to 4 word title>\n\n<the system prompt>';

/** Ask the chat model to draft a system prompt from a description. Returns a name and the prompt text. */
export async function generateSystemPrompt(chat: { providerId: string | null; modelId: string | null } | null | undefined, description: string) {
  const raw = await quickComplete({ chat, system: SYSTEM, user: description, maxTokens: 700, temperature: 0.7 });
  const m = raw.match(/^\s*NAME:\s*(.+)\n+([\s\S]+)$/i);
  const name = (m?.[1] ?? description).replace(/[*"`]/g, '').trim().slice(0, 40) || 'New prompt';
  const body = (m?.[2] ?? raw).trim();
  if (!body) throw new Error('The model did not write a prompt. Try a more specific description.');
  return { name, body };
}
