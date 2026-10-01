import { json } from '../../_lib/response.js';
import { isValidRecord, upsertStmt } from '../../_lib/fin.js';

/** Substitui todos os dados (restauração de backup / reset): { records: [{coll,id,data}] } */
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  const records = Array.isArray(body?.records) ? body.records : null;
  if (!records || !records.every(isValidRecord)) return json({ error: 'Registros inválidos' }, 400);

  // Um único batch = uma transação: se algo falhar, os dados antigos são mantidos.
  await env.DB.batch([env.DB.prepare('DELETE FROM fin_records'), ...records.map((r) => upsertStmt(env.DB, r))]);
  return json({ ok: true, records: records.length });
}
