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
  ['invalid worker frontmatter', root => patch(root, '.agents/skills/pm/SKILL.md', text => text.replace('name: pm', 'name: wrong'))],
  ['missing backend resolution', root => patch(root, '.agents/skills/tester/SKILL.md', text => text.replace('state backend from automatically loaded repository instructions', 'choose a backend each time'))],
  ['missing literal reference', root => patch(root, '.pi/prompts/pm-agent.md', text => text + '\nRead `docs/missing-contract.md`.\n')],
  ['missing cleanup protection', root => patch(root, 'AGENTS.md', text => text.replace('never run blanket', 'run blanket'))],
  ['missing canonical gate', root => patch(root, '.pi/prompts/team-lead.md', text => text.replaceAll('Ready for Acceptance Verification', 'Acceptance removed'))],
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
