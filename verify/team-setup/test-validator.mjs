import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = mkdtempSync(join(tmpdir(), 'gabprd-team-validator-'));
const scenarios = [
  ['duplicate backend marker', root => patch(root, 'AGENTS.md', text => text + '\n**State backend:** filesystem\n')],
  ['missing worker route', root => patchJson(root, '.pi/skill-models.json', value => { delete value.assignments.destroyer; })],
  ['unsupported automatic routing claim', root => patchJson(root, '.pi/skill-models.json', value => { value.routing = 'automatic'; })],
  ['incorrect model assignment', root => patchJson(root, '.pi/skill-models.json', value => { value.assignments.pm.model = 'nonexistent'; })],
  ['missing helper route', root => patchJson(root, '.pi/skill-models.json', value => { delete value.assignments.brainstorm; })],
  ['incorrect PM front-door model', root => patchJson(root, '.pi/skill-models.json', value => { value.assignments['pm-agent'].model = 'gpt-6.1-sol'; })],
  ['incorrect committer model', root => patchJson(root, '.pi/skill-models.json', value => { value.assignments['git-committer'].model = 'gpt-6.1-sol'; })],
  ['incorrect helper model', root => patchJson(root, '.pi/skill-models.json', value => { value.assignments.inspire.model = 'gpt-6.1-sol'; })],
  ['stale PM skill assignment', root => patch(root, '.agents/skills/pm/SKILL.md', text => text.replace('openai-codex/gpt-6-astra', 'openai-codex/gpt-6.1-sol'))],
  ['invalid worker frontmatter', root => patch(root, '.agents/skills/pm/SKILL.md', text => text.replace('name: pm', 'name: wrong'))],
  ['missing backend resolution', root => patch(root, '.agents/skills/tester/SKILL.md', text => text.replace('state backend from automatically loaded repository instructions', 'choose a backend each time'))],
  ['missing literal reference', root => patch(root, '.pi/prompts/pm-agent.md', text => text + '\nRead `docs/missing-contract.md`.\n')],
  ['missing cleanup protection', root => patch(root, 'AGENTS.md', text => text.replace('never run blanket', 'run blanket'))],
  ['missing canonical gate', root => patch(root, '.pi/prompts/team-lead.md', text => text.replaceAll('Ready for Acceptance Verification', 'Acceptance removed'))],
  ['missing Electron reference', root => rmSync(join(root, '.agents/skills/desktop-architect/references/electron-development.md'))],
  ['altered upstream MIT notice', root => patch(root, '.agents/skills/desktop-architect/references/LICENSE.electron-development', text => text.replace('Copyright (c) 2026 Antigravity User', 'Copyright removed'))],
  ['missing Electron role handoff', root => patch(root, '.agents/skills/desktop-architect/SKILL.md', text => text.replace('.agents/skills/desktop-architect/references/electron-development.md', 'docs/design/2026-10-09-prd-creator-prd.md'))],
  ['missing Electron sender validation', root => patch(root, '.agents/skills/desktop-architect/references/electron-development.md', text => text.replace('Validate IPC sender/frame identity and runtime payloads before privileged work.', 'Trust renderer input.'))],
  ['missing non-prefix containment guard', root => patch(root, '.agents/skills/desktop-architect/references/electron-development.md', text => text.replace('Never use a string-prefix check such as `filePath.startsWith(baseDir)` as path containment.', 'Use a prefix check for containment.'))],
  ['missing deferred Pi policy', root => patch(root, '.agents/skills/desktop-architect/references/electron-development.md', text => text.replace('Pi tool/extension policy remains deferred.', 'Unrestricted Pi tools are approved.'))],
  ['missing Electron runtime evidence gate', root => patch(root, '.agents/skills/desktop-architect/references/electron-development.md', text => text.replace('Required runtime evidence not executed is NOT CHECKED and blocking unless a human accepts the gap.', 'Static checks are acceptance.'))],
];
function patch(root, path, update) {
  const file = join(root, path);
  writeFileSync(file, update(readFileSync(file, 'utf8')));
}
function patchJson(root, path, update) {
  patch(root, path, text => { const value = JSON.parse(text); update(value); return JSON.stringify(value); });
}
function run(root) {
  const result = spawnSync(process.execPath, [join(root, 'verify/team-setup/check-resources.mjs')], { encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}
try {
  for (const path of ['AGENTS.md', '.gitignore', '.agents', '.pi/prompts', '.pi/settings.json', '.pi/skill-models.json', 'docs', 'instructions', 'verify/team-setup/check-resources.mjs']) {
    cpSync(join(source, path), join(temporary, path), { recursive: true });
  }
  const baseline = run(temporary);
  assert.equal(baseline.status, 0, baseline.stderr);
  for (const [name, mutate] of scenarios) {
    // Restore every potentially mutated source, then mutate only the temporary copy.
    for (const path of ['AGENTS.md', '.agents', '.pi/prompts', '.pi/skill-models.json']) {
      cpSync(join(source, path), join(temporary, path), { recursive: true });
    }
    mutate(temporary);
    const result = run(temporary);
    assert.notEqual(result.status, 0, `Validator accepted: ${name}`);
    assert.match(result.stderr, /AssertionError/, `Unexpected failure instead of validation rejection: ${name}`);
    console.log(`PASS rejection: ${name}`);
  }
  console.log(`PASS: clean baseline plus ${scenarios.length} isolated adversarial resource mutations. No repository files mutated.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
