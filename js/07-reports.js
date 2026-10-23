// ═══ دفتر المقهى ═══ 07-reports.js — التقارير
// (مقسوم من app.js — الأسطر 3968-4111)

const cashMethodMeta = [
  { key: "cash", label: "كاش", icon: "💵" },
  { key: "bank", label: "تطبيق بنك", icon: "🏦" },
  { key: "wallet", label: "محفظة", icon: "📱" }
];

function renderCashOnHand() {
  if (!els.cashOnHandBox) return;
  const c = cashOnHand();
  const cards = cashMethodMeta.map(({ key, label, icon }) => {
    const m = c.methods[key];
    const lastAdjustment = latestCashAdjustment(key);
    const transferText = (m.transferIn || m.transferOut)
      ? ` | تحويل +${money(m.transferIn)} / -${money(m.transferOut)}`
      : "";
    return `
      <article class="cash-method-card ${m.current >= 0 ? "" : "is-negative"}">
        <div class="cash-method-head">
          <span>${icon} ${label}${key === "cash" ? " <em class=\"cash-card-hint\">= اللي بالدرج</em>" : ""}</span>
          <button class="cash-method-reconcile" type="button" data-reconcile-method="${key}" title="جرد ${label}">⚖</button>
        </div>
        <strong>${money(m.current)}</strong>
        <small>رأس مال ${money(m.opening)} + دخل ${money(m.inflow)} − طلع ${money(m.outflow)}${m.adjustments ? ` ${m.adjustments >= 0 ? "+" : "−"} جرد ${money(Math.abs(m.adjustments))}` : ""}${transferText}</small>
        ${lastAdjustment ? `<small>آخر جرد: ${money(lastAdjustment.counted)} | ${formatDate(lastAdjustment.createdAt)}</small>` : ""}
      </article>
    `;
  }).join("");

  els.cashOnHandBox.innerHTML = `
    <div class="cashbox-balance-scope">
      <strong>الرصيد الحالي - كل الفترات</strong>
      <span>هذه الأرقام هي الموجود معك الآن، ولا تتغير حسب فلتر التقرير.</span>
    </div>
    <div class="cashbox-onhand-top">
      <div class="cashbox-onhand-total">
        <span>💰 إجمالي الفلوس اللي معك <em class="cashbox-total-hint">(كاش + بنك + محفظة معًا — مش الدرج بس)</em></span>
        <strong class="${c.total.current >= 0 ? "is-positive" : "is-negative"}">${money(c.total.current)}</strong>
      </div>
      <div class="cashbox-onhand-actions">
        <button class="secondary-button" id="transferCashButton" type="button">⇄ تحويل</button>
        <button class="secondary-button" id="setOpeningCashButton" type="button">✎ رأس المال</button>
      </div>
    </div>
    <div class="cash-method-grid">${cards}</div>
    ${renderCashboxActionCard(c)}
  `;

  const setBtn = document.getElementById("setOpeningCashButton");
  if (setBtn) setBtn.addEventListener("click", showOpeningCashCard);
  const transferBtn = document.getElementById("transferCashButton");
  if (transferBtn) transferBtn.addEventListener("click", showTransferCashCard);
  els.cashOnHandBox.querySelectorAll("[data-reconcile-method]").forEach((btn) => {
    btn.addEventListener("click", () => showReconcileCashCard(btn.dataset.reconcileMethod));
  });
  bindCashboxActionCard();
}

function latestCashAdjustment(method) {
  return (state.cashAdjustments || [])
    .filter((entry) => entry.method === method)
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
}

function renderCashboxActionCard(c) {
  if (!cashboxAction) return "";

  if (cashboxAction.type === "opening") {
    const opening = normalizeOpeningCash(state.openingCash);
    return `
      <form class="cashbox-action-card" id="openingCashForm">
        <div>
          <h3>رأس المال داخل البرنامج</h3>
          <p>اكتب المبلغ الأساسي لكل طريقة دفع عند بداية استخدام البرنامج.</p>
        </div>
        <div class="cashbox-action-grid">
          ${cashMethodMeta.map(({ key, label, icon }) => `
            <label class="field compact">
              <span>${icon} ${label}</span>
              <input type="number" min="0" step="any" inputmode="decimal" data-opening-cash="${key}" value="${escapeAttr(inputNumberValue(opening[key]))}" />
            </label>
          `).join("")}
        </div>
        <div class="cashbox-action-buttons">
          <button class="primary-button" type="submit">حفظ رأس المال</button>
          <button class="secondary-button" type="button" data-cashbox-cancel>إلغاء</button>
        </div>
      </form>
    `;
  }

  if (cashboxAction.type === "transfer") {
    const fromMethod = paymentMethods.includes(cashboxAction.fromMethod) ? cashboxAction.fromMethod : "cash";
    const toMethod = paymentMethods.includes(cashboxAction.toMethod) && cashboxAction.toMethod !== fromMethod ? cashboxAction.toMethod : "bank";
    const options = (selected) => cashMethodMeta.map(({ key, label, icon }) => {
      return `<option value="${key}" ${key === selected ? "selected" : ""}>${icon} ${label}</option>`;
    }).join("");

    return `
      <form class="cashbox-action-card" id="cashTransferForm">
        <div>
          <h3>تحويل بين طرق الدفع</h3>
          <p>انقل مبلغ من كاش إلى تطبيق بنك أو محفظة. هذا تحويل داخلي لا يُحسب دخل ولا مصروف.</p>
        </div>
        <div class="cashbox-transfer-grid">
          <label class="field compact">
            <span>من</span>
            <select id="cashTransferFromInput">${options(fromMethod)}</select>
          </label>
          <label class="field compact">
            <span>إلى</span>
            <select id="cashTransferToInput">${options(toMethod)}</select>
          </label>
          <label class="field compact cashbox-transfer-amount">
            <span>المبلغ</span>
            <input id="cashTransferAmountInput" type="number" min="0" step="any" inputmode="decimal" />
          </label>
          <label class="field compact cashbox-transfer-note">
            <span>ملاحظة</span>
            <input id="cashTransferNoteInput" type="text" placeholder="مثال: إيداع كاش في البنك" />
          </label>
        </div>
        <div class="cashbox-transfer-preview" id="cashTransferPreview"></div>
        <div class="cashbox-action-buttons">
          <button class="primary-button" type="submit">تثبيت التحويل</button>
          <button class="secondary-button" type="button" data-cashbox-cancel>إلغاء</button>
        </div>
      </form>
    `;
  }

  if (cashboxAction.type === "reconcile") {
    const method = cashboxAction.method;
    const meta = cashMethodMeta.find((item) => item.key === method);
    const expected = c.methods[method]?.current || 0;
    if (!meta) return "";

    return `
      <form class="cashbox-action-card" id="reconcileCashForm" data-method="${escapeAttr(method)}" data-expected="${escapeAttr(expected)}">
        <div>
          <h3>جرد ${meta.label}</h3>
          <p>عدّ المبلغ الفعلي واكتبه، والبرنامج يسجل الفرق كتسوية صندوق.</p>
        </div>
        <div class="cashbox-reconcile-line">
          <span>المتوقع حسب البرنامج</span>
          <strong>${money(expected)}</strong>
        </div>
        <label class="field compact">
          <span>المبلغ الفعلي الموجود</span>
          <input id="cashboxCountedInput" type="number" min="0" step="any" inputmode="decimal" value="${escapeAttr(inputNumberValue(expected))}" />
        </label>
        <div class="cashbox-diff" id="cashboxDiffText">مطابق</div>
        <div class="cashbox-action-buttons">
          <button class="primary-button" type="submit">تثبيت الجرد</button>
          <button class="secondary-button" type="button" data-cashbox-cancel>إلغاء</button>
        </div>
      </form>
    `;
  }

  return "";
}

function bindCashboxActionCard() {
  els.cashOnHandBox.querySelectorAll("[data-cashbox-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      cashboxAction = null;
      render();
    });
  });

  const openingForm = document.getElementById("openingCashForm");
  if (openingForm) openingForm.addEventListener("submit", setOpeningCash);

  const transferForm = document.getElementById("cashTransferForm");
  if (transferForm) {
    ["cashTransferFromInput", "cashTransferToInput", "cashTransferAmountInput"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.addEventListener("input", updateCashTransferPreview);
      if (input) input.addEventListener("change", updateCashTransferPreview);
    });
    updateCashTransferPreview();
    transferForm.addEventListener("submit", transferCashboxFunds);
  }

  const reconcileForm = document.getElementById("reconcileCashForm");
  if (reconcileForm) {
    const input = document.getElementById("cashboxCountedInput");
    const update = () => updateCashboxDiff(reconcileForm);
    if (input) input.addEventListener("input", update);
    update();
    reconcileForm.addEventListener("submit", reconcileCashMethod);
  }
}

function showOpeningCashCard() {
  cashboxAction = { type: "opening" };
  render();
}

function showTransferCashCard() {
  cashboxAction = { type: "transfer", fromMethod: "cash", toMethod: "bank" };
  render();
}

function showReconcileCashCard(method) {
  cashboxAction = { type: "reconcile", method };
  render();
}

function cashMethodLabel(method) {
  return cashMethodMeta.find((item) => item.key === method)?.label || method;
}

function reportPercentText(value) {
  const number = Number(value || 0);
  return `${Number.isFinite(number) ? number.toFixed(1) : "0.0"}%`;
}

function reportCollectionRate(data = {}) {
  const salesTotal = Number(data.salesTotal || 0);
  if (salesTotal <= 0.001) return 0;
  return Math.max(Number(data.paidTotal || 0), 0) / salesTotal * 100;
}

function reportDebtPressure(data = {}) {
  const customerDebt = Math.max(Number(data.customerSummary?.debt || 0), 0);
  if (customerDebt <= 0.001) return 0;
  const salesTotal = Number(data.salesTotal || 0);
  return salesTotal > 0.001 ? customerDebt / salesTotal * 100 : 100;
}

function reportInventoryNet(data = {}) {
  return Number(data.inventorySummary?.net || 0);
}

function reportPurchaseSupplierDebtTotal(data = {}) {
  return (data.purchases || []).reduce((sum, purchase) => {
    return sum + (typeof purchaseSupplierDebt === "function" ? purchaseSupplierDebt(purchase) : 0);
  }, 0);
}

function reportTopSoldItem(itemRows = []) {
  return itemRows
    .slice()
    .filter((row) => Number(row.stats?.qty || 0) > 0.001 || Number(row.stats?.sales || 0) > 0.001)
    .sort((a, b) => Number(b.stats?.qty || 0) - Number(a.stats?.qty || 0) || Number(b.stats?.sales || 0) - Number(a.stats?.sales || 0))[0] || null;
}

function reportLargestOutflow(data = {}, cashbox = {}) {
  const fallback = [
    { label: "مشتريات مدفوعة", amount: data.purchasePaidTotal },
    { label: "تسديد موردين", amount: data.supplierPaymentsTotal },
    { label: "مصروفات عامة", amount: data.expensesTotal },
    { label: "سلف عمال", amount: data.workerTransactionSummary?.advances },
    { label: "قبضات عمال", amount: data.workerTransactionSummary?.salaryPaid },
    { label: "سحب أرباح", amount: data.ownerWithdrawalSummary?.profit },
    { label: "سحب شخصي لشريك", amount: data.ownerWithdrawalSummary?.personal }
  ];
  return (Array.isArray(cashbox.cashOutParts) ? cashbox.cashOutParts : fallback)
    .filter((part) => Number(part.amount || 0) > 0.001)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
}

function reportManagerHealth(data = {}, cashbox = {}) {
  const finalProfit = Number(data.profitWithWorkersPayrollAndInventory || 0);
  const salesTotal = Number(data.salesTotal || 0);
  const collectionRate = reportCollectionRate(data);
  const customerDebt = Math.max(Number(data.customerSummary?.debt || 0), 0);
  const hasSales = salesTotal > 0.001;

  if (finalProfit < -0.001 || (hasSales && collectionRate < 55)) {
    let sentence = `في ضغط واضح: الربح ${money(finalProfit)} والتحصيل ${hasSales ? reportPercentText(collectionRate) : "لا يوجد"}.`;
    if (finalProfit < -0.001) {
      sentence = `الربح النهائي سالب ${money(Math.abs(finalProfit))}؛ راجع المصروفات والدين قبل أي سحب.`;
    } else if (hasSales && collectionRate < 55) {
      sentence = `أقل من نصف المبيعات تقريباً دخلت الصندوق؛ التحصيل يحتاج متابعة اليوم.`;
    }
    return { label: "خطر", tone: "danger", sentence, finalProfit, collectionRate, customerDebt };
  }

  if (!hasSales || finalProfit <= 0.001 || (hasSales && collectionRate < 80)) {
    let sentence = `الصورة مستقرة لكن تحتاج متابعة: التحصيل ${hasSales ? reportPercentText(collectionRate) : "لا يوجد"}.`;
    if (!hasSales) {
      sentence = "لا توجد مبيعات في الفترة المختارة، لذلك الحكم يحتاج فترة فيها حركة.";
    } else if (collectionRate < 80) {
      sentence = `المبيعات موجودة لكن جزء مهم منها لم يدخل الصندوق بعد.`;
    } else if (finalProfit <= 0.001) {
      sentence = "الربح قريب من الصفر؛ أي مصروف إضافي ممكن يقلب الفترة لخسارة.";
    }
    return { label: "انتبه", tone: "warn", sentence, finalProfit, collectionRate, customerDebt };
  }

  return {
    label: "ممتاز",
    tone: "success",
    sentence: `الفترة رابحة والتحصيل من مبيعات الفترة قوي (${reportPercentText(collectionRate)}).`,
    finalProfit,
    collectionRate,
    customerDebt
  };
}

function reportActionInsights(data = {}, cashbox = {}, itemRows = []) {
  const insights = [];
  const add = (tone, title, detail) => {
    if (insights.length >= 5) return;
    if (insights.some((item) => item.title === title)) return;
    insights.push({ tone, title, detail });
  };

  const finalProfit = Number(data.profitWithWorkersPayrollAndInventory || 0);
  const salesTotal = Number(data.salesTotal || 0);
  const collectionRate = reportCollectionRate(data);
  const customerDebt = Math.max(Number(data.customerSummary?.debt || 0), 0);
  const inventoryNet = reportInventoryNet(data);
  const inventoryWaste = Number(data.inventoryWasteTotal || 0);
  const cashIn = Number(cashbox.cashIn || 0);
  const cashOut = Number(cashbox.cashOut || 0);
  const cashNet = Number(cashbox.cashNet || 0);
  const topSold = reportTopSoldItem(itemRows);
  const largestOutflow = reportLargestOutflow(data, cashbox);
  const purchaseSupplierDebtTotal = reportPurchaseSupplierDebtTotal(data);
  const supplierDebtEvents = purchaseSupplierDebtTotal + Number(data.supplierDirectDebtsTotal || 0);
  const supplierCreditEvents = Number(data.supplierCreditNotesTotal || 0) + Number(data.purchaseCreditUsedTotal || 0) + Number(data.supplierReceiptsTotal || 0);
  const workerDueTotal = Number(data.workerDueTotal || 0);

  if (finalProfit < -0.001) {
    add("danger", "الربح النهائي سالب", `الخسارة ${money(Math.abs(finalProfit))} بعد المصروفات والتالف؛ راجع أكبر خروج نقدي.`);
  } else if (finalProfit > 0.001) {
    add("success", "ربح صافي إيجابي", `النتيجة النهائية ${money(finalProfit)} بعد العمال والمصاريف والتالف.`);
  } else {
    add("neutral", "الربح قريب من الصفر", "الفترة متوازنة تقريباً؛ راقب أي مصروف جديد.");
  }

  if (salesTotal > 0.001 && collectionRate < 70) {
    add("danger", "التحصيل منخفض", `دخل الصندوق ${reportPercentText(collectionRate)} فقط من المبيعات؛ تابع فواتير الدين.`);
  } else if (salesTotal > 0.001 && collectionRate >= 90) {
    add("success", "التحصيل قوي", `تم قبض ${reportPercentText(collectionRate)} من مبيعات الفترة.`);
  } else if (salesTotal > 0.001) {
    add("warn", "التحصيل متوسط", `نسبة التحصيل ${reportPercentText(collectionRate)}؛ الأفضل تقليل الدين الجديد.`);
  } else {
    add("neutral", "لا توجد مبيعات بالفترة", "الفترة المختارة لا تحمل فواتير بيع حالياً.");
  }

  if (customerDebt > 0.001) {
    add("warn", "ديون العملاء الحالية", `${money(customerDebt)} رصيد حالي لكل الفترات؛ راجع العملاء أصحاب الأرصدة الأكبر.`);
  } else if (customerDebt <= 0.001 && salesTotal > 0.001) {
    add("success", "لا يوجد دين عملاء ضاغط", "حسابات العملاء الحالية صافية تقريباً.");
  }

  if (inventoryNet < -0.001) {
    add("warn", "فرق جرد بالنقص", `فرق الجرد ${money(Math.abs(inventoryNet))} للمعلومة فقط ولا يغيّر الربح.`);
  } else if (inventoryWaste > 0.001) {
    add("warn", "في تالف مخزون", `التالف المسجل ${money(inventoryWaste)}؛ راجع السبب المتكرر.`);
  } else if (Number(data.inventorySummary?.count || 0) > 0) {
    add("success", "الجرد تحت السيطرة", `فرق الجرد ${money(inventoryNet)} للمعلومة فقط ولا يدخل في الربح.`);
  }

  if (cashOut > cashIn + 0.001) {
    add("danger", "الطالع أعلى من الداخل", `الصندوق صافي ${money(cashNet)}؛ أكبر بند خروج: ${largestOutflow ? largestOutflow.label : "غير محدد"}.`);
  } else if (largestOutflow) {
    add("neutral", "أكبر خروج نقدي", `${largestOutflow.label}: ${money(largestOutflow.amount)}.`);
  }

  if (topSold) {
    add("success", "أقوى صنف مبيع", `${topSold.item?.name || "صنف"} باع ${quantityText(topSold.stats?.qty || 0)} بقيمة ${money(topSold.stats?.sales || 0)}.`);
  }

  if (supplierDebtEvents > 0.001) {
    add("warn", "التزامات موردين جديدة", `دين/مباشر للموردين ${money(supplierDebtEvents)} ضمن الفترة.`);
  } else if (supplierCreditEvents > 0.001) {
    add("success", "رصيد موردين مفيد", `أحداث رصيد أو قبض موردين بقيمة ${money(supplierCreditEvents)}.`);
  }

  if (workerDueTotal > 0.001) {
    add("warn", "مستحق عمال مفتوح", `باقي مستحقات عمال ${money(workerDueTotal)}.`);
  }

  [
    ["neutral", "الصندوق بلا ضغط واضح", "لا يظهر خروج نقدي أعلى من الداخل في الفترة."],
    ["neutral", "لا توجد التزامات بارزة", "ديون الموردين ومستحقات العمال ليست مرتفعة في هذه القراءة."],
    ["neutral", "القراءة جاهزة", "راجع التفاصيل أسفل الصفحة إذا أردت معرفة مصدر كل رقم."]
  ].forEach(([tone, title, detail]) => {
    if (insights.length < 3) add(tone, title, detail);
  });

  return insights.slice(0, 5);
}

