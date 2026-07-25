import {mountTestRoutes} from '../src/test-routes.mjs';
test('test routes mount',()=>{const routes=[];const app={get:p=>routes.push(p)};mountTestRoutes(app,{db:{},oauth:{}});expect(routes).toEqual(['/test/login','/test/logout','/test/callback'])});
