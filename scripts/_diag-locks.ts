import { pool, closeScriptDatabase } from "./_db";

const TARGET_PID = Number(process.argv[2] ?? 234004);

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Terminating pid ${TARGET_PID}...`);
    const term = await client.query(`select pg_terminate_backend($1) as terminated`, [TARGET_PID]);
    console.log(term.rows);

    await new Promise((r) => setTimeout(r, 1500));

    const activity = await client.query(`
      select pid, usename, application_name, state, wait_event_type, wait_event,
             extract(epoch from (now() - query_start))::int as running_for_s,
             left(query, 100) as query
      from pg_stat_activity
      where datname = current_database()
      order by query_start asc
    `);
    console.log("=== pg_stat_activity after terminate ===");
    console.table(activity.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
