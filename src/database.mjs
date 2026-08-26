import {createDb} from '@eliware/mysql';
import 'dotenv/config';

const required = ['MYSQL_HOSTNAME', 'MYSQL_USERNAME', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missing = required.filter(name => !process.env[name] && !(name === 'MYSQL_USERNAME' && process.env.MYSQL_USERAME));
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

const env = {
  MYSQL_HOST: process.env.MYSQL_HOSTNAME,
  MYSQL_USER: process.env.MYSQL_USERNAME || process.env.MYSQL_USERAME,
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
  MYSQL_DATABASE: process.env.MYSQL_DATABASE,
};

export const db = await createDb({env, poolOptions: {namedPlaceholders: true}});
