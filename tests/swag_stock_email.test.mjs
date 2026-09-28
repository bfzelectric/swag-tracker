import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, createHandler } from '../supabase/functions/swag-stock-email/worker.mjs';

const alert = { id: 'alert-1', lease_token: 'lease-1', item_name: 'Camo Beanies', quantity: 10, minimum_quantity: 10, sender: 'theog@bfzelectric.com', recipient: 'artiem@bfzelectric.com' };
function harness({ graphStatus = 202, networkError = false, wrongSender = false, missingConfig = false, idle = false, finishError = false } = {}) {
  const calls = [];
  const config = { worker_secret: 'test-secret', tenant_id: 'tenant', client_id: 'client', refresh_token: 'refresh-token' };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/get_swag_mail_config')) return Response.json(missingConfig ? { worker_secret: 'test-secret' } : config);
    if (url.endsWith('/token')) return Response.json({ access_token: 'access', refresh_token: 'rotated' });
    if (url.endsWith('/rotate_swag_mail_token')) return Response.json(true);
    if (url.includes('/me?')) return Response.json({ mail: wrongSender ? 'another@example.com' : alert.sender });
    if (url.endsWith('/claim_swag_stock_alert')) return Response.json(idle ? [] : [alert]);
    if (url.endsWith('/sendMail')) {
      if (networkError) throw new Error('Connection lost');
      return new Response(null, { status: graphStatus });
    }
    if (url.endsWith('/finish_swag_stock_alert')) return finishError ? new Response(null, { status: 500 }) : Response.json(true);
    throw new Error(`Unexpected URL: ${url}`);
  };
  const invoke = (secret = 'test-secret', body = {}) => createHandler({ url: 'https://db.example', serviceKey: 'service-key', fetchImpl })(new Request('https://worker.example', { method: 'POST', headers: { 'x-swag-worker-secret': secret }, body: JSON.stringify(body) }));
  const result = () => JSON.parse(calls.find((c) => c.url.endsWith('/finish_swag_stock_alert'))?.options.body ?? '{}');
  return { calls, invoke, result };
}
test('message includes equality threshold and only the fixed pilot recipient', () => {
  const message = buildMessage(alert);
  assert.match(message.message.body.content, /On Hand: 10\nMinimum: 10/);
  assert.equal(message.message.toRecipients[0].emailAddress.address, 'artiem@bfzelectric.com');
  assert.throws(() => buildMessage({ ...alert, quantity: 11 }));
  assert.throws(() => buildMessage({ ...alert, item_name: 'Other item' }));
  assert.throws(() => buildMessage({ ...alert, recipient: 'other@example.com' }));
});
test('unauthorized requests cannot claim or send mail', async () => {
  const h = harness();
  assert.equal((await h.invoke('wrong')).status, 401);
  assert.equal(h.calls.length, 1);
});
test('missing Microsoft connection leaves the queue untouched', async () => {
  const h = harness({ missingConfig: true });
  assert.equal((await h.invoke()).status, 503);
  assert.equal(h.calls.length, 1);
});
test('wrong connected mailbox never claims or sends', async () => {
  const h = harness({ wrongSender: true });
  assert.equal((await h.invoke()).status, 503);
  assert.equal(h.calls.some((c) => c.url.endsWith('/claim_swag_stock_alert')), false);
});
test('successful send saves the rotated token and records acceptance', async () => {
  const h = harness();
  const response = await h.invoke('test-secret', { recipient: 'attacker@example.com' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'accepted');
  assert.equal(h.result().p_result, 'sent');
  const sent = JSON.parse(h.calls.find((c) => c.url.endsWith('/sendMail')).options.body);
  assert.equal(sent.message.toRecipients[0].emailAddress.address, alert.recipient);
  assert.equal(h.calls.findIndex((c) => c.url.endsWith('/rotate_swag_mail_token')) < h.calls.findIndex((c) => c.url.endsWith('/sendMail')), true);
});
test('empty queue sends no email', async () => {
  const h = harness({ idle: true });
  assert.equal((await (await h.invoke()).json()).status, 'idle');
  assert.equal(h.calls.some((c) => c.url.endsWith('/sendMail')), false);
});
for (const [status, outcome] of [[429, 'retry'], [503, 'retry'], [403, 'failed'], [400, 'failed']]) {
  test(`HTTP ${status} is recorded as ${outcome}`, async () => {
    const h = harness({ graphStatus: status }); await h.invoke(); assert.equal(h.result().p_result, outcome);
  });
}
test('uncertain network result is held for review, preventing blind duplicate sends', async () => {
  const h = harness({ networkError: true });
  assert.equal((await h.invoke()).status, 502);
  assert.equal(h.result().p_result, 'unknown');
});
test('database error after acceptance never triggers a second send', async () => {
  const h = harness({ finishError: true });
  assert.equal((await h.invoke()).status, 503);
  assert.equal(h.calls.filter((c) => c.url.endsWith('/sendMail')).length, 1);
});
