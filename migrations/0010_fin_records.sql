-- Ricco Orçamento: registros do controle financeiro (lançamentos, contas, cartões, categorias etc.)
-- Cada linha é um registro de uma coleção; `data` guarda o objeto em JSON.
CREATE TABLE IF NOT EXISTS fin_records (
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (coll, id)
);

CREATE INDEX IF NOT EXISTS idx_fin_records_coll ON fin_records(coll);
