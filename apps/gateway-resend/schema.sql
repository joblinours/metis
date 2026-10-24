CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  to_address TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL,
  prev_folder TEXT,
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  to_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body_html TEXT,
  body_text TEXT,
  date TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  message_id_header TEXT,
  references_header TEXT,
  in_reply_to TEXT,
  list_unsubscribe TEXT,
  list_unsubscribe_post TEXT,
  attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_key TEXT,
  resend_email_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_folder_date ON messages (to_address, folder, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (to_address, thread_id, date ASC);
CREATE INDEX IF NOT EXISTS idx_messages_starred ON messages (to_address, is_starred, date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedupe ON messages (to_address, message_id_header);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_resend_id ON messages (resend_email_id);

CREATE TABLE IF NOT EXISTS blobs (
  key TEXT PRIMARY KEY,
  content_type TEXT,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tokens (
  address TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
