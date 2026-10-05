export const sender = 'theog@bfzelectric.com';
export const recipient = 'artiem@bfzelectric.com';
const scopes = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';

export function buildMessage(alert) {
  if (alert.item_name !== 'Camo Beanies' || alert.sender !== sender || alert.recipient !== recipient ||
      !Number.isInteger(alert.quantity) || !Number.isInteger(alert.minimum_quantity) ||
      alert.quantity < 0 || alert.quantity > alert.minimum_quantity) throw new Error('Invalid alert');
  return {
    message: {
      subject: 'Low stock: Camo Beanies',
      from: { emailAddress: { address: sender } },
      toRecipients: [{ emailAddress: { address: recipient } }],
      body: { contentType: 'Text', content: `Camo Beanies stock is low.\n\nOn Hand: ${alert.quantity}\nMinimum: ${alert.minimum_quantity}\n\nOn Hand is less than or equal to Minimum. Please arrange replenishment.\n\nBFZ Swag Tracker\nAlert reference: ${alert.id}` },
      internetMessageHeaders: [{ name: 'x-bfz-swag-alert-id', value: alert.id }],
    },
    saveToSentItems: true,
  };
}

async function matchesSecret(actual, expected) {
  if (!actual || !expected) return false;
  const digest = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function createHandler({ url, serviceKey, fetchImpl = fetch }) {
  const json = (data, status = 200) => Response.json(data, { status });
  const request = (url, options = {}) => fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000) });
  async function rpc(name, body = {}) {
    const response = await request(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Database operation failed: ${name}`);
    return response.json();
  }
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    // Never accept recipient, subject, sender, or inventory values from callers.
    if (!req.headers.get('x-swag-worker-secret')) return json({ error: 'Unauthorized' }, 401);
    try {
      const config = await rpc('get_swag_mail_config');
      if (!await matchesSecret(req.headers.get('x-swag-worker-secret'), config?.worker_secret)) return json({ error: 'Unauthorized' }, 401);
      if (!config?.client_id || !config?.tenant_id || !config?.refresh_token) return json({ error: 'Microsoft sender is not connected' }, 503);
      const tokenResponse = await request(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant_id)}/oauth2/v2.0/token`, {
        method: 'POST', body: new URLSearchParams({ client_id: config.client_id, refresh_token: config.refresh_token, grant_type: 'refresh_token', scope: scopes }),
      });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || !token.access_token) return json({ error: 'Reconnect Microsoft sender' }, 503);
      if (token.refresh_token) await rpc('rotate_swag_mail_token', { p_old: config.refresh_token, p_new: token.refresh_token });
      const identityResponse = await request('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: { Authorization: `Bearer ${token.access_token}` } });
      const identity = await identityResponse.json();
      if (!identityResponse.ok || ![identity.mail, identity.userPrincipalName].some((v) => v?.toLowerCase() === sender)) return json({ error: 'Connected mailbox does not match configured sender' }, 503);
      const [alert] = await rpc('claim_swag_stock_alert');
      if (!alert) return json({ status: 'idle' });
      const finish = async (result, error = null) => {
        const saved = await rpc('finish_swag_stock_alert', { p_id: alert.id, p_lease_token: alert.lease_token, p_result: result, p_error: error });
        if (!saved) throw new Error('Alert lease lost');
      };
      let message;
      try { message = buildMessage(alert); }
      catch { await finish('failed', 'Alert failed pilot-rule validation'); return json({ error: 'Invalid queued alert' }, 500); }
      let sent;
      try {
        sent = await request('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(message),
        });
      } catch {
        // The provider may have accepted the message before the network failed.
        await finish('unknown', 'Send outcome unknown; inspect the sender Sent Items before retrying.');
        return json({ status: 'unknown', alert_id: alert.id }, 502);
      }
      if (sent.status === 202) {
        await finish('sent');
        return json({ status: 'accepted', alert_id: alert.id });
      }
      await finish(sent.status === 429 || sent.status >= 500 ? 'retry' : 'failed', `Microsoft Graph HTTP ${sent.status}`);
      return json({ error: 'Microsoft did not accept the email', alert_id: alert.id }, 502);
    } catch {
      // No token, provider response body, or email contents in logs/responses.
      return json({ error: 'Mail worker failed; check connection and alert queue' }, 503);
    }
  };
}
