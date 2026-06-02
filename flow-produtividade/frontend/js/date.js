// Data local no fuso America/Sao_Paulo (UTC-3), com suporte a offset em dias
function brDate(offsetDays = 0) {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    d.setDate(d.getDate() - offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

window.brDate = brDate;
