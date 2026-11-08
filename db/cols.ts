import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
const db: any = getDb();
db.execute(dsql`SHOW COLUMNS FROM factories`).then(([r]: any) => {
  console.log(r.map((c: any) => c.Field).join(","));
  process.exit(0);
});
