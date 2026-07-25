import 'dotenv/config';
import {db} from './src/database.mjs';
import {createOAuth} from './src/oauth.mjs';
import {rateLimit} from './src/rate-limit.mjs';
import {createApp} from './src/app.mjs';

const app = createApp({db, oauth: createOAuth(db), rateLimit});
const port = Number(process.env.HTTP_PORT || 8080);
app.listen(port, () => console.log(`OAuth provider listening on ${port}`));
export {app};
