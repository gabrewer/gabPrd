## Summary and scope

Describe the committed change, its intent, included scope and exclusions. Identify the published head SHA and base; do not describe uncommitted work as part of this PR.

## Issue references

Use non-closing issue references only; never add automatic issue-closing keywords.

List supplied or validated existing issue links and the authoritative acceptance/intent reference. If none applies, say so; do not invent a tracking issue.

## Verification and evidence

Record actual commands/results and reviewed SHA; leave unknown results unchecked and mark missing evidence NOT CHECKED. Identify any human-accepted gaps explicitly.

For each applicable check, supply its command, result, exact SHA, evidence provenance and limitations. Distinguish committed-tree review, automated checks and live runtime evidence. Dirty-checkout results are not automatically evidence for the PR head. Tests and commits are implementation evidence, not human acceptance.

## Risks and accepted gaps

Describe applicable security/data-safety, integration, compatibility, accessibility, packaging or recovery risks. Identify unresolved findings and NOT CHECKED evidence. Cite explicit human acceptance for each accepted gap; do not turn an accepted gap into a passing result. Explain non-applicable categories rather than assume success.

## Review checkpoint

Record branch, base ref/SHA, merge base, committed range, commit count, unique changed-file count and BELOW / ADVISORY / STRONG (or NOT CHECKED with reason). Report dirty scope separately. Include the review boundary/next action and any explicit human decision to continue scope. A checkpoint is not push/merge authorization.
