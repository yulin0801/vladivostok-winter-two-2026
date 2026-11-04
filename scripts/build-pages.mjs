import { spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stageRoot = path.join(sourceRoot, 'work', 'pages-build');
const docsRoot = path.join(sourceRoot, 'docs');
const marker = '.pages-build.json';
const defaultApiOrigin = 'https://vladivostok-winter-two-2026.vercel.app';

function options() {
  const result = {
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '/vladivostok-winter-two-2026',
    apiOrigin: process.env.NEXT_PUBLIC_API_ORIGIN || defaultApiOrigin,
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Build the GitHub Pages frontend in an isolated directory.

Usage: npm run build:pages -- [--base-path /repository] [--api-origin https://api.example.com]

Defaults:
  base path: NEXT_PUBLIC_BASE_PATH or /vladivostok-winter-two-2026
  API:       NEXT_PUBLIC_API_ORIGIN or ${defaultApiOrigin}

Use --base-path / for a username.github.io repository or a custom domain.
The generated docs/ directory is replaced after a successful build.
No .env files are read or copied; only the two public build variables above are used.`);
      return null;
    }
    const key = { '--base-path': 'basePath', '--api-origin': 'apiOrigin' }[args[i]];
    if (!key || i + 1 >= args.length || args[i + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${args[i]}. See --help.`);
    }
    result[key] = args[++i];
  }
  if (result.basePath === '/') result.basePath = '';
  if (result.basePath && !/^\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(result.basePath)) {
    throw new Error('Base path must be /repository-name, /, or an empty string.');
  }
  const origin = new URL(result.apiOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== result.apiOrigin || origin.username || origin.password) {
    throw new Error('API origin must be an HTTPS origin without credentials, path, query, or fragment.');
  }
  return result;
}

