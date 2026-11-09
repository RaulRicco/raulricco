// Integrações — chaves de API para o assistente virtual / automações locais
const Integrations = (() => {
    const $ = id => document.getElementById(id);

    const fmtWhen = s => {
        if (!s) return 'nunca';
        const d = new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
        return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    async function render() {
        const el = $('tokens-list');
        try {
            const res = await apiRequest(`${FLOW_API}/tokens`);
            if (!res || !res.ok) throw new Error();
            const tokens = await res.json();
            el.innerHTML = tokens.length ? `<table><thead><tr><th>Nome</th><th>Chave</th><th>Criada</th><th>Último uso</th><th></th></tr></thead><tbody>${
                tokens.map(t => `<tr><td>${escapeHtml(t.name)}</td><td><code>${escapeHtml(t.prefix)}…</code></td><td>${fmtWhen(t.created_at)}</td><td>${fmtWhen(t.last_used_at)}</td>
                <td style="text-align:right"><button class="icon-btn del" data-revoke="${t.id}" title="Revogar chave" aria-label="Revogar chave"><i class="fas fa-ban"></i></button></td></tr>`).join('')
            }</tbody></table>` : '<p class="empty">Nenhuma chave criada.</p>';
            el.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', async () => {
                if (!confirm('Revogar esta chave? Qualquer automação usando ela para de funcionar na hora.')) return;
                const r = await apiRequest(`${FLOW_API}/tokens/${b.dataset.revoke}`, { method: 'DELETE' });
                if (r && r.ok) { toast('Chave revogada.'); render(); }
            }));
        } catch (e) {
            el.innerHTML = '<p class="empty">Não foi possível carregar as chaves.</p>';
        }
    }

    async function create() {
        const name = $('token-name').value.trim() || 'Assistente MacBook';
        const res = await apiRequest(`${FLOW_API}/tokens`, { method: 'POST', body: JSON.stringify({ name }) });
        const data = res ? await res.json().catch(() => ({})) : {};
        if (!res || !res.ok) { toast(data.error || 'Não foi possível criar a chave.'); return; }
        $('token-value').textContent = data.token;
        $('token-cmd').textContent = `flow login --token ${data.token}`;
        $('token-new').style.display = 'block';
        $('token-name').value = '';
        render();
    }

    function copy(id) {
        const text = $(id).textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
            () => toast('Copiado.'),
            () => { const r = document.createRange(); r.selectNodeContents($(id)); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Selecionado — use Cmd+C.'); });
    }

    function bind() {
        $('create-token').addEventListener('click', create);
        $('token-name').addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
        $('copy-token').addEventListener('click', () => copy('token-value'));
        $('copy-cmd').addEventListener('click', () => copy('token-cmd'));
        $('hide-token').addEventListener('click', () => { $('token-new').style.display = 'none'; $('token-value').textContent = ''; $('token-cmd').textContent = ''; });
    }

    return { bind, render };
})();

window.Integrations = Integrations;
