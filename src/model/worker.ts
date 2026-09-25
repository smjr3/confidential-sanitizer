/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';
import { MODEL_ID } from './config';
import { alignTokens, type NerEntity } from '../detection/ner';
import type { TokenClassificationPipelineType } from '@huggingface/transformers';

let classifier: TokenClassificationPipelineType | undefined;
type Request = { kind:'analyze'; text:string; base:string; local:boolean; job:number };
self.onmessage = async (event: MessageEvent<Request>) => {
  const { text, base, local, job } = event.data;
  try {
    if (!classifier) {
      env.allowLocalModels = local;
      env.allowRemoteModels = !local;
      env.localModelPath = `${base}models/`;
      env.useBrowserCache = false;
      if (env.backends.onnx.wasm) {
        env.backends.onnx.wasm.wasmPaths = `${base}wasm/`;
        env.backends.onnx.wasm.numThreads = 1;
      }
      self.postMessage({kind:'status', job, message:'NERモデルを読み込んでいます（初回は約279MB）'});
      const create = pipeline as unknown as (task:'token-classification', model:string, options:object)=>Promise<TokenClassificationPipelineType>;
      classifier = await create('token-classification', MODEL_ID, {
        dtype: 'q8',
        progress_callback: (progress: { status:string; progress?:number }) => {
          if (progress.status === 'progress' && typeof progress.progress === 'number')
            self.postMessage({kind:'status', job, message:`モデル取得 ${Math.round(progress.progress)}%`});
        }
      });
    }
    const items: Array<NerEntity & {offset:number}> = [];
    // Small chunks prevent silently truncating long documents at the tokenizer limit.
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 400, text.length);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('。',end), text.lastIndexOf('。',end-100), text.lastIndexOf('\n',end));
        if (boundary > start + 200 && boundary < end) end = boundary + 1;
      }
      self.postMessage({kind:'status', job, message:`固有名詞を解析中 ${Math.round(start / Math.max(text.length,1)*100)}%`});
      const segment=text.slice(start,end);
      const output = await classifier(segment, { ignore_labels: [] }) as NerEntity[];
      for (const item of alignTokens(segment,output)) items.push({...item,offset:start});
      start = end;
    }
    self.postMessage({kind:'result', job, items});
  } catch {
    // Do not send exception details: third-party errors can contain the source text.
    self.postMessage({kind:'error', job, message:'モデルの取得または解析に失敗しました。通信・モデル配置を確認してください。'});
  }
};
