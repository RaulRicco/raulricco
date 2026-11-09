-- Flow System: Eisenhower + Big 3 (MIT) + áreas da vida + deep work com qualidade + revisões

-- Tarefas: área, quadrante Eisenhower, MIT, estimativa e data real de conclusão
ALTER TABLE tasks ADD COLUMN area TEXT DEFAULT 'work';          -- work | personal
ALTER TABLE tasks ADD COLUMN important INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN urgent INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN is_mit INTEGER DEFAULT 0;           -- Big 3 do dia
ALTER TABLE tasks ADD COLUMN estimate INTEGER DEFAULT 1;         -- pomodoros estimados
ALTER TABLE tasks ADD COLUMN completed_at TEXT;

-- Sessões: vínculo com tarefa, área e qualidade do foco (1-5)
ALTER TABLE pomodoro_sessions ADD COLUMN task_id TEXT;
ALTER TABLE pomodoro_sessions ADD COLUMN area TEXT;
ALTER TABLE pomodoro_sessions ADD COLUMN focus_quality INTEGER;

-- Metas: área (trimestral passa a ser aceito no period)
ALTER TABLE goals ADD COLUMN area TEXT DEFAULT 'work';

-- Shutdown diário (reflexão)
CREATE TABLE IF NOT EXISTS daily_reviews (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  energy INTEGER,
  mood INTEGER,
  wins TEXT,
  blockers TEXT,
  tomorrow TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON pomodoro_sessions(user_id, date);

-- Converte prioridades antigas: alta = urgente + importante (Q1); demais ficam em Q2
UPDATE tasks SET urgent = 1 WHERE priority = 'high';
