import {randomToken, pkce} from './crypto.mjs';

export function mountTestRoutes(app, {db, oauth, clientId='elid-test-app', publicHost}) {
  app.get('/test/login', async (req, res) => {
    const state = randomToken(24);
    const verifier = randomToken(48);
    const host = publicHost || req.headers.host;
    const redirectUri = `http://${host}/test/callback`;
    await db.execute(
      'INSERT INTO oauth_pkce_flows(state_hash,verifier,redirect_uri,expires_at) VALUES(SHA2(?,256),?,?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))',
      [state, verifier, redirectUri],
    );
    const params = new URLSearchParams({client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
      scope: 'openid profile email', code_challenge: pkce(verifier), code_challenge_method: 'S256', state});
    res.redirect(`/oauth/authorize?${params}`);
  });

  app.get('/test/logout', (_, res) => res.send('<main><h1>Logged out</h1><a href="/test/login">Sign in again</a></main>'));
  app.get('/test/callback', async (req, res) => {
    const [flows] = await db.execute('SELECT verifier,redirect_uri FROM oauth_pkce_flows WHERE state_hash=SHA2(?,256) AND expires_at>NOW()', [req.query.state]);
    const flow = flows[0];
    await db.execute('DELETE FROM oauth_pkce_flows WHERE state_hash=SHA2(?,256)', [req.query.state]);
    if (!flow || !req.query.code) return res.status(400).send('Invalid or expired test login callback');
    const result = await oauth.token({grant_type: 'authorization_code', code: req.query.code, client_id: clientId,
      redirect_uri: flow.redirect_uri, code_verifier: flow.verifier});
    if (result.error) return res.status(400).json(result);
    const [users] = await db.execute("SELECT user_id FROM oauth_tokens WHERE token_hash=SHA2(?,256) AND token_type='access'", [result.access_token]);
    res.send(`<main><h1>Login successful</h1><p>User ID: <code>${users[0]?.user_id || 'unknown'}</code></p><a href="/test/logout">Log out</a></main>`);
  });
}
