-- Ricco Orçamento: tentativas de login com senha errada (limite contra força bruta)
CREATE TABLE IF NOT EXISTS fin_login_attempts (
  ip TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fin_login_attempts_ip ON fin_login_attempts(ip, created_at);
