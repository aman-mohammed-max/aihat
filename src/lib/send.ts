import { useChats, type Attachment } from '@/store/chats';
import { useSettings } from '@/store/settings';

export type SubmitOptions = { files?: Attachment[]; search?: boolean; ui?: boolean; image?: boolean };

/**
 * Send one message the way the chat box does: image turn, web-search-assisted turn, UI turn or plain.
 * Used by the chat box and by commands such as /search and /ui. The web lookup itself happens inside `send`,
 * after the reply bubble exists, so the activity box can show it ("Searching the web…").
 */
export async function submit(chatId: string, text: string, o: SubmitOptions = {}) {
  if (o.image) return useChats.getState().sendImage(chatId, text, { refine: useSettings.getState().imageImprove });
  await useChats.getState().send(chatId, text, [...(o.files ?? [])], { ui: o.ui, search: o.search });
}
