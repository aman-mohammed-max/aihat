import { Alert } from 'react-native';

import { useChats, type Attachment } from '@/store/chats';
import { useSettings } from '@/store/settings';

import { uid } from './id';
import { formatHits, webSearch } from './search';

export type SubmitOptions = { files?: Attachment[]; search?: boolean; ui?: boolean; image?: boolean };

/**
 * Send one message the way the chat box does: image turn, web-search-assisted turn, UI turn or plain.
 * Used by the chat box and by commands such as /search and /ui.
 */
export async function submit(chatId: string, text: string, o: SubmitOptions = {}) {
  if (o.image) return useChats.getState().sendImage(chatId, text, { refine: useSettings.getState().imageImprove });

  const attachments: Attachment[] = [...(o.files ?? [])];
  let citations: { title: string; url: string }[] = [];
  if (o.search) {
    try {
      const hits = await webSearch(text);
      citations = hits.map((h) => ({ title: h.title, url: h.url }));
      attachments.push({ id: uid(), kind: 'file', name: 'Web results', uri: '', inline: true, text: `Use these web results to answer; cite them as [n].\n\n${formatHits(hits)}` });
    } catch (e: any) {
      Alert.alert('Web search failed', `${e?.message ?? 'Unknown error'}\n\nThe model will answer without it.`);
    }
  }
  await useChats.getState().send(chatId, text, attachments, { citations, ui: o.ui });
}
