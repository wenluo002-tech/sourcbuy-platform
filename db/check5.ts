import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [r]: any = await db.execute(sql`SELECT 
    SUM(score>=90) s90, SUM(score>=85) s85, SUM(score>=80) s80, SUM(score>=75) s75, SUM(score>=70) s70, COUNT(*) total FROM factories`);
  console.log(r[0]);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1)});
