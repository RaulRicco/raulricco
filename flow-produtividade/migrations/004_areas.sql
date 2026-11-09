-- Áreas personalizadas com meta de foco (minutos por dia/semana/mês)
-- O id é escopado por usuário: 'work' e 'personal' continuam válidos para os dados existentes.
CREATE TABLE IF NOT EXISTS areas (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3987e5',
  icon TEXT DEFAULT 'fa-circle',
  target_minutes INTEGER DEFAULT 0,
  target_period TEXT DEFAULT 'weekly',   -- daily | weekly | monthly
  sort_order INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, id)
);

INSERT OR IGNORE INTO areas (id, user_id, name, color, icon, target_minutes, target_period, sort_order)
  SELECT 'work', id, 'Profissional', '#3987e5', 'fa-briefcase', 900, 'weekly', 0 FROM users;
INSERT OR IGNORE INTO areas (id, user_id, name, color, icon, target_minutes, target_period, sort_order)
  SELECT 'personal', id, 'Pessoal', '#d95926', 'fa-heart', 300, 'weekly', 1 FROM users;
