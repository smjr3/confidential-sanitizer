import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { startPreview } from './preview-server.mjs';

const root = resolve('.');
function npm(args, cwd) {
  return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd, encoding: 'utf8', shell: process.platform === 'win32', timeout: 60000,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' }
  });
}
function cli(args, cwd) { return execFileSync(process.execPath, args, { cwd, encoding:'utf8', timeout:15000 }); }

test('installable package excludes models and supports local serving and static export', { timeout:120000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'sanitizer-package-'));
  const sentinel = join(root, 'dist/models/.package-exclusion-test');
  await mkdir(sentinel, { recursive:true });
  await writeFile(join(sentinel, 'model.onnx'), 'must not be packaged');
  await writeFile(join(sentinel, 'tokenizer.json'), '{}');
  try {
    const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root));
    const files = packed.files.map(file => file.path);
    assert.ok(files.includes('preview.bat'));
    assert.ok(files.includes('dist/index.html'));
    assert.ok(files.some(file => file.endsWith('.wasm')));
    assert.ok(files.includes('dist/licenses/onnxruntime-LICENSE'));
    assert.ok(!files.some(file => /(^|\/)(models|node_modules|src|tests)\//.test(file) || /\.(onnx|tgz)$|tokenizer/.test(file)));
    const consumer = join(temp, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), '{"private":true}');
    // Offline mode proves the tarball needs no registry or install-time model access.
    npm(['install', '--offline', '--ignore-scripts', join(temp, packed.filename)], consumer);
    const installed = join(consumer, 'node_modules/confidential-sanitizer');
    const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.dependencies ?? {}, {});
    assert.equal(pkg.scripts.postinstall, undefined);
    const launcher = join(installed, 'bin/confidential-sanitizer.mjs');
    assert.match(cli([launcher, '--help'], consumer), /export/);
    assert.equal(cli([launcher, '--version'], consumer).trim(), pkg.version);
    const destination = join(temp, 'site');
    cli([launcher, 'export', destination], consumer);
    assert.ok((await readdir(destination)).includes('preview.bat'));
    assert.ok((await readFile(join(destination, 'index.html'), 'utf8')).includes('./assets/'));
    assert.throws(() => cli([launcher, 'export', destination], consumer));
    assert.throws(() => cli([launcher, 'serve', '--port', 'invalid'], consumer));
    const models = join(temp, 'models');
    await mkdir(models);
    await writeFile(join(models, 'config.json'), '{"test":true}');
    const { server, address } = await startPreview({ root:destination, models, port:0 });
    try {
      assert.equal(server.address().address, '127.0.0.1');
      assert.equal((await fetch(address)).status, 200);
      assert.equal((await fetch(address + 'favicon.svg')).headers.get('content-type'), 'image/svg+xml');
      assert.deepEqual(await (await fetch(address + 'models/config.json')).json(), {test:true});
      assert.equal((await fetch(address, { method:'POST', body:'not accepted' })).status, 405);
      const wasm = (await readdir(join(destination, 'wasm'))).find(name => name.endsWith('.wasm'));
      assert.equal((await fetch(address + 'wasm/' + wasm, { method:'HEAD' })).headers.get('content-type'), 'application/wasm');
      assert.equal((await fetch(address + 'missing-file')).status, 404);
      await writeFile(join(temp, 'secret.txt'), 'outside');
      await symlink(join(temp, 'secret.txt'), join(destination, 'escape.txt'));
      assert.equal((await fetch(address + 'escape.txt')).status, 403);
    } finally { await new Promise(ok => server.close(ok)); }
    // Exercise the installed command entrypoint itself, not just the helper.
    const child = spawn(process.execPath, [launcher, 'serve', '--models', models], { cwd:consumer, stdio:['ignore','pipe','pipe'] });
    try {
      const address = await new Promise((ok, fail) => {
        const timeout = setTimeout(() => fail(new Error('CLI start timeout')), 10000);
        let output = '';
        child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//); if (match) { clearTimeout(timeout); ok(match[0]); } });
        child.on('error', error => { clearTimeout(timeout); fail(error); });
        child.on('exit', () => { clearTimeout(timeout); fail(new Error('CLI stopped before startup')); });
      });
      assert.equal((await fetch(address)).status, 200);
      assert.equal((await fetch(address + 'models/config.json')).status, 200);
    } finally { child.kill(); await new Promise(ok => child.once('close', ok)); }
  } finally {
    await rm(sentinel, { recursive:true, force:true });
    await rm(temp, { recursive:true, force:true });
  }
});
