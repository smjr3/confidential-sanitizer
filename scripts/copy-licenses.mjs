import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const out = 'dist/licenses';
await mkdir(out, { recursive: true });
await cp('LICENSE', join(out, 'confidential-sanitizer-LICENSE'));
await cp('licenses', out, { recursive: true });
const names = ['@huggingface/transformers', '@huggingface/jinja', 'flatbuffers', 'long', 'platform', 'protobufjs'];
for (const entry of await readdir('node_modules/@protobufjs')) names.push(`@protobufjs/${entry}`);
const rows = [];
for (const name of names) {
  const base = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'));
  const files = (await readdir(base)).filter(file => /^(LICENSE|LICENCE|NOTICE)(\.|$)/i.test(file));
  if (!files.length) throw new Error(`License missing: ${name}`);
  for (const file of files) await cp(join(base, file), join(out, `${name.replaceAll('/', '_')}-${file}`));
  rows.push(`${name}\t${pkg.version}\t${pkg.license}`);
}
for (const name of ['onnxruntime-web']) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  rows.push(`${name}\t${pkg.version}\t${pkg.license}`);
}
await writeFile(join(out, 'packages.txt'), rows.join('\n') + '\n');
