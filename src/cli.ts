#!/usr/bin/env node
import { spawn } from "node:child_process";
import { parseCron, matches, slotFor, type CronFields } from "./cron.ts";
import { Store, type RunRow } from "./store.ts";

const VERSION = "0.9.2";

const HELP = `ofrenda ${VERSION} — a small, local-first cron runner

Usage:
  ofrenda run [--config <path>]   start the scheduler (foreground)
  ofrenda list [--limit <n>]      recent runs
  ofrenda retry <run-id>          re-run a failed run's command

Options:
  --config <path>   config file (default ./ofrenda.toml)
  --limit <n>       rows to list (default 20)
  --version         print the version
  --help            print this message`;

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split("=");
      const value = inline ?? argv[i + 1];
      if (inline === undefined && value !== undefined && !value.startsWith("--")) i++;
      flags.set(key!, value ?? "true");
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

/** The wall-clock time in a zone, tagged as UTC so cron fields can be matched. */
function zonedNow(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(
    Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute")),
  );
}

function execute(command: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", (err) => resolve({ code: 127, output: String(err) }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function tick(
  store: Store,
  jobs: { name: string; schedule: string; timezone: string; command: string[]; webhookUrl?: string }[],
  schedules: Map<string, CronFields>,
  now = new Date(),
): Promise<void> {
  for (const job of jobs) {
    const fields = schedules.get(job.name)!;
    const local = zonedNow(now, job.timezone);
    if (!matches(fields, local)) continue;

    // The slot is the scheduled wall-clock minute. Keeping it zone-local means
    // a DST fall-back does not create a second slot for the same wall time.
    const slot = slotFor(local);
    const runId = store.claim(job.name, slot);
    if (!runId) continue;

    const { code, output } = await execute(job.command);
    store.finish(runId, code, output);
    console.log(`[${job.name}] ${slot} exited ${code}`);

    if (code !== 0 && job.webhookUrl) {
      try {
        await fetch(job.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ job: job.name, run_id: runId, slot, exit_code: code }),
        });
      } catch (err) {
        // best effort: the run history is the source of truth
        console.error(`[${job.name}] webhook failed: ${(err as Error).message}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const command = rest[0];

  if (flags.has("version")) {
    console.log(VERSION);
    return;
  }
  if (flags.has("help") || command === undefined) {
    console.log(HELP);
    return;
  }

  if (command === "list") {
    const store = new Store();
    const limit = Number(flags.get("limit") ?? 20);
    for (const row of store.list(limit)) printRun(row);
    store.close();
    return;
  }

  if (command === "retry") {
    const id = rest[1];
    if (!id) {
      console.error("usage: ofrenda retry <run-id>");
      process.exitCode = 1;
      return;
    }
    const store = new Store();
    const run = store.get(id);
    if (!run) {
      console.error(`no run ${id}`);
      process.exitCode = 1;
      store.close();
      return;
    }
    const { loadConfig } = await import("./config.ts");
    const config = await loadConfig(String(flags.get("config") ?? "./ofrenda.toml"));
    const job = config.jobs.find((j) => j.name === run.job);
    if (!job) {
      console.error(`job "${run.job}" is no longer in the config`);
      process.exitCode = 1;
      store.close();
      return;
    }
    const { code, output } = await execute(job.command);
    console.log(output);
    process.exitCode = code;
    store.close();
    return;
  }

  if (command === "run") {
    const { loadConfig } = await import("./config.ts");
    const config = await loadConfig(String(flags.get("config") ?? "./ofrenda.toml"));
    const schedules = new Map(
      config.jobs.map((job) => [job.name, parseCron(job.schedule)]),
    );
    const store = new Store();
    const pruned = store.prune(config.retentionDays);
    if (pruned > 0) console.log(`pruned ${pruned} passed runs`);

    console.log(
      `ofrenda ${VERSION}: ${config.jobs.length} jobs, timezone ${config.timezone}`,
    );
    const loop = async () => {
      await tick(store, config.jobs, schedules);
    };
    await loop();
    setInterval(loop, 30_000);
    return;
  }

  console.error(`unknown command "${command}"`);
  console.log(HELP);
  process.exitCode = 1;
}

function printRun(row: RunRow): void {
  const when = new Date(row.started_at * 1000).toISOString();
  const exit = row.exit_code === null ? "-" : String(row.exit_code);
  console.log(`${row.id}  ${when}  ${row.status.padEnd(7)}  exit ${exit}  ${row.job}`);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
