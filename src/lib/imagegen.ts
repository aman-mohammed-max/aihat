import { ASPECTS, viaA1111, viaComfy, viaProvider } from '@/api/images';
import { useSettings } from '@/store/settings';

import { requireRoute } from './endpoints';
import { saveImage } from './media';

/** Generate images with the engine chosen in Images settings. Results are saved on the phone. */
export type ImageOverrides = { model?: string; aspect?: keyof typeof ASPECTS; n?: number };

export async function generateImages(prompt: string, o: ImageOverrides = {}): Promise<string[]> {
  const s = useSettings.getState();
  const [width, height] = ASPECTS[o.aspect ?? s.imageAspect];
  const model = o.model ?? (s.imageEngine === 'provider' ? s.routes.images.model : s.imageModel);
  const req = { prompt, n: o.n ?? s.imageCount, width, height, negative: s.imageNegative, model };

  let urls: string[];
  if (s.imageEngine === 'provider') urls = await viaProvider(requireRoute('images').provider, req);
  else if (s.imageEngine === 'a1111') urls = await viaA1111(s.imageUrl, req);
  else urls = await viaComfy(s.imageUrl, req, s.imageWorkflow);
  if (!urls.length) throw new Error('The server returned no images.');
  return Promise.all(urls.map(saveImage));
}
