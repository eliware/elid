#!/usr/bin/env node
import crypto from 'node:crypto';
import { db } from '../src/database.mjs';
import { snowflake } from '../src/snowflake.mjs';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  npm run client -- --name "Docs Web" --redirect-uri https://docs.purinton.us/auth/callback \
    --scope docs:read --resource https://docs.purinton.us/

Options:
  --name NAME                 Required display name
  --redirect-uri URI           Repeatable; exact callback URI
  --scope SCOPE                Repeatable or space-separated
  --resource URI               Repeatable protected resource URI
  --confidential               Generate a client secret
  --client-id ID               Optional explicit client ID
`);
  process.exit(message ? 2 : 0);
}

function args(argv) {
  const out = { redirectUris: [], scopes: [], resources: [], confidential: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--confidential') { out.confidential = true; continue; }
    if (!arg.startsWith('--') || i + 1 >= argv.length) usage(`Invalid option: ${arg}`);
    const value = argv[++i];
    if (arg === '--name') out.name = value;
    else if (arg === '--client-id') out.clientId = value;
    else if (arg === '--redirect-uri') out.redirectUris.push(value);
    else if (arg === '--scope') out.scopes.push(...value.split(/\s+/).filter(Boolean));
    else if (arg === '--resource') out.resources.push(value);
    else usage(`Unknown option: ${arg}`);
  }
  return out;
}

function validate(options) {
  if (!options.name || options.name.length > 191) usage('A name of 1-191 characters is required');
  if (!options.redirectUris.length) usage('At least one --redirect-uri is required');
  for (const uri of options.redirectUris) {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) usage(`Unsafe redirect URI: ${uri}`);
    } catch { usage(`Invalid redirect URI: ${uri}`); }
  }
  for (const resource of options.resources) {
    try { if (new URL(resource).protocol !== 'https:') usage(`Resource must use HTTPS: ${resource}`); }
    catch { usage(`Invalid resource URI: ${resource}`); }
  }
}

const options = args(process.argv.slice(2));
validate(options);
const clientId = options.clientId || `cli_${crypto.randomBytes(18).toString('base64url')}`;
const clientSecret = options.confidential ? crypto.randomBytes(32).toString('base64url') : null;
const secretHash = clientSecret ? crypto.createHash('sha256').update(clientSecret).digest('hex') : null;

try {
  await db.execute(
    'INSERT INTO oauth_clients(id,client_id,client_secret_hash,name,redirect_uris,public_client,allowed_scopes,allowed_resources) VALUES(?,?,?,?,?,?,?,?)',
    [snowflake(), clientId, secretHash, options.name, JSON.stringify(options.redirectUris), !options.confidential, JSON.stringify([...new Set(options.scopes)]), JSON.stringify([...new Set(options.resources)])]
  );
  console.log(JSON.stringify({
    client_id: clientId,
    client_type: options.confidential ? 'confidential' : 'public-pkce',
    client_secret: clientSecret,
    name: options.name,
    redirect_uris: options.redirectUris,
    scopes: [...new Set(options.scopes)],
    resources: [...new Set(options.resources)]
  }, null, 2));
} finally {
  await db.end();
}
