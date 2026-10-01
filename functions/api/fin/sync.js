import { json } from '../../_lib/response.js';
import { isValidRecord, runBatches, upsertStmt, deleteStmt } from '../../_lib/fin.js';

/** Aplica alterações incrementais: { upserts: [{coll,id,data}], deletes: [{coll,id}] } */
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  const upserts = Array.isArray(body?.upserts) ? body.upserts : [];
  const deletes = Array.isArray(body?.deletes) ? body.deletes : [];
  if (![...upserts, ...deletes].every(isValidRecord)) return json({ error: 'Registro inválido' }, 400);
  if (upserts.some((r) => !r.data || typeof r.data !== 'object')) return json({ error: 'Dados inválidos' }, 400);

  await runBatches(env.DB, [
    ...upserts.map((r) => upsertStmt(env.DB, r)),
    ...deletes.map((r) => deleteStmt(env.DB, r)),
  ]);
  return json({ ok: true, upserts: upserts.length, deletes: deletes.length });
}