function reportMiniStatements(data = {}, cashbox = {}) {
  const saleInvoiceCount = Array.isArray(data.saleInvoices) ? data.saleInvoices.length : 0;
  const averageInvoice = saleInvoiceCount ? Number(data.salesTotal || 0) / saleInvoiceCount : 0;
  const purchaseSupplierDebtTotal = reportPurchaseSupplierDebtTotal(data);
  const supplierObligations = purchaseSupplierDebtTotal + Number(data.supplierDirectDebtsTotal || 0);
  const workerDueTotal = Number(data.workerDueTotal || 0);
  const inventoryNet = reportInventoryNet(data);

  return [
    {
      title: "المبيعات",
      tone: "sales",
      value: money(data.salesTotal),
      rows: [
        ["مدفوع", money(data.paidTotal)],
        ["دين", Number(data.debtTotal || 0) > 0.001 ? money(data.debtTotal) : "لا يوجد"],
        ["متوسط الفاتورة", saleInvoiceCount ? money(averageInvoice) : "لا يوجد"]
      ]
    },
    {
      title: "الصندوق",
      tone: Number(cashbox.cashNet || 0) >= 0 ? "success" : "danger",
      value: money(cashbox.cashNet),
      rows: [
        ["داخل", money(cashbox.cashIn)],
        ["طالع", money(cashbox.cashOut)],
        ["الصافي", `${Number(cashbox.cashNet || 0) >= 0 ? "+" : "−"}${money(Math.abs(Number(cashbox.cashNet || 0)))}`]
      ]
    },
    {
      title: "التزامات",
      tone: supplierObligations + workerDueTotal > 0.001 ? "warn" : "neutral",
      value: supplierObligations + workerDueTotal > 0.001 ? money(supplierObligations + workerDueTotal) : "لا يوجد",
      rows: [
        ["موردين/مباشر", supplierObligations > 0.001 ? money(supplierObligations) : "لا يوجد"],
        ["مستحق عمال", workerDueTotal > 0.001 ? money(workerDueTotal) : "لا يوجد"],
        ["مشتريات مدفوعة", Number(data.purchasePaidTotal || 0) > 0.001 ? money(data.purchasePaidTotal) : "لا يوجد"]
      ]
    },
    {
      title: "الجرد",
      tone: inventoryNet < -0.001 ? "danger" : inventoryNet > 0.001 ? "success" : "neutral",
      value: money(inventoryNet),
      rows: [
        ["عمليات جرد", quantityText(data.inventorySummary?.count || 0)],
        ["تالف", Number(data.inventoryWasteTotal || 0) > 0.001 ? money(data.inventoryWasteTotal) : "لا يوجد"],
        ["الفرق (للمعرفة فقط)", money(inventoryNet)]
      ]
    }
  ];
}

function renderManagerKpi({ label, value, tone = "neutral", note = "" }) {
  return `
    <article class="manager-kpi is-${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
      ${note ? `<small>${note}</small>` : ""}
    </article>
  `;
}

function renderManagerInsight(insight) {
  return `
    <article class="manager-insight is-${insight.tone || "neutral"}">
      <strong>${escapeHtml(insight.title || "")}</strong>
      <small>${escapeHtml(insight.detail || "")}</small>
    </article>
  `;
}

