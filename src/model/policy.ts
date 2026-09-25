type ModelEnvironment = {
  allowLocalModels: boolean;
  allowRemoteModels: boolean;
  localModelPath: string;
  useBrowserCache: boolean;
  backends: { onnx: { wasm?: { wasmPaths?: unknown; numThreads?: number } } };
};

export function configureLocalModel(environment: ModelEnvironment, base: string): void {
  environment.allowLocalModels = true;
  environment.allowRemoteModels = false;
  environment.localModelPath = `${base}models/`;
  environment.useBrowserCache = false;
  if (environment.backends.onnx.wasm) {
    environment.backends.onnx.wasm.wasmPaths = `${base}wasm/`;
    environment.backends.onnx.wasm.numThreads = 1;
  }
}
