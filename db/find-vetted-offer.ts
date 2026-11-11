import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const rows: any = await db.execute(sql`
  SELECT o.offer_id, o.title, f.id AS factory_id FROM offers o
  JOIN factories f ON f.member_id = o.member_id
  WHERE o.status != 'delisted' LIMIT 5
`);
console.log(JSON.stringify(rows?.[0] ?? rows, null, 1));
process.exit(0);
