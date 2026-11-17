// P4 前端字典注入：verify/points 模块 × 五语言（幂等：已注入则跳过）
// 用法：npx tsx db/gen-i18n-verify.ts
import * as fs from "fs";

const V: Record<string, { verify: Record<string, string>; points: Record<string, string> }> = {
  en: {
    verify: {
      title: "Supplier Verification", sub: "Enter the full name of a Chinese factory you know and redeem a verification report based on public records — registration, certifications, operating history, each item tagged with its source.",
      companyLabel: "Full company name", companyPh: "e.g. Jiangsu Baoxiang Sports Equipment Co., Ltd.",
      productLabel: "Product of interest (optional)", productPh: "e.g. treadmill — used for price intelligence",
      balance: "Your points", cost: "This redemption", pointsUnit: "pts",
      submit: "Redeem & generate report", generating: "Generating report",
      generatingDesc: "Checking registration records, certifications and public operating history — about 1–2 minutes.",
      notEnough: "Not enough points — complete your first order to earn more, or contact support.",
      invalidName: "Please enter the full registered company name (4–100 characters).",
      loginFirst: "Sign in to redeem verification reports — new accounts get 1,000 points, enough for one report.",
      myReports: "My verification reports", emptyReports: "No reports yet — enter a factory name above to redeem your first one.",
      view: "View report", generatingBadge: "Generating", failedBadge: "Failed (points refunded)",
      retryHint: "Company not found in public archives — please check the exact registered name and try again.",
      inOurSystem: "Already inside the SourcBuy verified network",
      downloadPdf: "Download PDF report",
      ctaA: "Let SourcBuy source from this factory", ctaB: "Compare verified factories in this category", ctaC: "Upgrade to an on-site audit",
      stVerified: "Verified", stPending: "Pending", stUncovered: "Out of scope",
      conclusionTitle: "Conclusion (no rating — facts and gaps only)",
      back: "Back", pdfNotReady: "PDF is being typeset — refresh in a moment",
    },
    points: {
      title: "My points", balance: "Current balance", history: "Points history", empty: "No records yet.",
      registerGift: "Welcome gift", orderPayment: "Order reward", refundClawback: "Refund clawback",
      reportRedeem: "Report redemption", reportRefund: "Report refund", manualAdjust: "Manual adjustment",
      rule1: "1,000 pts on signup — enough for one verification report",
      rule2: "Every $1 of the first payment = 1 pt (freight & channel fees excluded)",
      rule3: "1,000 pts = one verification report; failed generation auto-refunds",
    },
  },
  es: {
    verify: {
      title: "Verificación de proveedores", sub: "Ingrese el nombre completo de una fábrica china y canjee un informe de verificación basado en registros públicos: registro mercantil, certificaciones e historial, cada ítem con su fuente.",
      companyLabel: "Nombre completo de la empresa", companyPh: "Ej.: Jiangsu Baoxiang Sports Equipment Co., Ltd.",
      productLabel: "Producto de interés (opcional)", productPh: "Ej.: cinta de correr — para inteligencia de precios",
      balance: "Sus puntos", cost: "Este canje", pointsUnit: "pts",
      submit: "Canjear y generar informe", generating: "Generando informe",
      generatingDesc: "Verificando registro mercantil, certificaciones e historial público — aproximadamente 1–2 minutos.",
      notEnough: "Puntos insuficientes: complete su primer pedido para acumular o contacte soporte.",
      invalidName: "Ingrese el nombre registral completo (4–100 caracteres).",
      loginFirst: "Inicie sesión para canjear informes — las cuentas nuevas reciben 1.000 puntos, suficiente para un informe.",
      myReports: "Mis informes de verificación", emptyReports: "Aún no hay informes — ingrese una fábrica arriba para canjear el primero.",
      view: "Ver informe", generatingBadge: "Generando", failedBadge: "Falló (puntos devueltos)",
      retryHint: "Empresa no encontrada en archivos públicos — verifique el nombre registral exacto e inténtelo de nuevo.",
      inOurSystem: "Ya forma parte de la red verificada SourcBuy",
      downloadPdf: "Descargar informe PDF",
      ctaA: "Encargar a SourcBuy la compra en esta fábrica", ctaB: "Comparar fábricas verificadas de la categoría", ctaC: "Actualizar a auditoría in situ",
      stVerified: "Verificado", stPending: "Pendiente", stUncovered: "Fuera de alcance",
      conclusionTitle: "Conclusión (sin calificación — solo hechos y vacíos)",
      back: "Volver", pdfNotReady: "El PDF se está componiendo — actualice en un momento",
    },
    points: {
      title: "Mis puntos", balance: "Saldo actual", history: "Historial de puntos", empty: "Sin registros aún.",
      registerGift: "Regalo de bienvenida", orderPayment: "Recompensa por pedido", refundClawback: "Reversa por reembolso",
      reportRedeem: "Canje de informe", reportRefund: "Devolución de informe", manualAdjust: "Ajuste manual",
      rule1: "1.000 pts al registrarse — suficiente para un informe de verificación",
      rule2: "Cada $1 del primer pago = 1 pt (sin flete ni comisiones de canal)",
      rule3: "1.000 pts = un informe de verificación; si falla, se devuelve automáticamente",
    },
  },
  fr: {
    verify: {
      title: "Vérification de fournisseurs", sub: "Saisissez le nom complet d'une usine chinoise et échangez un rapport de vérification fondé sur les sources publiques — registre, certifications, historique, chaque point sourcé.",
      companyLabel: "Raison sociale complète", companyPh: "Ex. : Jiangsu Baoxiang Sports Equipment Co., Ltd.",
      productLabel: "Produit visé (facultatif)", productPh: "Ex. : tapis de course — pour la veille prix",
      balance: "Vos points", cost: "Cet échange", pointsUnit: "pts",
      submit: "Échanger et générer le rapport", generating: "Génération du rapport",
      generatingDesc: "Vérification du registre, des certifications et de l'historique public — environ 1 à 2 minutes.",
      notEnough: "Points insuffisants — finalisez une première commande pour en gagner, ou contactez le support.",
      invalidName: "Saisissez la raison sociale complète (4–100 caractères).",
      loginFirst: "Connectez-vous pour échanger des rapports — tout nouveau compte reçoit 1 000 points, soit un rapport.",
      myReports: "Mes rapports de vérification", emptyReports: "Aucun rapport — saisissez une usine ci-dessus pour échanger le premier.",
      view: "Voir le rapport", generatingBadge: "En cours", failedBadge: "Échec (points remboursés)",
      retryHint: "Entreprise introuvable dans les archives publiques — vérifiez la raison sociale exacte et réessayez.",
      inOurSystem: "Déjà présent dans le réseau vérifié SourcBuy",
      downloadPdf: "Télécharger le rapport PDF",
      ctaA: "Confier l'achat à SourcBuy auprès de cette usine", ctaB: "Comparer avec des usines déjà auditées", ctaC: "Passer à l'audit sur site",
      stVerified: "Vérifié", stPending: "À vérifier", stUncovered: "Hors portée",
      conclusionTitle: "Conclusion (sans note — faits et lacunes uniquement)",
      back: "Retour", pdfNotReady: "Le PDF est en cours de composition — actualisez dans un instant",
    },
    points: {
      title: "Mes points", balance: "Solde actuel", history: "Historique des points", empty: "Aucun enregistrement.",
      registerGift: "Cadeau de bienvenue", orderPayment: "Récompense de commande", refundClawback: "Reprise sur remboursement",
      reportRedeem: "Échange de rapport", reportRefund: "Remboursement de rapport", manualAdjust: "Ajustement manuel",
      rule1: "1 000 pts à l'inscription — soit un rapport de vérification",
      rule2: "Chaque 1 $ du premier paiement = 1 pt (hors fret et frais de canal)",
      rule3: "1 000 pts = un rapport de vérification ; en cas d'échec, remboursement automatique",
    },
  },
  pt: {
    verify: {
      title: "Verificação de fornecedores", sub: "Digite o nome completo de uma fábrica chinesa e troque por um relatório de verificação com base em registros públicos — registro, certificações e histórico, cada item com sua fonte.",
      companyLabel: "Razão social completa", companyPh: "Ex.: Jiangsu Baoxiang Sports Equipment Co., Ltd.",
      productLabel: "Produto de interesse (opcional)", productPh: "Ex.: esteira — para inteligência de preços",
      balance: "Seus pontos", cost: "Esta troca", pointsUnit: "pts",
      submit: "Trocar e gerar relatório", generating: "Gerando relatório",
      generatingDesc: "Verificando registro, certificações e histórico público — cerca de 1–2 minutos.",
      notEnough: "Pontos insuficientes — conclua seu primeiro pedido para acumular ou fale com o suporte.",
      invalidName: "Digite a razão social completa (4–100 caracteres).",
      loginFirst: "Entre para trocar relatórios — contas novas recebem 1.000 pontos, suficiente para um relatório.",
      myReports: "Meus relatórios de verificação", emptyReports: "Nenhum relatório ainda — digite uma fábrica acima para trocar o primeiro.",
      view: "Ver relatório", generatingBadge: "Gerando", failedBadge: "Falhou (pontos devolvidos)",
      retryHint: "Empresa não encontrada em arquivos públicos — confira a razão social exata e tente novamente.",
      inOurSystem: "Já está na rede verificada SourcBuy",
      downloadPdf: "Baixar relatório em PDF",
      ctaA: "Contratar a SourcBuy para comprar desta fábrica", ctaB: "Comparar fábricas verificadas da categoria", ctaC: "Fazer upgrade para auditoria presencial",
      stVerified: "Verificado", stPending: "Pendente", stUncovered: "Fora do escopo",
      conclusionTitle: "Conclusão (sem nota — apenas fatos e lacunas)",
      back: "Voltar", pdfNotReady: "O PDF está sendo diagramado — atualize em instantes",
    },
    points: {
      title: "Meus pontos", balance: "Saldo atual", history: "Histórico de pontos", empty: "Sem registros ainda.",
      registerGift: "Presente de boas-vindas", orderPayment: "Recompensa de pedido", refundClawback: "Estorno de reembolso",
      reportRedeem: "Troca de relatório", reportRefund: "Devolução de relatório", manualAdjust: "Ajuste manual",
      rule1: "1.000 pts no cadastro — suficiente para um relatório de verificação",
      rule2: "Cada $1 do primeiro pagamento = 1 pt (sem frete nem taxa de canal)",
      rule3: "1.000 pts = um relatório de verificação; se falhar, devolução automática",
    },
  },
  ka: {
    verify: {
      title: "მიმწოდებლის შემოწმება", sub: "შეიყვანეთ ჩინური ქარხნის სრული სახელი და გადაცვალეთ საჯარო ჩანაწერებზე დაფუძნებული შემოწმების ანგარიში — რეესტრი, სერტიფიკატები, ისტორია, თითოეული პუნქტი წყაროთი.",
      companyLabel: "კომპანიის სრული სახელი", companyPh: "მაგ.: Jiangsu Baoxiang Sports Equipment Co., Ltd.",
      productLabel: "სასურველი პროდუქტი (არასავალდებულო)", productPh: "მაგ.: სარბენი ბილიკი — ფასების ანალიზისთვის",
      balance: "თქვენი ქულები", cost: "ეს გაცვლა", pointsUnit: "ქულა",
      submit: "გაცვლა და ანგარიშის გენერაცია", generating: "ანგარიში მუზდება",
      generatingDesc: "მოწმდება რეესტრი, სერტიფიკატები და საჯარო ისტორია — დაახლოებით 1–2 წუთი.",
      notEnough: "ქულები არ კმარა — დაასრულეთ პირველი შეკვეთა ან დაუკავშირდით მხარდაჭერას.",
      invalidName: "შეიყვანეთ სრული სარეგისტრაციო სახელი (4–100 სიმბოლო).",
      loginFirst: "შედით ანგარიშების გასაცვლელად — ახალი ანგარიში იღებს 1,000 ქულას, ერთი ანგარიშის საკმარისად.",
      myReports: "ჩემი შემოწმების ანგარიშები", emptyReports: "ანგარიშები ჯერ არ არის — შეიყვანეთ ქარხანა ზემოთ პირველის გასაცვლელად.",
      view: "ანგარიშის ნახვა", generatingBadge: "მუზდება", failedBadge: "ვერ მოხერხდა (ქულები დაბრუნდა)",
      retryHint: "კომპანია საჯარო არქივებში ვერ მოიძებნა — შეამოწმეთ ზუსტი სარეგისტრაციო სახელი.",
      inOurSystem: "უკვე SourcBuy-ის შემოწმებულ ქსელშია",
      downloadPdf: "PDF ანგარიშის ჩამოტვირთვა",
      ctaA: "SourcBuy-ს მიანჭეთ შესყიდვა ამ ქარხნიდან", ctaB: "შეადარეთ ამ კატეგორიის შემოწმებული ქარხნები", ctaC: "განაახლეთ ადგილზე აუდიტამდე",
      stVerified: "დადასტურებული", stPending: "სასინჯო", stUncovered: "ფარგლებს გარეთ",
      conclusionTitle: "დასკვნა (შეფასების გარეშე — მხოლოდ ფაქტები)",
      back: "უკან", pdfNotReady: "PDF მუზდება — განაახლეთ მოამდეში",
    },
    points: {
      title: "ჩემი ქულები", balance: "მიმდინარე ნაშთი", history: "ქულების ისტორია", empty: "ჩანაწერები ჯერ არ არის.",
      registerGift: "საჩუქარი რეგისტრაციაზე", orderPayment: "შეკვეთის ჯილდო", refundClawback: "დაბრუნების ჩამოჭრა",
      reportRedeem: "ანგარიშის გაცვლა", reportRefund: "ანგარიშის დაბრუნება", manualAdjust: "ხელით კორექტირება",
      rule1: "1,000 ქულა რეგისტრაციისას — ერთი შემოწმების ანგარიშის საკმარისი",
      rule2: "პირველი გადახდის ყოველი $1 = 1 ქულა (ტრანსპორტი და საკომისიო გამორიცხულია)",
      rule3: "1,000 ქულა = ერთი ანგარიში; წარუმატებლობისას ქულები ავტომატურად ბრუნდება",
    },
  },
};

