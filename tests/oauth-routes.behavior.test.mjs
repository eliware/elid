import {jest} from '@jest/globals';
import bcrypt from 'bcryptjs';
import {mountOAuthRoutes, esc, loginPage} from '../src/oauth-routes.mjs';

const response=()=>({statusCode:200,headers:{},body:null,redirectTo:null,status(n){this.statusCode=n;return this},send(v){this.body=v;return this},json(v){this.body=v;return this},redirect(v){this.redirectTo=v;return this},type(){return this}});
const encoded=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const setup=()=>{const routes={};const app={get:(p,...h)=>routes[`GET ${p}`]=h.at(-1),post:(p,...h)=>routes[`POST ${p}`]=h.at(-1)};const db={execute:jest.fn()};const oauth={authorize:jest.fn().mockResolvedValue('/done'),token:jest.fn().mockResolvedValue({access_token:'x'}),register:jest.fn().mockResolvedValue({client_id:'c'})};const rateLimit=jest.fn(()=> (req,res,next)=>next());mountOAuthRoutes(app,{db,oauth,rateLimit});return {routes,db,oauth,rateLimit};};
const req=(body={},query={},headers={})=>({body,query,headers,get:jest.fn().mockReturnValue('example.test')});

beforeEach(()=>{jest.spyOn(console,'error').mockImplementation(()=>{});jest.spyOn(console,'info').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());

test('helpers cover defaults and escaping',()=>{expect(esc(null)).toBe('');expect(esc(undefined)).toBe('');expect(loginPage('x')).toContain('Scopes: <b>none</b>');expect(loginPage('x',{scope:'s',resource:'r'})).toContain('Resource: <b>r</b>');});

test('authorize GET validates each required parameter and escapes/render data',async()=>{const {routes}=setup();
  for (const query of [{redirect_uri:'u',code_challenge:'c'},{client_id:'x',code_challenge:'c'},{client_id:'x',redirect_uri:'u'}]) {const r=response();await routes['GET /oauth/authorize'](req({},query),r);expect(r.statusCode).toBe(400);}
  const r=response();await routes['GET /oauth/authorize'](req({}, {client_id:'<x>"\'&',redirect_uri:'u',code_challenge:'c',scope:'a&b',resource:'r'}),r);expect(r.body).toContain('&lt;x&gt;');expect(r.body).not.toContain('DATA');expect(r.body).toContain('a&amp;b');
});

test('authorize POST handles invalid credentials, success, and errors',async()=>{const {routes,db,oauth}=setup();
  db.execute.mockResolvedValueOnce([[]]);let r=response();await routes['POST /oauth/authorize'](req({data:encoded({}),username:'x',password:'x'}),r);expect(r.statusCode).toBe(401);
  db.execute.mockResolvedValueOnce([[{id:'u',password_hash:await bcrypt.hash('p',4)}]]);r=response();await routes['POST /oauth/authorize'](req({data:encoded({client_id:'c'}),username:'x',password:'bad'}),r);expect(r.statusCode).toBe(401);
  db.execute.mockResolvedValueOnce([[{id:'u',password_hash:await bcrypt.hash('p',4)}]]);r=response();await routes['POST /oauth/authorize'](req({data:encoded({client_id:'c'}),username:'x',password:'p'}),r);expect(oauth.authorize).toHaveBeenCalledWith({client_id:'c'},'u');expect(r.redirectTo).toBe('/done');
  r=response();await routes['POST /oauth/authorize'](req({data:'bad',username:'x',password:'p'}),r);expect(r.statusCode).toBe(400);expect(r.body).toEqual({error:'server_error'});
  db.execute.mockRejectedValueOnce(new Error('db'));r=response();await routes['POST /oauth/authorize'](req({data:encoded({}),username:'x',password:'p'}),r);expect(r.statusCode).toBe(400);
  oauth.authorize.mockRejectedValueOnce(new Error('oauth'));db.execute.mockResolvedValueOnce([[{id:'u',password_hash:await bcrypt.hash('p',4)}]]);r=response();await routes['POST /oauth/authorize'](req({data:encoded({}),username:'x',password:'p'}),r);expect(r.statusCode).toBe(400);
});

test('registration supports defaults, errors, and exceptions',async()=>{const {routes,oauth}=setup();let r=response();await routes['POST /oauth/register'](req({client_name:'x',redirect_uris:[]}),r);expect(r.statusCode).toBe(201);expect(oauth.register).toHaveBeenCalled();
  oauth.register.mockResolvedValueOnce({error:'invalid_client'});r=response();await routes['POST /oauth/register'](req(null),r);expect(r.statusCode).toBe(400);
  oauth.register.mockRejectedValueOnce(new Error('bad'));r=response();await routes['POST /oauth/register'](req({}),r);expect(r.statusCode).toBe(500);expect(r.body).toEqual({error:'server_error'});
  oauth.register.mockRejectedValueOnce(new Error('bad2'));const r2=response();const badReq={body:{},headers:{},get:undefined};await routes['POST /oauth/register'](badReq,r2);expect(r2.statusCode).toBe(500);
});

test('token supports success, OAuth error, and exception',async()=>{const {routes,oauth}=setup();let r=response();await routes['POST /oauth/token'](req({grant_type:'authorization_code'}),r);expect(r.statusCode).toBe(200);
  oauth.token.mockResolvedValueOnce({error:'invalid_grant'});r=response();await routes['POST /oauth/token'](req({}),r);expect(r.statusCode).toBe(400);
  oauth.token.mockRejectedValueOnce(new Error('bad'));r=response();await routes['POST /oauth/token'](req({}),r);expect(r.statusCode).toBe(500);
});

test('introspection requires confidential client authentication',async()=>{const {routes,db}=setup();let r=response();await routes['POST /oauth/introspect'](req({}),r);expect(r.body).toEqual({active:false});
  r=response();await routes['POST /oauth/introspect'](req({token:'t'}),r);expect(r.statusCode).toBe(401);
  db.execute.mockResolvedValueOnce([[{client_secret_hash:'9a1c2a7b8e5d3f1c9c1d1e7c5a6b8f9d4e2a1b7c6d5e4f3a2b1c0d9e8f7a6b5c'}]]).mockResolvedValueOnce([[]]);r=response();await routes['POST /oauth/introspect'](req({token:'t'},{},{authorization:'Basic Yzpz'}),r);expect(r.statusCode).toBe(401);
  r=response();await routes['GET /oauth/introspect']({},r);expect(r.statusCode).toBe(405);
});

test('userinfo authenticates and returns groups, including group query failure',async()=>{const {routes,db}=setup();let r=response();await routes['GET /userinfo'](req({}, {}, {}),r);expect(r.statusCode).toBe(401);
  r=response();await routes['GET /userinfo'](req({}, {}, {authorization:'Basic x'}),r);expect(r.statusCode).toBe(401);
  db.execute.mockResolvedValueOnce([[]]);r=response();await routes['GET /userinfo'](req({}, {}, {authorization:'Bearer bad'}),r);expect(r.statusCode).toBe(401);
  db.execute.mockResolvedValueOnce([[{user_id:'u',username:'alice'}]]).mockResolvedValueOnce([[{group_name:'a'},{group_name:'b'}]]);r=response();await routes['GET /userinfo'](req({}, {}, {authorization:'Bearer tok'}),r);expect(r.body).toMatchObject({sub:'u',preferred_username:'alice',groups:['a','b']});
  db.execute.mockResolvedValueOnce([[{user_id:'u',username:'alice'}]]).mockRejectedValueOnce(new Error('groups'));r=response();await routes['GET /userinfo'](req({}, {}, {authorization:'Bearer tok'}),r);expect(r.body.groups).toEqual([]);
});
