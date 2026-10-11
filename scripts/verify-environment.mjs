import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
function fail(message) { console.error(message); process.exitCode = 1; }
function atLeast(value, minimum, major) {
  const parts = value.trim().split('.').map(Number);
  return parts.length === 3 && parts.every(Number.isInteger) && parts[0] === major
    && (parts[1] > minimum[1] || (parts[1] === minimum[1] && parts[2] >= minimum[2]));
}
if (process.platform !== 'win32' || process.arch !== 'x64') fail('Required: Windows x64. No cross-platform runtime evidence is accepted.');
if (!atLeast(process.versions.node, [24, 13, 0], 24)) fail('Required: Node 24.13.0 or later within major 24.');
const npmCli = process.env.npm_execpath;
if (!npmCli || !path.isAbsolute(npmCli) || !existsSync(npmCli) || !/npm-cli\.js$/i.test(npmCli)) fail('Run this check through npm with an installed npm CLI.');
else {
  try {
    const version = execFileSync(process.execPath, [npmCli, '--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!atLeast(version, [11, 6, 2], 11)) fail('Required: npm 11.6.2 or later within major 11.');
  } catch { fail('The npm version check could not finish.'); }
}
if (process.platform === 'win32') {
  // Native source-build fallback diagnostics only; never provision tools or print raw failures.
  let python = false;
  for (const [command, args] of [['py.exe', ['-3', '--version']], ['python.exe', ['--version']]]) {
    try { python = /^Python 3\./.test(execFileSync(command, args, { encoding: 'utf8', timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })); } catch {}
    if (python) break;
  }
  const programs = process.env['ProgramFiles(x86)'];
  const vswhere = programs && path.join(programs, 'Microsoft Visual Studio/Installer/vswhere.exe');
  let nativeTools = false;
  const sdkIncludes = programs && path.join(programs, 'Windows Kits/10/Include');
  if (vswhere && existsSync(vswhere)) {
    try {
      const installs = JSON.parse(execFileSync(vswhere, ['-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-format', 'json'], { encoding: 'utf8', timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
      nativeTools = Array.isArray(installs) && installs.some(install => install.isComplete === true && install.isLaunchable === true)
        && Boolean(sdkIncludes && existsSync(sdkIncludes));
    } catch {}
  }
  if (!python) fail('Python 3 native-build prerequisite was not detected; no installation was attempted.');
  if (!nativeTools) fail('Visual Studio C++/Windows SDK native-build prerequisites were not detected; no installation was attempted.');
}
if (!process.exitCode) console.log('Declared Windows/Node/npm and native-build prerequisites detected. Native ABI compatibility is still NOT CHECKED.');
