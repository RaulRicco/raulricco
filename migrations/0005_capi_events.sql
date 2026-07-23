CREATE TABLE IF NOT EXISTS capi_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  request_payload TEXT,
  response_body TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_capi_events_lead_id ON capi_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_capi_events_created_at ON capi_events(created_at);
