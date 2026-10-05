import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { environmentStatus, mergeMissingEnvironment } from './setup-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const importIndex = args.indexOf('--import-env');
const knownArgs = new Set(['--check', '--import-env']);
if (
  args.some(
    (arg, i) =>
      !knownArgs.has(arg) && !(importIndex >= 0 && i === importIndex + 1),
  )
) {
  throw new Error(
    'Usage: node scripts/setup.mjs [--check] [--import-env <local-file>]',
  );
}
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('Install Node 22.13+ before running setup. See START_HERE.md.');
  process.exit(1);
}
const envPath = path.join(root, '.env.local');
function readOptional(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

if (!checkOnly && !fs.existsSync(envPath)) {
  fs.copyFileSync(
    path.join(root, '.env.example'),
    envPath,
    fs.constants.COPYFILE_EXCL,
  );
  console.log('Created ignored .env.local from the template.');
}
if (importIndex >= 0) {
  if (checkOnly || !args[importIndex + 1])
    throw new Error(
      '--import-env requires a local file and cannot be used with --check.',
    );
  const sourcePath = path.resolve(root, args[importIndex + 1]);
  const relative = path.relative(root, sourcePath);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    sourcePath === envPath
  ) {
    throw new Error(
      'Import from a separate local file inside this cloned repository.',
    );
  }
  const result = mergeMissingEnvironment(
    readOptional(envPath),
    fs.readFileSync(sourcePath, 'utf8'),
  );
  fs.writeFileSync(envPath, result.text, { mode: 0o600 });
  console.log(
    `Added settings: ${result.added.join(', ') || 'none; existing values preserved'}.`,
  );
}

const statePath = path.join(root, '.setup', 'dependencies.sha256');
const lockHash = createHash('sha256')
  .update(fs.readFileSync(path.join(root, 'package-lock.json')))
  .digest('hex');
const dependenciesInstalled = fs.existsSync(
  path.join(root, 'node_modules', 'vinext', 'package.json'),
);
if (
  !checkOnly &&
  (!dependenciesInstalled || readOptional(statePath) !== lockHash)
) {
  console.log('Installing locked project dependencies…');
  const result =
    process.platform === 'win32'
      ? spawnSync(
          process.env.ComSpec || 'cmd.exe',
          ['/d', '/s', '/c', 'npm ci'],
          { cwd: root, stdio: 'inherit' },
        )
      : spawnSync('npm', ['ci'], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(
      'Dependency installation failed. Check network/permissions; do not change the lockfile to bypass it.',
    );
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, lockHash);
}
const environment = environmentStatus(readOptional(envPath));
const linkPath = path.join(root, '.vercel', 'project.json');
let linkedProject = null;
try {
  linkedProject = JSON.parse(readOptional(linkPath)).projectId ?? null;
} catch {
  /* not linked */
}
const expectedProject = 'prj_SMI4QbpxNUbQHmjOqOleZY00D0bh';
const report = {
  node: process.versions.node,
  dependenciesInstalled: fs.existsSync(
    path.join(root, 'node_modules', 'vinext', 'package.json'),
  ),
  environment,
  vercelLink:
    linkedProject === expectedProject
      ? 'correct'
      : linkedProject
        ? 'different-project'
        : 'not-linked',
};
console.log(JSON.stringify(report, null, 2));
console.log(
  environment.ready
    ? 'Live configuration is present; connectivity and authorization still need read-only verification.'
    : 'Local preview is available after installing dependencies. Live configuration is incomplete; follow SETUP_FOR_CODEX.md.',
);
if (!report.dependenciesInstalled || environment.problems.length)
  process.exitCode = 1;
