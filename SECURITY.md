# Security

Report vulnerabilities privately to the repository owner. Do not publish credentials, tokens, database dumps, private keys, or `.env` files.

Production requirements:

- Use HTTPS at the proxy and set `NODE_ENV=production`.
- Set `MYSQL_HOSTNAME`, `MYSQL_USERNAME`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`.
- Set `TRUST_PROXY=true` only when traffic comes through a trusted reverse proxy.
- Keep `ENABLE_TEST_ROUTES=false`.
- Rotate credentials if they were ever exposed or committed.
