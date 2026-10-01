export const FIN_COLLECTIONS = [
  'settings', 'accounts', 'cards', 'categories', 'costCenters', 'contacts',
  'tx', 'budgets', 'goals', 'assets', 'investments', 'audit',
];

const CHUNK = 100;

export function isValidRecord(r) {
  return r && FIN_COLLECTIONS.includes(r.coll) && typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64;
}

/** Executa statements em lotes para respeitar os limites do D1. */
export async function runBatches(db, statements) {
  for (let i = 0; i < statements.length; i += CHUNK) {
    await db.batch(statements.slice(i, i + CHUNK));
  }
}

export function upsertStmt(db, r) {
  return db
    .prepare(
      `INSERT INTO fin_records (coll, id, data, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .bind(r.coll, r.id, JSON.stringify(r.data));
}

export function deleteStmt(db, r) {
  return db.prepare('DELETE FROM fin_records WHERE coll = ? AND id = ?').bind(r.coll, r.id);
}
