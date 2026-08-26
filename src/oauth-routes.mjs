import bcrypt from 'bcryptjs';
import {authorityIssuer} from './authority.mjs';
import {digest, safeEqual} from './crypto.mjs';
import {log} from '@eliware/common';

export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const loginPage = (client,q={}) => `<!doctype html><meta name=viewport content="width=device-width"><title>Sign in - Elid</title><style>:root{color-scheme:dark}body{font:15px system-ui;min-height:100vh;display:grid;place-items:center;margin:0;background:radial-gradient(circle at top,#24334b,#111 60%);color:#eee}.card{width:min(420px,calc(100% - 2rem));box-sizing:border-box;background:#1d1d1dcc;border:1px solid #4b5563;border-radius:14px;padding:2rem}input,button{box-sizing:border-box;width:100%;padding:.75rem;margin:.4rem 0;background:#111;color:#fff;border:1px solid #667085;border-radius:6px}button{background:#4f8cff}</style><main class=card><b>ELID OAUTH</b><h1>Sign in to continue</h1><p>${esc(client)} is requesting access.</p><p>Scopes: <b>${esc(q.scope||'none')}</b><br>Resource: <b>${esc(q.resource||'unspecified')}</b></p><form id=f method=post><input type=hidden name=data value="DATA"><input name=username autocomplete=username required><input name=password type=password autocomplete=current-password required><button>Authorize application</button><p id=e hidden>Invalid username or password.</p></form></main><script>f.onsubmit=()=>{e.hidden=true}</script>`;

export function mountOAuthRoutes(app, {db, oauth, rateLimit}) {
  app.get('/oauth/authorize', async (req, res) => {
    if (!req.query.client_id || !req.query.redirect_uri || !req.query.code_challenge) return res.status(400).send('Missing OAuth parameters');
    const data = Buffer.from(JSON.stringify(req.query)).toString('base64url');
    const result = await db.execute('SELECT name FROM oauth_clients WHERE client_id=?', [req.query.client_id]);
    const rows = result?.[0] || [];
    const clientName = String(rows[0]?.name || req.query.client_id).trim();
    res.type('html').send(loginPage(clientName,req.query).replace('DATA', data));
  });
  app.post('/oauth/authorize', rateLimit({db, windowMs: 60000, max: 20}), async (req, res) => {
    try {
      const q = JSON.parse(Buffer.from(req.body.data, 'base64url'));
      const [rows] = await db.execute('SELECT * FROM oauth_users WHERE username=?', [req.body.username]);
      if (!rows[0] || !(await bcrypt.compare(req.body.password, rows[0].password_hash))) return res.status(401).send('Invalid credentials');
      res.redirect(await oauth.authorize(q, rows[0].id));
    } catch (error) { log.error('oauth authorize error', error); res.status(400).json({error: 'server_error'}); }
  });
  app.post('/oauth/register', rateLimit({db, windowMs: 60000, max: 10}), async (req, res) => {
    const body=req.body&&typeof req.body==='object'?req.body:{};
    try { const result = await oauth.register(body); const status=result.error?400:201; log.info('oauth registration result', {status,error:result.error||null}); res.status(status).json(result); }
    catch (error) { log.error('oauth registration error', error); res.status(500).json({error: 'server_error'}); }
  });
  app.post('/oauth/token', rateLimit({db, windowMs: 60000, max: 30}), async (req, res) => {
    try { const result = await oauth.token(req.body); res.status(result.error ? 400 : 200).json(result); }
    catch (error) { log.error('oauth token error', error); res.status(500).json({error: 'server_error'}); }
  });
  app.post('/oauth/introspect', rateLimit({db, windowMs: 60000, max: 60}), async (req, res) => {
    if (!req.body.token) return res.json({active: false});
    const auth = req.headers.authorization || '';
    const basic = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString() : '';
    const [basicId, basicSecret] = basic.split(':');
    const clientId = req.body.client_id || basicId;
    if (!clientId || !basicSecret) return res.status(401).json({error:'invalid_client'});
    const [clients] = await db.execute('SELECT client_secret_hash FROM oauth_clients WHERE client_id=? AND public_client=FALSE',[clientId]);
    if (!clients[0]?.client_secret_hash || !safeEqual(digest(basicSecret), clients[0].client_secret_hash)) return res.status(401).json({error:'invalid_client'});
    const [rows] = await db.execute("SELECT client_id,user_id,scope,resource,UNIX_TIMESTAMP(expires_at) exp,UNIX_TIMESTAMP(created_at) iat FROM oauth_tokens WHERE token_hash=SHA2(?,256) AND token_type='access' AND revoked_at IS NULL AND expires_at>NOW()", [req.body.token]);
    const row=rows[0];
    if (!row || req.body.resource && req.body.resource!==row.resource) return res.json({active: false});
    res.json({active:true,client_id:row.client_id,sub:row.user_id,user_id:row.user_id,scope:row.scope,resource:row.resource,aud:row.resource,iss:authorityIssuer(),exp:Number(row.exp),iat:Number(row.iat),token_type:'Bearer'});
  });
  app.get('/userinfo', rateLimit({db, windowMs: 60000, max: 60}), async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({error: 'invalid_token'});
    const [rows] = await db.execute("SELECT t.user_id,u.username,UNIX_TIMESTAMP(t.expires_at) exp FROM oauth_tokens t JOIN oauth_users u ON u.id=t.user_id WHERE t.token_hash=SHA2(?,256) AND t.token_type='access' AND t.revoked_at IS NULL AND t.expires_at>NOW()", [token]);
    const row = rows[0];
    if (!row) return res.status(401).json({error: 'invalid_token'});
    let groups = [];
    try {
      const [groupRows] = await db.execute('SELECT group_name FROM oauth_user_groups WHERE user_id=? ORDER BY group_name', [row.user_id]);
      groups = groupRows.map(group => group.group_name);
    } catch {}
    res.json({sub: row.user_id, preferred_username: row.username, name: row.username, email: null, email_verified: false, groups});
  });

  app.get('/oauth/introspect', (_, res) => res.status(405).json({error: 'use POST'}));
}
