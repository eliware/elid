import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const files = ['server.mjs', ...(await readdir(path.join(root, 'src'))).filter(name => name.endsWith('.mjs')).map(name => path.join('src', name))];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
