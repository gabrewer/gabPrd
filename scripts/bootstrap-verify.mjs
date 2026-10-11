import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npmCli = process.env.npm_execpath;
const scripts = ['typecheck', 'test:unit', 'rebuild:sqlite', 'package', 'inspect:package', 'test:runtime'];
function run(args) {
  const child = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
  if (child.error || child.signal || child.status !== 0) {
    console.error('Bootstrap verification stopped at a failed prerequisite or subcommand. No remediation was attempted.');
    process.exit(1);
  }
}
if (realpathSync(process.cwd()) !== realpathSync(root) || !npmCli || !path.isAbsolute(npmCli)
  || !existsSync(npmCli) || !/npm-cli\.js$/i.test(npmCli)) {
  console.error('Run npm run verify:bootstrap from the project root with an installed npm CLI.');
  process.exit(1);
}
run([path.join(root, 'scripts/verify-environment.mjs')]);
for (const name of scripts) {
  console.log(`Bootstrap gate: ${name}`);
  run([npmCli, 'run', name]);
  if (name === 'package' && !existsSync(path.join(root, 'out/gabPrd-win32-x64/gabPrd.exe'))) {
    console.error('The required packaged Windows executable is missing.');
    process.exit(1);
  }
}
console.log('Automated bootstrap gates passed. Manual Windows accessibility evidence and review/acceptance remain separate.');
