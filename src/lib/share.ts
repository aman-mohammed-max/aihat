import { saveFile } from './files';

export async function exportText(name: string, text: string) {
  return saveFile(name, text);
}
