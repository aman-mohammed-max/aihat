import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { Attachment } from '@/store/chats';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toast';

import { DOC_EXT, readDocument } from './docs';
import { readBytes, readText } from './files';
import { uid } from './id';

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|ya?ml|toml|ini|log|sql|sh|ts|tsx|js|jsx|mjs|py|rs|kt|java|go|c|cc|cpp|h|hpp|swift|rb|php|lua|r|tex)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i;
const MAX_CHARS = 5_000_000;

/** A file to read: picked, or dropped on the desktop window. */
export type Picked = { name: string; uri: string; size?: number | null; mimeType?: string | null };

function dataUri(bytes: Uint8Array, mime: string) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}

/** Pick files and read them (see readFiles). */
export async function pickFiles(): Promise<Attachment[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return readFiles(res.assets);
}

/**
 * Read files into attachments: plain text and code directly, PDF / Word / PowerPoint / Excel through the document
 * readers, pictures (and the pages of a scanned PDF) as images the model can see. Files that can't be read are
 * listed in one message instead of being silently dropped.
 */
export async function readFiles(list: Picked[]): Promise<Attachment[]> {
  const maxMb = useSettings.getState().maxFileMb;
  const out: Attachment[] = [];
  const problems: string[] = [];

  for (const a of list) {
    if ((a.size ?? 0) > maxMb * 1024 * 1024) {
      problems.push(`${a.name}: larger than ${maxMb} MB (change this in Files & documents)`);
      continue;
    }
    try {
      let text: string | undefined;
      let meta: string | undefined;
      if (a.mimeType?.startsWith('image/') || IMAGE_EXT.test(a.name)) {
        const mime = a.mimeType?.startsWith('image/') ? a.mimeType : `image/${a.name.split('.').pop()?.toLowerCase().replace('jpg', 'jpeg') ?? 'png'}`;
        out.push({ id: uid(), kind: 'image', name: a.name, uri: dataUri(await readBytes(a.uri), mime), mime });
        continue;
      }
      if (DOC_EXT.test(a.name)) {
        toast(`Reading ${a.name}…`);
        await new Promise((r) => setTimeout(r, 30)); // let the toast paint before the (synchronous) parse
        const r = readDocument(await readBytes(a.uri), a.name);
        // Scanned pages come back as pictures: they go along as images, for a model that can see them to read.
        for (const img of r.images ?? []) {
          out.push({ id: uid(), kind: 'image', name: `${a.name}, page ${img.page}`, uri: dataUri(img.bytes, img.mime), mime: img.mime });
        }
        if (r.images?.length) toast(`${a.name}: scanned pages added as pictures. Pick a model marked Vision to read them.`);
        if (!r.text) continue;
        text = r.text;
        meta = r.meta;
      } else if (TEXT_EXT.test(a.name) || a.mimeType?.startsWith('text/') || a.mimeType === 'application/json') {
        text = await readText(a.uri);
        meta = `${text.length >= 10000 ? Math.round(text.length / 1000) + 'k' : text.length} chars`;
      } else {
        problems.push(`${a.name}: this file type can’t be read yet (text, code, PDF, Word, PowerPoint, Excel and pictures can)`);
        continue;
      }
      if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
      out.push({ id: uid(), kind: 'file', name: a.name, uri: a.uri, mime: a.mimeType ?? undefined, text, meta });
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
