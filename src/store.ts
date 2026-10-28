import { DatabaseSync } from "node:sqlite";

export interface RunRow {
  id: string;
  job: string;
  slot: string;
  started_at: number;
  finished_at: number | null;
  exit_code: number | null;
  status: string;
  output: string | null;
}

/**
 * Slot uniqueness is the whole concurrency story: the insert either wins the
 * slot or does nothing, so a missed wake-up cannot double-fire.
 */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path = "ofrenda.db") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists runs (
        id text primary key,
        job text not null,
        slot text not null,
        started_at integer not null,
        finished_at integer,
        exit_code integer,
        status text not null,
        output text
      );
      create unique index if not exists runs_slot on runs (job, slot);
    `);
  }

  /** Returns the new run id, or null when this slot already ran. */
  claim(job: string, slot: string): string | null {
    const id = `r_${slot.replace(/[-:.]/g, "")}_${job}`;
    const info = this.db
      .prepare(
        `insert into runs (id, job, slot, started_at, status)
         values (?, ?, ?, unixepoch(), 'running')
         on conflict (job, slot) do nothing`,
      )
      .run(id, job, slot);
    return Number(info.changes) === 0 ? null : id;
  }

  finish(id: string, exitCode: number, output: string): void {
    this.db
      .prepare(
        `update runs
         set finished_at = unixepoch(), exit_code = ?, status = ?, output = ?
         where id = ?`,
      )
      .run(
        exitCode,
        exitCode === 0 ? "passed" : "failed",
        output.slice(-4000),
        id,
      );
  }

  list(limit = 20): RunRow[] {
    return this.db
      .prepare(`select * from runs order by started_at desc limit ?`)
      .all(limit) as unknown as RunRow[];
  }

  get(id: string): RunRow | null {
    const row = this.db.prepare(`select * from runs where id = ?`).get(id);
    return (row as unknown as RunRow) ?? null;
  }

  /** Prune passed runs only; failures are kept for 90 days regardless. */
  prune(retentionDays = 30): number {
    const info = this.db
      .prepare(
        `delete from runs
         where status = 'passed' and finished_at < unixepoch() - ? * 86400`,
      )
      .run(retentionDays);
    return Number(info.changes);
  }

  close(): void {
    this.db.close();
  }
}
