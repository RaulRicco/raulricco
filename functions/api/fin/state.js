import { json } from '../../_lib/response.js';

export async function onRequestGet({ env }) {
  // rowid = ordem em que cada registro foi lançado (a fatura do cartão usa isso como ordem padrão)
  const { results } = await env.DB.prepare('SELECT coll, id, data FROM fin_records ORDER BY rowid').all();
  const records = results.map((r) => ({ coll: r.coll, id: r.id, data: JSON.parse(r.data) }));
  return json({ records }, 200, { 'Cache-Control': 'no-store' });
}
