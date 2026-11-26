-- Usuarios y sesiones. La contraseña nunca se guarda en texto plano.

CREATE TABLE app_user (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE INDEX ix_app_user_username ON app_user (username);

CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user (id),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ix_session_user ON session (user_id);
CREATE INDEX ix_session_expires ON session (expires_at);
