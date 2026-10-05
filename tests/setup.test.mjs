import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  environmentStatus,
  mergeMissingEnvironment,
} from '../scripts/setup-lib.mjs';

test('first-run script creates local template and safely reruns in an isolated clone', (context) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'swag-setup-test-'));
  context.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'scripts'));
  for (const file of ['setup.mjs', 'setup-lib.mjs']) {
    fs.copyFileSync(
      new URL(`../scripts/${file}`, import.meta.url),
      path.join(fixture, 'scripts', file),
    );
  }
  fs.writeFileSync(
    path.join(fixture, '.env.example'),
    'NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n',
  );
  const lock = '{"lockfileVersion":3}';
  fs.writeFileSync(path.join(fixture, 'package-lock.json'), lock);
  // Pretend installation completed: isolate environment setup without any npm/network access.
  fs.mkdirSync(path.join(fixture, 'node_modules', 'vinext'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(fixture, 'node_modules', 'vinext', 'package.json'),
    '{}',
  );
  fs.mkdirSync(path.join(fixture, '.setup'));
  fs.writeFileSync(
    path.join(fixture, '.setup', 'dependencies.sha256'),
    createHash('sha256').update(lock).digest('hex'),
  );
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [path.join(fixture, 'scripts', 'setup.mjs'), ...args],
      { encoding: 'utf8' },
    );
  assert.equal(run().status, 0);
  assert.ok(fs.existsSync(path.join(fixture, '.env.local')));
  fs.writeFileSync(
    path.join(fixture, '.env.local'),
    `${valid}LOCAL_OVERRIDE=keep\n`,
  );
  assert.equal(run().status, 0);
  assert.ok(
    fs
      .readFileSync(path.join(fixture, '.env.local'), 'utf8')
      .includes('LOCAL_OVERRIDE=keep'),
  );
  fs.writeFileSync(
    path.join(fixture, '.env.import.local'),
    `${valid}PRIVATE_TOKEN=not-for-import\n`,
  );
  const imported = run('--import-env', '.env.import.local');
  assert.equal(imported.status, 0);
  assert.ok(!imported.stdout.includes('sb_publishable_example'));
  assert.ok(
    !fs
      .readFileSync(path.join(fixture, '.env.local'), 'utf8')
      .includes('not-for-import'),
  );
  assert.equal(run('--bogus').status, 1);
});

const valid =
  'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example\n';
test('diagnostics list missing names, never environment values', () => {
  assert.equal(environmentStatus(valid).ready, true);
  assert.deepEqual(environmentStatus('').missing, [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
  assert.equal(
    JSON.stringify(environmentStatus(valid)).includes('sb_publishable_example'),
    false,
  );
});
test('merge fills blanks, preserves overrides and excludes unrelated secrets', () => {
  const current =
    '# local note\nNEXT_PUBLIC_SITE_URL=http://localhost:3100\nNEXT_PUBLIC_SUPABASE_URL=\n';
  const result = mergeMissingEnvironment(
    current,
    `${valid}NEXT_PUBLIC_SITE_URL=https://example.com\nSERVICE_ROLE_KEY=private\n`,
  );
  assert.equal(environmentStatus(result.text).ready, true);
  assert.ok(result.text.includes('http://localhost:3100'));
  assert.ok(result.text.includes('# local note'));
  assert.ok(!result.text.includes('private'));
});
test('secret and service-role keys are rejected before writing', () => {
  assert.throws(
    () =>
      mergeMissingEnvironment(
        '',
        valid.replace('sb_publishable_example', 'sb_secret_example'),
      ),
    /secret key/,
  );
  const payload = Buffer.from(
    JSON.stringify({ role: 'service_role' }),
  ).toString('base64url');
  assert.equal(
    environmentStatus(
      valid.replace('sb_publishable_example', `eyJheader.${payload}.signature`),
    ).ready,
    false,
  );
});
test('repeated imports leave configured files unchanged', () => {
  const first = mergeMissingEnvironment('', valid);
  const second = mergeMissingEnvironment(first.text, valid);
  assert.equal(second.text, first.text);
  assert.deepEqual(second.added, []);
});
