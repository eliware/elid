import {mountOAuthRoutes} from '../src/oauth-routes.mjs';
test('oauth routes mount',()=>{const routes=[];const app={get:p=>routes.push(`GET ${p}`),post:p=>routes.push(`POST ${p}`)};mountOAuthRoutes(app,{db:{},oauth:{},rateLimit:()=>()=>{}});expect(routes).toEqual(expect.arrayContaining(['GET /oauth/authorize','POST /oauth/token','POST /oauth/introspect']))});
