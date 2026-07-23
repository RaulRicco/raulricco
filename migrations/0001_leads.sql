CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  segmento TEXT,
  tempo_negocio TEXT,
  ja_investe_trafego TEXT,
  quando_investiu TEXT,
  quanto_disposto_investir TEXT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  fbclid TEXT,
  user_agent TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
