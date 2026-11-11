-- Etapas: tarefa concluída hoje que continua no dia seguinte (depende de outras etapas)
ALTER TABLE tasks ADD COLUMN step INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN continues_from TEXT;   -- id da etapa anterior
ALTER TABLE tasks ADD COLUMN continued_to TEXT;     -- id da próxima etapa
