import {jest} from '@jest/globals';

jest.unstable_mockModule('bcryptjs', () => ({default:{compare:jest.fn(async (value, hash) => value === hash),hash:jest.fn(async ()=>'new-hash')}}));
jest.unstable_mockModule('../src/crypto.mjs', () => ({randomToken:jest.fn(()=>'tok en')}));
jest.unstable_mockModule('../src/rate-limit.mjs', () => ({envNumber:jest.fn((_, fallback)=>fallback),rateLimit:jest.fn(()=> (req,res,next)=>next())}));
const {mountAccount} = await import('../src/account.mjs');

const response = () => ({send:jest.fn(), redirect:jest.fn(), setHeader:jest.fn(), status:jest.fn().mockReturnThis()});
const setup = (results=[]) => {
  const routes = {};
  const app = {get:jest.fn((p,...h)=>{routes[`GET ${p}`]=h}), post:jest.fn((p,...h)=>{routes[`POST ${p}`]=h})};
  let i=0; const db={execute:jest.fn(async()=>results[i++] ?? [[]])};
  mountAccount(app,db); return {routes,db};
};
const run = async (handlers, q, r) => { let i=0; const next=()=>handlers[++i]?.(q,r,next); await handlers[0](q,r,next); };
const req = (body={}, extra={}) => ({body,headers:{},secure:false,params:{},...extra});

test('login page renders', async()=>{const {routes}=setup(); const r=response(); await run(routes['GET /account/login'],{},r); expect(r.send.mock.calls[0][0]).toContain('Sign in to Elid')});
test('login rejects unknown/bad password and succeeds', async()=>{
  const {routes,db}=setup([[[{id:'u',username:'joe',password_hash:'pw'}]],[[{id:'u',username:'joe',password_hash:'pw'}]],[[{id:'u',username:'joe',password_hash:'pw'}]],[[]]]);
  let r=response(); await run(routes['POST /account/login'],req({username:'x',password:'p'}),r); expect(r.status).toHaveBeenCalledWith(401);
  r=response(); await run(routes['POST /account/login'],req({username:'joe',password:'bad'}),r); expect(r.status).toHaveBeenCalledWith(401);
  r=response(); await run(routes['POST /account/login'],req({username:'joe',password:'pw'},{secure:true}),r); expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO oauth_sessions'),expect.any(Array)); expect(r.redirect).toHaveBeenCalledWith('/account'); expect(r.setHeader.mock.calls[0][1]).toContain('Secure');
});
test('logout clears cookie',async()=>{const {routes,db}=setup();const r=response();await run(routes['POST /account/logout'],req({}, {headers:{cookie:'elid_account=abc%20x; other=y'},secure:true}),r);expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE'),['abc x']);expect(r.redirect).toHaveBeenCalledWith('/account/login');expect(r.setHeader.mock.calls[0][1]).toContain('Max-Age=0')});
test('auth redirects without session',async()=>{const {routes}=setup([[[]]]);const r=response();await run(routes['GET /account'],req(),r);expect(r.redirect).toHaveBeenCalledWith('/account/login')});
test('account page empty and populated, escaping fields',async()=>{let x=setup([[ [{id:'u',username:'<joe>'}] ],[[]]]);let r=response();await run(x.routes['GET /account'],req({}, {headers:{cookie:'elid_account=s'}}),r);expect(r.send.mock.calls[0][0]).toContain('No authorized applications');
 x=setup([[ [{id:'u',username:'<joe>'}] ],[[{client_id:'a&b',name:null,last_used:'now',token_count:2},{client_id:'x',name:'<App>',last_used:null,token_count:1}]]]);r=response();await run(x.routes['GET /account'],req({}, {headers:{cookie:'elid_account=s'}}),r);const html=r.send.mock.calls[0][0];expect(html).toContain('&lt;joe&gt;');expect(html).toContain('a&amp;b');expect(html).toContain('&lt;App&gt;');});
test('password validation, bad current, and success',async()=>{let x=setup([[ [{id:'u'}] ]]);let r=response();await run(x.routes['POST /account/password'],req({new_password:'short',confirm_password:'short'},{headers:{cookie:'elid_account=s'}}),r);expect(r.status).toHaveBeenCalledWith(400);
 x=setup([[ [{id:'u'}] ],[ [{password_hash:'old'}] ]]);r=response();await run(x.routes['POST /account/password'],req({current_password:'bad',new_password:'long enough password',confirm_password:'different'},{headers:{cookie:'elid_account=s'}}),r);expect(r.status).toHaveBeenCalledWith(400);
 r=response();await run(x.routes['POST /account/password'],req({current_password:'bad',new_password:'long enough password',confirm_password:'long enough password'},{headers:{cookie:'elid_account=s'}}),r);expect(r.status).toHaveBeenCalledWith(401);
 x=setup();x.db.execute=jest.fn(async sql=>sql.startsWith('SELECT password_hash')?[[{password_hash:'old'}]]:[[]]);r=response();await x.routes['POST /account/password'][1](req({current_password:'old',new_password:'long enough password',confirm_password:'long enough password'},{user:{id:'u'}}),r);expect(r.send.mock.calls[0][0]).toContain('Password changed');});
test('password handles missing user row',async()=>{const x=setup([[ [{id:'u'}] ],[[]]]);const r=response();await run(x.routes['POST /account/password'],req({current_password:'x',new_password:'long enough password',confirm_password:'long enough password'},{headers:{cookie:'elid_account=s'}}),r);expect(r.status).toHaveBeenCalledWith(401)});
test('revoke app',async()=>{const x=setup([[ [{id:'u'}] ],[[]]]);const r=response();await run(x.routes['POST /account/apps/:clientId/revoke'],req({}, {headers:{cookie:'elid_account=s'},params:{clientId:'c'}}),r);expect(x.db.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE oauth_tokens'),['u','c']);expect(r.redirect).toHaveBeenCalledWith('/account')});
test('remaining false branches',async()=>{
 let x=setup([[[{id:'u',username:undefined}]], [[]]]);let r=response();await run(x.routes['GET /account'],req({}, {headers:{cookie:'elid_account=s'}}),r);
 x=setup([[[{id:'u',username:'j',password_hash:'pw'}]],[[{id:'u',username:'j',password_hash:'pw'}]],[[{id:'u',username:'j',password_hash:'pw'}]],[[]]]);r=response();await run(x.routes['POST /account/login'],req({username:'j',password:'pw'}),r);
 x=setup([[ [{id:'u'}] ]]);r=response();await run(x.routes['POST /account/password'],req({},{headers:{cookie:'elid_account=s'}}),r);expect(r.status).toHaveBeenCalledWith(400);
 x=setup();r=response();await run(x.routes['POST /account/logout'],req({}, {headers:{cookie:'elid_account=s'}}),r);
});
