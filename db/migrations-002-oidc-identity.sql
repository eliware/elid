ALTER TABLE oauth_users
  ADD COLUMN email VARCHAR(191) NULL,
  ADD COLUMN display_name VARCHAR(191) NULL,
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS oauth_user_groups (
  user_id VARCHAR(32) NOT NULL,
  group_name VARCHAR(191) NOT NULL,
  PRIMARY KEY(user_id, group_name),
  INDEX(group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE oauth_codes
  ADD COLUMN nonce VARCHAR(255) NULL;
