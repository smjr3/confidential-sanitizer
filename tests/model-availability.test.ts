import { afterEach, expect, it, vi } from 'vitest';
import { modelAvailable } from '../src/model/availability';

afterEach(() => vi.unstubAllGlobals());
it('checks only a same-origin model file and rejects a missing model or HTML fallback', async () => {
  const fetchMock=vi.fn().mockResolvedValueOnce(new Response('',{status:200,headers:{'content-type':'text/html'}}))
    .mockResolvedValueOnce(new Response('',{status:404}))
    .mockResolvedValueOnce(new Response('',{status:200,headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',fetchMock);
  const base='https://internal.example/tools/';
  expect(await modelAvailable(base)).toBe(false);
  expect(await modelAvailable(base)).toBe(false);
  expect(await modelAvailable(base)).toBe(true);
  expect(fetchMock.mock.calls[0][0].href).toBe('https://internal.example/tools/models/jiting/xlm-roberta-ner-japanese_onnx/config.json');
  expect(fetchMock.mock.calls[0][1]).toEqual({method:'HEAD',cache:'no-store'});
});
