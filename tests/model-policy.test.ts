import { expect,it } from 'vitest';
import { configureLocalModel } from '../src/model/policy';

it('loads the model and WASM only from the Pages origin', () => {
  const environment={
    allowLocalModels:false, allowRemoteModels:true, localModelPath:'',useBrowserCache:true,
    backends:{onnx:{wasm:{wasmPaths:'',numThreads:4}}}
  };
  configureLocalModel(environment,'https://example.test/group/project/');
  expect(environment.allowRemoteModels).toBe(false);
  expect(environment.allowLocalModels).toBe(true);
  expect(environment.localModelPath).toBe('https://example.test/group/project/models/');
  expect(environment.backends.onnx.wasm.wasmPaths).toBe('https://example.test/group/project/wasm/');
});
