import { json } from '../../_lib/response.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT coll, id, data FROM fin_records').all();
  const records = results.map((r) => ({ coll: r.coll, id: r.id, data: JSON.parse(r.data) }));
  return json({ records }, 200, { 'Cache-Control': 'no-store' });
}
