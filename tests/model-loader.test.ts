import { t } from '../src/content/text';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelLoader } from '../src/model/loader';
vi.mock('../src/model/config',()=>({appBase:()=> 'https://example.test/site/'}));
class FakeWorker extends EventTarget {
  static instances:FakeWorker[]=[];
  terminate=vi.fn();
  postMessage=vi.fn();
  constructor(){super();FakeWorker.instances.push(this);}
  reply(kind:string,extra:object={}){this.dispatchEvent(new MessageEvent('message',{data:{job:this.postMessage.mock.calls.at(-1)![0].job,kind,...extra}}));}
}
let loader:ModelLoader;
beforeEach(()=>{FakeWorker.instances=[];vi.stubGlobal('Worker',FakeWorker);loader=new ModelLoader();});
afterEach(()=>{loader.dispose();vi.unstubAllGlobals();});
describe('model lifecycle',()=>{
  it('reuses a loaded worker and reports status',async()=>{
    const status=vi.fn();
    const first=loader.analyze('架空の文章',status);
    const worker=FakeWorker.instances[0];
    worker.reply('status',{message:'読み込み中'});worker.reply('result',{items:[]});
    await expect(first).resolves.toEqual([]);expect(status).toHaveBeenCalledWith('読み込み中');
    const next=loader.analyze('次',status);worker.reply('result',{items:[]});await next;
    expect(FakeWorker.instances).toHaveLength(1);
  });
  it('rejects cancelled analysis and ignores late messages',async()=>{
    const status=vi.fn();const result=loader.analyze('消去予定',status);
    const assertion=expect(result).rejects.toThrow(t('ai.cancelled'));
    const worker=FakeWorker.instances[0];loader.dispose();
    worker.reply('status',{message:'古い進捗'});worker.reply('result',{items:[]});
    await assertion;expect(status).not.toHaveBeenCalled();expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('cancels a concurrent job before starting another worker',async()=>{
    const first=loader.analyze('旧',()=>{});const assertion=expect(first).rejects.toThrow(t('ai.cancelled'));
    const second=loader.analyze('新',()=>{});await assertion;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    FakeWorker.instances[1].reply('result',{items:[]});await second;
  });
  it.each(['error','message'])('recreates a failed worker after %s failure',async kind=>{
    const first=loader.analyze('文章',()=>{});const assertion=expect(first).rejects.toThrow();
    const worker=FakeWorker.instances[0];
    if(kind==='error')worker.dispatchEvent(new Event('error'));else worker.reply('error',{message:'失敗'});
    await assertion;expect(worker.terminate).toHaveBeenCalledOnce();
    const second=loader.analyze('再実行',()=>{});
    FakeWorker.instances[1].reply('result',{items:[]});await second;
  });
});