function renderMiniStatement(statement) {
  return `
    <article class="mini-statement-card is-${statement.tone || "neutral"}">
      <header>
        <span>${escapeHtml(statement.title || "")}</span>
        <strong>${statement.value}</strong>
      </header>
      <div class="mini-statement-lines">
        ${(statement.rows || []).map(([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${value}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderManagerCommandCenter(health, kpis, insights) {
  return `
    <section class="manager-command-center is-${health.tone}" aria-label="مركز المدير">
      <div class="manager-command-head">
        <div>
          <span class="manager-command-kicker">مركز المدير</span>
          <h3>قراءة القرار</h3>
          <p>${escapeHtml(health.sentence)}</p>
        </div>
        <strong class="manager-health-badge is-${health.tone}">${escapeHtml(health.label)}</strong>
      </div>
      <div class="manager-kpis">
        ${kpis.map(renderManagerKpi).join("")}
      </div>
      <div class="manager-insights">
        ${insights.map(renderManagerInsight).join("")}
      </div>
    </section>
  `;
}

function updateCashTransferPreview() {
  const fromInput = document.getElementById("cashTransferFromInput");
  const toInput = document.getElementById("cashTransferToInput");
  const amountInput = document.getElementById("cashTransferAmountInput");
  const preview = document.getElementById("cashTransferPreview");
  if (!fromInput || !toInput || !amountInput || !preview) return;

  const fromMethod = paymentMethods.includes(fromInput.value) ? fromInput.value : "cash";
  if (toInput.value === fromMethod) {
    toInput.value = paymentMethods.find((method) => method !== fromMethod) || "bank";
  }
  const toMethod = paymentMethods.includes(toInput.value) ? toInput.value : "bank";
  const amount = Math.max(Number(amountInput.value || 0), 0);
  const box = cashOnHand();
  const fromCurrent = Number(box.methods[fromMethod]?.current || 0);
  const toCurrent = Number(box.methods[toMethod]?.current || 0);
  const hasAmount = amount > 0.001;
  const fromAfter = fromCurrent - amount;
  const toAfter = toCurrent + amount;

  preview.classList.toggle("is-warning", hasAmount && fromAfter < -0.001);
  preview.innerHTML = hasAmount
    ? `
      <span>${cashMethodLabel(fromMethod)}: ${money(fromCurrent)} ← ${money(fromAfter)}</span>
      <span>${cashMethodLabel(toMethod)}: ${money(toCurrent)} ← ${money(toAfter)}</span>
    `
    : `<span>اكتب المبلغ حتى يظهر تأثير التحويل.</span>`;
}

function transferCashboxFunds(event) {
  event.preventDefault();
  const fromMethod = document.getElementById("cashTransferFromInput")?.value || "cash";
  const toMethod = document.getElementById("cashTransferToInput")?.value || "bank";
  const amount = Number(document.getElementById("cashTransferAmountInput")?.value || 0);
  const note = document.getElementById("cashTransferNoteInput")?.value?.trim() || "";

  if (!paymentMethods.includes(fromMethod) || !paymentMethods.includes(toMethod)) {
    showToast("اختار طريقة التحويل بشكل صحيح.");
    return;
  }
  if (fromMethod === toMethod) {
    showToast("اختار وجهة مختلفة عن المصدر.");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("اكتب مبلغ تحويل صحيح.");
    return;
  }

  const box = cashOnHand();
  const fromCurrent = Number(box.methods[fromMethod]?.current || 0);
  if (amount > fromCurrent + 0.001) {
    showToast(`رصيد ${cashMethodLabel(fromMethod)} لا يكفي. إذا الرقم الحقيقي مختلف اعمل جرد للصندوق أولاً.`);
    return;
  }

  const entry = normalizeCashTransfer({
    id: uid("cashtransfer"),
    fromMethod,
    toMethod,
    amount,
    note,
    createdAt: new Date().toISOString()
  });
  state.cashTransfers = state.cashTransfers || [];
  state.cashTransfers.push(entry);
  cashboxAction = null;
  saveState();
  showToast(`تم تحويل ${money(amount)} من ${cashMethodLabel(fromMethod)} إلى ${cashMethodLabel(toMethod)}.`);
  render();
}

function setOpeningCash(event) {
  event.preventDefault();
  const opening = normalizeOpeningCash(state.openingCash);
  const next = { ...opening };
  for (const { key, label } of cashMethodMeta) {
    const input = event.currentTarget.querySelector(`[data-opening-cash="${key}"]`);
    const raw = input?.value || "0";
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) { showToast(`قيمة ${label} غير صحيحة.`); return; }
    next[key] = value;
  }
  state.openingCash = next;
  cashboxAction = null;
  saveState();
  showToast("تم تحديث رأس المال.");
  render();
}

function updateCashboxDiff(form) {
  const expected = Number(form.dataset.expected || 0);
  const counted = Number(document.getElementById("cashboxCountedInput")?.value || 0);
  const diff = counted - expected;
  const diffText = document.getElementById("cashboxDiffText");
  if (!diffText) return;
  diffText.classList.toggle("is-negative", diff < -0.001);
  diffText.classList.toggle("is-positive", diff > 0.001);
  diffText.textContent = Math.abs(diff) <= 0.001
    ? "مطابق"
    : diff > 0
      ? `زيادة ${money(diff)}`
      : `نقص ${money(Math.abs(diff))}`;
}

function reconcileCashMethod(event) {
  event.preventDefault();
  const method = event.currentTarget.dataset.method;
  const meta = cashMethodMeta.find((m) => m.key === method);
  if (!meta) return;
  const expected = Number(event.currentTarget.dataset.expected || 0);
  const raw = document.getElementById("cashboxCountedInput")?.value || "";
  const counted = Number(raw);
  if (!Number.isFinite(counted) || counted < 0) { showToast("اكتب رقم صحيح."); return; }
  const diff = counted - expected;
  if (Math.abs(diff) <= 0.001) {
    cashboxAction = null;
    showToast(`${meta.label} مطابق.`);
    render();
    return;
  }
  const sign = diff > 0 ? "زيادة" : "نقص";
  state.cashAdjustments = state.cashAdjustments || [];
  state.cashAdjustments.push({
    id: uid("cashadj"),
    method,
    diff,
    counted,
    expected,
    createdAt: new Date().toISOString()
  });
  cashboxAction = null;
  saveState();
  showToast(`تم تثبيت ${meta.label} على ${money(counted)} (${sign} ${money(Math.abs(diff))}).`);
  render();
}

function cafeHandoverHtml(range, options = {}) {
  const report = cafeHandoverData(range);
  const { meeting, data } = report;
  const text = (value) => escapeHtml(String(value ?? ""));
  const date = (value) => value ? formatDate(value) : "غير مسجل";
  const method = (entry) => paymentLabels[entry.method] || entry.method || "غير مسجل";
  const sum = (entries) => entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const sorted = (entries) => entries.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const table = (headers, rows) => rows.length ? `<div class="handover-table-wrap"><table class="handover-table"><thead><tr>${headers.map((label) => `<th scope="col">${text(label)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((cell, index) => `<td data-label="${text(headers[index])}"><span>${text(cell)}</span></td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="handover-empty">لا توجد سجلات في هذا القسم.</p>';
  const section = (title, count, body) => `<details class="handover-section"${options.full ? " open" : ""}><summary>${text(title)}${options.full && count != null ? ` <span>(${text(quantityText(count))})</span>` : ""}</summary>${body}</details>`;
  const note = (value) => `<p class="handover-note">${text(value)}</p>`;
  const metric = (label, amount) => `<div><span>${text(label)}</span><strong>${money(amount)}</strong></div>`;
  const expenseRows = (entries) => sorted(entries).map((entry) => [date(entry.createdAt), entry.title || "مصروف", expenseCategoryLabel(entry), expensePurposeLabel(entry), money(entry.amount), method(entry), entry.note || ""]);
  const expenseHeaders = ["التاريخ", "ما تم دفعه", "التصنيف", "الغرض", "المبلغ", "طريقة الدفع", "ملاحظة"];
  const workerName = (entry) => entry.workerName || getWorker(entry.workerId)?.name || "عامل غير محدد";
  const workerRows = (entries) => sorted(entries).map((entry) => [date(entry.createdAt), workerName(entry), workerTransactionTypeLabel(entry.type), money(entry.amount), method(entry), entry.note || ""]);
  const transactionHeaders = ["التاريخ", "الاسم", "نوع الحركة", "المبلغ", "طريقة الدفع", "ملاحظة"];
  const partnerName = (entry) => entry.partnerName || getPartner(entry.partnerId)?.name || "شريك غير محدد";
  const partnerWorkerIds = new Set(meeting.partners.map((row) => row.partner.workerId).filter(Boolean));
  const partnerTransactions = data.workerTransactions.filter((entry) => partnerWorkerIds.has(entry.workerId));
  const partnerConsumptions = data.workerConsumptions.filter((entry) => partnerWorkerIds.has(entry.workerId));
  const payrollBody = note(`أجور من صفحة المصاريف: ${money(sum(report.wages))} · قبضات رواتب من حسابات العمال: ${money(sum(report.salaries))}. السلف والدفعات الواردة معروضة منفصلة. إذا سُجلت دفعة واحدة في المصدرين، راجع التكرار قبل التسليم.`)
    + '<h4>أجور مسجلة كمصاريف، بما فيها أجور التجهيز والتوسعة</h4>' + table(expenseHeaders, expenseRows(report.wages))
    + '<h4>قبضات الرواتب</h4>' + table(transactionHeaders, workerRows(report.salaries))
    + '<h4>سلف العمال</h4>' + table(transactionHeaders, workerRows(report.advances))
    + '<h4>دفعات واردة من العمال</h4>' + table(transactionHeaders, workerRows(report.receipts));
  const purchaseRows = sorted(data.purchases).map((entry) => [date(entry.createdAt), `${entry.number || entry.id || "فاتورة شراء"}\n${entry.supplier || "بدون مورد"}`, `قبل الخصم: ${money(purchaseSubtotal(entry))}\nالخصم: ${money(purchaseDiscount(entry))}\nالصافي: ${money(purchaseAmount(entry))}`, purchasePaymentText(entry), money(purchaseSupplierCreditUsed(entry)), money(purchaseSupplierDebt(entry)), entry.note || ""]);
  const purchaseItems = sorted(data.purchases).flatMap((entry) => purchaseLines(entry).map((line) => [entry.number || entry.id || "فاتورة شراء", line.item || line.linkedItemName || "مادة", quantityWithUnit(line.qty, line.unit), quantityWithUnit(line.stockQty, line.stockUnit), money(line.amount || 0)]));
  const cancelled = report.invoices.filter(invoiceIsCancelled);
  const invoiceTypes = { sale: "بيع", payment: "تسديد عميل", payout: "رد رصيد لعميل" };
  const invoiceRows = sorted(report.invoices).map((entry) => [date(entry.createdAt), entry.number || entry.id || "فاتورة", entry.customerName || "نقدي", invoiceIsCancelled(entry) ? "ملغاة" : (invoiceTypes[entry.type] || entry.type || "حركة"), money(entry.total || 0), money(entry.paid || 0), entry.note || ""]);
  const soldItems = sorted(data.saleInvoices).flatMap((entry) => (entry.items || []).map((line) => [entry.number || entry.id || "فاتورة", line.name || "صنف", quantityText(line.qty), money(invoiceLineNet(entry, line))]));
  const consumptionRows = (entries) => sorted(entries).map((entry) => [date(entry.createdAt), workerName(entry), entry.itemName || "صنف", workerConsumptionTypeLabel(entry.type), quantityText(entry.qty), money(entry.total || 0), money(entry.costTotal || 0)]);
  const consumptionHeaders = ["التاريخ", "الاسم", "الصنف", "نوع الاستهلاك", "الكمية", "القيمة المسجلة", "التكلفة"];
  const partnerRows = meeting.partners.map((entry) => [entry.partner.name, money(entry.funding.capital), money(entry.funding.refundableDeposited), money(entry.workerReceipts), money(entry.cashTaken), money(entry.products)]);
  const partnerLedger = sorted(data.partnerFundingTransactions.concat(data.ownerWithdrawals)).map((entry) => [date(entry.createdAt), partnerName(entry), entry.type ? partnerFundingTypeLabel(entry.type) : ownerWithdrawalTypeLabel(ownerWithdrawalKind(entry)), money(entry.amount), method(entry), entry.note || ""]);
  const stockRows = report.stock.map((entry) => [entry.name, quantityWithUnit(entry.stockQty, entry.stockUnit), money(entry.cost || 0), money(purchaseInventoryStockValue(entry)), `${entry.hidden ? "مخفية بالقائمة · " : ""}${purchaseInventoryAvailabilityLabel(entry.availabilityStatus)}`]);
  const wasteRows = sorted(data.inventoryWaste).map((entry) => [date(entry.createdAt), entry.itemName || "مادة", quantityWithUnit(entry.qty, entry.unit), money(entry.totalCost || 0), entry.reason || ""]);
  const ledgerRows = report.cashEntries.map((entry) => [date(entry.date), entry.direction === "in" ? "داخل" : entry.direction === "out" ? "خارج" : "تحويل داخلي", entry.category, entry.direction === "transfer" ? `${cashMethodLabel(entry.fromMethod)} إلى ${cashMethodLabel(entry.toMethod)}` : cashMethodLabel(entry.method), money(entry.amount), entry.description]);
  const expenseBreakdown = report.expenseBreakdown.length
    ? report.expenseBreakdown.map((entry) => `<div><span>${text(entry.label)}</span><strong>${money(entry.amount)}</strong></div>`).join("")
    : '<p class="handover-empty">لا توجد مصاريف تشغيل في الفترة.</p>';
  return `<article class="handover-report" dir="rtl">
    <header><h2>${text(businessName())}</h2><p><strong>${text(rangeText(range))}</strong></p><p class="handover-note">تقرير تسليم أُعدّ بتاريخ ${text(date(new Date().toISOString()))}. الحركات تتبع الفترة المختارة؛ الأرصدة والمخزون الحاليان يعكسان وقت إعداد التقرير.</p></header>
    <h3 class="handover-heading">خلال الفترة المختارة</h3>
    <div class="handover-totals">${metric("بعنا", data.salesTotal)}${metric("اشترينا بضاعة", data.purchasesTotal)}${metric("مصاريف تشغيل", report.operatingTotal)}${metric("دفعنا تجهيزات", report.equipmentTotal)}${metric("دفعنا للعمال", report.workersPaidTotal)}${metric("أخذ الشركاء", report.partnersTakenTotal)}</div>
    <section class="handover-expense-summary"><h4>تفصيل مصاريف التشغيل</h4><div class="handover-expense-breakdown">${expenseBreakdown}</div></section>
    <section class="handover-net ${report.netSummaryTotal >= 0 ? "is-positive" : "is-negative"}"><div><span>صافي الحسبة للفترة</span><small>المبيعات ناقص البضاعة والمصاريف والتجهيزات والعمال والشركاء</small></div><strong>${money(report.netSummaryTotal)}</strong></section>
    <h3 class="handover-heading">الرصيد الحالي</h3>
    <div class="handover-totals handover-current">${metric("الموجود معنا الآن", meeting.onHand.total.current)}</div>
    ${note("صافي الحسبة يجمع البنود الظاهرة أعلاه، لكنه ليس رصيد الصندوق ولا الربح المحاسبي لأن المبيعات والمشتريات تشمل الدين. دفعات العمال تشمل الأجور والرواتب والسلف لغير الشركاء. ما أخذه الشركاء يشمل السحوبات والسلف والرواتب ورد التمويل، ولا يشمل الأصناف غير النقدية. الموجود الآن يشمل النقد والبنك والمحفظة.")}
    ${report.review.length ? note(`تحتاج مراجعة: ${report.review.length} حركة بتصنيف تجهيزات وغرض تشغيل، قيمتها ${money(sum(report.review))}. بقيت ضمن التشغيل حسب الغرض المسجل.`) : ""}
    <h3 class="handover-heading">التفاصيل</h3>
    ${section("ملاحظات الحساب", null, note("التجهيزات بقيمة الإنفاق المسجل وليست تقييماً لسعر بيعها أو إثباتاً بأنها ما زالت موجودة. مشتريات البضاعة تشمل المدفوع والدين؛ قيمتها تختلف عن المخزون المتبقي. تفاصيل الأقسام أدناه لا تُجمع مرة ثانية مع الملخص.") + note(`سلف العمال، دون سلف الشركاء: ${money(report.advancesTotal)} · تسديدات لاحقة للموردين: ${money(data.supplierPaymentsTotal)}.`))}
    ${section("التجهيزات والمعدات والتوسعة", report.equipment.length, table(expenseHeaders, expenseRows(report.equipment)))}
    ${section("مشتريات البضاعة", data.purchases.length, table(["التاريخ", "الفاتورة والمورد", "قيمة الفاتورة", "الدفع وقت الشراء", "رصيد سابق مستخدم", "دين جديد", "ملاحظة"], purchaseRows) + '<h4>مواد كل فاتورة</h4>' + note("قيمة السطر كما سُجلت؛ إجمالي الفاتورة أعلاه هو المعتمد بعد الخصم. الكميات بوحداتها ولا تُجمع وحدات مختلفة.") + table(["الفاتورة", "المادة", "كمية الشراء", "كمية المخزون المضافة", "قيمة السطر"], purchaseItems))}
    ${section("أجور العمال والرواتب والسلف", report.wages.length + report.salaries.length + report.advances.length + report.receipts.length, payrollBody)}
    ${section("باقي مصاريف التشغيل", report.operations.length, table(expenseHeaders, expenseRows(report.operations)))}
    ${section("البيع وفواتير العملاء", report.invoices.length, note(`مبيعات ${money(data.salesTotal)} · المقبوض وقت البيع ${money(data.paidTotal)} · تسديدات منفصلة ${money(meeting.cash.paymentsReceived)} · فواتير ملغاة ${cancelled.length} مستبعدة من الإجماليات.`) + table(["التاريخ", "الفاتورة", "العميل", "النوع أو الحالة", "قيمة الفاتورة", "المدفوع", "ملاحظة"], invoiceRows) + '<h4>الأصناف المباعة، تشمل البيع بالدين</h4>' + table(["الفاتورة", "الصنف", "الكمية", "قيمة البيع بعد الخصم"], soldItems))}
    ${section("الموردون: الدفعات وحركات الحساب", data.supplierTransactions.length, table(["التاريخ", "المورد", "نوع الحركة", "المبلغ", "طريقة الدفع", "ملاحظة"], sorted(data.supplierTransactions).map((entry) => [date(entry.createdAt), entry.supplier, supplierTransactionTypeLabels[entry.type] || entry.type, money(entry.amount), method(entry), entry.note || ""])))}
    ${section("الشركاء: ما دفعوه وما أخذوه", meeting.partners.length, table(["الشريك", "زيادة رأس مال", "تمويل مسترد دخل", "دفعات بحساب العامل", "النقد الذي أخذه", "استهلاك محسوب من الحصة"], partnerRows) + note("النقد الذي أخذه الشريك يشمل السحوبات والسلف والراتب ورد التمويل. الراتب ظاهر أيضاً بكشف الأجور كمرجع لنفس الحركة. التمويل ليس مبيعات أو ربحاً.") + '<h4>حركات التمويل والسحب</h4>' + table(transactionHeaders, partnerLedger) + '<h4>حركات الشركاء المسجلة بحساب العامل</h4>' + table(transactionHeaders, workerRows(partnerTransactions)) + '<h4>استهلاك الشركاء</h4>' + table(consumptionHeaders, consumptionRows(partnerConsumptions)))}
    ${section("استهلاك العمال", data.workerConsumptions.length - partnerConsumptions.length, table(consumptionHeaders, consumptionRows(data.workerConsumptions.filter((entry) => !partnerWorkerIds.has(entry.workerId)))))}
    ${section("المخزون والتالف والجرد", report.stock.length, note("المخزون أدناه هو الرصيد الحالي لكل الفترات بحسب البرنامج، بما فيه المواد المخفية والموقوفة. القيمة حسب تكلفة المخزون المسجلة، وقد تظهر كميات سالبة تحتاج جرداً فعلياً.") + table(["المادة", "الموجود الآن", "تكلفة الوحدة بالمخزون", "القيمة المسجلة", "الحالة"], stockRows) + '<h4>مخزون سابق أُدخل يدوياً ضمن الفترة، ليس فاتورة شراء</h4>' + table(["التاريخ", "المادة", "الكمية المدخلة", "تكلفة الوحدة", "ملاحظة"], sorted(report.manualStock).map((entry) => [date(entry.createdAt), entry.name, quantityWithUnit(entry.stockQty, entry.stockUnit), money(entry.cost), entry.note || ""])) + '<h4>التالف خلال الفترة</h4>' + table(["التاريخ", "المادة", "الكمية", "التكلفة", "السبب"], wasteRows) + '<h4>محاضر الجرد خلال الفترة</h4>' + table(["التاريخ", "المحضر", "صافي فرق الجرد", "ملاحظة"], sorted(data.inventoryCounts).map((entry) => [date(entry.createdAt), entry.number || entry.id, money(inventoryCountValue(entry).net), entry.note || ""])))}
    ${section("الأرصدة الحالية عند إعداد التقرير", report.customerPositions.length + report.supplierPositions.length + report.workers.length, note("هذه أرصدة وقت إعداد التقرير، حتى لو كانت فترة الحركات المختارة قديمة. مستحقات العامل تتبع فترة حسابه المبينة بجانبه.") + table(["الحساب", "الرصيد الحالي"], paymentMethods.map((key) => [paymentLabels[key], money(meeting.onHand.methods[key].current)]).concat([["إجمالي الفلوس", money(meeting.onHand.total.current)]])) + '<h4>حسابات العملاء</h4>' + table(["العميل", "عليه للكافيه", "له عند الكافيه"], report.customerPositions.map((entry) => [entry.name, money(Math.max(Number(entry.balance), 0)), money(Math.max(-Number(entry.balance), 0))])) + '<h4>حسابات الموردين</h4>' + table(["المورد", "علينا للمورد", "لنا عند المورد"], report.supplierPositions.map((entry) => [entry.supplier, money(entry.debt), money(entry.credit)])) + '<h4>حسابات العمال</h4>' + table(["العامل", "فترة حسابه", "مستحق له", "رصيد عليه", "الصفة"], report.workers.map(({worker, account, isPartner}) => [worker.name, `${account.range.minDate || "البداية"} إلى ${account.range.maxDate || "اليوم"}`, money(Math.max(account.due, 0)), money(Math.max(-account.due, 0)), isPartner ? "مرتبط بشريك" : "عامل"])) + '<h4>تمويل الشركاء الحالي</h4>' + table(["الشريك", "تمويل مسترد متبقٍ له", "مساهمات رأس المال المسجلة"], meeting.partners.map((entry) => [entry.partner.name, money(entry.currentFunding.outstandingRefundable), money(entry.currentFunding.capital)])))}
    ${section("حركات الصندوق التفصيلية", report.cashEntries.length, note(`المقبوض من البيع ${money(salesCashSummary(range).total)}، وتفاصيل فواتيره في قسم البيع. الجدول التالي يضم باقي الحركات؛ التحويل بين الحسابات لا يمثل دخلاً أو مصروفاً جديداً.`) + table(["التاريخ", "الاتجاه", "نوع الحركة", "الحساب", "المبلغ", "التفصيل"], ledgerRows))}
    ${section("طلبات مفتوحة لم تُفوتر بعد", report.openOrders.length, table(["الطاولة", "الأصناف والكميات"], report.openOrders.map(([key, order]) => [state.tableNames?.[key] || key, (order.items || []).map((item) => `${item.name || "صنف"}: ${quantityText(item.qty)}`).join("\n")]))) }
    <footer class="handover-signatures"><p>اسم المسلّم: ____________________</p><p>اسم المستلم: ____________________</p><p>تاريخ التسليم والتوقيع: ____________________</p></footer>
  </article>`;
}

function cafeHandoverDocument(range) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>تقرير تسليم الكافيه</title><style>
  body{font:14px Tahoma,Arial,sans-serif;color:#17282d;background:#fff;margin:20px;line-height:1.7}h1,h2{font-size:20px}h3,h4,summary{font-size:16px}summary{font-weight:bold;padding:14px 0}details{border-top:1px solid #ccd7d7;margin-top:20px}.handover-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.handover-totals div{padding:12px;background:#f0f5f4}.handover-totals span,.handover-totals strong{display:block}.handover-totals strong{font-size:20px}.handover-note{color:#536368;font-size:13px}.handover-expense-summary{padding:10px 12px;background:#f0f5f4}.handover-expense-summary h4{margin:0 0 8px}.handover-expense-breakdown{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px 18px}.handover-expense-breakdown div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #ccd7d7;padding:4px 0}.handover-net{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:16px 0;padding:14px 16px;border-right:4px solid #257048;background:#f0f5f4}.handover-net span,.handover-net small{display:block}.handover-net small{color:#536368}.handover-net strong{font-size:22px}.handover-net.is-negative{border-color:#b23b30}.handover-net.is-negative strong{color:#b23b30}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #ccd7d7;padding:8px;text-align:right;overflow-wrap:anywhere;vertical-align:top;white-space:pre-line}thead{background:#edf3f1}.handover-table-wrap{overflow:auto}.handover-signatures{margin-top:28px;border-top:1px solid #ccd7d7} @media(max-width:700px){table,tbody,tr,td{display:block}thead{display:none}tr{border-bottom:2px solid #ccd7d7;margin-bottom:12px}td{display:grid;grid-template-columns:minmax(0,42%) minmax(0,58%)}td:before{content:attr(data-label);font-weight:bold}body{margin:12px}} @media print{body{margin:0;font-size:10px}table{font-size:9px}tr{break-inside:avoid}thead{display:table-header-group}summary,h4{break-after:avoid}.handover-table-wrap{overflow:visible}.handover-signatures{break-inside:avoid}}
  @media print{table{display:table}tbody{display:table-row-group}tr{display:table-row;margin:0}td{display:table-cell}td:before{display:none}}
  </style></head><body><h1>تقرير تسليم الكافيه</h1>${cafeHandoverHtml(range, {full:true})}</body></html>`;
}

function printCafeHandover() {
  if (!isManagerMode()) return;
  const host = document.createElement("div");
  host.className = "print-host";
  host.innerHTML = `<div class="print-invoice"><h1>تقرير تسليم الكافيه</h1>${cafeHandoverHtml(selectedReportRange(), {full:true})}</div>`;
  document.body.appendChild(host);
  try { window.print(); } finally { host.remove(); }
}

function saveCafeHandover() {
  if (!isManagerMode()) return;
  const blob = new Blob([cafeHandoverDocument(selectedReportRange())], {type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cafe-handover-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 1000);
  showToast("تم تجهيز نسخة ثابتة من التقرير للحفظ، تشمل كل تفاصيل الفترة والأرصدة وقت إعدادها.");
}

function partnerMeetingHtml(range) {
  const report = partnerMeetingData(range);
  const { data, partners, cash, onHand, distribution } = report;
  const shareBasis = distribution.basis === "profit" ? "الربح حسب إعداد توزيع الشركاء" : distribution.source === "onHand" ? "الفلوس الموجودة حالياً بعد حماية تمويل الشركاء" : "صافي حركة الفترة بعد فصل تمويل الشركاء";
  const row = (label, amount) => `<tr${/^(إجمالي|نتيجة|صافي|المتبقي|رصيد الحصة|المتاح)/.test(label) ? ' class="meeting-total"' : ""}><th scope="row">${escapeHtml(label)}</th><td>${money(amount)}</td></tr>`;
  const block = (title, rows) => `<section class="meeting-section"><h3>${escapeHtml(title)}</h3><table class="statement-table"><tbody>${rows.map(([label, value]) => row(label, value)).join("")}</tbody></table></section>`;
  const funding = data.partnerFundingSummary;
  const ledger = (entries) => entries.length ? `<table class="statement-table meeting-ledger"><thead><tr><th>التاريخ</th><th>الحركة</th><th>المبلغ</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${escapeHtml(formatDate(entry.createdAt))}</td><td>${escapeHtml(entry.label)}</td><td>${money(entry.amount)}</td></tr>`).join("")}</tbody></table>` : "<p>لا توجد حركات ضمن الفترة.</p>";
  return `<div class="partner-meeting" dir="rtl">
    <p><strong>${escapeHtml(rangeText(range))}</strong></p>
    <p class="meeting-note">أُعدّ بتاريخ ${escapeHtml(formatDate(new Date().toISOString()))}. حركات الفترة أدناه تتبع التاريخ المختار، والأرصدة الحالية موضحة في قسم مستقل.</p>
    <div class="meeting-columns">
      ${block("بعنا وقبضنا", [["إجمالي البيع، يشمل البيع بالدين", data.salesTotal], ["المقبوض وقت البيع", data.paidTotal], ["بيع خُصم من أرصدة العملاء", data.customerOffsetTotal], ["دين جديد من مبيعات الفترة", data.debtTotal], ["تسديدات العملاء المنفصلة", cash.paymentsReceived], ["إجمالي المقبوض من العملاء", data.paidTotal + cash.paymentsReceived]])}
      ${block("اشترينا", [["قيمة المشتريات بعد الخصم", data.purchasesTotal], ["خصومات المشتريات", data.purchaseDiscountTotal], ["المدفوع وقت الشراء", data.purchasePaidTotal], ["رصيد سابق مستخدم عند المورد", data.purchaseCreditUsedTotal], ["دين جديد على المشتريات", report.purchaseDebt], ["دفع زائد أصبح رصيداً عند المورد", report.purchaseOverpayment], ["دفعات لاحقة للموردين", data.supplierPaymentsTotal], ["مبالغ رجعت من الموردين", data.supplierReceiptsTotal]])}
      ${block("تشغيل الكافيه", [["مصاريف التشغيل المسجلة", data.operatingExpensesTotal], ["سلف وقبضات العمال، دون سلف الشركاء", report.workerOperatingOut], ["إجمالي المدفوع للتشغيل والعمال", data.operatingExpensesTotal + report.workerOperatingOut], ["تكلفة الأصناف المباعة", data.itemCost], ["تالف المخزون", data.inventoryWasteTotal], ["نتيجة التشغيل بعد التكلفة والمدفوع للعمال والجرد", report.operatingProfit]])}
      ${block("تجهيزات وتوسعة المشروع وتمويله", [["المنفق على التجهيزات والتوسعة", data.renovationExpensesTotal], ["زيادة رأس المال من الشركاء", funding.capital], ["تمويل مسترد أدخله الشركاء", funding.refundableDeposited], ["تمويل رجع للشركاء", funding.refunded]])}
    </div>
    <p class="meeting-note">مشتريات المخزون تظهر بقيمتها، وتدخل تكلفة المباع فقط في نتيجة التشغيل. التجهيزات والتوسعة معروضة كإنفاق على المشروع. تمويل الشركاء وسلفهم منفصلة عن نتيجة التشغيل. النتيجة تشمل البيع بالدين وتعتمد المدفوع للعمال؛ ليست المبلغ الجاهز للتوزيع.</p>
    ${block("حركة الفلوس خلال الفترة", [["إجمالي الداخل، يشمل تمويل الشركاء", cash.cashIn], ["إجمالي الخارج، يشمل السحوبات والتجهيزات", cash.cashOut], ["صافي حركة الفترة", cash.cashNet]])}
    <h3>كل شريك: كم دفع وكم أخذ خلال الفترة</h3>
    <p class="meeting-note">حساب الحصص يتبع إعداد التوزيع الحالي: ${shareBasis}. ${distribution.basis === "profit" ? "قد يتضمن أرباحاً لم تُقبض بعد." : "المتاح للدفع يظهر منفصلاً عن المتبقي من الحصة."}</p>
    ${partners.length && Math.abs(distribution.totalSharePercent - 100) > 0.001 ? `<p class="meeting-note">مجموع نسب الشركاء ${quantityText(distribution.totalSharePercent)}%؛ راجع النسب قبل اعتماد التوزيع.</p>` : ""}
    ${partners.length ? partners.map((entry) => {
      const entries = entry.fundingEntries.map((item) => ({ ...item, label: partnerFundingTypeLabel(item.type) }))
        .concat(data.ownerWithdrawals.filter((item) => item.partnerId === entry.partner.id).map((item) => ({ ...item, label: ownerWithdrawalTypeLabel(ownerWithdrawalKind(item)) })))
        .concat(entry.workerEntries.map((item) => ({ ...item, label: workerTransactionTypeLabel(item.type) })))
        .concat(data.workerConsumptions.filter((item) => entry.partner.workerId && item.workerId === entry.partner.workerId && item.type === SALARY_WORKER_CONSUMPTION_TYPE).map((item) => ({ ...item, amount: item.total, label: `مشروبات وأصناف: ${item.itemName || ""}` })))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return `<section class="meeting-partner"><h4>${escapeHtml(entry.partner.name)} · ${quantityText(entry.partner.sharePercent)}%</h4><div class="meeting-columns">
        ${block("دفع للكافيه", [["زيادة رأس مال", entry.funding.capital], ["تمويل مسترد", entry.funding.refundableDeposited], ["دفعات مسجلة بحساب العامل", entry.workerReceipts], ["إجمالي ما أدخله", entry.paidIn]])}
        ${block("أخذ من الكافيه", [["سحب أرباح", entry.profitWithdrawals], ["سحب شخصي", entry.personalWithdrawals], ["سلف من حساب العامل", entry.advances], ["قبض راتب من حساب العامل", entry.salaryPaid], ["تمويل رجع له", entry.funding.refunded], ["إجمالي النقد الذي أخذه", entry.cashTaken], ["مشروبات وأصناف على حسابه، غير نقدية", entry.products], ["المحسوب من حصته: سحوبات وسلف وأصناف", entry.shareDeductions]])}
        </div>
        ${block("حساب الحصة حسب إعداد التوزيع الحالي", [["الحصة قبل الخصم", entry.share.shareAmount], ["مسحوبات زائدة مرحّلة من قبل الفترة", entry.share.carryInDebt], ["المخصوم خلال الفترة", entry.shareDeductions], [entry.share.remaining >= 0 ? "المتبقي من الحصة" : "رصيد الحصة بالسالب", Math.abs(entry.share.remaining)], ...(distribution.basis === "cash" ? [["المتاح للدفع من الفلوس", entry.share.boxPayout]] : [])])}
        ${entry.share.remaining < 0 ? '<p class="meeting-note">الرصيد السالب قد ينتج عن عجز الفترة أو الخصومات والمرحل السابق؛ النقد الذي أخذه فعلياً موضح أعلاه.</p>' : ""}
        <p>تمويل مسترد متبقٍ له حالياً، كل الفترات: <strong>${money(entry.currentFunding.outstandingRefundable)}</strong> · إجمالي مساهماته المسجلة برأس المال، كل الفترات: <strong>${money(entry.currentFunding.capital)}</strong></p>
        ${entry.workerReceipts ? '<p class="meeting-note">دفعات حساب العامل معروضة منفصلة؛ لم تُصنف تلقائياً كزيادة رأس مال أو تمويل مسترد.</p>' : ""}
        <details><summary>تفاصيل حركات الشريك (${entries.length})</summary>${ledger(entries)}</details></section>`;
    }).join("") : "<p>لم تتم إضافة شركاء بعد.</p>"}
    ${report.unassignedWithdrawals || report.unassignedFunding ? `<p class="meeting-note">حركات غير مرتبطة بشريك حالي: سحوبات ${money(report.unassignedWithdrawals)}، وحركات تمويل ${money(report.unassignedFunding)}. تحتاج مراجعة نسبتها للشركاء.</p>` : ""}
    ${block("الأرصدة الحالية الآن، تشمل كل الفترات", [["الموجود كاش", onHand.methods.cash.current], ["الموجود بالبنك", onHand.methods.bank.current], ["الموجود بالمحفظة", onHand.methods.wallet.current], ["إجمالي الموجود", onHand.total.current], ["ديون العملاء للكافيه", data.customerSummary.debt], ["أرصدة العملاء عند الكافيه", data.customerSummary.credit], ["علينا للموردين", report.supplierDebt], ["لنا عند الموردين", report.supplierCredit]])}
    <details><summary>تفاصيل مصاريف التشغيل والتجهيزات (${data.expenses.length})</summary>${ledger(data.expenses.map((entry) => ({ ...entry, label: `${expensePurposeLabel(entry)}: ${entry.title || "مصروف"}` })))}</details>
  </div>`;
}

function printPartnerMeeting() {
  if (!isManagerMode()) return;
  const host = document.createElement("div");
  host.className = "print-host";
  host.innerHTML = `<div class="print-invoice"><h1>${escapeHtml(businessName())}</h1><h2>كشف جلسة الشركاء</h2>${partnerMeetingHtml(selectedReportRange())}</div>`;
  const expanded = Array.from(document.querySelectorAll("#partnerMeetingReport details"), (section) => section.open);
  host.querySelectorAll("details").forEach((section, index) => { section.open = Boolean(expanded[index]); });
  document.body.appendChild(host);
  try { window.print(); } finally { host.remove(); }
}

function renderReportingStart() {
  const status = document.querySelector("#reportingStartStatus");
  if (!status) return;
  const start = state.reportingStart;
  status.textContent = start ? `بداية المتابعة: ${start.localTime.replace("T", " ")}` : "لم تحدد بداية متابعة جديدة";
  const controls = document.querySelector("#reportingStartControls");
  const input = document.querySelector("#reportingStartDateInput");
  if (!controls?.open) input.value = start?.localTime || localDateTimeKey(new Date().toISOString());
  document.querySelector("#reportingStartButton").textContent = start ? "حفظ تعديل البداية مع نسخة احتياطية" : "حفظ البداية مع نسخة احتياطية";
  document.querySelector("#reportingStartCancelButton").hidden = !start;
  document.querySelector("#reportingCurrentButton").disabled = !start;
  document.querySelector("#reportingHistoryButton").disabled = !start;
}

function applyReportingPeriod(mode) {
  const range = reportingPeriodRange(mode);
  els.reportDateFromInput.value = range.minDate.slice(0, 10);
  els.reportTimeFromInput.value = range.minDate.slice(11, 16);
  els.reportDateToInput.value = range.maxDate.slice(0, 10);
  els.reportTimeToInput.value = range.maxDate.slice(11, 16);
  cashLedgerViewLimit = CASH_LEDGER_STEP;
  renderReports();
  renderTopItemsAndPeakHours();
}

let reportingStartBusy = false;
async function startReportingPeriod() {
  const value = document.querySelector("#reportingStartDateInput")?.value || "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || localDateTimeKey(new Date(value).toISOString()) !== value) {
    showToast("اختر تاريخ ووقت بداية صحيحين.");
    return;
  }
  await updateReportingStart(value);
}

async function updateReportingStart(localTime) {
  if (!isManagerMode() || reportingStartBusy) return;
  if ((state.reportingStart?.localTime || null) === localTime) return;
  reportingStartBusy = true;
  const button = document.querySelector("#reportingStartButton");
  if (button) button.disabled = true;
  try {
    const payload = await backupPayload();
    const fileName = `before-new-period-${backupFileName()}`;
    const saved = await saveBackupToLocalServer(payload, fileName);
    if (!saved) {
      showToast("لم تتغير البداية: تعذر حفظ النسخة في مجلد backups. افتح البرنامج من مشغله المحلي وحاول مجدداً.");
      return;
    }
    const now = new Date();
    const previousStart = state.reportingStart?.localTime || "";
    state.reportingStart = localTime ? { localTime, createdAt: now.toISOString(), backupFile: fileName } : null;
    auditAction("reports.start", { previousStart, start: localTime || "", backupFile: fileName });
    saveState(true);
    const controls = document.querySelector("#reportingStartControls");
    if (controls) controls.open = false;
    applyReportingPeriod(localTime ? "current" : "all");
    showToast(localTime ? "تم حفظ بداية الفترة والنسخة الاحتياطية. السجلات والأرصدة محفوظة." : "تم إلغاء تحديد البداية وعرض كل السجل. لم تُحذف أي حركة.");
  } catch (error) {
    console.error("reporting start failed", error);
    showToast("تعذر إكمال بداية المتابعة. السجلات القديمة ما زالت محفوظة.");
  } finally {
    reportingStartBusy = false;
    if (button) button.disabled = false;
  }
}

function setReportSection(section, options = {}) {
  const legacySection = section === "details" || section === "meeting" ? "partners" : section;
  const allowed = ["summary", "sales", "cash", "expenses", "partners", "handover"];
  selectedReportSection = allowed.includes(legacySection) ? legacySection : "summary";
  if (selectedReportSection === "handover") {
    const handover = document.querySelector("#cafeHandoverReport");
    if (handover) handover.innerHTML = cafeHandoverHtml(selectedReportRange());
  }
  if (selectedReportSection === "partners") {
    const meeting = document.querySelector("#partnerMeetingReport");
    if (meeting) meeting.innerHTML = partnerMeetingHtml(selectedReportRange());
  }
  document.querySelectorAll("[data-report-section]").forEach((panel) => {
    panel.hidden = panel.dataset.reportSection !== selectedReportSection;
  });
  document.querySelectorAll("[data-report-section-tab]").forEach((button) => {
    const active = button.dataset.reportSectionTab === selectedReportSection;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  saveUiState();
  if (options.scroll) {
    document.getElementById("reportSectionTabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderReports() {
  renderReportingStart();
  renderCashOnHand();
  const range = selectedReportRange();
  const data = reportData(range);
  const itemRows = reportItemRows(range);
  const customerRows = reportCustomerRows();
  const recentInvoices = data.invoices
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 8);
  // القوائم هون معاينة سريعة بس (مو التقرير الكامل) — التقرير المطبوع بيعرض كل الحركات بدون حد.
  const RECENT_REPORT_ROWS_LIMIT = 30;
  const recentPurchases = data.purchases
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, RECENT_REPORT_ROWS_LIMIT);
  const recentGeneralExpenses = data.expenses
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, RECENT_REPORT_ROWS_LIMIT);
  const recentSupplierPayments = data.supplierPayments
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, RECENT_REPORT_ROWS_LIMIT);
  const recentInventoryCounts = data.inventoryCounts
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, RECENT_REPORT_ROWS_LIMIT);
  const recentInventoryActivities = data.inventoryCounts
    .map((record) => ({ kind: "count", record, createdAt: record.createdAt || "" }))
    .concat((data.inventoryWaste || []).map((record) => ({ kind: "waste", record, createdAt: record.createdAt || "" })))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, RECENT_REPORT_ROWS_LIMIT);
  const recentWorkerConsumptions = data.workerConsumptions
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, RECENT_REPORT_ROWS_LIMIT);
  const recentWorkerTransactions = data.workerTransactions
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, RECENT_REPORT_ROWS_LIMIT);

  els.reportRangeText.textContent = rangeText(range);

  // ── حساب الصندوق: شو دخل وشو طلع (مصدر موحّد مع الطباعة الاحترافية) ──
  const paymentDiscountTotal = Number(data.paymentDiscountTotal || 0);
  const cashbox = cashboxBreakdown(data);
  const { boxIn, boxOut, boxNet, cashIn, cashOut, cashNet, paymentsReceived, payoutsPaid, payoutPayments, cashInParts, cashOutParts } = cashbox;

  const profitAfterInventory = data.profitWithWorkersPayrollAndInventory;
  const operatingProfitAfterInventory = data.operatingProfitWithWorkersPayrollAndInventory;
  const overallPartnerFunding = partnerFundingTotals(state.partnerFundingTransactions || []);
  const collectionRate = reportCollectionRate(data);
  const soldItemRows = itemRows
    .filter((row) => Number(row.stats?.qty || 0) > 0.001 || Number(row.stats?.sales || 0) > 0.001)
    .sort((a, b) => Number(b.stats.qty || 0) - Number(a.stats.qty || 0) || Number(b.stats.sales || 0) - Number(a.stats.sales || 0));
  const soldItemQtyTotal = soldItemRows.reduce((sum, row) => sum + Number(row.stats.qty || 0), 0);
  const managerInsights = reportActionInsights(data, cashbox, itemRows);
  const percentText = reportPercentText;

  const card = (label, value, tone = "") => `
    <article class="report-card ${tone ? `is-${tone}` : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
  const amountCard = (label, amount, tone = "") => Number(amount || 0) > 0.001 ? card(label, money(amount), tone) : "";
  const moneyPartsText = (parts, emptyText = "لا توجد حركة") => {
    const visible = parts.filter((part) => Number(part.amount || 0) > 0.001);
    return visible.length
      ? visible.map((part) => `${part.label} ${money(part.amount)}`).join(" + ")
      : emptyText;
  };

  const collectedFromCustomers = Number(data.paidTotal || 0) + Number(paymentsReceived || 0);
  const workerCashOut = Number(data.workerTransactionSummary.advances || 0) + Number(data.workerTransactionSummary.salaryPaid || 0);
  const supplierPositions = supplierBalances();
  const currentSupplierDebt = supplierPositions.reduce((sum, entry) => sum + Number(entry.debt || 0), 0);
  const currentSupplierCredit = supplierPositions.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  const currentWorkerDue = (state.workers || []).reduce((sum, worker) => {
    return sum + Math.max(Number(workerMonthlyAccount(worker).due || 0), 0);
  }, 0);
  const partnerPeriodSnapshot = partnerDistribution(range, "cash");
  const partnerTakenInPeriod = Number(partnerPeriodSnapshot.totalProfitWithdrawals || 0)
    + Number(partnerPeriodSnapshot.totalPersonalWithdrawals || 0)
    + Number(partnerPeriodSnapshot.totalPartnerAdvances || 0)
    + Number(partnerPeriodSnapshot.totalPartnerProducts || 0);
  const salesMinusPurchases = Number(data.salesTotal || 0) - Number(data.purchasesTotal || 0);
  const simpleResultAfterExpenses = salesMinusPurchases - Number(data.expensesTotal || 0);
  const profitSteps = [
    ["ربح الأصناف بعد تكلفتها", Number(data.itemProfit || 0)],
    ["صافي استهلاك العمال", Number(data.workerSummary.net || 0)],
    ["خصومات تسديد العملاء", -paymentDiscountTotal],
    ["مصاريف تشغيل الكافيه", -Number(data.operatingExpensesTotal || 0)],
    ["المنفق على تجهيزات وتوسعة المشروع", -Number(data.renovationExpensesTotal || 0)],
    ["سلف وقبضات العمال", -workerCashOut],
    ["التالف المسجل", -Number(data.inventoryWasteTotal || 0)]
  ];

  const paymentRowTotal = (payments = {}) => paymentMethods.reduce((sum, method) => sum + Number(payments[method] || 0), 0);
  const expenseMovementRows = expensePurposeIds.flatMap((purpose) => expenseCategoryIds.map((category) => {
    const entries = data.expenses.filter((entry) => expensePurpose(entry) === purpose && inferExpenseCategory(entry) === category);
    return {
      label: `${expensePurposeLabel({ purpose })} - ${expenseCategoryLabel(category)}`,
      note: `${quantityText(entries.length)} حركة مصروف`,
      payments: expensePaymentTotals(entries)
    };
  })).filter((row) => paymentMethods.some((method) => Number(row.payments[method] || 0) > 0.001));
  const salaryPayments = cashEntryPaymentTotals(data.workerTransactions.filter((entry) => entry.type === WORKER_SALARY_PAYMENT_TYPE));
  const advancePayments = cashEntryPaymentTotals(data.workerTransactions.filter((entry) => entry.type === WORKER_ADVANCE_TYPE));
  const refundableFundingPayments = partnerFundingPaymentTotals(data.partnerFundingTransactions.filter((entry) => entry.type === PARTNER_FUNDING_REFUNDABLE), "in");
  const capitalFundingPayments = partnerFundingPaymentTotals(data.partnerFundingTransactions.filter((entry) => entry.type === PARTNER_FUNDING_CAPITAL), "in");
  const partnerWorkerIds = new Set((state.partners || []).map((partner) => partner.workerId).filter(Boolean));
  const partnerAdvancePayments = cashEntryPaymentTotals(data.workerTransactions.filter((entry) => entry.type === WORKER_ADVANCE_TYPE && partnerWorkerIds.has(entry.workerId)));
  const regularWorkerAdvancePayments = cashEntryPaymentTotals(data.workerTransactions.filter((entry) => entry.type === WORKER_ADVANCE_TYPE && !partnerWorkerIds.has(entry.workerId)));
  const moneyInRows = [
    { label: "مبيعات مدفوعة", note: "المقبوض داخل فواتير البيع", payments: data.salePayments },
    { label: "تسديد ديون عملاء", note: "دفعات لاحقة من العملاء", payments: data.paymentPayments },
    { label: "مشروبات عمال مدفوعة", note: "دفعها العامل مباشرة", payments: data.workerPayments },
    { label: "مبالغ مستلمة من العمال", note: "دفعة من العامل على حسابه", payments: data.workerTransactionInPayments },
    { label: "مبالغ مستلمة من الموردين", note: "قبض أو إرجاع من مورد", payments: data.supplierReceiptPayments },
    { label: "إرجاع سحب شخصي", note: "مبلغ أعاده شريك إلى الصندوق", payments: data.ownerWithdrawalReturnPayments },
    { label: "تمويل مسترد من الشركاء", note: "يبقى مستحقاً للشريك", payments: refundableFundingPayments },
    { label: "زيادة رأس مال", note: "ليست مبيعات ولا أرباحاً", payments: capitalFundingPayments }
  ];
  const moneyOutRows = [
    { label: "شراء بضاعة ومخزون", note: "المدفوع وقت فواتير الشراء", payments: data.purchasePayments },
    { label: "تسديد حسابات الموردين", note: "دفعات لاحقة للموردين", payments: data.supplierPaymentPayments },
    ...expenseMovementRows,
    { label: "رواتب مدفوعة للعمال", note: "حركات دفع راتب", payments: salaryPayments },
    { label: "سلف مدفوعة للعمال", note: "تشمل الشريك إذا كان مربوطاً كعامل", payments: advancePayments },
    { label: "دفعات خارجة للعملاء", note: "إرجاع أو دفع رصيد عميل", payments: payoutPayments },
    { label: "سحب أرباح الشركاء", note: "لا يُسجل كمصروف", payments: data.profitWithdrawalPayments },
    { label: "سحب شخصي للشركاء", note: "يُخصم من حصة الشريك", payments: data.personalWithdrawalPayments },
    { label: "رد تمويل للشركاء", note: "إرجاع تمويل مسترد", payments: data.partnerFundingOutPayments }
  ];
  const movementRowHtml = (row, direction) => `
    <tr>
      <td><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.note)}</small></td>
      ${paymentMethods.map((method) => `<td>${money(row.payments?.[method] || 0)}</td>`).join("")}
      <td class="is-${direction}"><strong>${money(paymentRowTotal(row.payments))}</strong></td>
    </tr>`;
  const partnerFundingInCash = paymentRowTotal(refundableFundingPayments) + paymentRowTotal(capitalFundingPayments);
  const cafeGeneratedCashIn = cashIn - partnerFundingInCash;
  const customerReceiptPayments = paymentMethods.reduce((totals, method) => {
    totals[method] = Number(data.salePayments?.[method] || 0) + Number(data.paymentPayments?.[method] || 0);
    return totals;
  }, {});
  const customerReceiptsTotal = paymentRowTotal(customerReceiptPayments);
  const combinePaymentTotals = (...groups) => paymentMethods.reduce((totals, method) => {
    totals[method] = groups.reduce((sum, group) => sum + Number(group?.[method] || 0), 0);
    return totals;
  }, {});
  const goodsCashOut = paymentRowTotal(data.purchasePayments) + paymentRowTotal(data.supplierPaymentPayments);
  const operationsCashOut = paymentRowTotal(expensePaymentTotals(data.expenses.filter((entry) => expensePurpose(entry) === "operations")));
  const equipmentCashOut = paymentRowTotal(expensePaymentTotals(data.expenses.filter((entry) => expensePurpose(entry) === "renovation")));
  const workersCashOut = paymentRowTotal(salaryPayments) + paymentRowTotal(regularWorkerAdvancePayments);
  const customerPayoutCashOut = paymentRowTotal(payoutPayments);
  const partnersCashOut = paymentRowTotal(data.profitWithdrawalPayments)
    + paymentRowTotal(data.personalWithdrawalPayments)
    + paymentRowTotal(data.partnerFundingOutPayments)
    + paymentRowTotal(partnerAdvancePayments);
  const remainingAfterOperations = cashIn - goodsCashOut - operationsCashOut - workersCashOut - customerPayoutCashOut;
  const finalCashMovement = remainingAfterOperations - equipmentCashOut - partnersCashOut;
  const currentCashPosition = cashOnHand();
  const otherIncomePayments = combinePaymentTotals(data.workerPayments, data.workerTransactionInPayments, data.supplierReceiptPayments);
  const goodsAndSuppliersPayments = combinePaymentTotals(data.purchasePayments, data.supplierPaymentPayments);
  const allExpensePayments = expensePaymentTotals(data.expenses);
  const regularWorkerPayments = combinePaymentTotals(salaryPayments, regularWorkerAdvancePayments);
  const allPartnerOutPayments = combinePaymentTotals(
    data.profitWithdrawalPayments,
    data.personalWithdrawalPayments,
    data.partnerFundingOutPayments,
    partnerAdvancePayments
  );
  const cashStatementRows = [
    { label: "المقبوض من العملاء", payments: customerReceiptPayments, direction: "in" },
    { label: "تمويل ورأس مال", payments: combinePaymentTotals(refundableFundingPayments, capitalFundingPayments), direction: "in" },
    ...(paymentRowTotal(otherIncomePayments) > 0.001 ? [{ label: "مقبوضات أخرى", payments: otherIncomePayments, direction: "in" }] : []),
    { label: "شراء بضاعة وتسديد موردين", payments: goodsAndSuppliersPayments, direction: "out" },
    { label: "المصاريف", payments: allExpensePayments, direction: "out" },
    { label: "العمال", payments: regularWorkerPayments, direction: "out" },
    { label: "الشركاء", payments: allPartnerOutPayments, direction: "out" },
    ...(customerPayoutCashOut > 0.001 ? [{ label: "دفعات خارجة للعملاء", payments: payoutPayments, direction: "out" }] : [])
  ];
  const cashStatementNet = paymentMethods.reduce((totals, method) => {
    totals[method] = cashStatementRows.reduce((sum, row) => {
      const amount = Number(row.payments?.[method] || 0);
      return sum + (row.direction === "out" ? -amount : amount);
    }, 0);
    return totals;
  }, {});
  const statementAmount = (amount, direction = "in") => `${direction === "out" && Number(amount || 0) > 0.001 ? "−" : ""}${money(Math.abs(Number(amount || 0)))}`;
  const cashStatementRowHtml = (row) => `
    <tr class="is-${row.direction}">
      <th scope="row">${escapeHtml(row.label)}</th>
      ${paymentMethods.map((method) => `<td>${statementAmount(row.payments?.[method], row.direction)}</td>`).join("")}
      <td><strong>${statementAmount(paymentRowTotal(row.payments), row.direction)}</strong></td>
    </tr>`;
  const moneyMovementOverview = document.getElementById("reportMoneyMovementOverview");
  if (moneyMovementOverview) moneyMovementOverview.innerHTML = `
    <div class="section-title money-movement-title"><div><h3>كل حركة دخل وخروج</h3><p>${escapeHtml(rangeText(range))} · جميع طرق الدفع</p></div></div>
    <section class="cash-waterfall" aria-label="الحسبة الفعلية للفلوس">
      <header><div><h4>الحسبة الفعلية للفلوس</h4><p>من أول شيكل دخل حتى المبلغ المتبقي</p></div><span>للفترة المختارة</span></header>
      <div class="cash-customer-receipts">
        <div><span>كل الفلوس المقبوضة من العملاء</span><small>مبيعات مدفوعة ${money(data.paidTotal)} + تسديد ديون قديمة ${money(paymentsReceived)}</small></div>
        <strong>${money(customerReceiptsTotal)}</strong>
        <div class="cash-customer-methods">
          <span>كاش <b>${money(customerReceiptPayments.cash)}</b></span>
          <span>بنك <b>${money(customerReceiptPayments.bank)}</b></span>
          <span>محفظة <b>${money(customerReceiptPayments.wallet)}</b></span>
        </div>
      </div>
      <div class="cash-waterfall-line is-start">
        <div><span>إجمالي كل ما دخل الصندوق من جميع المصادر</span><small>من شغل وحسابات الكافيه ${money(cafeGeneratedCashIn)} · تمويل ورأس مال من الشركاء ${money(partnerFundingInCash)}</small></div><strong>${money(cashIn)}</strong>
      </div>
      <div class="cash-waterfall-line is-minus"><div><span>المدفوع على البضاعة والموردين</span><small>شراء مباشر ${money(paymentRowTotal(data.purchasePayments))} · تسديدات موردين ${money(paymentRowTotal(data.supplierPaymentPayments))}</small></div><strong>−${money(goodsCashOut)}</strong></div>
      <div class="cash-waterfall-line is-minus"><div><span>مصاريف تشغيل الكافيه</span><small>الإيجار والخدمات والصيانة والمصاريف اليومية</small></div><strong>−${money(operationsCashOut)}</strong></div>
      <div class="cash-waterfall-line is-minus"><div><span>ما أخذه العمال</span><small>رواتب ${money(paymentRowTotal(salaryPayments))} · سلف عمال غير شركاء ${money(paymentRowTotal(regularWorkerAdvancePayments))}</small></div><strong>−${money(workersCashOut)}</strong></div>
      ${customerPayoutCashOut > 0.001 ? `<div class="cash-waterfall-line is-minus"><div><span>دفعات خارجة للعملاء</span><small>إرجاع أو دفع رصيد عميل</small></div><strong>−${money(customerPayoutCashOut)}</strong></div>` : ""}
      <div class="cash-waterfall-line is-subtotal"><div><span>المتبقي بعد البضاعة والتشغيل والعمال</span><small>قبل التجهيزات وسحوبات الشركاء</small></div><strong>${money(remainingAfterOperations)}</strong></div>
      <div class="cash-waterfall-line is-minus"><div><span>تجهيزات وتوسعة المشروع</span><small>إنفاق غير تشغيلي</small></div><strong>−${money(equipmentCashOut)}</strong></div>
      <div class="cash-waterfall-line is-minus"><div><span>ما خرج للشركاء</span><small>سحب أرباح وشخصي ورد تمويل وسلف الشريك العامل</small></div><strong>−${money(partnersCashOut)}</strong></div>
      <div class="cash-waterfall-line is-final ${finalCashMovement >= 0 ? "is-positive" : "is-negative"}"><div><span>المتبقي النهائي من حركة الفترة</span><small>يطابق صافي حركة الصندوق أدناه</small></div><strong>${money(finalCashMovement)}</strong></div>
    </section>
    <div class="money-movement-totals">
      <div class="is-in"><span>إجمالي الداخل</span><strong>${money(cashIn)}</strong></div>
      <div class="is-out"><span>إجمالي الخارج</span><strong>${money(cashOut)}</strong></div>
      <div class="${cashNet >= 0 ? "is-in" : "is-out"}"><span>صافي الحركة</span><strong>${money(cashNet)}</strong></div>
    </div>
    <div class="money-movement-block">
      <h4>الفلوس التي دخلت</h4>
      <div class="money-movement-table-wrap"><table class="money-movement-table"><thead><tr><th>المصدر</th><th>كاش</th><th>بنك</th><th>محفظة</th><th>الإجمالي</th></tr></thead><tbody>${moneyInRows.map((row) => movementRowHtml(row, "in")).join("")}</tbody></table></div>
    </div>
    <div class="money-movement-block">
      <h4>الفلوس التي خرجت</h4>
      <div class="money-movement-table-wrap"><table class="money-movement-table"><thead><tr><th>السبب</th><th>كاش</th><th>بنك</th><th>محفظة</th><th>الإجمالي</th></tr></thead><tbody>${moneyOutRows.map((row) => movementRowHtml(row, "out")).join("")}</tbody></table></div>
    </div>
    <p class="money-movement-note">التحويل بين الكاش والبنك والمحفظة لا يظهر كدخل أو خروج لأنه نقل داخلي. المشتريات بالدين لا تخرج من الصندوق إلا وقت دفعها، والمبيعات بالدين لا تدخل الصندوق إلا وقت تحصيلها.</p>
  `;

  els.reportSummaryGrid.innerHTML = `
    <section class="financial-report" aria-label="التقرير المالي للفترة">
      <header class="report-story-head">
        <div>
          <span>ملخص الفترة المختارة</span>
          <h3>${escapeHtml(rangeText(range))}</h3>
        </div>
        <small>${quantityText(data.saleInvoices.length)} فاتورة بيع · ${quantityText(soldItemQtyTotal)} قطعة مباعة</small>
      </header>
      <section class="financial-statement financial-income-statement" aria-labelledby="incomeStatementTitle">
        <header class="financial-statement-head"><div><h3 id="incomeStatementTitle">قائمة الدخل</h3><p>نتيجة العمل خلال الفترة المختارة</p></div><span>للفترة</span></header>
        <div class="financial-table-wrap">
          <table class="financial-table financial-table-two-column">
            <thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
            <tbody>
              <tr><th scope="row"><span>إجمالي المبيعات</span><small>ناقص الدين ${money(data.debtTotal)} = المقبوض من مبيعات الفترة ${money(data.paidTotal)}</small></th><td>${money(data.salesTotal)}</td></tr>
              <tr><th scope="row">تسديد ديون قديمة</th><td>${money(paymentsReceived)}</td></tr>
              <tr class="is-highlight"><th scope="row">إجمالي المقبوض من العملاء</th><td><strong>${money(collectedFromCustomers)}</strong></td></tr>
              <tr><th scope="row">تكلفة البضاعة المباعة</th><td>${money(data.itemCost)}</td></tr>
              <tr class="is-subtotal"><th scope="row">مجمل الربح</th><td><strong>${money(data.itemProfit)}</strong></td></tr>
              <tr><th scope="row">مصاريف التشغيل</th><td>${money(data.operatingExpensesTotal)}</td></tr>
              <tr><th scope="row">العمال</th><td>${money(workerCashOut)}</td></tr>
              <tr><th scope="row"><span>التالف المسجل</span><small>فرق الجرد للمعلومة فقط ولا يدخل في الربح</small></th><td>${money(data.inventoryWasteTotal || 0)}</td></tr>
              <tr class="is-grand-total ${operatingProfitAfterInventory < 0 ? "is-negative" : ""}"><th scope="row">صافي ربح التشغيل</th><td><strong>${money(operatingProfitAfterInventory)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="financial-secondary-grid">
        <section class="financial-statement" aria-labelledby="cashStatementTitle">
          <header class="financial-statement-head"><div><h3 id="cashStatementTitle">حركة النقد</h3><p>الفلوس التي دخلت وخرجت فعليًا</p></div><span>للفترة</span></header>
          <div class="financial-table-wrap">
            <table class="financial-table financial-cash-table">
              <thead><tr><th>البيان</th><th>كاش</th><th>بنك</th><th>محفظة</th><th>الإجمالي</th></tr></thead>
              <tbody>
                ${cashStatementRows.map(cashStatementRowHtml).join("")}
                <tr class="is-grand-total ${paymentRowTotal(cashStatementNet) < 0 ? "is-negative" : ""}"><th scope="row">صافي الحركة</th>${paymentMethods.map((method) => `<td>${statementAmount(cashStatementNet[method])}</td>`).join("")}<td><strong>${money(paymentRowTotal(cashStatementNet))}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="financial-statement" aria-labelledby="positionStatementTitle">
          <header class="financial-statement-head"><div><h3 id="positionStatementTitle">المركز الحالي</h3><p>ما لنا وما علينا والموجود الآن</p></div><span>كل الفترات</span></header>
          <div class="financial-table-wrap">
            <table class="financial-table financial-table-two-column">
              <thead><tr><th>البيان</th><th>الرصيد الحالي</th></tr></thead>
              <tbody>
                <tr><th scope="row">ديون العملاء</th><td>${money(data.customerSummary.debt)}</td></tr>
                <tr class="${currentSupplierDebt > 0.001 ? "is-payable" : ""}"><th scope="row">ديون الموردين</th><td>${money(currentSupplierDebt)}</td></tr>
                <tr><th scope="row">رصيدنا عند الموردين</th><td>${money(currentSupplierCredit)}</td></tr>
                <tr class="${currentWorkerDue > 0.001 ? "is-payable" : ""}"><th scope="row">مستحق العمال</th><td>${money(currentWorkerDue)}</td></tr>
                <tr class="${overallPartnerFunding.outstandingRefundable > 0.001 ? "is-payable" : ""}"><th scope="row">تمويل الشركاء المسترد</th><td>${money(overallPartnerFunding.outstandingRefundable)}</td></tr>
                <tr class="is-grand-total ${currentCashPosition.total.current < 0 ? "is-negative" : ""}"><th scope="row">الفلوس الموجودة الآن</th><td><strong>${money(currentCashPosition.total.current)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <details class="financial-extra-details">
        <summary><span>تفاصيل وتحليلات إضافية</span><small>الحسبة المبسطة، حركة الفلوس، والتنبيهات</small></summary>
        <div class="financial-extra-content">
      <section class="financial-extra-cash-analysis" aria-label="التفصيل الكامل لحركة النقد">
        ${moneyMovementOverview ? moneyMovementOverview.innerHTML : ""}
      </section>
      <section class="report-simple-profit" aria-label="الحسبة المبسطة للمبيعات والمشتريات والمصاريف">
        <header><div><strong>الحسبة المبسطة</strong><small>المبيعات ناقص المشتريات ثم ناقص المصاريف</small></div><span>للفترة المختارة</span></header>
        <div class="report-simple-profit-flow">
          <div class="is-value"><span>المبيعات</span><strong>${money(data.salesTotal)}</strong></div>
          <div class="is-operator"><span>ناقص المشتريات</span><strong>−${money(data.purchasesTotal)}</strong></div>
          <div class="is-subtotal"><span>الناتج بعد المشتريات</span><strong>${money(salesMinusPurchases)}</strong></div>
          <div class="is-operator"><span>ناقص جميع المصاريف</span><strong>−${money(data.expensesTotal)}</strong><small>تشغيل ${money(data.operatingExpensesTotal)} · تجهيزات ${money(data.renovationExpensesTotal)}</small></div>
          <div class="is-result ${simpleResultAfterExpenses >= 0 ? "is-positive" : "is-negative"}"><span>الناتج بعد المشتريات والمصاريف</span><strong>${money(simpleResultAfterExpenses)}</strong></div>
        </div>
        <p>هذه حسبة مبسطة للمقارنة. ربح التشغيل الدقيق بالأعلى يعتمد على تكلفة الأصناف التي بيعت فعليًا، لأن جزءًا من المشتريات قد يبقى داخل المخزون.</p>
      </section>

      <section class="report-investment-result" aria-label="التجهيزات والنتيجة النهائية">
        <div>
          <span>إنفاق تجهيزات وتوسعة</span>
          <strong>${money(data.renovationExpensesTotal)}</strong>
          <small>خارج تشغيل الكافيه اليومي</small>
        </div>
        <div class="${profitAfterInventory >= 0 ? "is-positive" : "is-negative"}">
          <span>الصافي بعد التجهيزات</span>
          <strong>${money(profitAfterInventory)}</strong>
          <small>ربح التشغيل ناقص التجهيزات والتوسعة</small>
        </div>
      </section>

      <details class="report-profit-details">
        <summary>كيف وصلنا إلى الصافي؟</summary>
        <div class="report-profit-lines">
          ${profitSteps.map(([label, amount]) => `<div class="report-profit-line ${amount < -0.001 ? "is-minus" : amount > 0.001 ? "is-plus" : ""}"><span>${label}</span><strong>${amount > 0.001 ? "+" : amount < -0.001 ? "−" : ""}${money(Math.abs(amount))}</strong></div>`).join("")}
          <div class="report-profit-line is-total"><span>الصافي بعد التشغيل والتجهيزات</span><strong>${money(profitAfterInventory)}</strong></div>
        </div>
      </details>
      <p class="report-stock-note">فرق الجرد للمعلومة فقط ولا يغيّر الربح. التالف المسجل وحده يُحسب خسارة فعلية. شراء المخزون يؤثر على الصندوق وقت الدفع، بينما الربح يعتمد على تكلفة الأصناف التي بيعت فعلياً.</p>
      <section class="report-action-band" aria-label="ملاحظات مهمة">
        <h3>ملاحظات تحتاج انتباهك</h3>
        <div class="report-action-list">${managerInsights.slice(0, 4).map(renderManagerInsight).join("")}</div>
      </section>
      </div>
      </details>
    </section>
  `;

  if (els.reportExpenseCategorySummary) {
    const categoryTotals = expenseCategoryIds.reduce((totals, category) => {
      totals[category] = data.expenses
        .filter((expense) => inferExpenseCategory(expense) === category)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      return totals;
    }, {});
    els.reportExpenseCategorySummary.innerHTML = `
      <article class="report-expense-category is-purpose-operations">
        <span>تشغيل الكافيه</span>
        <strong>${money(data.operatingExpensesTotal)}</strong>
      </article>
      <article class="report-expense-category is-purpose-renovation">
        <span>تجهيزات وتوسعة المشروع</span>
        <strong>${money(data.renovationExpensesTotal)}</strong>
      </article>
      <article class="report-expense-category is-purpose-total">
        <span>إجمالي الخارج</span>
        <strong>${money(data.expensesTotal)}</strong>
      </article>
      ${expenseCategoryIds.map((category) => `
      <article class="report-expense-category is-${category}">
        <span>${escapeHtml(expenseCategoryLabel(category))}</span>
        <strong>${money(categoryTotals[category])}</strong>
      </article>
      `).join("")}`;
  }

  const methodIcon = { cash: "💵", bank: "🏦", wallet: "📱" };
  els.reportPaymentsList.innerHTML = `
    <div class="report-period-scope">
      <strong>حركة الفترة المختارة</strong>
      <span>${escapeHtml(rangeText(range))} · دخل وطلع وصافي كل طريقة دفع ضمن هذه الفترة فقط.</span>
    </div>
    <div class="method-ledger">
      ${paymentMethods.map((method) => {
        const inRows = [
          { label: "مبيعات", amount: data.salePayments[method] },
          { label: "تسديد ديون عملاء", amount: data.paymentPayments[method] },
          { label: "مشروبات عمال", amount: data.workerPayments[method] },
          { label: "دفعات من العمال", amount: data.workerTransactionInPayments?.[method] || 0 },
          { label: "قبض من موردين", amount: data.supplierReceiptPayments?.[method] || 0 },
          { label: "تمويل شركاء", amount: data.partnerFundingInPayments?.[method] || 0 }
        ].filter((row) => Number(row.amount || 0) > 0.001);
        const outRows = [
          { label: "مشتريات", amount: data.purchasePayments[method] },
          { label: "تسديد موردين", amount: data.supplierPaymentPayments[method] },
          { label: "مصروفات عامة", amount: data.expensePayments[method] },
          { label: "سلف/قبضات عمال", amount: data.workerTransactionPayments[method] },
          { label: "دفعات لعملاء", amount: payoutPayments[method] },
          { label: "سحب حصة", amount: data.ownerWithdrawalPayments[method] },
          { label: "رد تمويل شريك", amount: data.partnerFundingOutPayments?.[method] || 0 }
        ].filter((row) => Number(row.amount || 0) > 0.001);
        const lineHtml = (rows, empty) => rows.length
          ? rows.map((row) => `<div class="ledger-line"><span>${row.label}</span><b>${money(row.amount)}</b></div>`).join("")
          : `<div class="ledger-empty">${empty}</div>`;
        return `
        <article class="ledger-card ${boxNet[method] >= 0 ? "is-up" : "is-down"}">
          <header class="ledger-head">
            <span class="ledger-title">${methodIcon[method] || "•"} ${paymentLabels[method]}${method === "cash" ? " · الدرج" : ""}</span>
            <strong class="ledger-net">${boxNet[method] >= 0 ? "الصافي +" : "الصافي −"}${money(Math.abs(boxNet[method]))}</strong>
          </header>
          <div class="ledger-cols">
            <div class="ledger-col ledger-in">
              <h6>⬇ دخل ${money(boxIn[method])}</h6>
              ${lineHtml(inRows, "لا يوجد دخل")}
            </div>
            <div class="ledger-col ledger-out">
              <h6>⬆ طلع ${money(boxOut[method])}</h6>
              ${lineHtml(outRows, "لا يوجد طالع")}
            </div>
          </div>
        </article>`;
      }).join("")}
    </div>`;

  renderCashLedger(range);
  renderPartnersPanel(range);

  const soldItemsHtml = soldItemRows.length
    ? soldItemRows.map(({ item, stats, workerStats }) => `
      <article class="report-row">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.category)} | سعر المنتج: ${money(item.price || 0)}${Array.isArray(item.options) && item.options.length ? " (السعر الأساسي)" : ""} | المباعة: ${quantityText(stats.qty)} | مبيعاتها: ${money(stats.sales)}${workerStats.qty > 0 ? ` | استهلاك عمال: ${quantityText(workerStats.qty)}` : ""}</small>
        </div>
        <span>ربح ${money(stats.profit)}</span>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد أصناف مباعة ضمن الفترة.</div>';
  els.reportItemsList.innerHTML = `
    ${soldItemsHtml}
    <div class="report-sold-items-totals">
      <article>
        <span>إجمالي البيع</span>
        <strong>${money(data.salesTotal || 0)}</strong>
        <small>يشمل البيع المدفوع والبيع بالدين</small>
      </article>
      <article class="is-cost">
        <span>تكلفة الأصناف</span>
        <strong>${money(data.itemCost || 0)}</strong>
        <small>تكلفة الكميات المباعة ضمن الفترة</small>
      </article>
      <article>
        <span>إجمالي الربح</span>
        <strong>${money(data.itemProfit || 0)}</strong>
        <small>إجمالي البيع ناقص تكلفة الأصناف</small>
      </article>
    </div>`;

  els.reportCustomersList.innerHTML = customerRows.length
    ? customerRows.map((customer) => `
      <article class="report-row ${Number(customer.balance || 0) > 0 ? "is-danger" : "is-credit"}">
        <div>
          <strong>${escapeHtml(customer.name)}</strong>
          <small>${customer.phone ? escapeHtml(customer.phone) : "بدون رقم جوال"}</small>
        </div>
        <span>${balanceText(Number(customer.balance || 0))}</span>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد أرصدة أو ديون حالية.</div>';

  els.reportInvoicesList.innerHTML = recentInvoices.length
    ? recentInvoices.map((invoice) => `
      <article class="report-row">
        <div>
          <strong>${escapeHtml(invoice.number || "فاتورة")}</strong>
          <small>${formatDate(invoice.createdAt)} | ${escapeHtml(invoice.customerName || "زبون نقدي")}</small>
        </div>
        <span>${money(invoice.total)} | ${statusText(invoice.status)}</span>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد فواتير ضمن الفترة.</div>';

  els.reportPurchasesList.innerHTML = recentPurchases.length
    ? recentPurchases.map((purchase) => {
      const lines = purchaseLines(purchase);
      const qty = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
      const stockQty = lines.reduce((sum, line) => sum + purchaseLineStockQty(line), 0);
      const debt = purchaseSupplierDebt(purchase);
      const overpayment = purchaseSupplierOverpayment(purchase);
      const discount = purchaseDiscount(purchase);
      return `
        <article class="report-row">
          <div>
            <strong>${escapeHtml(purchase.number || "فاتورة مشتريات")}</strong>
            <small>${formatDate(purchase.createdAt)}${purchase.supplier ? ` | ${escapeHtml(purchase.supplier)}` : ""} | ${escapeHtml(purchasePaymentText(purchase))}</small>
          </div>
          <span>${money(purchaseAmount(purchase))}${discount > 0.001 ? ` | خصم ${money(discount)}` : ""} | مدفوع ${money(purchasePaidAmount(purchase))}${debt > 0.001 ? ` | دين ${money(debt)}` : ""}${overpayment > 0.001 ? ` | رصيد لك ${money(overpayment)}` : ""} | مخزون ${quantityText(stockQty)}</span>
        </article>
      `;
    }).join("")
    : '<div class="empty-state">لا توجد مشتريات ضمن الفترة.</div>';

  if (els.reportSupplierPaymentsTotal) {
    els.reportSupplierPaymentsTotal.textContent = money(data.supplierPaymentsTotal);
  }
  if (els.reportSupplierPaymentsList) {
    els.reportSupplierPaymentsList.innerHTML = recentSupplierPayments.length
      ? recentSupplierPayments.map((payment) => `
        <article class="report-row is-danger">
          <div>
            <strong>${escapeHtml(payment.supplier || "مورد")}</strong>
            <small>${formatDate(payment.createdAt)} | ${paymentLabels[payment.method] || payment.method}${payment.note ? ` | ${escapeHtml(payment.note)}` : ""}</small>
          </div>
          <span>مسدد ${money(payment.amount)}</span>
        </article>
      `).join("")
      : '<div class="empty-state">لا توجد تسديدات موردين ضمن الفترة.</div>';
  }

  els.reportGeneralExpensesList.innerHTML = recentGeneralExpenses.length
    ? recentGeneralExpenses.map((expense) => `
      <article class="report-row is-danger">
        <div>
          <strong>${escapeHtml(expense.title || "مصروف")} <span class="report-expense-badge is-${inferExpenseCategory(expense)}">${escapeHtml(expenseCategoryLabel(expense))}</span> <span class="report-expense-purpose is-${expensePurpose(expense)}">${escapeHtml(expensePurposeLabel(expense))}</span></strong>
          <small>${formatDate(expense.createdAt)} | ${paymentLabels[expense.method] || expense.method}${expense.note ? ` | ${escapeHtml(expense.note)}` : ""}</small>
        </div>
        <span>${money(expense.amount)}</span>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد مصروفات عامة ضمن الفترة.</div>';

  els.reportInventoryList.innerHTML = recentInventoryActivities.length
    ? recentInventoryActivities.map(({ kind, record }) => {
      if (kind === "waste") {
        return `
        <article class="report-row is-danger">
          <div>
            <strong>تالف: ${escapeHtml(record.itemName || "مادة")}</strong>
            <small>${formatDate(record.createdAt)} | ${quantityWithUnit(record.qty, record.unit)}${record.reason ? ` | ${escapeHtml(record.reason)}` : ""}</small>
          </div>
          <span>خسارة: ${money(record.totalCost || 0)}</span>
        </article>`;
      }
      const value = inventoryCountValue(record);
      const netLabel = value.net > 0.001 ? "زيادة بالجرد (للمعرفة)" : value.net < -0.001 ? "نقص بالجرد (للمعرفة)" : "فرق الجرد";
      const rowClass = value.net > 0.001 ? "is-credit" : value.net < -0.001 ? "is-danger" : "";
      return `
        <article class="report-row ${rowClass}">
          <div>
            <strong>${escapeHtml(record.number || "جرد")}</strong>
            <small>${formatDate(record.createdAt)}${record.note ? ` | ${escapeHtml(record.note)}` : ""} | فروقات: ${quantityText(record.changed || 0)}</small>
          </div>
          <span>${netLabel}: ${money(Math.abs(value.net))}</span>
        </article>
      `;
    }).join("")
    : '<div class="empty-state">لا يوجد جرد أو تالف ضمن الفترة.</div>';

  els.reportExpensesList.innerHTML = recentWorkerConsumptions.length
    ? recentWorkerConsumptions.map((entry) => `
      <article class="report-row ${entry.type === FREE_WORKER_CONSUMPTION_TYPE ? "is-danger" : "is-credit"}">
        <div>
          <strong>${escapeHtml(entry.workerName)} - ${escapeHtml(entry.itemName)}</strong>
          <small>${formatDate(entry.createdAt)} | ${workerConsumptionTypeLabel(entry.type)} | الكمية: ${quantityText(entry.qty)}</small>
        </div>
        <span>${entry.type === FREE_WORKER_CONSUMPTION_TYPE ? `تكلفة ${money(entry.costTotal)}` : money(entry.total)}</span>
      </article>
    `).join("")
    : '<div class="empty-state">لا يوجد استهلاك عمال ضمن الفترة.</div>';

  els.reportWorkersList.innerHTML = recentWorkerTransactions.length
    ? recentWorkerTransactions.map((entry) => {
      const isAdvance = entry.type === WORKER_ADVANCE_TYPE;
      const isInflow = workerTransactionIsInflow(entry);
      return `
        <article class="report-row ${isAdvance ? "is-danger" : "is-credit"}">
          <div>
            <strong>${escapeHtml(entry.workerName)} - ${workerTransactionTypeLabel(entry.type)}</strong>
            <small>${formatDate(entry.createdAt)} | ${paymentLabels[entry.method] || entry.method}${entry.note ? ` | ${escapeHtml(entry.note)}` : ""}</small>
          </div>
          <span>${isAdvance ? "عليه " : isInflow ? "داخل للكافي " : entry.type === WORKER_CAFE_FUNDING_REFUND_TYPE ? "تمويل مرجّع " : "مدفوع له "}${money(entry.amount)}</span>
        </article>
      `;
    }).join("")
    : '<div class="empty-state">لا توجد سلف أو قبضات عمال ضمن الفترة.</div>';

  setReportSection(selectedReportSection);
}

// دفتر أستاذ موحّد بالتفصيل: كل حركة مالية فردية (دخل/طلع/تحويل) بمكان واحد
// المبيعات مجمّعة بصف واحد فوق (مش سطر لكل فاتورة) — بيوضح توزيع كاش/بنك/محفظة، وبيوديك لصفحة الفواتير لو ضغطته.
function renderCashLedger(range) {
  if (!els.cashLedgerList) return;
  const sales = salesCashSummary(range);
  const allEntries = buildCashLedgerEntries(range);
  if (cashLedgerViewLimit < CASH_LEDGER_STEP) cashLedgerViewLimit = CASH_LEDGER_STEP;
  const entries = allEntries.slice(0, cashLedgerViewLimit);
  const remaining = allEntries.length - entries.length;

  const totalIn = sales.total + allEntries.filter((e) => e.direction === "in").reduce((sum, e) => sum + e.amount, 0);
  const totalOut = allEntries.filter((e) => e.direction === "out").reduce((sum, e) => sum + e.amount, 0);
  const totalTransfer = allEntries.filter((e) => e.direction === "transfer").reduce((sum, e) => sum + e.amount, 0);
  const totalCount = allEntries.length + (sales.count > 0 ? 1 : 0);

  if (els.cashLedgerSubtitle) {
    els.cashLedgerSubtitle.textContent = totalCount
      ? `${quantityText(totalCount)} حركة — دخل ${money(totalIn)} · طلع ${money(totalOut)}${totalTransfer > 0.001 ? ` · تحويلات ${money(totalTransfer)}` : ""}`
      : "كل شيكل دخل، طلع، أو انتقل بين الحسابات";
  }

  if (els.cashLedgerTotals) {
    els.cashLedgerTotals.innerHTML = `
      <article class="cash-ledger-total is-in"><span>⬇ إجمالي الداخل</span><strong>${money(totalIn)}</strong></article>
      <article class="cash-ledger-total is-out"><span>⬆ إجمالي الطالع</span><strong>${money(totalOut)}</strong></article>
      <article class="cash-ledger-total is-transfer"><span>⇄ تحويلات داخلية</span><strong>${money(totalTransfer)}</strong></article>
      <article class="cash-ledger-total ${totalIn - totalOut >= 0 ? "is-in" : "is-out"}"><span>📊 الصافي</span><strong>${totalIn - totalOut >= 0 ? "+" : "−"}${money(Math.abs(totalIn - totalOut))}</strong></article>
    `;
  }

  const salesRow = sales.count > 0
    ? `<article class="report-row cash-ledger-row is-credit is-sales-summary" data-go-view="invoices" role="button" tabindex="0">
        <div>
          <strong>⬇ 🧾 مبيعات (${quantityText(sales.count)} فاتورة) — اضغط لفتح الفواتير</strong>
          <small>💵 كاش ${money(sales.cash)} | 🏦 بنك ${money(sales.bank)} | 📱 محفظة ${money(sales.wallet)}</small>
        </div>
        <span>+${money(sales.total)}</span>
      </article>`
    : "";

  const moreRow = remaining > 0
    ? `<button class="secondary-button cash-ledger-more" type="button" data-show-more-cash-ledger>⬇ عرض ${Math.min(remaining, CASH_LEDGER_STEP)} حركة أكثر (متبقّي ${remaining})</button>`
    : "";

  const restRows = entries.map((entry) => {
    if (entry.direction === "transfer") {
      return `
        <article class="report-row cash-ledger-row is-transfer">
          <div>
            <strong>⇄ ${escapeHtml(entry.category)}</strong>
            <small>${formatDate(entry.date)} | ${escapeHtml(entry.description)}</small>
          </div>
          <span>${paymentLabels[entry.fromMethod]} ← ${paymentLabels[entry.toMethod]} | ${money(entry.amount)}</span>
        </article>`;
    }
    const isIn = entry.direction === "in";
    return `
      <article class="report-row cash-ledger-row ${isIn ? "is-credit" : "is-danger"}">
        <div>
          <strong>${isIn ? "⬇" : "⬆"} ${escapeHtml(entry.category)}</strong>
          <small>${formatDate(entry.date)} | ${escapeHtml(entry.description)} | ${paymentLabels[entry.method] || entry.method}</small>
        </div>
        <span>${isIn ? "+" : "−"}${money(entry.amount)}</span>
      </article>`;
  }).join("");

  els.cashLedgerList.innerHTML = (salesRow || entries.length)
    ? salesRow + restRows + moreRow
    : '<div class="empty-state">لا توجد حركات مالية ضمن الفترة.</div>';
}

// ═══ لوحة الشركاء وتوزيع الأرباح ═══
function renderPartnersPanel(range) {
  if (!els.partnersList) return;
  const partners = state.partners || [];

  const workerOptions = (workerId) => ['<option value="">— بدون ربط —</option>']
    .concat((state.workers || []).map((w) => `<option value="${escapeAttr(w.id)}" ${w.id === workerId ? "selected" : ""}>${escapeHtml(w.name)}</option>`))
    .join("");
  els.partnersList.innerHTML = partners.length
    ? partners.map((p) => {
      const funding = partnerFundingBalance(p.id);
      const fundingStatus = [
        funding.outstandingRefundable > 0.001 ? `<span class="partner-funding-mini is-refundable">له تمويل مسترد ${money(funding.outstandingRefundable)}</span>` : "",
        funding.capital > 0.001 ? `<span class="partner-funding-mini is-capital">رأس مال ${money(funding.capital)}</span>` : ""
      ].filter(Boolean).join("");
      return `
        <article class="partner-row" data-partner-row="${p.id}">
          <div class="partner-row-name"><strong>${escapeHtml(p.name)}</strong><small>${fundingStatus || "لا توجد حركات تمويل"}</small></div>
          <label class="field compact partner-share-field">
            <span>نسبته %</span>
            <input type="number" min="0" max="100" step="any" inputmode="decimal" value="${Number(p.sharePercent || 0)}" data-partner-share="${escapeAttr(p.id)}" />
          </label>
          <label class="field compact partner-worker-field">
            <span>مربوط بعامل</span>
            <select data-partner-worker="${escapeAttr(p.id)}">${workerOptions(p.workerId)}</select>
          </label>
          <button class="customer-delete-button" type="button" data-remove-partner="${escapeAttr(p.id)}">حذف</button>
        </article>`;
    }).join("")
    : '<div class="empty-state">ما في شركاء بعد. أضف شريك من فوق (اسمه ونسبته من الربح).</div>';

  renderPartnerFundingWorkspace();
  renderPartnerWithdrawalWorkspace(range);

  if (!els.partnersDistribution) return;
  if (!partners.length) { els.partnersDistribution.innerHTML = ""; return; }

  const dist = partnerDistribution(range, "cash");
  const totalPartnerTaken = Number(dist.totalProfitWithdrawals || 0)
    + Number(dist.totalPersonalWithdrawals || 0)
    + Number(dist.totalPartnerAdvances || 0)
    + Number(dist.totalPartnerProducts || 0);
  const withdrawalRows = dist.rows.map((row) => {
    const totalTaken = Number(row.profitWithdrawals || 0) + Number(row.personalWithdrawals || 0)
      + Number(row.advances || 0) + Number(row.withdrawnProducts || 0);
    return `<tr>
      <td><strong>${escapeHtml(row.partner.name)}</strong></td>
      <td>${money(row.profitWithdrawals)}</td>
      <td>${money(row.personalWithdrawals)}</td>
      <td>${money(row.advances)}</td>
      <td>${money(row.withdrawnProducts)}</td>
      <td><strong>${money(totalTaken)}</strong></td>
    </tr>`;
  }).join("");
  const shareWarn = Math.abs(dist.totalSharePercent - 100) > 0.01
    ? `<p class="partners-warn">⚠️ مجموع النسب = ${quantityText(dist.totalSharePercent)}% (المفروض 100%). عدّل النسب فوق.</p>`
    : "";
  const unassignedWarn = dist.unassignedWithdrawn > 0.001
    ? `<p class="partners-warn">📌 في سحوبات ${money(dist.unassignedWithdrawn)} مش منسوبة لأي شريك — اربطها بالشريك الصحيح حتى تنخصم من حصته.</p>`
    : "";
  const shareReady = Math.abs(dist.totalSharePercent - 100) <= 0.01;
  const unassignedReady = dist.unassignedWithdrawn <= 0.001;
  const isOnHandSource = dist.source === "onHand";
  const rows = dist.rows.map((r) => {
    const parts = [];
    if (r.profitWithdrawals > 0.001) parts.push(`أرباح ${money(r.profitWithdrawals)}`);
    if (r.personalWithdrawals > 0.001) parts.push(`شخصي ${money(r.personalWithdrawals)}`);
    if (r.advances > 0.001) parts.push(`سلف ${money(r.advances)}`);
    if (r.withdrawnProducts > 0.001) parts.push(`منتجات ${money(r.withdrawnProducts)}`);
    if (r.carryInDebt > 0.001) parts.push(`مرحل ${money(r.carryInDebt)}`);
    const breakdown = (parts.length > 1 || r.advances > 0.001 || r.withdrawnProducts > 0.001 || r.carryInDebt > 0.001)
      ? `<small>(${parts.join(" + ")})</small>` : "";
    const cashPayout = Number(r.boxPayout || 0);
    const outsideDue = Number(r.outsideDue || 0);
    const overdrawn = Number(r.overdrawn || 0);
    const status = overdrawn > 0.001
      ? `<span class="close-due-negative">أخذ زيادة ${money(overdrawn)}</span>`
      : outsideDue > 0.001
        ? `<span class="close-due-negative">ناقصه ${money(outsideDue)} بسبب نقص الكاش</span>`
        : `<span class="close-due-positive">متسوي</span>`;
    return `
    <tr>
      <td>${escapeHtml(r.partner.name)}</td>
      <td>${quantityText(r.sharePercent)}%</td>
      <td>${money(r.shareAmount)}</td>
      <td>${money(r.totalShareDeductions)} ${breakdown}</td>
      <td class="close-due-positive"><strong>${money(cashPayout)}</strong></td>
      <td>${status}</td>
    </tr>`;
  }).join("");
  const drawsBits = [];
  if (dist.totalPartnerAdvances > 0.5) drawsBits.push(`سلف ${money(dist.totalPartnerAdvances)}`);
  if (dist.totalPartnerProducts > 0.5) drawsBits.push(`منتجات ${money(dist.totalPartnerProducts)}`);
  const drawsNote = drawsBits.length
    ? `<div class="partners-adv-note">ℹ️ ${drawsBits.join(" + ")} محسوبة ضمن "اللي أخذه" للشريك المربوط بالعامل، فتنخصم من حصته.</div>`
    : "";
  // المصدر المختار هو سقف الدفع الفعلي: صندوق الفترة، أو كل الفلوس الموجودة معك الآن.
  const drawerNow = dist.cashNet;
  const periodMoney = Number(dist.periodCashNet ?? dist.cashNet);
  const onHand = typeof cashOnHand === "function" ? cashOnHand() : null;
  const onHandDetails = onHand ? paymentMethods
    .map((method) => `${paymentLabels[method] || method}: ${money(onHand.methods[method].current)}`)
    .join(" | ") : "";
  const onHandMoney = onHand ? Number(onHand.total.current || 0) : Number(dist.moneyOnHand || 0);
  const onHandRow = onHand ? `
      <div class="partners-summary-row partners-money-row ${isOnHandSource ? "is-chosen" : ""}">
        <span>💼 إجمالي الفلوس اللي معي الآن <small>${onHandDetails}</small></span><strong>${money(onHandMoney)}</strong>
      </div>` : "";
  const periodRow = `
      <div class="partners-summary-row ${!isOnHandSource ? "is-chosen" : ""}">
        <span>💵 صندوق الفترة المختارة <small>حسب التاريخ المحدد بالتقرير</small></span><strong>${money(periodMoney)}</strong>
      </div>`;
  const sourceLabel = isOnHandSource ? "كل الفلوس اللي معي الآن" : "صندوق الفترة المختارة";
  const excludedFunding = isOnHandSource ? Number(dist.protectedOnHand || 0) : Number(dist.periodFundingNet || 0);
  const excludedFundingLabel = isOnHandSource ? "تمويل محمي من الفلوس الموجودة" : "صافي تمويل الشركاء داخل الفترة";
  const reconcile = `<div class="partners-reconcile">${shareReady && unassignedReady ? "✅" : "⚠️"} الاستلام الفعلي الآن = <strong>${money(dist.totalBoxPayout)}</strong> من ${sourceLabel}. أساس القسمة = ${money(drawerNow)} + اللي أخذوه ${money(dist.totalWithdrawn)}.</div>`;
  els.partnersDistribution.innerHTML = `
    <section class="partner-withdrawal-overview" aria-label="ملخص سحوبات الشركاء">
      <header>
        <div><h4>ملخص ما أخذه الشركاء</h4><p>${escapeHtml(rangeText(range))}</p></div>
        <strong>${money(totalPartnerTaken)}</strong>
      </header>
      <div class="partner-withdrawal-kpis">
        <div><span>سحب أرباح</span><strong>${money(dist.totalProfitWithdrawals)}</strong></div>
        <div><span>سحب شخصي</span><strong>${money(dist.totalPersonalWithdrawals)}</strong></div>
        <div><span>سلف كشركاء عاملين</span><strong>${money(dist.totalPartnerAdvances)}</strong></div>
        <div><span>منتجات على حسابهم</span><strong>${money(dist.totalPartnerProducts)}</strong></div>
        <div><span>سحوبات غير مربوطة</span><strong class="${dist.unassignedWithdrawn > 0.001 ? "is-danger" : ""}">${money(dist.unassignedWithdrawn)}</strong></div>
      </div>
      <div class="partners-table-wrap">
        <table class="partners-table partner-withdrawal-table">
          <thead><tr><th>الشريك</th><th>أرباح</th><th>شخصي</th><th>سلف</th><th>منتجات</th><th>الإجمالي</th></tr></thead>
          <tbody>${withdrawalRows}</tbody>
        </table>
      </div>
    </section>
    <div class="partners-basis-toggle">
      <span>احسب التوزيع من:</span>
      <button type="button" class="partners-basis-btn ${!isOnHandSource ? "is-active" : ""}" data-partner-source="period">💵 صندوق الفترة</button>
      <button type="button" class="partners-basis-btn ${isOnHandSource ? "is-active" : ""}" data-partner-source="onHand">💼 كل الفلوس اللي معي</button>
    </div>
    <div class="partners-summary-box">
      ${periodRow}
      ${onHandRow}
      <div class="partners-summary-row">
        <span>💸 اللي أخذه الشركاء خلال الفترة <small>بنرجعه لأساس القسمة ثم نخصمه من صاحبه</small></span><strong>${money(dist.totalWithdrawn)}</strong>
      </div>
      <div class="partners-summary-row">
        <span>🧮 أساس القسمة قبل السحوبات</span><strong>${money(dist.base)}</strong>
      </div>
      ${Math.abs(excludedFunding) > 0.001 ? `<div class="partners-summary-row is-protected"><span>${excludedFundingLabel} <small>مستبعد لأنه ليس ربحاً</small></span><strong>${excludedFunding >= 0 ? "−" : "+"}${money(Math.abs(excludedFunding))}</strong></div>` : ""}
      <div class="partners-summary-chosen">نستخدم ${sourceLabel} بعد استبعاد تمويل الشركاء، ثم نضيف اللي أخذوه ونخصمه من صاحبه.</div>
    </div>
    ${drawsNote}${shareWarn}${unassignedWarn}
    <div class="partners-table-wrap">
      <table class="partners-table">
        <thead><tr><th>الشريك</th><th>نسبته</th><th>حصته الحالية</th><th>المخصوم من حصته</th><th>يستلم فعلياً الآن</th><th>الحالة</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${reconcile}`;
}

function selectedPartnerWithdrawalType() {
  return Array.from(els.partnerWithdrawalTypeInputs || []).find((input) => input.checked)?.value || OWNER_WITHDRAWAL_PROFIT;
}

function setPartnerWithdrawalType(kind) {
  const normalized = ownerWithdrawalKinds.includes(kind) ? kind : OWNER_WITHDRAWAL_PROFIT;
  Array.from(els.partnerWithdrawalTypeInputs || []).forEach((input) => { input.checked = input.value === normalized; });
}

function resetPartnerWithdrawalForm(options = {}) {
  editingPartnerWithdrawalId = null;
  const previousPartner = options.partnerId || els.partnerWithdrawalPartnerInput?.value || "";
  els.partnerWithdrawalForm?.reset();
  if (els.partnerWithdrawalDateInput) els.partnerWithdrawalDateInput.value = todayDateInputValue();
  if (els.partnerWithdrawalMethodInput) els.partnerWithdrawalMethodInput.value = getLastPaymentMethod();
  setPartnerWithdrawalType(OWNER_WITHDRAWAL_PROFIT);
  if (previousPartner && getPartner(previousPartner)) els.partnerWithdrawalPartnerInput.value = previousPartner;
  if (els.partnerWithdrawalSubmitButton) els.partnerWithdrawalSubmitButton.textContent = "تسجيل السحب";
  if (els.partnerWithdrawalCancelButton) els.partnerWithdrawalCancelButton.hidden = true;
}

function partnerWithdrawalEntriesForSelection(selection, range) {
  return (state.ownerWithdrawals || [])
    .filter((entry) => selection === "__unassigned__" ? !entry.partnerId : entry.partnerId === selection)
    .filter((entry) => ownerWithdrawalMatchesRange(entry, range))
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function renderPartnerWithdrawalWorkspace(range = selectedReportRange()) {
  if (!els.partnerWithdrawalPartnerInput || !els.partnerWithdrawalSummary || !els.partnerWithdrawalLedger) return;
  const partners = state.partners || [];
  const hasUnassigned = (state.ownerWithdrawals || []).some((entry) => !entry.partnerId);
  const current = els.partnerWithdrawalPartnerInput.value;
  const options = partners.map((partner) => `<option value="${escapeAttr(partner.id)}">${escapeHtml(partner.name)}</option>`);
  if (hasUnassigned) options.push('<option value="__unassigned__">سحوبات قديمة غير منسوبة</option>');
  els.partnerWithdrawalPartnerInput.innerHTML = options.length ? options.join("") : '<option value="">أضف شريكاً أولاً</option>';
  if ((current === "__unassigned__" && hasUnassigned) || getPartner(current)) els.partnerWithdrawalPartnerInput.value = current;
  const selection = els.partnerWithdrawalPartnerInput.value;
  const partner = getPartner(selection);
  const entries = selection ? partnerWithdrawalEntriesForSelection(selection, range) : [];
  const dist = partner ? partnerDistribution(range, "cash") : null;
  const row = dist?.rows.find((item) => item.partner.id === partner.id);
  const funding = partner ? partnerFundingBalance(partner.id) : partnerFundingTotals([]);
  const selectedWithdrawalTotals = ownerWithdrawalTotals(entries);
  const deducted = Number(row?.totalShareDeductions || row?.withdrawn || 0);
  const remaining = Number(row?.remaining || 0);

  els.partnerWithdrawalSummary.innerHTML = partner ? `
    <article><span>حصته قبل السحب</span><strong>${money(row?.shareAmount || 0)}</strong></article>
    <article class="is-profit"><span>سحب أرباح</span><strong>${money(row?.profitWithdrawals || 0)}</strong></article>
    <article class="is-personal"><span>صافي السحب الشخصي بالفترة</span><strong>${money(row?.personalWithdrawals || 0)}</strong><small>بعد طرح المبالغ التي أعادها · مرحل عليه: ${money(row?.carryInDebt || 0)}</small></article>
    <article class="is-return"><span>إرجاع سحب شخصي</span><strong>${money(selectedWithdrawalTotals.personalReturned)}</strong><small>دخل إلى الصندوق</small></article>
    <article><span>سلف العامل المرتبط</span><strong>${money(row?.advances || 0)}</strong></article>
    <article><span>منتجات/مشروبات عليه</span><strong>${money(row?.withdrawnProducts || 0)}</strong></article>
    <article class="is-deducted"><span>إجمالي المخصوم من حصته</span><strong>${money(deducted)}</strong></article>
    <article class="${remaining < -0.001 ? "is-overdrawn" : "is-remaining"}"><span>${remaining < -0.001 ? "أخذ زيادة" : "المتبقي له"}</span><strong>${money(Math.abs(remaining))}</strong></article>
    <article class="is-funding"><span>رد التمويل (منفصل)</span><strong>${money(funding.refunded)}</strong><small>ليس ضمن خصم الحصة</small></article>`
    : selection === "__unassigned__"
      ? `<article class="is-warning"><span>سجل قديم يحتاج ربطاً</span><strong>${quantityText(entries.length)} حركة</strong><small>اضغط تعديل واختر الشريك الصحيح.</small></article>`
      : `<article><span>حساب السحوبات</span><strong>₪0</strong><small>أضف شريكاً أولاً لبدء الكشف.</small></article>`;

  els.partnerWithdrawalLedger.innerHTML = entries.length
    ? `<div class="partner-withdrawal-ledger-head"><strong>${partner ? `كشف سحوبات ${escapeHtml(partner.name)}` : "سحوبات غير منسوبة"}</strong><span>${quantityText(entries.length)} حركة ضمن الفترة</span></div>${entries.map((rawEntry) => {
      const entry = normalizeOwnerWithdrawal(rawEntry);
      const personal = entry.kind === OWNER_WITHDRAWAL_PERSONAL;
      const isReturn = entry.kind === OWNER_WITHDRAWAL_PERSONAL_RETURN;
      return `<article class="partner-withdrawal-entry ${isReturn ? "is-return" : personal ? "is-personal" : "is-profit"} ${entry.partnerId ? "" : "is-unassigned"}">
        <div><span class="partner-withdrawal-kind">${escapeHtml(ownerWithdrawalTypeLabel(entry.kind))}</span><strong>${isReturn ? "+" : "−"}${money(entry.amount)}</strong></div>
        <p>${formatDate(entry.createdAt)} · ${paymentLabels[entry.method] || entry.method}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}${entry.partnerId ? "" : " · يحتاج تحديد شريك"}</p>
        <div class="partner-withdrawal-entry-actions"><button type="button" class="secondary-button" data-edit-partner-withdrawal="${escapeAttr(entry.id)}">تعديل</button><button type="button" class="customer-delete-button" data-delete-partner-withdrawal="${escapeAttr(entry.id)}">حذف</button></div>
      </article>`;
    }).join("")}`
    : `<div class="empty-state">${partner ? "لا توجد سحوبات لهذا الشريك ضمن الفترة المختارة." : "لا توجد سحوبات قديمة غير منسوبة ضمن الفترة."}</div>`;

  const disabled = !partner && selection !== "__unassigned__";
  Array.from(els.partnerWithdrawalForm?.querySelectorAll("input, select, button") || []).forEach((control) => { control.disabled = disabled; });
}

function startEditPartnerWithdrawal(id) {
  const entry = (state.ownerWithdrawals || []).find((item) => item.id === id);
  if (!entry) { showToast("لم أجد السحب المطلوب."); return; }
  if (!guardClosedPeriod(entry.createdAt, "تعديل سحب ضمن فترة مغلقة")) return;
  editingPartnerWithdrawalId = entry.id;
  if (entry.partnerId && getPartner(entry.partnerId)) els.partnerWithdrawalPartnerInput.value = entry.partnerId;
  else els.partnerWithdrawalPartnerInput.value = "__unassigned__";
  setPartnerWithdrawalType(ownerWithdrawalKind(entry));
  els.partnerWithdrawalDateInput.value = invoiceDateInputValue(entry);
  els.partnerWithdrawalAmountInput.value = Number(entry.amount || 0) || "";
  els.partnerWithdrawalMethodInput.value = paymentMethods.includes(entry.method) ? entry.method : "cash";
  els.partnerWithdrawalNoteInput.value = entry.note || "";
  els.partnerWithdrawalSubmitButton.textContent = "حفظ تعديل السحب";
  els.partnerWithdrawalCancelButton.hidden = false;
  els.partnerWithdrawalForm.scrollIntoView({ behavior: "smooth", block: "start" });
  els.partnerWithdrawalAmountInput.focus();
}

function partnerProfitWithdrawalLimit(partnerId, range, editingEntry = null) {
  const dist = partnerDistribution(range, "cash");
  const row = dist.rows.find((item) => item.partner.id === partnerId);
  let available = Math.max(Number(row?.boxPayout || 0), 0);
  if (editingEntry && editingEntry.partnerId === partnerId && ownerWithdrawalKind(editingEntry) === OWNER_WITHDRAWAL_PROFIT && ownerWithdrawalMatchesRange(editingEntry, range)) {
    available += Number(editingEntry.amount || 0);
  }
  return available;
}

function recordPartnerWithdrawal(event) {
  event?.preventDefault();
  const editingEntry = editingPartnerWithdrawalId
    ? (state.ownerWithdrawals || []).find((entry) => entry.id === editingPartnerWithdrawalId)
    : null;
  if (editingPartnerWithdrawalId && !editingEntry) { resetPartnerWithdrawalForm(); showToast("السحب الذي كنت تعدله غير موجود."); return; }
  const partner = getPartner(els.partnerWithdrawalPartnerInput.value);
  const kind = selectedPartnerWithdrawalType();
  const amount = Number(els.partnerWithdrawalAmountInput.value || 0);
  const method = paymentMethods.includes(els.partnerWithdrawalMethodInput.value) ? els.partnerWithdrawalMethodInput.value : "cash";
  const createdAt = invoiceDateFromInput(els.partnerWithdrawalDateInput.value);
  if (!partner) { showToast("اختار الشريك حتى ينخصم السحب من حسابه الصحيح."); return; }
  if (!Number.isFinite(amount) || amount <= 0) { showToast("اكتب مبلغاً أكبر من صفر."); els.partnerWithdrawalAmountInput.focus(); return; }
  if (editingEntry && !guardClosedPeriod(editingEntry.createdAt, "تعديل سحب ضمن فترة مغلقة")) return;
  if (!guardClosedPeriod(createdAt, editingEntry ? "نقل سحب إلى فترة مغلقة" : "تسجيل سحب ضمن فترة مغلقة")) return;
  if (kind === OWNER_WITHDRAWAL_PROFIT) {
    const available = partnerProfitWithdrawalLimit(partner.id, selectedReportRange(), editingEntry);
    if (amount > available + 0.001) {
      showToast(`ربح ${partner.name} المتاح للسحب هو ${money(available)} فقط. إذا سيأخذ أكثر، اختار «سحب شخصي».`);
      return;
    }
  }
  let entry = normalizeOwnerWithdrawal({
    ...editingEntry,
    id: editingEntry?.id || uid("withdraw"),
    kind,
    partnerId: partner.id,
    partnerName: partner.name,
    amount,
    method,
    note: els.partnerWithdrawalNoteInput.value.trim(),
    createdAt
  });
  let split = null;
  let nextWithdrawals = (state.ownerWithdrawals || []).filter((item) => item.id !== editingEntry?.id);
  let nextFunding = (state.partnerFundingTransactions || []).filter((item) => item.sourcePersonalReturnId !== editingEntry?.id);
  if (kind === OWNER_WITHDRAWAL_PERSONAL_RETURN) {
    split = buildPersonalWithdrawalReturnSplit({ partner, editingEntry, amount, method, note: els.partnerWithdrawalNoteInput.value.trim(), createdAt });
    entry = split.returnEntry;
    if (entry) nextWithdrawals.push(entry);
    nextFunding = (state.partnerFundingTransactions || []).filter((item) => item.id !== split.linkedFunding?.id && item.sourcePersonalReturnId !== split.returnId);
    if (split.fundingEntry) nextFunding.push(split.fundingEntry);
  } else {
    nextWithdrawals.push(entry);
  }
  const validation = ownerWithdrawalLedgerValidation(nextWithdrawals, partner.id);
  if (!validation.valid) {
    showToast(`لا يمكن إرجاع هذا المبلغ؛ السحب الشخصي المتبقي أقل بـ ${money(validation.shortage)}.`);
    return;
  }
  state.ownerWithdrawals = nextWithdrawals;
  state.partnerFundingTransactions = nextFunding;
  auditAction(editingEntry ? "partner.withdrawal_edit" : "partner.withdrawal_create", { id: entry?.id || split?.returnId, partnerId: partner.id, partnerName: partner.name, kind, amount, returnedAmount: split?.returnedAmount, excessFunding: split?.excessFunding, method, createdAt });
  setLastPaymentMethod(method);
  resetPartnerWithdrawalForm({ partnerId: partner.id });
  saveState();
  const returnBalance = kind === OWNER_WITHDRAWAL_PERSONAL_RETURN ? cashOnHand().methods[method]?.current : null;
  showToast(kind === OWNER_WITHDRAWAL_PERSONAL_RETURN && split?.excessFunding > 0.001
    ? `تم إرجاع ${money(split.returnedAmount)} من السحب، وتحويل الزيادة ${money(split.excessFunding)} إلى تمويل مسترد. رصيد ${paymentLabels[method] || method} الآن ${money(returnBalance)}.`
    : `${editingEntry ? "تم تعديل" : "تم تسجيل"} ${ownerWithdrawalTypeLabel(kind)} بقيمة ${money(amount)}${kind === OWNER_WITHDRAWAL_PERSONAL ? " وسيُخصم من حصته الحالية أو القادمة." : kind === OWNER_WITHDRAWAL_PERSONAL_RETURN ? ` وإضافته إلى ${paymentLabels[method] || method}. الرصيد الآن ${money(returnBalance)}.` : "."}`);
  render();
}

async function deletePartnerWithdrawal(id) {
  const entry = (state.ownerWithdrawals || []).find((item) => item.id === id);
  if (!entry) return;
  if (!guardClosedPeriod(entry.createdAt, "حذف سحب ضمن فترة مغلقة")) return;
  const nextWithdrawals = (state.ownerWithdrawals || []).filter((item) => item.id !== id);
  const validation = ownerWithdrawalLedgerValidation(nextWithdrawals, entry.partnerId);
  if (!validation.valid) {
    showToast(`لا يمكن حذف هذه الحركة؛ يوجد إرجاع سحب شخصي لاحق يعتمد عليها بقيمة ${money(validation.shortage)}.`);
    return;
  }
  if (!(await appConfirm(`حذف ${ownerWithdrawalTypeLabel(ownerWithdrawalKind(entry))} بقيمة ${money(entry.amount)}${entry.partnerName ? ` للشريك ${entry.partnerName}` : ""}؟`))) return;
  state.ownerWithdrawals = nextWithdrawals;
  state.partnerFundingTransactions = (state.partnerFundingTransactions || []).filter((item) => item.sourcePersonalReturnId !== entry.id);
  if (editingPartnerWithdrawalId === id) resetPartnerWithdrawalForm({ partnerId: entry.partnerId });
  auditAction("partner.withdrawal_delete", { id: entry.id, partnerId: entry.partnerId, kind: ownerWithdrawalKind(entry), amount: entry.amount, method: entry.method, createdAt: entry.createdAt });
  saveState();
  showToast("تم حذف السحب.");
  render();
}

function selectedPartnerFundingType() {
  return Array.from(els.partnerFundingTypeInputs || []).find((input) => input.checked)?.value || PARTNER_FUNDING_REFUNDABLE;
}

function setPartnerFundingType(type) {
  const normalized = partnerFundingTypes.includes(type) ? type : PARTNER_FUNDING_REFUNDABLE;
  Array.from(els.partnerFundingTypeInputs || []).forEach((input) => { input.checked = input.value === normalized; });
}

function resetPartnerFundingForm(options = {}) {
  editingPartnerFundingId = null;
  const previousPartner = options.partnerId || els.partnerFundingPartnerInput?.value || "";
  els.partnerFundingForm?.reset();
  if (els.partnerFundingDateInput) els.partnerFundingDateInput.value = todayDateInputValue();
  if (els.partnerFundingMethodInput) els.partnerFundingMethodInput.value = getLastPaymentMethod();
  setPartnerFundingType(PARTNER_FUNDING_REFUNDABLE);
  if (previousPartner && getPartner(previousPartner)) els.partnerFundingPartnerInput.value = previousPartner;
  if (els.partnerFundingSubmitButton) els.partnerFundingSubmitButton.textContent = "تسجيل حركة التمويل";
  if (els.partnerFundingCancelButton) els.partnerFundingCancelButton.hidden = true;
}

function renderPartnerFundingWorkspace() {
  if (!els.partnerFundingPartnerInput || !els.partnerFundingSummary || !els.partnerFundingLedger) return;
  const partners = state.partners || [];
  const currentPartnerId = els.partnerFundingPartnerInput.value;
  els.partnerFundingPartnerInput.innerHTML = partners.length
    ? partners.map((partner) => `<option value="${escapeAttr(partner.id)}">${escapeHtml(partner.name)}</option>`).join("")
    : '<option value="">أضف شريكاً أولاً</option>';
  if (currentPartnerId && getPartner(currentPartnerId)) els.partnerFundingPartnerInput.value = currentPartnerId;
  const partnerId = els.partnerFundingPartnerInput.value;
  const partner = getPartner(partnerId);
  const entries = partner ? partnerFundingTransactionsFor(partner.id) : [];
  const totals = partner ? partnerFundingBalance(partner.id) : partnerFundingTotals([]);

  els.partnerFundingSummary.innerHTML = `
    <article><span>تمويل مسترد دفعه</span><strong>${money(totals.refundableDeposited)}</strong></article>
    <article class="is-refund"><span>تم إرجاعه</span><strong>${money(totals.refunded)}</strong></article>
    <article class="is-due"><span>باقي مستحق له</span><strong>${money(totals.outstandingRefundable)}</strong></article>
    <article class="is-capital"><span>رأس مال أضافه</span><strong>${money(totals.capital)}</strong></article>`;

  els.partnerFundingLedger.innerHTML = entries.length
    ? `<div class="partner-funding-ledger-head"><strong>كشف حركات ${escapeHtml(partner.name)}</strong><span>${quantityText(entries.length)} حركة</span></div>${entries.map((entry) => {
      const isRefund = entry.type === PARTNER_FUNDING_REFUND;
      return `<article class="partner-funding-entry ${isRefund ? "is-out" : entry.type === PARTNER_FUNDING_CAPITAL ? "is-capital" : "is-in"}">
        <div><span class="partner-funding-badge">${escapeHtml(partnerFundingTypeLabel(entry.type))}</span><strong>${isRefund ? "−" : "+"}${money(entry.amount)}</strong></div>
        <p>${formatDate(entry.createdAt)} · ${paymentLabels[entry.method] || entry.method}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</p>
        <div class="partner-funding-entry-actions"><button type="button" class="secondary-button" data-edit-partner-funding="${escapeAttr(entry.id)}">تعديل</button><button type="button" class="customer-delete-button" data-delete-partner-funding="${escapeAttr(entry.id)}">حذف</button></div>
      </article>`;
    }).join("")}`
    : `<div class="empty-state">${partner ? "لا توجد حركات تمويل لهذا الشريك." : "أضف شريكاً حتى تبدأ حساب التمويل."}</div>`;

  const disabled = !partner;
  Array.from(els.partnerFundingForm?.querySelectorAll("input, select, button") || []).forEach((control) => { control.disabled = disabled; });
}

function setPartnerDistributionBasis(basis) {
  state.partnerDistributionBasis = basis === "profit" ? "profit" : "cash";
  saveState();
  renderPartnersPanel(selectedReportRange());
}

function setPartnerDistributionSource(source) {
  state.partnerDistributionSource = source === "onHand" ? "onHand" : "period";
  saveState();
  renderPartnersPanel(selectedReportRange());
}

function addPartner(event) {
  event.preventDefault();
  const name = els.partnerNameInput.value.trim();
  const share = Math.min(Math.max(Number(els.partnerShareInput.value || 0), 0), 100);
  if (!name) { showToast("اكتب اسم الشريك."); els.partnerNameInput.focus(); return; }
  state.partners = state.partners || [];
  state.partners.push(normalizePartner({ name, sharePercent: share }));
  saveState();
  els.partnerAddForm.reset();
  showToast(`تمت إضافة الشريك ${name}.`);
  renderPartnersPanel(selectedReportRange());
  populateWithdrawPartnerSelect();
}

function updatePartnerShare(id, value) {
  const partner = getPartner(id);
  if (!partner) return;
  partner.sharePercent = Math.min(Math.max(Number(value || 0), 0), 100);
  saveState();
  renderPartnersPanel(selectedReportRange());
}

function updatePartnerWorker(id, workerId) {
  const partner = getPartner(id);
  if (!partner) return;
  partner.workerId = workerId && getWorker(workerId) ? workerId : "";
  saveState();
  renderPartnersPanel(selectedReportRange());
}

function startEditPartnerFunding(id) {
  const entry = (state.partnerFundingTransactions || []).find((item) => item.id === id);
  if (!entry) { showToast("لم أجد حركة التمويل المطلوبة."); return; }
  if (!guardClosedPeriod(entry.createdAt, "تعديل حركة تمويل ضمن فترة مغلقة")) return;
  editingPartnerFundingId = entry.id;
  renderPartnerFundingWorkspace();
  els.partnerFundingPartnerInput.value = entry.partnerId;
  setPartnerFundingType(entry.type);
  els.partnerFundingDateInput.value = invoiceDateInputValue(entry);
  els.partnerFundingAmountInput.value = Number(entry.amount || 0) || "";
  els.partnerFundingMethodInput.value = paymentMethods.includes(entry.method) ? entry.method : "cash";
  els.partnerFundingNoteInput.value = entry.note || "";
  els.partnerFundingSubmitButton.textContent = "حفظ تعديل الحركة";
  els.partnerFundingCancelButton.hidden = false;
  els.partnerFundingForm.scrollIntoView({ behavior: "smooth", block: "start" });
  els.partnerFundingAmountInput.focus();
}

function recordPartnerFunding(event) {
  event?.preventDefault();
  const editingEntry = editingPartnerFundingId
    ? (state.partnerFundingTransactions || []).find((entry) => entry.id === editingPartnerFundingId)
    : null;
  if (editingPartnerFundingId && !editingEntry) { resetPartnerFundingForm(); showToast("حركة التمويل التي كنت تعدلها غير موجودة."); return; }
  const partner = getPartner(els.partnerFundingPartnerInput.value);
  const type = selectedPartnerFundingType();
  const amount = Number(els.partnerFundingAmountInput.value || 0);
  const method = paymentMethods.includes(els.partnerFundingMethodInput.value) ? els.partnerFundingMethodInput.value : "cash";
  const createdAt = invoiceDateFromInput(els.partnerFundingDateInput.value);
  if (!partner) { showToast("اختار الشريك."); return; }
  if (!Number.isFinite(amount) || amount <= 0) { showToast("اكتب مبلغاً أكبر من صفر."); els.partnerFundingAmountInput.focus(); return; }
  if (editingEntry && !guardClosedPeriod(editingEntry.createdAt, "تعديل حركة تمويل ضمن فترة مغلقة")) return;
  if (!guardClosedPeriod(createdAt, editingEntry ? "نقل حركة تمويل إلى فترة مغلقة" : "تسجيل تمويل ضمن فترة مغلقة")) return;

  const entry = normalizePartnerFundingTransaction({
    id: editingEntry?.id || uid("partner-funding"),
    partnerId: partner.id,
    partnerName: editingEntry && editingEntry.partnerId === partner.id ? editingEntry.partnerName : partner.name,
    type,
    amount,
    method,
    note: els.partnerFundingNoteInput.value.trim(),
    createdAt
  });
  const nextTransactions = (state.partnerFundingTransactions || []).filter((item) => item.id !== editingEntry?.id).concat(entry);
  const affectedPartnerIds = new Set([partner.id, editingEntry?.partnerId].filter(Boolean));
  for (const partnerId of affectedPartnerIds) {
    const validation = partnerFundingLedgerValidation(nextTransactions, partnerId);
    if (!validation.valid) {
      showToast(`لا يمكن رد هذا المبلغ؛ رصيد التمويل المسترد لا يكفي بتاريخ الحركة. النقص ${money(validation.shortage)}.`);
      return;
    }
  }

  state.partnerFundingTransactions = nextTransactions;
  auditAction(editingEntry ? "partner.funding_edit" : "partner.funding_create", {
    id: entry.id,
    partnerId: entry.partnerId,
    partnerName: entry.partnerName,
    type: entry.type,
    amount: entry.amount,
    method: entry.method,
    createdAt: entry.createdAt
  });
  setLastPaymentMethod(method);
  resetPartnerFundingForm({ partnerId: partner.id });
  saveState();
  showToast(editingEntry ? "تم حفظ تعديل حركة التمويل." : `تم تسجيل ${partnerFundingTypeLabel(type)} بقيمة ${money(amount)}.`);
  render();
}

async function deletePartnerFunding(id) {
  const entry = (state.partnerFundingTransactions || []).find((item) => item.id === id);
  if (!entry) return;
  if (!guardClosedPeriod(entry.createdAt, "حذف حركة تمويل ضمن فترة مغلقة")) return;
  const nextTransactions = (state.partnerFundingTransactions || []).filter((item) => item.id !== id);
  const validation = partnerFundingLedgerValidation(nextTransactions, entry.partnerId);
  if (!validation.valid) {
    showToast("لا يمكن حذف هذه الحركة لأنها ستجعل رصيد التمويل المسترد سالباً. عدّل أو احذف رد التمويل المرتبط أولاً.");
    return;
  }
  const confirmed = await appConfirm(`حذف ${partnerFundingTypeLabel(entry.type)} بقيمة ${money(entry.amount)} للشريك ${entry.partnerName}؟`);
  if (!confirmed) return;
  state.partnerFundingTransactions = nextTransactions;
  if (editingPartnerFundingId === id) resetPartnerFundingForm({ partnerId: entry.partnerId });
  auditAction("partner.funding_delete", { id: entry.id, partnerId: entry.partnerId, type: entry.type, amount: entry.amount, method: entry.method, createdAt: entry.createdAt });
  saveState();
  showToast("تم حذف حركة التمويل.");
  render();
}

async function deletePartner(id) {
  const partner = getPartner(id);
  if (!partner) return;
  if ((state.partnerFundingTransactions || []).some((entry) => entry.partnerId === id)) {
    showToast(`لا يمكن حذف ${partner.name} لأن له سجل تمويل. احتفظ بالشريك أو صفِّ واحذف حركات التمويل أولاً.`);
    return;
  }
  if ((state.ownerWithdrawals || []).some((entry) => entry.partnerId === id)) {
    showToast(`لا يمكن حذف ${partner.name} لأن له سجل سحوبات. احتفظ بالشريك أو عدّل/احذف سحوباته أولاً.`);
    return;
  }
  const ok = await appConfirm(`حذف الشريك "${partner.name}"؟`);
  if (!ok) return;
  state.partners = (state.partners || []).filter((p) => p.id !== id);
  saveState();
  showToast("تم حذف الشريك.");
  renderPartnersPanel(selectedReportRange());
  populateWithdrawPartnerSelect();
}

function populateWithdrawPartnerSelect() {
  if (!els.closeWithdrawPartner) return;
  const current = els.closeWithdrawPartner.value;
  els.closeWithdrawPartner.innerHTML = ['<option value="">— اختر الشريك —</option>']
    .concat((state.partners || []).map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`))
    .join("");
  if (current && getPartner(current)) els.closeWithdrawPartner.value = current;
}
