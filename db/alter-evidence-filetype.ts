// evidence.media_type 加 'file'（材质单/盖章回传可能是 PDF）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
await db.execute(sql.raw("ALTER TABLE inspection_evidences MODIFY media_type ENUM('photo','video','file') NOT NULL"));
const [c]: any = await db.execute(sql`SHOW COLUMNS FROM inspection_evidences LIKE 'media_type'`);
console.log("media_type:", c[0].Type);
process.exit(0);
