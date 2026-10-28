# Contributing

## Before you open anything

- Search the closed issues first. Most "it doesn't fire" reports are one of
  three known causes: a timezone mismatch, a slot that already ran, or a
  schedule that is not five fields. The README lists what this project will
  not do.
- Feature requests need a discussion issue first. A pull request that adds a
  feature without a discussion is closed with a pointer to the discussion.

## Bug reports

A bug report is actionable when it contains all four of these:

1. `ofrenda --version`
2. The relevant `[[job]]` block, secrets removed
3. The run id from `ofrenda list`, or `no run recorded` if nothing ran
4. What you expected and what happened instead

Reports missing the version or the config block are labelled `needs-repro` and
closed after 14 days if nothing is added. This is not hostility — without a
version we cannot tell which release you are running, and the scheduler has
changed between minor versions.

## Maintainer rulings

When a case is closed, the closing comment states the ruling: what we decided
and why. That comment is the record. If you disagree with a ruling, reopen the
issue with new information rather than filing a new one — duplicates are closed
with a pointer to the original thread.

## What we promise

- A reply within a week on actionable reports.
- No promises about timing for feature work. If you need a date, hire someone.
- Duplicate reports are closed, not merged into a tracking issue.

## Labels

| Label | Meaning |
|---|---|
| `bug` | confirmed defect in current release |
| `needs-repro` | missing version, config, logs, or steps |
| `question` | usage question, not a defect |
| `duplicate` | same problem already decided elsewhere |
| `feature` | accepted new capability |
| `out-of-scope` | we will not do this, and the README says why |
| `docs` | documentation only |
| `wontfix` | valid report, deliberately not fixed |
| `good-first-issue` | contained and well specified |
