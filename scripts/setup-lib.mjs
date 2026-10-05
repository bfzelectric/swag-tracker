import { parseEnv } from 'node:util';

export const requiredKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];
export const allowedKeys = [...requiredKeys, 'NEXT_PUBLIC_SITE_URL'];

export function environmentStatus(text) {
  const values = parseEnv(text);
  const missing = requiredKeys.filter((key) => !values[key]?.trim());
  const problems = [];
  if (values.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const url = new URL(values.NEXT_PUBLIC_SUPABASE_URL);
      if (url.protocol !== 'https:')
        problems.push('Supabase URL must use HTTPS.');
    } catch {
      problems.push('Supabase URL is invalid.');
    }
  }
  const key = values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (key.startsWith('sb_secret_'))
    problems.push('A secret key cannot be used in browser configuration.');
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split('.')[1], 'base64url').toString(),
      );
      if (payload.role !== 'anon')
        problems.push(
          'Only an anon/public key is allowed in browser configuration.',
        );
    } catch {
      problems.push('The legacy public key is malformed.');
    }
  } else if (key && !key.startsWith('sb_publishable_')) {
    problems.push(
      'Use a Supabase publishable key, not an account token or database password.',
    );
  }
  return {
    ready: missing.length === 0 && problems.length === 0,
    missing,
    problems,
  };
}

// Import only browser settings that this app needs; never copy unrelated Vercel secrets.
// Nonempty existing values are preserved. Values are never included in diagnostics.
export function mergeMissingEnvironment(current, incoming) {
  const existing = parseEnv(current);
  const source = parseEnv(incoming);
  let merged = current;
  const added = [];
  for (const key of allowedKeys) {
    if (existing[key]?.trim() || !source[key]?.trim()) continue;
    const assignment = `${key}=${JSON.stringify(source[key])}`;
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'm');
    merged = pattern.test(merged)
      ? merged.replace(pattern, () => assignment)
      : `${merged.trimEnd()}\n${assignment}\n`;
    added.push(key);
  }
  const status = environmentStatus(merged);
  if (status.problems.length) throw new Error(status.problems.join(' '));
  return { text: merged, added };
}
