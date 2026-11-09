-- Chaves de API permanentes para automações (assistente virtual, scripts, MCP)
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 do token; o token em si nunca é salvo
  prefix TEXT NOT NULL,              -- primeiros caracteres, para identificar na lista
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
