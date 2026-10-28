# ofrenda

A small, local-first cron runner. One process, one SQLite file, no control plane.

`ofrenda` runs the jobs listed in `ofrenda.toml`, records every run in
`ofrenda.db`, and gives you a `retry` command when something fails. It is
deliberately not a distributed scheduler: if you need one of those, use one.

```sh
ofrenda run --config ./ofrenda.toml
ofrenda list
ofrenda retry <run-id>
```

## Install

```sh
npm install -g ofrenda
```

Requires Node 24 or newer. Linux and macOS are supported. Windows is not
supported and there is no plan to add it — the scheduler relies on POSIX
signals and on filesystem semantics that differ on Windows.

## Configuration

```toml
[defaults]
timezone = "Europe/Berlin"
retention_days = 30

[[job]]
name = "nightly-backup"
schedule = "0 3 * * *"
command = ["pg_dump", "-Fc", "app", "--file", "/backups/app.dump"]

[[job]]
name = "sync-catalog"
schedule = "*/15 * * * *"
command = ["node", "scripts/sync-catalog.ts"]
```

Schedules are **five-field POSIX cron** (`minute hour day-of-month month
day-of-week`). There is no seconds field. Timezones are stored as UTC and
resolved against the job's timezone at fire time.

Config errors are reported with the line number and the offending value:

```
ofrenda.toml:12: job "nightly-backup": schedule "0 3 * *" has 4 fields, expected 5
```

## Run history

Every attempt is a row in `ofrenda.db` with its scheduled slot, start time,
exit code and captured output. Slots are unique, which is what makes a missed
or repeated wake-up harmless: a slot that already ran is never run twice.

Retention defaults to 30 days (`retention_days`). Failed runs are kept for 90
days regardless, so a slow-burning failure is not pruned before you notice it.

## Notifications

Set `webhook_url` on a job to receive a POST per failed run:

```toml
[[job]]
name = "nightly-backup"
webhook_url = "https://hooks.slack.com/services/…"
```

The payload is small and documented in `docs/architecture.md`.

## What this project will not do

These come up often enough to write down:

- **No distributed workers, no HA, no leader election.** One host runs the jobs.
- **No seconds field, no `@reboot`, no extended cron dialects.** Five fields.
- **No metrics endpoint.** Run history lives in SQLite; query it.
- **No web UI.** The CLI is the interface.

## Reporting a bug

Include the ofrenda version (`ofrenda --version`), the config with secrets
removed, the run id from `ofrenda list`, and the last 50 lines of output.
Reports without a version are closed until the version is provided — see
`CONTRIBUTING.md`.

## License

MIT
