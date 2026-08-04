import 'dotenv/config';
import {db} from './src/database.mjs';
import {createOAuth} from './src/oauth.mjs';
import {rateLimit} from './src/rate-limit.mjs';
import {createApp} from './src/app.mjs';

const app = createApp({db, oauth: createOAuth(db), rateLimit});
const port = Number(process.env.HTTP_PORT || 8080);
const server = app.listen(port, () => console.log(`OAuth provider listening on ${port}`));
let stopping = false;
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`Elid received ${signal}; shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(() => { clearTimeout(forceExit); process.exit(0); });
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
export {app};
