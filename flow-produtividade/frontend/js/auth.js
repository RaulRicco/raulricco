// Utilitário de requisição autenticada
async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('flow_token');
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        localStorage.removeItem('flow_token');
        localStorage.removeItem('flow_user');
        window.location.href = 'index.html';
        return null;
    }
    return res;
}

window.apiRequest = apiRequest;
