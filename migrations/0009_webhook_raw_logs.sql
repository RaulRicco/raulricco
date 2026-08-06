CREATE TABLE IF NOT EXISTS webhook_raw_logs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  headers TEXT,
  body TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_raw_logs_platform ON webhook_raw_logs(platform);
CREATE INDEX IF NOT EXISTS idx_webhook_raw_logs_created_at ON webhook_raw_logs(created_at);
