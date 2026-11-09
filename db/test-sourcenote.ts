// 字段级来源标注判定器 单元测试：npx tsx db/test-sourcenote.ts
import { tagIntentSources } from "../contracts/sourceNote";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra ?? ""); }
}

// 1. 全 user：买家原话全给到
{
  const s = tagIntentSources("我要500条瑜伽裤预算8000美元发美国", "", {
    product: "瑜伽裤", quantity: 500, destination: "美国", budgetNote: "8000美元", region: null, isGreeting: false,
  });
  check("1a product=user", s.product.source === "user");
  check("1b quantity=user", s.quantity.source === "user");
  check("1c destination=user", s.destination.source === "user");
  check("1d budget=user", s.budget.source === "user");
  check("1e region=unknown", s.region.source === "unknown");
}

// 2. 英文买家说 "ship to USA" → destination=美国 仍应判 user（英文证据映射）
{
  const s = tagIntentSources("need 2000 yoga pants ship to USA", "", {
    product: "瑜伽裤", quantity: 2000, destination: "美国", budgetNote: null, region: null, isGreeting: false,
  });
  check("2a destination=user(US映射)", s.destination.source === "user", s.destination);
  check("2b product=ai(中文词不在原话)", s.product.source === "ai" && s.product.confidence === 0.35, s.product);
  check("2c quantity=user(pcs量词)", s.quantity.source === "user", s.quantity);
}

// 3. 图片场景：product 标 AI 推断 0.5，note 是图片口径
{
  const s = tagIntentSources("这个多少钱能拿到", "", {
    product: "宠物降温垫", quantity: null, destination: null, budgetNote: null, region: null, isGreeting: false,
  }, { fromImage: true });
  check("3a product=ai@0.5", s.product.source === "ai" && s.product.confidence === 0.5, s.product);
  check("3b note含图片", s.product.note.zh.includes("图片"));
}

// 4. 雷达直达：品类=买家点的卡片 → user
{
  const s = tagIntentSources("帮我看看这个", "", {
    product: "瑜伽裤", quantity: null, destination: null, budgetNote: null, region: null, isGreeting: false,
  }, { fromRadar: true });
  check("4 radar product=user", s.product.source === "user");
}

// 5. 金额守卫：预算 8000 美元绝不能被当成数量
{
  const s = tagIntentSources("瑜伽裤预算8000美元发美国", "", {
    product: "瑜伽裤", quantity: 8000, destination: "美国", budgetNote: "8000美元", region: null, isGreeting: false,
  });
  check("5 金额不当数量→quantity=ai", s.quantity.source === "ai", s.quantity);
}

// 6. 历史继承：品类在上轮说过，本轮没提 → 仍 user
{
  const s = tagIntentSources("数量改成2000", "我要瑜伽裤发美国", {
    product: "瑜伽裤", quantity: 2000, destination: "美国", budgetNote: null, region: null, isGreeting: false,
  });
  check("6a product=user(历史继承)", s.product.source === "user");
  check("6b destination=user(历史继承)", s.destination.source === "user");
}

// 7. 产地：买家指定中山 → user
{
  const s = tagIntentSources("我要中山的灯饰厂", "", {
    product: "灯饰", quantity: null, destination: null, budgetNote: null, region: "中山", isGreeting: false,
  });
  check("7 region=user", s.region.source === "user");
}

// 8. 链接剥离：URL 里的词不算买家说的
{
  const s = tagIntentSources("这个多少 https://detail.example.com/offer/瑜伽裤批发.html", "", {
    product: "瑜伽裤", quantity: null, destination: null, budgetNote: null, region: null, isGreeting: false,
  });
  check("8 URL词不算user→ai", s.product.source === "ai", s.product);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
