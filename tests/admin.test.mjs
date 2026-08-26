import {jest} from '@jest/globals';
jest.unstable_mockModule('../src/crypto.mjs',()=>({randomToken:jest.fn(()=> 'tok')}));
jest.unstable_mockModule('../src/snowflake.mjs',()=>({snowflake:jest.fn(()=> 'sf')}));
jest.unstable_mockModule('../src/rate-limit.mjs',()=>({envNumber:jest.fn((k,d)=>d),rateLimit:jest.fn(()=> (q,r,n)=>n())}));
jest.unstable_mockModule('bcryptjs',()=>({default:{compare:jest.fn(),hash:jest.fn(async p=>`hash:${p}`)}}));
const {mountAdmin}=await import('../src/admin.mjs');
const bcrypt=(await import('bcryptjs')).default;

const req=(body={},headers={},params={},secure=false)=>({body,headers,params,secure});
const res=()=>({status:jest.fn(function(){return this}),send:jest.fn(function(){return this}),redirect:jest.fn(),setHeader:jest.fn()});
function setup(){const routes={get:{},post:{}};const app={get:(p,...f)=>routes.get[p]=f,post:(p,...f)=>routes.post[p]=f};const db={execute:jest.fn(async()=>[[]]),query:jest.fn(async()=>[[]])};mountAdmin(app,db);return {routes,db};}
const run=async(f,q,r,next=jest.fn())=>await f(q,r,next);
const authReq={headers:{cookie:'elid_admin=abc'},body:{},params:{}};

test('login page and auth redirects/accepts cookies',async()=>{const {routes,db}=setup();let r=res();await run(routes.get['/admin/login'][0],req(),r);expect(r.send).toHaveBeenCalled();
 db.execute.mockResolvedValueOnce([[]]);r=res();await run(routes.get['/admin'][0],req({},{}),r);expect(r.redirect).toHaveBeenCalledWith('/admin/login');expect(db.execute).toHaveBeenCalledWith('DELETE FROM oauth_sessions WHERE id=?',[undefined]);
 db.execute.mockResolvedValueOnce([[{id:'1',expires_at:'x'}]]);r=res();const n=jest.fn();await run(routes.get['/admin'][0],authReq,r,n);expect(n).toHaveBeenCalled();});

test('login success, invalid, secure cookie',async()=>{const {routes,db}=setup();bcrypt.compare.mockResolvedValueOnce(false);db.execute.mockResolvedValueOnce([[{username:'root',password_hash:'x'}]]);let r=res();await run(routes.post['/admin/login'][1],req({username:'root',password:'y'}),r);expect(r.status).toHaveBeenCalledWith(401);
 bcrypt.compare.mockResolvedValueOnce(true);db.execute.mockImplementationOnce(async()=>[[{id:'u',username:'root',password_hash:'x'}]]).mockImplementationOnce(async()=>[[]]);r=res();await run(routes.post['/admin/login'][1],req({username:'root',password:'pw'}, {},{},true),r);expect(r.setHeader.mock.calls[0][1]).toContain('Secure');expect(r.redirect).toHaveBeenCalledWith('/admin');});

test('logout',async()=>{const {routes,db}=setup();let r=res();await run(routes.post['/admin/logout'][0],req({}, {cookie:'elid_admin=a%20b; other=x'}),r);expect(db.execute).toHaveBeenCalledWith('DELETE FROM oauth_sessions WHERE id=?',['a b']);expect(r.redirect).toHaveBeenCalledWith('/admin/login');});

test('dashboard and clients pages cover rendering',async()=>{const {routes,db}=setup();db.query
 .mockResolvedValueOnce([[{n:2}]]).mockResolvedValueOnce([[{n:3}]]).mockResolvedValueOnce([[{n:4}]]).mockResolvedValueOnce([[{n:5}]])
 .mockResolvedValueOnce([[{id:'u',username:'<root>',created_at:'now'},{id:'v',username:'x',created_at:'now'}]])
 .mockResolvedValueOnce([[{id:'c',client_id:'cid',name:'<C>',redirect_uris:'["https://x"]',public_client:1,allowed_scopes:'["a"]',allowed_resources:'["r"]'}]]);
 let r=res();await run(routes.get['/admin'][1],authReq,r);expect(r.send.mock.calls[0][0]).toContain('&lt;root&gt;');
 db.query.mockResolvedValueOnce([[{id:1,name:'N',client_id:'c',redirect_uris:['x'],public_client:false,allowed_scopes:null,allowed_resources:null}]]);r=res();await run(routes.get['/admin/clients'][1],authReq,r);expect(r.send).toHaveBeenCalled();});

test('user create/password validation and success',async()=>{const {routes,db}=setup();let r=res();await run(routes.post['/admin/users'][1],req({username:'x',password:'short'}),r);expect(r.status).toHaveBeenCalledWith(400);
 await run(routes.post['/admin/users'][1],req({username:'x',password:'long enough password'}),r=res());expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO oauth_users'),['sf','x','hash:long enough password']);
 r=res();await run(routes.post['/admin/users/:id/password'][1],req({password:'short'}, {},{id:'1'}),r);expect(r.status).toHaveBeenCalledWith(400);
 r=res();await run(routes.post['/admin/users/:id/password'][1],req({password:'long enough password'}, {},{id:'1'}),r);expect(r.redirect).toHaveBeenCalledWith('/admin');});

