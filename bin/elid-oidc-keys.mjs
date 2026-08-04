#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = process.env.OIDC_KEY_DIR || '/var/lib/elid/keys';
await fs.mkdir(dir, { recursive: true, mode: 0o700 });
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
const kid = `elid-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${crypto.randomBytes(4).toString('hex')}`;
await fs.writeFile(path.join(dir, 'current-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
await fs.writeFile(path.join(dir, 'current-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
await fs.writeFile(path.join(dir, 'current-kid'), `${kid}\n`, { mode: 0o644 });
console.log(JSON.stringify({ dir, kid, algorithm: 'RS256' }, null, 2));
