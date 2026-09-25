import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const source = 'node_modules/onnxruntime-web/dist';
const target = 'public/wasm';
mkdirSync(target,{recursive:true});
for (const name of readdirSync(source)) {
  if (name.startsWith('ort-wasm') && (name.endsWith('.wasm') || name.endsWith('.mjs')))
    copyFileSync(join(source,name),join(target,name));
}
