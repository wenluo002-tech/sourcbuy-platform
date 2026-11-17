// P4 前端字典二次注入：VerifyReport 在线页增量键 × 六语言（幂等）
// 用法：npx tsx db/gen-i18n-verify2.ts
import * as fs from "fs";

const ADD: Record<string, Record<string, string>> = {
  zh: {
    conclusion: "公开核查未发现异常项 · {pending} 项待人工核实 · {uncovered} 项远程无法覆盖",
    metricYears: "经营年限", metricCerts: "在册资质", metricCoverage: "核查覆盖",
    maxRiskLabel: "最大风险",
    secMatrix: "核验矩阵", secReg: "工商底档", secMainProducts: "主营产品", secCap: "经营与产能",
    secCerts: "资质证书与验厂记录", secExp: "出口与市场 · 核查边界",
    certAsOriginal: "以证书原件为准",
    wbCrossText: "国内主流 B2B 平台在营 {years} 年{cat}",
    reachText: "已确认公开渠道联系电话 {phones} 条、决策层联系人 {dm} 条。委托采购后由我方团队代为对接。",
    ctaTitle: "核查完成，下一步交给 SourcBuy", ctaSub: "我们只代表买方", recommended: "推荐",
    ctaADesc: "双检出货 + 分段付款 + 先行赔付（单笔最高 $50,000）",
    ctaBDesc: "比价、比产能、比交期，不必从零开始",
    ctaCDesc: "验厂员上门：核产线、核库存、核管理",
  },
  en: {
    conclusion: "No anomalies in public records · {pending} pending manual verification · {uncovered} beyond remote coverage",
    metricYears: "Years", metricCerts: "Licenses", metricCoverage: "Coverage",
    maxRiskLabel: "Top risk",
    secMatrix: "Verification matrix", secReg: "Registration profile", secMainProducts: "Main products", secCap: "Operations & capacity",
    secCerts: "Certifications & audits", secExp: "Export & markets · scope",
    certAsOriginal: "Per original certificate",
    wbCrossText: "Active on a major domestic B2B platform for {years} years{cat}",
    reachText: "Confirmed {phones} public phone lines and {dm} decision-maker contacts. Once you commission sourcing, our team makes contact on your behalf.",
    ctaTitle: "Verification done — SourcBuy takes it from here", ctaSub: "We represent the buyer only", recommended: "PICK",
    ctaADesc: "Dual QC + milestone payments + advance compensation (up to $50,000 per order)",
    ctaBDesc: "Compare price, capacity and lead time — no starting from zero",
    ctaCDesc: "Auditor on site: lines, inventory, management",
  },
  es: {
    conclusion: "Sin anomalías en registros públicos · {pending} pendientes de verificación manual · {uncovered} fuera del alcance remoto",
    metricYears: "Años", metricCerts: "Licencias", metricCoverage: "Cobertura",
    maxRiskLabel: "Riesgo principal",
    secMatrix: "Matriz de verificación", secReg: "Perfil registral", secMainProducts: "Productos principales", secCap: "Operaciones y capacidad",
    secCerts: "Certificaciones y auditorías", secExp: "Exportación y mercados · alcance",
    certAsOriginal: "Según certificado original",
    wbCrossText: "Activa en una importante plataforma B2B nacional desde hace {years} años{cat}",
    reachText: "Confirmamos {phones} líneas telefónicas públicas y {dm} contactos decisores. Al contratar, nuestro equipo contacta en su nombre.",
    ctaTitle: "Verificación lista — SourcBuy continúa por usted", ctaSub: "Representamos solo al comprador", recommended: "ELECCIÓN",
    ctaADesc: "Doble QC + pagos por hitos + compensación anticipada (hasta $50.000 por pedido)",
    ctaBDesc: "Compare precio, capacidad y plazos sin empezar de cero",
    ctaCDesc: "Auditor in situ: líneas, inventario, gestión",
  },
  fr: {
    conclusion: "Aucune anomalie dans les sources publiques · {pending} points à vérifier manuellement · {uncovered} hors portée à distance",
    metricYears: "Ancienneté", metricCerts: "Licences", metricCoverage: "Couverture",
    maxRiskLabel: "Risque majeur",
    secMatrix: "Matrice de vérification", secReg: "Profil d'enregistrement", secMainProducts: "Produits principaux", secCap: "Opérations & capacité",
    secCerts: "Certifications & audits", secExp: "Export & marchés · limites",
    certAsOriginal: "Selon le certificat original",
    wbCrossText: "Active sur une grande plateforme B2B nationale depuis {years} ans{cat}",
    reachText: "Nous confirmons {phones} lignes publiques et {dm} contacts décisionnaires. Dès la commande, notre équipe établit le contact en votre nom.",
    ctaTitle: "Vérification terminée — SourcBuy prend le relais", ctaSub: "Nous ne représentons que l'acheteur", recommended: "CHOIX",
    ctaADesc: "Double QC + paiements échelonnés + indemnisation anticipée (jusqu'à 50 000 $ par commande)",
    ctaBDesc: "Comparez prix, capacité et délais sans repartir de zéro",
    ctaCDesc: "Auditeur sur site : lignes, stocks, gestion",
  },
  pt: {
    conclusion: "Sem anomalias em registros públicos · {pending} pendentes de verificação manual · {uncovered} fora do alcance remoto",
    metricYears: "Anos", metricCerts: "Licenças", metricCoverage: "Cobertura",
    maxRiskLabel: "Maior risco",
    secMatrix: "Matriz de verificação", secReg: "Perfil de registro", secMainProducts: "Produtos principais", secCap: "Operações e capacidade",
    secCerts: "Certificações e auditorias", secExp: "Exportação e mercados · escopo",
    certAsOriginal: "Conforme certificado original",
    wbCrossText: "Ativa em uma grande plataforma B2B nacional há {years} anos{cat}",
    reachText: "Confirmamos {phones} linhas telefônicas públicas e {dm} contatos decisórios. Ao contratar, nossa equipe faz o contato em seu nome.",
    ctaTitle: "Verificação concluída — a SourcBuy assume daqui", ctaSub: "Representamos apenas o comprador", recommended: "ESCOLHA",
    ctaADesc: "QC duplo + pagamentos por etapas + compensação antecipada (até $50.000 por pedido)",
    ctaBDesc: "Compare preço, capacidade e prazo sem começar do zero",
    ctaCDesc: "Auditor presencial: linhas, estoque, gestão",
  },
  ka: {
    conclusion: "საჯარო ჩანაწერებში ანომალია არ არის · {pending} ხელით შესამოწმებელია · {uncovered} დისტანციურად მიუწვდომელია",
    metricYears: "წლები", metricCerts: "ლიცენზიები", metricCoverage: "დაფარვა",
    maxRiskLabel: "მთავარი რისკი",
    secMatrix: "შემოწმების მატრიცა", secReg: "რეგისტრაციის პროფილი", secMainProducts: "მთავარი პროდუქტები", secCap: "ოპერაციები და სიმძლავრე",
    secCerts: "სერტიფიკატები და აუდიტები", secExp: "ექსპორტი და ბაზრები · ფარგლები",
    certAsOriginal: "ორიგინალი სერტიფიკატის მიხედვით",
    wbCrossText: "აქტიურია წამყვან შიდა B2B პლატფორმაზე {years} წელი{cat}",
    reachText: "დადასტურებულია {phones} საჯარო ტელეფონი და {dm} გადაწყვეტილების მიმღები კონტაქტი. შეკვეთის შემდეგ ჩვენი გუნდი დაუკავშირდება თქვენი სახელით.",
    ctaTitle: "შემოწმება დასრულდა — შემდეგ SourcBuy-ის ჯერადია", ctaSub: "ჩვენ მხოლოდ მყიდველს ვ წარმოვადგენთ", recommended: "არჩევა",
    ctaADesc: "ორმაგი QC + ეტაპობრივი გადახდები + წინასწარი ანაზღაურება ($50,000-მდე შეკვეთაზე)",
    ctaBDesc: "შეადარეთ ფასი, სიმძლავრე და ვადები ნულიდან დაწყების გარეშე",
    ctaCDesc: "აუდიტორი ადგილზე: ხაზები, მარაგი, მენეჯმენტი",
  },
};

let changed = 0;
for (const [lang, mod] of Object.entries(ADD)) {
  const p = `src/i18n/${lang}.ts`;
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("ctaADesc")) { console.log(`${lang}: 已注入，跳过`); continue; }
  const lines = Object.entries(mod).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
  if (lang === "zh") {
    // zhVerify 在 zh.ts 独立导出 const
    s = s.replace(/(export const zhVerify = \{[\s\S]*?)(\n\};)/, (m, a, b) => `${a},\n${lines.replace(/^    /gm, "  ")}${b}`);
  } else if (lang === "en") {
    s = s.replace(/(export const enVerify = \{[\s\S]*?)(\n\};)/, (m, a, b) => `${a},\n${lines.replace(/^    /gm, "  ")}${b}`);
  } else {
    s = s.replace(/("verify": \{[\s\S]*?)(\n  \},)/, (m, a, b) => `${a},\n${lines}${b}`);
  }
  fs.writeFileSync(p, s);
  changed++;
  console.log(`${lang}: 二次注入完成`);
}
console.log(`done, ${changed} files`);
