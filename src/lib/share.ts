import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function exportText(name: string, text: string) {
  const f = new File(Paths.cache, name);
  f.write(text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri);
}
