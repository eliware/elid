import {randomToken,digest,pkce,validRedirect} from './crypto.mjs';
import {snowflake} from './snowflake.mjs';

const fail=(error,description)=>({error,error_description:description});
const splitScopes=value=>[...new Set(String(value??'').trim().split(/\s+/).filter(Boolean))];
const resourceUri=value=>{try { const u=new URL(String(value)); return u.protocol==='https:'&&!u.hash&&!u.search ? u.href : null; } catch { return null; }};
const configuredResources=()=>{try { const x=JSON.parse(process.env.OAUTH_PROTECTED_RESOURCES||'[]'); return Array.isArray(x)?x.filter(Boolean):[]; } catch { return []; }};
const allowedValues=value=>{try { const x=typeof value==='string'?JSON.parse(value):value; return Array.isArray(x)?x:[]; } catch { return splitScopes(value); }};

export function createOAuth(db) {
  async function client(id) { const [r]=await db.execute('SELECT * FROM oauth_clients WHERE client_id=?',[id]); return r[0]; }
  function resourceAllowed(c, resource) {
    const value=resourceUri(resource); if (!value) return false;
    const configured=configuredResources();
    const allowed=allowedValues(c?.allowed_resources);
    return (allowed.length ? allowed : configured).includes(value);
  }
  function scopesAllowed(c, scope) {
    const requested=splitScopes(scope); const known=splitScopes(process.env.OAUTH_SCOPES||'funnel:read funnel:write');
    if (requested.some(x=>!known.includes(x))) return false;
    const allowed=allowedValues(c?.allowed_scopes);
    return !allowed.length || requested.every(x=>allowed.includes(x));
  }
  async function authorize(q, userId) {
    const c=await client(q.client_id);
    if(!c||q.response_type!=='code'||!q.redirect_uri||!validRedirect(allowedValues(c.redirect_uris),q.redirect_uri)) throw fail('invalid_request','Invalid client or redirect URI');
    if(!q.code_challenge||q.code_challenge_method!=='S256') throw fail('invalid_request','S256 PKCE is required');
    const resource=q.resource ? resourceUri(q.resource) : null;
    if(allowedValues(c.allowed_resources).length && !resource) throw fail('invalid_target','Resource is required');
    if(q.resource && !resourceAllowed(c,resource)) throw fail('invalid_target','Invalid resource');
    if(resource && !resourceAllowed(c,resource)) throw fail('invalid_target','Invalid resource');
    if(!scopesAllowed(c,q.scope)) throw fail('invalid_scope','Unknown or unauthorized scope');
    const scope=splitScopes(q.scope).join(' '), code=randomToken(32);
    await db.execute('INSERT INTO oauth_codes (id,code_hash,client_id,user_id,redirect_uri,scope,resource,code_challenge,code_challenge_method,expires_at) VALUES (?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))',[snowflake(),digest(code),q.client_id,userId,q.redirect_uri,scope,resource,q.code_challenge,q.code_challenge_method]);
    return `${q.redirect_uri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.state||'')}`;
  }
  async function token(body) {
    if(body.grant_type==='authorization_code') {
      const [r]=await db.execute('SELECT * FROM oauth_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>NOW()',[digest(body.code||'')]); const row=r[0]; const c=await client(body.client_id);
      if(!row||!c||row.client_id!==body.client_id||row.redirect_uri!==body.redirect_uri||!body.code_verifier||pkce(body.code_verifier)!==row.code_challenge) return fail('invalid_grant','Invalid authorization code or PKCE verifier');
      if(row.resource && body.resource!==row.resource) return fail('invalid_grant','Invalid resource');
      if(row.resource && !resourceAllowed(c,row.resource)) return fail('invalid_grant','Invalid resource');
      await db.execute('UPDATE oauth_codes SET used_at=NOW() WHERE id=? AND used_at IS NULL',[row.id]); return issue(row.client_id,row.user_id,row.scope,row.family_id,row.resource);
    }
    if(body.grant_type==='refresh_token') {
      const [r]=await db.execute("SELECT * FROM oauth_tokens WHERE token_hash=? AND token_type='refresh' AND revoked_at IS NULL AND expires_at>NOW()",[digest(body.refresh_token||'')]); const row=r[0];
      if(!row||row.client_id!==body.client_id||body.resource && body.resource!==row.resource) return fail('invalid_grant','Invalid refresh token or resource');
      await db.execute('UPDATE oauth_tokens SET revoked_at=NOW() WHERE family_id=? AND revoked_at IS NULL',[row.family_id]); return issue(row.client_id,row.user_id,row.scope,row.family_id,row.resource);
    }
    return fail('unsupported_grant_type','Only authorization_code and refresh_token are supported');
  }
  async function issue(clientId,userId,scope,familyId=snowflake(),resource=null) {
    const access=randomToken(), refresh=randomToken(), now=new Date();
    await db.execute('INSERT INTO oauth_tokens (id,token_hash,token_type,client_id,user_id,scope,resource,expires_at,revoked_at,family_id,created_at) VALUES (?, ?, "access", ?, ?, ?, ?, ?, NULL, ?, ?)',[snowflake(),digest(access),clientId,userId,scope,resource,new Date(Date.now()+3600000),familyId,now]);
    await db.execute('INSERT INTO oauth_tokens (id,token_hash,token_type,client_id,user_id,scope,resource,expires_at,revoked_at,family_id,created_at) VALUES (?, ?, "refresh", ?, ?, ?, ?, ?, NULL, ?, ?)',[snowflake(),digest(refresh),clientId,userId,scope,resource,new Date(Date.now()+2592000000),familyId,now]);
    return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope,...(resource?{resource}: {})};
  }
  return {authorize,token,resourceUri};
}
