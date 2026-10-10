import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const expectedWorkers = [
  'product-designer', 'pm', 'desktop-architect', 'pi-integration-specialist',
  'domain-modeler', 'api-developer', 'accessibility-specialist', 'shared-component-architect',
  'frontend-builder', 'backend-builder', 'conversation-builder', 'pi-integration-builder',
  'git-workspace-builder', 'persistence-recovery-builder', 'markdown-editor-builder',
  'windows-release-engineer', 'test-writer', 'security-data-safety-reviewer',
  'destroyer', 'review-agent', 'tester', 'git-committer', 'acceptance-coordinator',
];
const expectedPrompts = ['pm-agent', 'team-lead', 'pr-checkpoint'];
const expectedHelpers = ['brainstorm', 'inspire'];
const astra = new Set(['pm-agent', 'pm', ...expectedHelpers]);
const medium = new Set([
  'frontend-builder', 'backend-builder', 'conversation-builder', 'pi-integration-builder',
  'git-workspace-builder', 'persistence-recovery-builder', 'markdown-editor-builder',
  'windows-release-engineer', 'git-committer',
]);
const expectedRoute = name => ({
  provider: 'openai-codex',
  model: astra.has(name) ? 'gpt-6-astra' : name === 'git-committer' ? 'gpt-6-luna' : 'gpt-6.1-sol',
  thinkingLevel: medium.has(name) ? 'medium' : 'high',
});
const agents = read('AGENTS.md');
assert.equal((agents.match(/^\*\*State backend:\*\* .+$/gm) ?? []).length, 1, 'Exactly one backend marker');
assert.match(agents, /^\*\*State backend:\*\* github-issues$/m);
assert.match(agents, /never run blanket/i);
assert.match(agents, /Never close issues/i);
assert.match(read('.gitignore'), /^\.pi\/tmp\/$/m);
const routes = JSON.parse(read('.pi/skill-models.json'));
assert.equal(routes.routing, 'manual');
const names = [...expectedPrompts, ...expectedWorkers];
assert.deepEqual(Object.keys(routes.assignments).sort(), [...names, ...expectedHelpers].sort(), 'Complete, non-stale route map');
assert.deepEqual(readdirSync(join(root, '.pi/prompts')).filter(f => f.endsWith('.md')).sort(), expectedPrompts.map(n => `${n}.md`).sort());
const docs = read('docs/team/README.md');
for (const name of names) {
  const worker = expectedWorkers.includes(name);
  const path = worker ? `.agents/skills/${name}/SKILL.md` : `.pi/prompts/${name}.md`;
  const body = read(path);
  const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(fm, `${path}: frontmatter`);
  assert.match(fm[1], /^description: .+/m, `${path}: description`);
  if (worker) {
    assert.match(fm[1], new RegExp(`^name: ${name}$`, 'm'));
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const description = fm[1].match(/^description: (.+)$/m)[1];
    assert.ok(description.length <= 1024);
    for (const heading of ['Inputs / read before write', 'Responsibilities and handoff', 'Boundaries', 'Required evidence', 'Model and tools']) {
      assert.ok(body.includes(`## ${heading}`), `${path}: ${heading}`);
    }
  }
  assert.match(body, /state backend from automatically loaded repository instructions/i, `${path}: backend resolution`);
  assert.match(body, /incomplete (initialization|setup)/i, `${path}: missing-marker guard`);
  assert.ok(docs.includes(name), `${name}: operator map`);
  const expected = expectedRoute(name);
  assert.deepEqual(routes.assignments[name], expected, `${name}: exact assignment`);
  if (worker) {
    assert.ok(body.includes(`Assignment: \`${expected.provider}/${expected.model}\`, thinking \`${expected.thinkingLevel}\``), `${path}: assignment declaration matches route`);
  }
  // Only literal repository references: placeholders and slash-command syntax are not paths.
  for (const match of body.matchAll(/`((?:instructions|docs|\.agents|\.pi|verify)\/[^`]+)`/g)) {
    const literal = match[1];
    if (/[<>$]|\.\.\./.test(literal) || literal.endsWith('/')) continue;
    assert.ok(existsSync(join(root, literal)), `${path}: missing reference ${literal}`);
  }
}
for (const name of expectedHelpers) {
  assert.ok(existsSync(join(root, `.agents/skills/${name}/SKILL.md`)), `Preserved helper ${name}`);
  assert.deepEqual(routes.assignments[name], expectedRoute(name), `${name}: exact helper assignment`);
  assert.ok(docs.includes(name), `${name}: helper operator map`);
}
const electronGuidePath = '.agents/skills/desktop-architect/references/electron-development.md';
const electronLicensePath = '.agents/skills/desktop-architect/references/LICENSE.electron-development';
assert.ok(existsSync(join(root, electronGuidePath)), 'Curated Electron reference exists');
assert.ok(existsSync(join(root, electronLicensePath)), 'Upstream Electron reference license exists');
const electronGuide = read(electronGuidePath);
assert.ok(docs.includes(electronGuidePath), 'Electron reference operator entry');
for (const name of ['desktop-architect', 'api-developer', 'security-data-safety-reviewer', 'windows-release-engineer', 'pi-integration-builder', 'test-writer']) {
  assert.ok(read(`.agents/skills/${name}/SKILL.md`).includes(electronGuidePath), `${name}: Electron reference handoff`);
}
for (const guard of [
  'This reference does not authorize implementation, installation, automatic updates, publishing, or a new worker.',
  'Electron Forge + Webpack + npm + Squirrel.Windows',
  'Validate IPC sender/frame identity and runtime payloads before privileged work.',
  'TypeScript types are not runtime validation.',
  'Never use a string-prefix check such as `filePath.startsWith(baseDir)` as path containment.',
  'Pi tool/extension policy remains deferred.',
  'Required runtime evidence not executed is NOT CHECKED and blocking unless a human accepts the gap.',
  'https://github.com/sickn33/agentic-awesome-skills/tree/1c7bdea7f9094080fdb6f8b9b0aefb13030a2e31/skills/electron-development',
]) {
  assert.ok(electronGuide.includes(guard), `Electron reference guard: ${guard}`);
}
assert.ok(electronGuide.includes(electronLicensePath), 'Electron reference license attribution');
assert.equal(createHash('sha256').update(read(electronLicensePath).replaceAll('\r\n', '\n')).digest('hex'),
  'af98370a7edc0f00ec46979d049517833c9a7fa2ba74e3cf8cc42f7db557299d', 'Complete upstream MIT license preserved (newline-normalized)');
const settings = JSON.parse(read('.pi/settings.json'));
assert.equal(settings.defaultProvider, 'openai-codex');
assert.equal(settings.defaultModel, 'gpt-6.1-sol');
assert.equal(settings.defaultThinkingLevel, 'high');
const lead = read('.pi/prompts/team-lead.md');
for (const heading of ['Destroy Report', 'Review Report', 'Test Report', 'Sprint Complete', 'Ready for Acceptance Verification']) {
  assert.ok(lead.includes(heading), `Canonical gate ${heading}`);
}
assert.match(lead, /at most six/i);
assert.match(lead, /No push\/PR creation without separate authorization/);
assert.match(lead, /Never blanket-reset\/clean/);
assert.match(read('.pi/prompts/pm-agent.md'), /Contract Impact Check/);
assert.match(read('.pi/prompts/pr-checkpoint.md'), /15 OR 60/);
console.log(`PASS: ${expectedWorkers.length} workers, ${expectedPrompts.length} prompts, ${expectedHelpers.length} preserved helper routes, mixed-model assignments, backend, Electron reference/license/handoffs, safety guards. This is resource validation, not application runtime or human acceptance.`);
