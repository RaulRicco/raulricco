import { json } from '../../_lib/response.js';

function detectSource(lead) {
  if (lead.gclid || lead.utm_source === 'google') return 'Google Ads';
  if (
    lead.fbclid ||
    lead.utm_source === 'facebook' ||
    lead.utm_source === 'instagram' ||
    lead.utm_source === 'meta'
  ) {
    return 'Meta Ads';
  }
  if (lead.utm_source) return lead.utm_source;
  return 'Direto';
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = 'SELECT * FROM leads';
  const bindings = [];
  if (from && to) {
    query += ' WHERE created_at >= ? AND created_at <= ?';
    bindings.push(from, to);
  }
  query += ' ORDER BY created_at DESC';

  const { results: leads } = await env.DB.prepare(query).bind(...bindings).all();

  const totalLeads = leads.length;
  const fechados = leads.filter((l) => l.status === 'fechado');
  const totalFechado = fechados.reduce((sum, l) => sum + Number(l.valor_fechado || 0), 0);
  const taxaConversao = totalLeads > 0 ? (fechados.length / totalLeads) * 100 : 0;

  const byDay = {};
  const bySource = {};

  leads.forEach((lead) => {
    const day = (lead.created_at || '').slice(0, 10);
    if (day) byDay[day] = (byDay[day] || 0) + 1;

    const source = detectSource(lead);
    bySource[source] = (bySource[source] || 0) + 1;
  });

  const series = Object.entries(byDay)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({ date, count }));

  const sources = Object.entries(bySource)
    .sort(([, a], [, b]) => b - a)
    .map(([source, count]) => ({
      source,
      count,
      percent: totalLeads > 0 ? Math.round((count / totalLeads) * 1000) / 10 : 0,
    }));

  const recentLeads = leads.slice(0, 20).map((lead) => ({
    id: lead.id,
    nome: lead.nome,
    segmento: lead.segmento,
    status: lead.status,
    valor_fechado: lead.valor_fechado,
    created_at: lead.created_at,
    source: detectSource(lead),
  }));

  return json({
    ok: true,
    totals: {
      totalLeads,
      totalFechados: fechados.length,
      totalFechado,
      taxaConversao: Math.round(taxaConversao * 10) / 10,
    },
    series,
    sources,
    recentLeads,
  });
}
