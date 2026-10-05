// Operator-only device sign-in. Tokens stay in ignored work/ until moved to Vault.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sender } from '../supabase/functions/swag-stock-email/worker.mjs';
const [action, tenantId, clientId] = process.argv.slice(2);
const statePath = new URL('../work/swag-mail-device.json', import.meta.url);
const tokenPath = new URL('../work/swag-mail-connection.json', import.meta.url);
const scope = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(body), signal: AbortSignal.timeout(20000) });
  return { ok: res.ok, data: await res.json() };
}
if (action === 'start') {
  if (!tenantId || !clientId) throw new Error('Provide tenant ID and application client ID');
  const { ok, data } = await post(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/devicecode`, { client_id: clientId, scope });
  if (!ok) throw new Error(`Microsoft sign-in could not start: ${data.error}`);
  await mkdir(new URL('../work/', import.meta.url), { recursive: true });
  await writeFile(statePath, JSON.stringify({ tenantId, clientId, deviceCode: data.device_code, expiresAt: Date.now() + data.expires_in * 1000 }), { mode: 0o600 });
  console.log(JSON.stringify({ verification_uri: data.verification_uri, user_code: data.user_code, expires_in: data.expires_in, interval: data.interval }));
} else if (action === 'poll') {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  if (state.expiresAt <= Date.now()) throw new Error('Device sign-in expired; start again');
  const { ok, data } = await post(`https://login.microsoftonline.com/${encodeURIComponent(state.tenantId)}/oauth2/v2.0/token`, { client_id: state.clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: state.deviceCode });
  if (!ok) { console.log(JSON.stringify({ status: data.error })); process.exit(data.error === 'authorization_pending' ? 0 : 1); }
  const identityResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: { Authorization: `Bearer ${data.access_token}` }, signal: AbortSignal.timeout(15000) });
  const identity = await identityResponse.json();
  if (!identityResponse.ok || ![identity.mail, identity.userPrincipalName].some((value) => value?.toLowerCase() === sender)) throw new Error(`Sign in as ${sender}`);
  if (!data.refresh_token) throw new Error('Microsoft did not provide an offline connection');
  await writeFile(tokenPath, JSON.stringify({ tenant_id: state.tenantId, client_id: state.clientId, refresh_token: data.refresh_token }), { mode: 0o600 });
  console.log(JSON.stringify({ status: 'connected', sender, token_file: tokenPath.pathname }));
} else { throw new Error('Use start <tenant-id> <client-id> or poll'); }
