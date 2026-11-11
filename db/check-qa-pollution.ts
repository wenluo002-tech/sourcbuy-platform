import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
process.loadEnvFile();
const db = getDb();
const [u]: any = await db.execute(dsql`SELECT COUNT(*) n, MIN(created_at) first, MAX(created_at) last FROM users WHERE email LIKE 'qa-%@sourcbuy.test' OR email LIKE '%@test.dev' OR email LIKE '%@test.com'`);
console.log("测试账号:", JSON.stringify(u));
const [o]: any = await db.execute(dsql`SELECT COUNT(*) n, COALESCE(SUM(gmv_usd),0) gmv FROM orders o JOIN users u ON u.id=o.user_id WHERE u.email LIKE 'qa-%' OR u.email LIKE '%@test.dev' OR u.email LIKE '%@test.com'`);
console.log("测试账号订单:", JSON.stringify(o));
const [o2]: any = await db.execute(dsql`SELECT COUNT(*) n, COALESCE(SUM(gmv_usd),0) gmv FROM orders`);
console.log("全部订单:", JSON.stringify(o2));
// 非测试账号的真实买家
const [real]: any = await db.execute(dsql`SELECT COUNT(*) n FROM users WHERE email NOT LIKE 'qa-%' AND email NOT LIKE '%@test.dev' AND email NOT LIKE '%@test.com'`);
console.log("非测试账号:", JSON.stringify(real));
const [ro]: any = await db.execute(dsql`SELECT o.status, COUNT(*) n FROM orders o JOIN users u ON u.id=o.user_id WHERE u.email NOT LIKE 'qa-%' AND u.email NOT LIKE '%@test.dev' AND u.email NOT LIKE '%@test.com' GROUP BY o.status`);
console.log("真实买家订单状态分布:", JSON.stringify(ro));
process.exit(0);
