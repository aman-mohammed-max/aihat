import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { Attachment } from '@/store/chats';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';

import { DOC_EXT, readDocument } from './docs';
import { uid } from './id';

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|ya?ml|toml|ini|log|sql|sh|ts|tsx|js|jsx|mjs|py|rs|kt|java|go|c|cc|cpp|h|hpp|swift|rb|php|lua|r|tex)$/i;
const MAX_CHARS = 5_000_000;

/**
 * Pick files and read their text: plain text and code directly, PDF / Word / PowerPoint / Excel through the
 * document readers. Files that can't be read are listed in one message instead of being silently dropped.
 */
export async function pickFiles(): Promise<Attachment[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  const maxBytes = useSettings.getState().maxFileMb * 1024 * 1024;
  const out: Attachment[] = [];
  const problems: string[] = [];

  for (const a of res.assets) {
    if ((a.size ?? 0) > maxBytes) {
      problems.push(`${a.name}: larger than ${useSettings.getState().maxFileMb} MB (change this in Files & documents)`);
      continue;
    }
    try {
      let text: string | undefined;
      let meta: string | undefined;
      if (DOC_EXT.test(a.name)) {
        toast(`Reading ${a.name}…`);
        await new Promise((r) => setTimeout(r, 30)); // let the toast paint before the (synchronous) parse
        const r = readDocument(new Uint8Array(await new File(a.uri).arrayBuffer()), a.name);
        text = r.text;
        meta = r.meta;
      } else if (TEXT_EXT.test(a.name) || a.mimeType?.startsWith('text/') || a.mimeType === 'application/json') {
        text = await new File(a.uri).text();
        meta = `${text.length >= 10000 ? Math.round(text.length / 1000) + 'k' : text.length} chars`;
      } else if (a.mimeType?.startsWith('image/')) {
        problems.push(`${a.name}: add pictures with Photos or Camera so the model can see them`);
        continue;
      } else {
        problems.push(`${a.name}: this file type can’t be read yet (text, code, PDF, Word, PowerPoint and Excel can)`);
        continue;
      }
      if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
      out.push({ id: uid(), kind: 'file', name: a.name, uri: a.uri, mime: a.mimeType, text, meta });
    } catch (e: any) {
      problems.push(`${a.name}: ${e?.message ?? 'could not be read'}`);
    }
  }
  if (problems.length) Alert.alert(problems.length === 1 ? 'Couldn’t add a file' : `Couldn’t add ${problems.length} files`, problems.join('\n\n'));
  return out;
}

async function imagesFrom(res: ImagePicker.ImagePickerResult): Promise<Attachment[]> {
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    id: uid(),
    kind: 'image' as const,
    name: a.fileName ?? 'image.jpg',
    uri: a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri,
    mime: a.mimeType,
  }));
}

export async function pickPhotos() {
  return imagesFrom(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, base64: true, quality: 0.8 }));
}

export async function takePhoto() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return [];
  return imagesFrom(await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 }));
}
