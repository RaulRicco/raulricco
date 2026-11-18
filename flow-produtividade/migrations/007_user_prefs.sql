-- Preferências e estado do dia sincronizados entre aparelhos
-- (configurações do timer, cronômetro/pomodoro em andamento, visualização, checklist semanal...)
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
