// Lightweight fetch wrapper for the portal pages.
// Robust to: empty response body, non-JSON body, network failure, 401/403/503.

const authHeader = () => {
  const token = localStorage.getItem('portal_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function parseBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function makeError(res, body) {
  const detail = body && (body.detail || body._raw);
  const msg = detail || `HTTP ${res.status}`;
  const err = new Error(msg);
  err.status = res.status;
  err.body = body;
  return err;
}

export async function portalFetch(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader(),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Network failure, dev proxy unreachable, etc.
    const err = new Error('Le serveur ne répond pas. Vérifiez votre connexion.');
    err.status = 0;
    throw err;
  }
  const data = await parseBody(res);
  if (!res.ok) throw makeError(res, data);
  return data ?? {};
}

export const Portal = {
  isEnabled: () => portalFetch('/api/portal/enabled'),
  login: (matricule, password) =>
    portalFetch('/api/portal/login', { method: 'POST', body: { matricule, password } }),
  changePassword: (current_password, new_password) =>
    portalFetch('/api/portal/change-password', { method: 'POST', body: { current_password, new_password } }),
  me: () => portalFetch('/api/portal/me'),
  punches: (start_date, end_date) =>
    portalFetch(`/api/portal/punches?start_date=${encodeURIComponent(start_date)}&end_date=${encodeURIComponent(end_date)}`),
  monthSummary: (year, month) =>
    portalFetch(`/api/portal/month-summary?year=${year}&month=${month}`),
  leaveBalance: (year) =>
    portalFetch(`/api/portal/leave/balance${year ? `?year=${year}` : ''}`),
  leaveRequests: () => portalFetch('/api/portal/leave/requests'),
  leaveSign: (id) => portalFetch(`/api/portal/leave/requests/${id}/sign`, { method: 'POST' }),
  leaveCreate: (body) => portalFetch('/api/portal/leave/requests', { method: 'POST', body }),
  isSupervisor: () => portalFetch('/api/portal/leave/is-supervisor'),
  toValidate: () => portalFetch('/api/portal/leave/to-validate'),
  supervisorApprove: (id) => portalFetch(`/api/portal/leave/requests/${id}/supervisor-approve`, { method: 'POST' }),
  supervisorReject: (id, reason) => portalFetch(`/api/portal/leave/requests/${id}/supervisor-reject`, { method: 'POST', body: { reason } }),
};
