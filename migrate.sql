-- MCP OAuth resource and scope policy migration.
ALTER TABLE oauth_clients ADD COLUMN allowed_scopes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE oauth_clients ADD COLUMN allowed_resources TEXT NOT NULL DEFAULT '[]';
ALTER TABLE oauth_codes ADD COLUMN resource VARCHAR(2048) NULL;
ALTER TABLE oauth_tokens ADD COLUMN resource VARCHAR(2048) NULL;
