import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";
import { parseCron } from "./cron.ts";

export interface Job {
  name: string;
  schedule: string;
  command: string[];
  timezone: string;
  webhookUrl?: string;
}

export interface Config {
  timezone: string;
  retentionDays: number;
  jobs: Job[];
}

interface RawJob {
  name?: unknown;
  schedule?: unknown;
  command?: unknown;
  timezone?: unknown;
  webhook_url?: unknown;
}

interface RawConfig {
  defaults?: { timezone?: unknown; retention_days?: unknown };
  job?: RawJob[];
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

export async function loadConfig(path: string): Promise<Config> {
  let raw: RawConfig;
  try {
    raw = parse(await readFile(path, "utf8")) as RawConfig;
  } catch (err) {
    // smol-toml reports line and column; keep them, they are the whole point
    throw new Error(`${path}: ${(err as Error).message}`);
  }

  const timezone =
    typeof raw.defaults?.timezone === "string" ? raw.defaults.timezone : "UTC";
  if (!isTimezone(timezone)) fail(path, `unknown timezone "${timezone}"`);

  const retention =
    raw.defaults?.retention_days === undefined
      ? 30
      : Number(raw.defaults.retention_days);
  if (!Number.isInteger(retention) || retention < 1) {
    fail(path, `retention_days must be a positive integer, got ${retention}`);
  }

  const rawJobs = raw.job ?? [];
  if (rawJobs.length === 0) fail(path, "no [[job]] blocks defined");

  const seen = new Set<string>();
  const jobs = rawJobs.map((job, i) => {
    const label = typeof job.name === "string" ? job.name : `#${i + 1}`;
    if (typeof job.name !== "string" || job.name.trim() === "") {
      fail(path, `job ${label}: name is required`);
    }
    if (seen.has(job.name)) fail(path, `job "${job.name}": duplicate name`);
    seen.add(job.name);

    if (typeof job.schedule !== "string") {
      fail(path, `job "${job.name}": schedule is required`);
    }
    try {
      parseCron(job.schedule);
    } catch (err) {
      fail(path, `job "${job.name}": ${(err as Error).message}`);
    }

    const command = job.command;
    if (!Array.isArray(command) || command.length === 0) {
      fail(path, `job "${job.name}": command must be a non-empty array`);
    }

    const jobTimezone =
      typeof job.timezone === "string" ? job.timezone : timezone;
    if (!isTimezone(jobTimezone)) {
      fail(path, `job "${job.name}": unknown timezone "${jobTimezone}"`);
    }

    return {
      name: job.name,
      schedule: job.schedule,
      command: command.map(String),
      timezone: jobTimezone,
      ...(typeof job.webhook_url === "string"
        ? { webhookUrl: job.webhook_url }
        : {}),
    };
  });

  return { timezone, retentionDays: retention, jobs };
}

function isTimezone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
