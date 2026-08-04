import {randomToken,digest,pkce,validRedirect} from './crypto.mjs';
import {snowflake} from './snowflake.mjs';
import {loadSigningKey, signJwt} from './oidc-keys.mjs';

const fail=(error,description)=>({error,error_description:description});
const splitScopes=value=>[...new Set(String(value??'').trim().split(/\s+/).filter(Boolean))];
const resourceUri=value=>{try { const u=new URL(String(value)); return u.protocol==='https:'&&!u.hash&&!u.search ? u.href : null; } catch { return null; }};
const configuredResources=()=>{try { const x=JSON.parse(process.env.OAUTH_PROTECTED_RESOURCES||'[\"https://funnel.purinton.us/mcp\"]'); return Array.isArray(x)?x.filter(Boolean):[]; } catch { return []; }};
const configuredScopes=()=>splitScopes(process.env.OAUTH_SCOPES||'funnel:read funnel:write');
const registrationScopes=()=>splitScopes(process.env.OAUTH_DCR_SCOPES||configuredScopes().join(' '));
const registrationResources=()=>{try { const x=JSON.parse(process.env.OAUTH_DCR_RESOURCES||JSON.stringify(configuredResources())); return Array.isArray(x)?x.filter(Boolean):[]; } catch { return configuredResources(); }};
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
    const requested=splitScopes(scope); const known=splitScopes(process.env.OAUTH_SCOPES||'openid profile email groups funnel:read funnel:write');
    if (requested.some(x=>!known.includes(x))) return false;
    const allowed=allowedValues(c?.allowed_scopes);
    return !allowed.length || requested.every(x=>allowed.includes(x));
  }
  function registrationRedirect(uri) {
    if (typeof uri !== 'string' || uri.length > 2048) return false;
    try { const u = new URL(uri); return u.protocol === 'https:' || ['http://127.0.0.1/', 'http://127.0.0.1:33418', 'http://localhost:33418', 'http://127.0.0.1:33418/', 'http://localhost:33418/', 'https://vscode.dev/redirect', 'https://insiders.vscode.dev/redirect'].includes(uri); }
    catch { return false; }
  }
  async function register(body) {
    if (!body || typeof body !== 'object') return fail('invalid_client_metadata', 'JSON object required');
    const name = String(body.client_name || '').trim();
    const uris = body.redirect_uris;
    const invalidRedirects=Array.isArray(uris)?uris.filter(uri=>!registrationRedirect(uri)):[];
    if (!name || name.length > 191 || !Array.isArray(uris) || !uris.length || uris.length > 10 || invalidRedirects.length) { console.warn('oauth registration rejected redirects', {nameLength:name.length, redirectUris:Array.isArray(uris)?uris:null, invalidRedirects}); return fail('invalid_redirect_uri', 'Invalid redirect URI'); }
    const auth = body.token_endpoint_auth_method || 'none';
    const grants = body.grant_types || ['authorization_code'];
    const responses = body.response_types || ['code'];
    const supportedGrants = JSON.stringify(grants) === '["authorization_code"]' || JSON.stringify(grants) === '["authorization_code","refresh_token"]';
    if (auth !== 'none' || !supportedGrants || JSON.stringify(responses) !== '["code"]') return fail('invalid_client_metadata', 'Only public authorization-code clients with optional refresh tokens are supported');
    if (body.code_challenge_methods_supported && (!Array.isArray(body.code_challenge_methods_supported) || body.code_challenge_methods_supported.some(x => x !== 'S256'))) return fail('invalid_client_metadata', 'Only S256 PKCE is supported');
    const requested = splitScopes(body.scope || 'funnel:read');
    if (!requested.length || requested.some(x => !['funnel:read', 'funnel:write'].includes(x))) return fail('invalid_scope', 'Invalid registration scope');
    const resource = body.resource || body.resource_uri || 'https://funnel.purinton.us/mcp';
    if (resource !== 'https://funnel.purinton.us/mcp') return fail('invalid_target', 'Invalid resource');
    const clientId = `dcr_${randomToken(18)}`;
    const issued = new Date();
    await db.execute('INSERT INTO oauth_clients(id,client_id,name,redirect_uris,public_client,allowed_scopes,allowed_resources) VALUES(?,?,?,?,TRUE,?,?)', [snowflake(), clientId, name, JSON.stringify(uris), JSON.stringify(requested), JSON.stringify([resource])]);
    await db.execute('INSERT INTO oauth_client_registrations(client_id,metadata,created_at) VALUES(?,?,?)', [clientId, JSON.stringify(body), issued]);
    return {client_id: clientId, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: grants, response_types: ['code'], code_challenge_methods_supported: ['S256'], scope: requested.join(' '), client_id_issued_at: Math.floor(issued.getTime()/1000)};
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
    await db.execute('INSERT INTO oauth_codes (id,code_hash,client_id,user_id,redirect_uri,scope,resource,code_challenge,code_challenge_method,nonce,expires_at) VALUES (?,?,?,?,?,?,?,?,?, ?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))',[snowflake(),digest(code),q.client_id,userId,q.redirect_uri,scope,resource,q.code_challenge,q.code_challenge_method,q.nonce||null]);
    return `${q.redirect_uri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.state||'')}`;
  }
  async function token(body) {
    if(body.grant_type==='authorization_code') {
      const [r]=await db.execute('SELECT * FROM oauth_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>NOW()',[digest(body.code||'')]); const row=r[0]; const c=await client(body.client_id);
      if(!row||!c||row.client_id!==body.client_id||row.redirect_uri!==body.redirect_uri||!body.code_verifier||pkce(body.code_verifier)!==row.code_challenge) return fail('invalid_grant','Invalid authorization code or PKCE verifier');
      if(row.resource && body.resource!==row.resource) return fail('invalid_grant','Invalid resource');
      if(row.resource && !resourceAllowed(c,row.resource)) return fail('invalid_grant','Invalid resource');
      await db.execute('UPDATE oauth_codes SET used_at=NOW() WHERE id=? AND used_at IS NULL',[row.id]); return issue(row.client_id,row.user_id,row.scope,row.family_id,row.resource,row.nonce);
    }
    if(body.grant_type==='refresh_token') {
      const [r]=await db.execute("SELECT * FROM oauth_tokens WHERE token_hash=? AND token_type='refresh' AND revoked_at IS NULL AND expires_at>NOW()",[digest(body.refresh_token||'')]); const row=r[0];
      if(!row||row.client_id!==body.client_id||body.resource && body.resource!==row.resource) return fail('invalid_grant','Invalid refresh token or resource');
      await db.execute('UPDATE oauth_tokens SET revoked_at=NOW() WHERE family_id=? AND revoked_at IS NULL',[row.family_id]); return issue(row.client_id,row.user_id,row.scope,row.family_id,row.resource,row.nonce);
    }
    return fail('unsupported_grant_type','Only authorization_code and refresh_token are supported');
  }
  async function issue(clientId,userId,scope,familyId=snowflake(),resource=null,nonce=null) {
    const access=randomToken(), refresh=randomToken(), now=new Date();
    await db.execute('INSERT INTO oauth_tokens (id,token_hash,token_type,client_id,user_id,scope,resource,expires_at,revoked_at,family_id,created_at) VALUES (?, ?, "access", ?, ?, ?, ?, ?, NULL, ?, ?)',[snowflake(),digest(access),clientId,userId,scope,resource,new Date(Date.now()+3600000),familyId,now]);
    await db.execute('INSERT INTO oauth_tokens (id,token_hash,token_type,client_id,user_id,scope,resource,expires_at,revoked_at,family_id,created_at) VALUES (?, ?, "refresh", ?, ?, ?, ?, ?, NULL, ?, ?)',[snowflake(),digest(refresh),clientId,userId,scope,resource,new Date(Date.now()+2592000000),familyId,now]);
    const result={access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope,...(resource?{resource}: {})};
    if (splitScopes(scope).includes('openid')) {
      const key=await loadSigningKey(); const now=Math.floor(Date.now()/1000);
      const [users]=await db.execute('SELECT username,email,display_name,email_verified FROM oauth_users WHERE id=?',[userId]);
      const user=users[0]||{}; let groups=[];
      try { const [rows]=await db.execute('SELECT group_name FROM oauth_user_groups WHERE user_id=? ORDER BY group_name',[userId]); groups=rows.map(x=>x.group_name); } catch {}
      const claims={iss:process.env.OAUTH_ISSUER||'https://auth.purinton.us',sub:userId,aud:clientId,iat:now,exp:now+900,auth_time:now,preferred_username:user.username||userId,name:user.display_name||user.username||userId,scope};
      if (user.email) { claims.email=user.email; claims.email_verified=Boolean(user.email_verified); }
      if (groups.length) claims.groups=groups;
      if (nonce) claims.nonce=nonce;
      result.id_token=signJwt(claims,key);
    }
    return result;
  }
  return {authorize,token,register,resourceUri};
}
