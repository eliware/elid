import 'dotenv/config';
import {db} from './src/database.mjs';
import {createOAuth} from './src/oauth.mjs';
import {rateLimit} from './src/rate-limit.mjs';
import {createApp} from './src/app.mjs';
import {closeDb} from '@eliware/mysql';
import {log, registerSignals} from '@eliware/common';

const app = createApp({db, oauth: createOAuth(db), rateLimit});
const port = Number(process.env.HTTP_PORT || 8080);
const server = app.listen(port, () => log.info(`OAuth provider listening on ${port}`));
const forceExit = setTimeout(() => process.exit(1), 10000);
forceExit.unref();
registerSignals({shutdownHook: async () => new Promise(resolve => server.close(async () => { clearTimeout(forceExit); await closeDb(db); resolve(); }))});
export {app};
