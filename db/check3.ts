process.loadEnvFile();
import { searchOffers } from "../api/sourcing/offerService";
async function main() {
  try {
    const r = await searchOffers("加湿器", 1);
    console.log("total:", r.total, "items:", r.items.length, "source:", r.source);
    console.log(JSON.stringify(r.items.slice(0, 3), null, 1).slice(0, 1200));
  } catch (e: any) {
    console.log("THREW:", e?.message, e?.stack?.split("\n").slice(0, 5).join(" | "));
  }
  process.exit(0);
}
main();
