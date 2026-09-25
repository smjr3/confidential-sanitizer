import { appBase, LOCAL_ONLY } from './config';
import type { NerEntity } from '../detection/ner';

export class ModelLoader {
  private worker: Worker | undefined;
  private job = 0;
  private cancel: (()=>void) | undefined;
  async analyze(text: string, onStatus: (message:string)=>void): Promise<Array<NerEntity & {offset:number}>> {
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), {type:'module'});
    const job = ++this.job;
    return new Promise((resolve,reject) => {
      const worker = this.worker!;
      const cleanup = () => { worker.removeEventListener('message',handler); worker.removeEventListener('error',onError); this.cancel=undefined; };
      const onError = () => { cleanup(); reject(new Error('NERの起動に失敗しました。ブラウザ設定を確認してください。')); };
      const handler = (event: MessageEvent) => {
        if (event.data.job !== job) return;
        if (event.data.kind === 'status') onStatus(event.data.message);
        if (event.data.kind === 'result' || event.data.kind === 'error') {
          cleanup();
          if (event.data.kind === 'result') resolve(event.data.items);
          else reject(new Error(event.data.message));
        }
      };
      worker.addEventListener('message',handler);
      worker.addEventListener('error',onError);
      this.cancel = () => { cleanup(); reject(new Error('NER処理を中断しました。')); };
      worker.postMessage({kind:'analyze', text, base:appBase(), local:LOCAL_ONLY, job});
    });
  }
  dispose(): void { this.cancel?.(); this.worker?.terminate(); this.worker=undefined; }
}