// 序列化为 TS 对象字面量片段
const toTs = (obj: Record<string, string>, indent: string) =>
  Object.entries(obj).map(([k, v]) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");

let changed = 0;
for (const [lang, mod] of Object.entries(V)) {
  const p = `src/i18n/${lang}.ts`;
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("verify") && s.includes(`${lang}Verify`) || s.includes('"verify"')) { console.log(`${lang}: 已注入，跳过`); continue; }
  if (lang === "en") {
    // en 是模块合并结构：尾部加两个 const 并在合并对象里引用（替换函数形式防 $1 被当反向引用）
    s = s.replace(/export const en: Messages = \{/, () => `export const enVerify = {\n${toTs(mod.verify, "  ")}\n};\n\nexport const enPoints = {\n${toTs(mod.points, "  ")}\n};\n\nexport const en: Messages = {`);
    s = s.replace(/(\n  destGroup: enDestGroup,\n)\};/, (m) => m.replace(/\};$/, "  verify: enVerify,\n  points: enPoints,\n};"));
  } else {
    // es/fr/pt/ka 是单一大对象：在结尾 "};" 前插入两个键（函数形式：替换串含 $1 会被当反向引用吃掉）
    s = s.replace(/(\n)\};(\s*)$/, (m, g1, g2) => `,\n  "verify": {\n${toTs(mod.verify, "    ")}\n  },\n  "points": {\n${toTs(mod.points, "    ")}\n  }\n};${g2}`);
  }
  fs.writeFileSync(p, s);
  changed++;
  console.log(`${lang}: 注入完成`);
}
console.log(`done, ${changed} files changed`);
