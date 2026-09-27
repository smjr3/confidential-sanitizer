import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('packages', { recursive: true });
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--pack-destination', 'packages'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) console.error('パッケージ作成を開始できませんでした。npmを確認してください。');
process.exitCode = result.status ?? 1;
