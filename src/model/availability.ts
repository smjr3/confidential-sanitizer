import { MODEL_ID } from './config';

/** Checks a small same-origin static file; no document text is included in the request. */
export async function modelAvailable(base: string): Promise<boolean> {
  try {
    const response = await fetch(new URL(`models/${MODEL_ID}/config.json`, base), {method:'HEAD',cache:'no-store'});
    return response.ok && (response.headers.get('content-type') ?? '').includes('json');
  } catch { return false; }
}
