// GitLab CI fetches model assets once. Browser code cannot contact the model host.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

if (process.env.CI !== 'true') throw new Error('モデル取得はCIでのみ実行してください。');

const modelId = 'jiting/xlm-roberta-ner-japanese_onnx';
const revision = '8d70fc4d277a84e59ccc70520ffd9daff66e66f0';
const source = process.env.MODEL_BASE_URL ?? `https://huggingface.co/${modelId}/resolve/${revision}/`;
const base = new URL(source.endsWith('/') ? source : `${source}/`);
const destination = join('public', 'models', modelId);
const files = [
  {path:'config.json'},
  {path:'tokenizer_config.json'},
  {path:'special_tokens_map.json'},
  {path:'sentencepiece.bpe.model'},
  {path:'tokenizer.json', sha256:'3a56def25aa40facc030ea8b0b87f3688e4b3c39eb8b45d5702b3a1300fe2a20'},
  {path:'onnx/model_quantized.onnx', sha256:'aced2a203ea3ac7e7ec6f6cb7a0044fc0b1391830c7c57563bdf2018d2d75d8a'}
];

for (const file of files) {
  const target = join(destination,file.path);
  const temporary = `${target}.partial`;
  await mkdir(dirname(target),{recursive:true});
  try {
    const response = await fetch(new URL(file.path,base), {
      headers: process.env.MODEL_AUTH_TOKEN ? {Authorization:`Bearer ${process.env.MODEL_AUTH_TOKEN}`} : {},
      signal: AbortSignal.timeout(15 * 60 * 1000)
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));
    const size=(await stat(temporary)).size;
    if (size < (file.path.endsWith('.onnx') ? 200_000_000 : file.path === 'tokenizer.json' ? 10_000_000 : 1))
      throw new Error('ファイルサイズが想定より小さいため中断しました。');
    if (file.sha256) {
      const digest=createHash('sha256');
      for await (const chunk of createReadStream(temporary)) digest.update(chunk);
      if (digest.digest('hex') !== file.sha256) throw new Error('SHA-256照合に失敗しました。');
    }
    await rename(temporary,target);
    process.stdout.write(`${file.path}: ${size} bytes verified\n`);
  } catch {
    await rm(temporary,{force:true});
    // Do not print URLs or authorization details from third-party exceptions.
    throw new Error(`${file.path} のCI取得・検証に失敗しました。`);
  }
}