test('delete users root/nonroot',async()=>{const {routes,db}=setup();db.execute.mockResolvedValueOnce([[{username:'root'}]]);let r=res();await run(routes.post['/admin/users/:id/delete'][1],req({}, {},{id:'1'}),r);expect(r.status).toHaveBeenCalledWith(403);
 db.execute.mockResolvedValueOnce([[{username:'u'}]]).mockResolvedValueOnce([[]]);r=res();await run(routes.post['/admin/users/:id/delete'][1],req({}, {},{id:'2'}),r);expect(r.redirect).toHaveBeenCalledWith('/admin');});

test('client create validation/success and delete',async()=>{const {routes,db}=setup();let r=res();await run(routes.post['/admin/clients'][1],req({redirect_uris:' , '}),r);expect(r.status).toHaveBeenCalledWith(400);
 r=res();await run(routes.post['/admin/clients'][1],req({name:'n',client_id:'c',redirect_uris:' https://a ',allowed_scopes:' a  b ',allowed_resources:' https://r.example/ '}),r);expect(r.redirect).toHaveBeenCalledWith('/admin/clients');
 db.execute.mockResolvedValueOnce([[{client_id:'c'}]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);r=res();await run(routes.post['/admin/clients/:id/delete'][1],req({}, {},{id:'1'}),r);expect(r.redirect).toHaveBeenCalledWith('/admin/clients');
 db.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);r=res();await run(routes.post['/admin/clients/:id/delete'][1],req({}, {},{id:'2'}),r);expect(r.redirect).toHaveBeenCalledWith('/admin/clients');});


test('helper branches and optional client fields',async()=>{const {routes,db}=setup();
 db.query.mockResolvedValueOnce([[{id:1,name:'&<>"\'',client_id:'c',redirect_uris:['x'],public_client:true,allowed_scopes:'s',allowed_resources:'r'}]]);let r=res();await run(routes.get['/admin/clients'][1],authReq,r);expect(r.send.mock.calls[0][0]).toContain('&#39;');
 db.query.mockResolvedValueOnce([[{id:1,name:'N',client_id:'c',redirect_uris:'not-json',public_client:false}]]);r=res();await run(routes.get['/admin/clients'][1],authReq,r);expect(r.send).toHaveBeenCalled();
 r=res();await run(routes.post['/admin/clients'][1],req({name:'n',client_id:'c',redirect_uris:'https://x'}),r);expect(r.redirect).toHaveBeenCalled();
 r=res();await run(routes.post['/admin/users'][1],req({},{}),r);expect(r.status).toHaveBeenCalledWith(400);
 r=res();await run(routes.post['/admin/users/:id/password'][1],req({}, {},{id:'1'}),r);expect(r.status).toHaveBeenCalledWith(400);
});

test('login non-root and missing user; logout no cookie',async()=>{const {routes,db}=setup();let r=res();db.execute.mockResolvedValueOnce([[]]);await run(routes.post['/admin/login'][1],req({username:'root',password:'y'}),r);expect(r.status).toHaveBeenCalledWith(401);
 db.execute.mockResolvedValueOnce([[{username:'admin',password_hash:'x'}]]);bcrypt.compare.mockResolvedValueOnce(true);r=res();await run(routes.post['/admin/login'][1],req({username:'admin',password:'y'}),r);expect(r.status).toHaveBeenCalledWith(401);
 r=res();await run(routes.post['/admin/logout'][0],req(),r);expect(r.redirect).toHaveBeenCalledWith('/admin/login');
});

test('remaining conditional variants',async()=>{const {routes,db}=setup();
 // successful non-secure login
 db.execute.mockResolvedValueOnce([[{id:'u',username:'root',password_hash:'x'}]]).mockResolvedValueOnce([[]]);bcrypt.compare.mockResolvedValueOnce(true);let r=res();await run(routes.post['/admin/login'][1],req({username:'root',password:'pw'}),r);expect(r.setHeader.mock.calls[0][1]).not.toContain('Secure');
 // nullish escaping, scalar JSON, null/empty fallbacks
 db.query.mockResolvedValueOnce([[{id:1,name:null,client_id:null,redirect_uris:'"one"',public_client:0,allowed_scopes:null,allowed_resources:null},{id:2,name:'n',client_id:'c',redirect_uris:null,public_client:0}]]);r=res();await run(routes.get['/admin/clients'][1],authReq,r);expect(r.send).toHaveBeenCalled();
});

test('final helper and cookie branches',async()=>{const {routes,db}=setup();let r=res();
 db.query.mockResolvedValueOnce([[{id:1,name:'n',client_id:'c',redirect_uris:'["x"]',public_client:true,allowed_scopes:'scope',allowed_resources:'resource'}]]);await run(routes.get['/admin/clients'][1],authReq,r);
 r=res();await run(routes.post['/admin/logout'][0],req({}, {},{},true),r);expect(r.setHeader.mock.calls[0][1]).toContain('Secure');
 db.query.mockResolvedValueOnce([[{id:1,name:'n',client_id:'c',redirect_uris:'',public_client:false,allowed_scopes:'',allowed_resources:''}]]);r=res();await run(routes.get['/admin/clients'][1],authReq,r);
});

test('dashboard root disable branch',async()=>{const {routes,db}=setup();db.query.mockResolvedValueOnce([[{n:1}]]).mockResolvedValueOnce([[{n:1}]]).mockResolvedValueOnce([[{n:1}]]).mockResolvedValueOnce([[{n:1}]]).mockResolvedValueOnce([[{id:'u',username:'root',created_at:'now'}]]).mockResolvedValueOnce([[]]);const r=res();await run(routes.get['/admin'][1],authReq,r);expect(r.send.mock.calls[0][0]).toContain('disabled');});
