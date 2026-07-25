import bcrypt from 'bcryptjs';

const loginPage = client => `<!doctype html><meta name=viewport content="width=device-width"><title>Sign in - Elid</title><style>:root{color-scheme:dark}body{font:15px system-ui;min-height:100vh;display:grid;place-items:center;margin:0;background:radial-gradient(circle at top,#24334b,#111 60%);color:#eee}.card{width:min(420px,calc(100% - 2rem));box-sizing:border-box;background:#1d1d1dcc;border:1px solid #4b5563;border-radius:14px;padding:2rem}input,button{box-sizing:border-box;width:100%;padding:.75rem;margin:.4rem 0;background:#111;color:#fff;border:1px solid #667085;border-radius:6px}button{background:#4f8cff}</style><main class=card><b>ELID OAUTH</b><h1>Sign in to continue</h1><p>${client} is requesting access.</p><form id=f method=post><input type=hidden name=data value="DATA"><input name=username autocomplete=username required><input name=password type=password autocomplete=current-password required><button>Authorize application</button><p id=e hidden>Invalid username or password.</p></form></main><script>f.onsubmit=async e=>{e.preventDefault();let r=await fetch(location,{method:'POST',body:new URLSearchParams(new FormData(f))});if(r.status===401)e.hidden=false;else document.write(await r.text())}</script>`;

export function mountOAuthRoutes(app, {db, oauth, rateLimit}) {
  app.get('/oauth/authorize', (req, res) => {
    if (!req.query.client_id || !req.query.redirect_uri || !req.query.code_challenge) return res.status(400).send('Missing OAuth parameters');
    const data = Buffer.from(JSON.stringify(req.query)).toString('base64url');
    res.type('html').send(loginPage(req.query.client_id).replace('DATA', data));
  });
  app.post('/oauth/authorize', rateLimit({db, windowMs: 60000, max: 20}), async (req, res) => {
    try {
      const q = JSON.parse(Buffer.from(req.body.data, 'base64url'));
      const [rows] = await db.execute('SELECT * FROM oauth_users WHERE username=?', [req.body.username]);
      if (!rows[0] || !(await bcrypt.compare(req.body.password, rows[0].password_hash))) return res.status(401).send('Invalid credentials');
      res.redirect(await oauth.authorize(q, rows[0].id));
    } catch (error) { console.error('oauth authorize error', error); res.status(400).json({error: 'server_error'}); }
  });
  app.post('/oauth/token', rateLimit({db, windowMs: 60000, max: 30}), async (req, res) => {
    try { const result = await oauth.token(req.body); res.status(result.error ? 400 : 200).json(result); }
    catch (error) { console.error('oauth token error', error); res.status(500).json({error: 'server_error'}); }
  });
  app.post('/oauth/introspect', rateLimit({db, windowMs: 60000, max: 60}), async (req, res) => {
    const [rows] = await db.execute("SELECT client_id,user_id,scope,expires_at FROM oauth_tokens WHERE token_hash=SHA2(?,256) AND token_type='access' AND revoked_at IS NULL AND expires_at>NOW()", [req.body.token]);
    res.json(rows[0] ? {active: true, ...rows[0]} : {active: false});
  });
  app.get('/oauth/introspect', (_, res) => res.status(405).json({error: 'use POST'}));
}