async function exists(filename) {
  try { await lstat(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Check each existing ancestor before removing or writing any generated directory.
// In particular, never follow a work/ or docs/ junction outside this project.
async function assertGeneratedPath(target) {
  const relative = path.relative(sourceRoot, path.resolve(target));
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Generated output must remain inside the project.');
  }
  let current = sourceRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (await exists(current)) {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing a linked output path: ${current}`);
      const realRelative = path.relative(await realpath(sourceRoot), await realpath(current));
      if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
        throw new Error('Generated output resolves outside the project.');
      }
    }
  }
}

async function copySourceFile(relative) {
  const source = path.join(sourceRoot, relative);
  if (!(await lstat(source)).isFile()) throw new Error(`Expected an ordinary source file: ${relative}`);
  const destination = path.join(stageRoot, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function copySourceTree(relative, extensions) {
  const directory = path.join(sourceRoot, relative);
  if (!(await lstat(directory)).isDirectory()) throw new Error(`Expected an ordinary source directory: ${relative}`);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Linked source files are not allowed: ${relative}/${entry.name}`);
    if (entry.name.startsWith('.') || /\.(test|spec)\./.test(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) await copySourceTree(child, extensions);
    else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) await copySourceFile(child);
  }
}

async function prepare({ basePath, apiOrigin }) {
  await assertGeneratedPath(stageRoot);
  await assertGeneratedPath(docsRoot);
  if (await exists(docsRoot)) {
    if (!(await lstat(docsRoot)).isDirectory() || !(await exists(path.join(docsRoot, marker)))) {
      throw new Error('docs/ already exists without the Pages build marker. Preserve or move it before building.');
    }
  }
  const nextBinary = path.join(sourceRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!(await exists(nextBinary))) throw new Error('Dependencies are missing. Run npm ci in the project first.');

  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  // This allowlist intentionally excludes app/api, all server libraries, env files,
  // hosting bindings, database migrations, and the original Next build directory.
  for (const filename of [
    'app/layout.tsx', 'app/TripApp.tsx', 'app/travel.css', 'app/responsive.css', 'app/globals.css',
    'app/components/AccessGate.tsx', 'app/components/TripMap.tsx', 'app/components/record-draft.ts',
    'app/lib/client-access.ts', 'app/lib/types.ts', 'lib/utils.ts', 'postcss.config.mjs',
    'vendor/shadcn-tailwind-4.13.0.css', 'vendor/shadcn-tailwind-4.13.0.LICENSE.md',
  ]) await copySourceFile(filename);
  await copySourceTree('components/ui', new Set(['.ts', '.tsx', '.css']));
  await copySourceTree('hooks', new Set(['.ts', '.tsx']));
  await copySourceTree('public', new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.wav', '.webmanifest']));

  const sourcePackage = JSON.parse(await readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
  const serverPackages = new Set(['@libsql/client', '@vercel/blob', 'drizzle-orm', 'drizzle-kit']);
  const dependencies = Object.fromEntries(Object.entries(sourcePackage.dependencies || {}).filter(([name]) => !serverPackages.has(name)));
  const devDependencies = Object.fromEntries(Object.entries(sourcePackage.devDependencies || {}).filter(([name]) => !serverPackages.has(name)));
  await writeFile(path.join(stageRoot, 'package.json'), JSON.stringify({
    name: 'vladivostok-pages-build', version: '0.0.0', private: true, type: 'module', dependencies, devDependencies,
  }, null, 2));
  await writeFile(path.join(stageRoot, 'next.config.mjs'), `export default ${JSON.stringify({
    output: 'export', basePath, trailingSlash: true, images: { unoptimized: true },
    productionBrowserSourceMaps: false,
    env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_API_ORIGIN: apiOrigin },
  }, null, 2)};\n`);
  await writeFile(path.join(stageRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: false, skipLibCheck: true,
      strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
      resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', incremental: true,
      plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', 'app/**/*.ts', 'app/**/*.tsx', 'components/ui/**/*.tsx', 'hooks/**/*.ts', 'lib/utils.ts', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2));
  await writeFile(path.join(stageRoot, 'app', 'page.tsx'), `import TripApp from './TripApp';
import AccessGate from './components/AccessGate';

export default function Home() {
  return <AccessGate><TripApp /></AccessGate>;
}
`);
  await symlink(path.join(sourceRoot, 'node_modules'), path.join(stageRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return nextBinary;
}

function build(nextBinary, { basePath, apiOrigin }) {
  // Keep inherited credentials and unrelated NEXT_PUBLIC_* values out of the build.
  const allowed = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'TERM', 'CI', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())));
  Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_API_ORIGIN: apiOrigin });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBinary, 'build', '--webpack'], { cwd: stageRoot, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Static build failed (${signal || code}); existing docs/ was preserved.`)));
  });
}

async function collectExport(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected link in exported output: ${child}`);
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || (relative === '' && entry.name === 'api')) {
      throw new Error(`Unexpected private or backend path in exported output: ${child}`);
    }
    if (entry.isDirectory()) files.push(...await collectExport(directory, child));
    else if (entry.isFile()) {
      if (entry.name.endsWith('.map')) continue;
      if (/\.(?:ts|tsx|mjs|cjs|sql)$/.test(entry.name)) throw new Error(`Unexpected source file in exported output: ${child}`);
      files.push(child);
    }
  }
  return files;
}

async function publishDocs(config) {
  const exported = path.join(stageRoot, 'out');
  if (!(await stat(path.join(exported, 'index.html'))).isFile()) throw new Error('The static build did not produce index.html.');
  const files = await collectExport(exported);
  await assertGeneratedPath(docsRoot);
  await rm(docsRoot, { recursive: true, force: true });
  await mkdir(docsRoot, { recursive: true });
  for (const relative of files) {
    const destination = path.join(docsRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(exported, relative), destination);
  }
  await writeFile(path.join(docsRoot, '.nojekyll'), '');
  await writeFile(path.join(docsRoot, marker), `${JSON.stringify({ generator: 'scripts/build-pages.mjs', ...config }, null, 2)}\n`);
  console.log(`GitHub Pages frontend ready: docs/ (${files.length} files).`);
  console.log(`Base path: ${config.basePath || '/'}; public API: ${config.apiOrigin}`);
}

try {
  const config = options();
  if (config) {
    const nextBinary = await prepare(config);
    await build(nextBinary, config);
    await publishDocs(config);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Pages build failed.');
  process.exitCode = 1;
}
