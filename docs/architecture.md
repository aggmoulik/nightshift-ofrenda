# Architecture

## One process, one file

`ofrenda run` starts a single long-lived process. It reads `ofrenda.toml` once
at startup, opens `ofrenda.db`, and ticks. There is no daemon, no agent, no
socket, and nothing to coordinate with. Running two schedulers against the same
database is not supported: the slot uniqueness constraint will make the second
one lose races rather than duplicate work, but the intended deployment is one
process per host.

## Slots, not timestamps

Every job occurrence is identified by a **slot**: the UTC instant of the
scheduled minute, truncated to the minute. The `runs` table has a unique index
on `(job_name, slot)`. A tick therefore does one thing:

```sql
insert into runs (job_name, slot, started_at, status)
values (?, ?, unixepoch(), 'running')
on conflict (job_name, slot) do nothing;
```

If the insert affects no row, the slot already ran and the tick moves on. This
is why a machine that sleeps for two hours does not fire a backlog of missed
runs, and why a clock that jumps backwards does not double-fire.

## Timezones

Schedules are written in the job's timezone and converted to UTC when a slot is
computed. Storage is always UTC. DST transitions are handled by resolving the
wall-clock time through `Intl.DateTimeFormat` rather than by arithmetic on
offsets, so a spring-forward 02:30 slot that does not exist is skipped, and an
autumn-back 02:30 slot that exists twice resolves to the first occurrence.

tzdata comes from the host. On Alpine images install `tzdata` explicitly; the
base image ships without it and every non-UTC schedule silently falls back to
UTC.

## Retention

`retention_days` (default 30) prunes completed runs. Failed runs are kept for
90 days regardless, because the useful signal in a failure is often weeks old.
Pruning runs once at startup and then daily; it is a single `delete` and does
not block the tick.

## Webhooks

On a failed run, if the job has `webhook_url`, ofrenda POSTs:

```json
{ "job": "nightly-backup", "run_id": "r_01J…", "slot": "2026-10-27T03:00:00Z", "exit_code": 2 }
```

Failures to deliver the webhook are logged and never retried. Notifications are
best-effort; the run history is the source of truth.

## History

2026-09: replaced offset arithmetic with `Intl` resolution after two timezone
regressions (#1, #2). 2026-10: slot uniqueness moved from an in-memory set to
the unique index, which fixed the sleep/wake double-fire (#4).
