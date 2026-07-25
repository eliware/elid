import {randomToken,digest,pkce,validRedirect} from './crypto.mjs';
import {snowflake} from './snowflake.mjs';
const fail=(error,description)=>({error,error_description:description});
export function createOAuth(db) {
  async function client(id) { const [r]=await db.execute('SELECT * FROM oauth_clients WHERE client_id=?',[id]); return r[0]; }
  async function authorize(q, userId) {
    const c=await client(q.client_id); if(!c||q.response_type!=='code'||!q.redirect_uri||!validRedirect(typeof c.redirect_uris==='string'?JSON.parse(c.redirect_uris):c.redirect_uris,q.redirect_uri)) throw fail('invalid_request','Invalid client or redirect URI');
    if(!q.code_challenge||q.code_challenge_method!=='S256') throw fail('invalid_request','S256 PKCE is required');
    const code=randomToken(32); await db.execute('INSERT INTO oauth_codes (id,code_hash,client_id,user_id,redirect_uri,scope,code_challenge,code_challenge_method,expires_at) VALUES (?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))',[snowflake(),digest(code),q.client_id,userId,q.redirect_uri,q.scope||'',q.code_challenge,q.code_challenge_method]); return `${q.redirect_uri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.state||'')}`;
  }
  async function token(body) {
    if(body.grant_type==='authorization_code') { const [r]=await db.execute('SELECT * FROM oauth_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>NOW()',[digest(body.code)]); const row=r[0]; const c=await client(body.client_id); if(!row||!c||row.client_id!==body.client_id||row.redirect_uri!==body.redirect_uri||!body.code_verifier||pkce(body.code_verifier)!==row.code_challenge) return fail('invalid_grant','Invalid authorization code or PKCE verifier'); /* verifier check below */
      const expected=Buffer.from(await import('node:crypto').then(x=>x.createHash('sha256').update(body.code_verifier).digest('base64url'))); if(expected.toString()!==row.code_challenge) return fail('invalid_grant','PKCE verification failed');
      await db.execute('UPDATE oauth_codes SET used_at=NOW() WHERE id=? AND used_at IS NULL',[row.id]); return issue(row.client_id,row.user_id,row.scope);
    }
    if(body.grant_type==='refresh_token') { const [r]=await db.execute("SELECT * FROM oauth_tokens WHERE token_hash=? AND token_type='refresh' AND revoked_at IS NULL AND expires_at>NOW()",[digest(body.refresh_token)]); if(!r[0]||r[0].client_id!==body.client_id) return fail('invalid_grant','Invalid refresh token'); await db.execute('UPDATE oauth_tokens SET revoked_at=NOW() WHERE id=?',[r[0].id]); return issue(r[0].client_id,r[0].user_id,r[0].scope,r[0].family_id); }
    return fail('unsupported_grant_type','Only authorization_code and refresh_token are supported');
  }
  async function issue(clientId,userId,scope,familyId=snowflake()) { const access=randomToken(), refresh=randomToken(); await db.execute('INSERT INTO oauth_tokens VALUES (?,?,"access",?,?,?,?,NULL,?,NOW())',[snowflake(),digest(access),clientId,userId,scope,new Date(Date.now()+3600000),familyId]); await db.execute('INSERT INTO oauth_tokens VALUES (?,?,"refresh",?,?,?,?,NULL,?,NOW())',[snowflake(),digest(refresh),clientId,userId,scope,new Date(Date.now()+2592000000),familyId]); return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope}; }
  return {authorize,token};
}
