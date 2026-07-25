import mysql from 'mysql2/promise';
import 'dotenv/config';

const required = ['MYSQL_HOSTNAME', 'MYSQL_USERNAME', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missing = required.filter(name => !process.env[name] && !(name === 'MYSQL_USERNAME' && process.env.MYSQL_USERAME));
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

export const db = mysql.createPool({
  host: process.env.MYSQL_HOSTNAME,
  user: process.env.MYSQL_USERNAME || process.env.MYSQL_USERAME,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});
