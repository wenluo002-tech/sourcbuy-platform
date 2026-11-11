process.loadEnvFile();
import { getDb } from "../api/queries/connection";
const db = getDb();
const [t]: any = await db.execute(`SHOW TABLES`);
const names = t.map((r: any) => Object.values(r)[0]);
console.log(names.join(", "));
for (const tb of ["sourcing_api_logs", "text_translations", "chat_threads"]) {
  if (names.includes(tb)) {
    const [c]: any = await db.execute(`SHOW COLUMNS FROM ${tb}`);
    console.log(`\n${tb}:`, c.map((x: any) => x.Field).join(", "));
  }
}
process.exit(0);
