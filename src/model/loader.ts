import { t } from '../content/text';
import { appBase } from './config';
import type { NerEntity } from '../detection/ner';

export class ModelLoader {
  private worker: Worker | undefined;
  private job = 0;
  private cancel: (()=>void) | undefined;
  async analyze(text: string, onStatus: (message:string)=>void): Promise<Array<NerEntity & {offset:number}>> {
    // A new request cancels the old worker before it can allocate another model.
    if (this.cancel) this.dispose();
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), {type:'module'});
    const job = ++this.job;
    return new Promise((resolve,reject) => {
      const worker = this.worker!;
      const cleanup = () => { worker.removeEventListener('message',handler); worker.removeEventListener('error',onError); this.cancel=undefined; };
      const fail = (message:string) => {
        cleanup();
        worker.terminate();
        if (this.worker===worker) this.worker=undefined;
        reject(new Error(message));
      };
      const onError = () => fail(t('ai.startFailed'));
      const handler = (event: MessageEvent) => {
        if (event.data.job !== job) return;
        if (event.data.kind === 'status') onStatus(event.data.message);
        if (event.data.kind === 'result') { cleanup(); resolve(event.data.items); }
        if (event.data.kind === 'error') fail(event.data.message);
      };
      worker.addEventListener('message',handler);
      worker.addEventListener('error',onError);
      this.cancel = () => { cleanup(); reject(new Error(t('ai.cancelled'))); };
      try { worker.postMessage({kind:'analyze', text, base:appBase(), job}); }
      catch { fail(t('ai.requestFailed')); }
    });
  }
  dispose(): void { this.cancel?.(); this.worker?.terminate(); this.worker=undefined; }
}
