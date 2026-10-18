// ═══ دفتر المقهى ═══ 11-extras.js — تذكير النسخ، تقرير اليوم، نقص المخزون، الأكثر مبيعاً
// (مقسوم من app.js — الأسطر 5342-5518)

// ─── End Period Close ───────────────────────────────────────────────────────

// ─── النسخ الاحتياطي: تذكير أسبوعي ──────────────────────────────────────────

const LAST_BACKUP_KEY = "cafe-pos-last-backup-at";
const BACKUP_SNOOZE_KEY = "cafe-pos-backup-snooze-until";

function markBackupDone() {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  els.backupReminderBanner.hidden = true;
}

function renderBackupReminder() {
  if (!isManagerMode()) {
    els.backupReminderBanner.hidden = true;
    return;
  }
  const hasData = state.invoices.length || (state.purchases || []).length;
  if (!hasData) { els.backupReminderBanner.hidden = true; return; }

  const snoozeUntil = localStorage.getItem(BACKUP_SNOOZE_KEY);
  if (snoozeUntil && new Date() < new Date(snoozeUntil)) {
    els.backupReminderBanner.hidden = true;
    return;
  }

  const last = localStorage.getItem(LAST_BACKUP_KEY);
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  const due = !last || days >= 7;
  els.backupReminderBanner.hidden = !due;
  if (due) {
    const text = document.getElementById("backupReminderText");
    if (text) {
      text.textContent = last
        ? `⚠️ آخر نسخة احتياطية قبل ${days} يوم — صدّر نسخة واحفظها على جوجل درايف أو ابعثها واتساب لنفسك!`
        : "⚠️ ما في ولا نسخة احتياطية — بياناتك كلها على هذا الجهاز فقط! صدّر نسخة الآن.";
    }
  }
}

function snoozeBackupReminder() {
  const tomorrow = new Date(Date.now() + 86400000);
  localStorage.setItem(BACKUP_SNOOZE_KEY, tomorrow.toISOString());
  els.backupReminderBanner.hidden = true;
}

// ─── تنقّل الجوال: قائمة المزيد ───────────────────────────────────────────────

const MOBILE_MORE_VIEWS = ["settings", "purchases", "inventory", "expenses", "close", "guide"];

function openMoreSheet() {
  if (els.mobileMoreSheet) els.mobileMoreSheet.hidden = false;
}

function closeMoreSheet() {
  if (els.mobileMoreSheet) els.mobileMoreSheet.hidden = true;
}

function syncMobileMoreActive() {
  if (!els.mobileMoreButton) return;
  els.mobileMoreButton.classList.toggle("is-active", MOBILE_MORE_VIEWS.includes(state.view));
}

// ─── اسم المحل + صفحة الدليل ─────────────────────────────────────────────────

function businessName() {
  return (state.businessName && state.businessName.trim()) || "دفتر المقهى";
}

function applyBusinessName() {
  const name = businessName();
  if (els.brandTitle) els.brandTitle.textContent = name;
  if (els.brandMark) els.brandMark.textContent = name.trim().charAt(0) || "د";
  document.title = `${name} | نظام طاولات وفواتير`;
}

function appTheme() {
  return state.theme === "dark" ? "dark" : "light";
}

function applyAppTheme() {
  const theme = appTheme();
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  try {
    localStorage.setItem(APP_THEME_KEY, theme);
  } catch (error) {
    // تجاهل منع التخزين في بعض المتصفحات.
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#09141a" : "#0f8b8d");
  if (els.themeToggleButton) {
    els.themeToggleButton.classList.toggle("is-dark", theme === "dark");
    els.themeToggleButton.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    const icon = els.themeToggleButton.querySelector(".theme-toggle-icon");
    const text = els.themeToggleButton.querySelector(".theme-toggle-text");
    if (icon) icon.textContent = theme === "dark" ? "☀" : "☾";
    if (text) text.textContent = theme === "dark" ? "نهاري" : "ليلي";
  }
}

let themeSwitchTimer = null;
function toggleAppTheme() {
  state.theme = appTheme() === "dark" ? "light" : "dark";
  // تفعيل الانتقال الناعم لحظة التبديل فقط (حتى لا يبطّئ التحميل أو حركات الأزرار).
  const root = document.documentElement;
  root.classList.add("theme-switching");
  if (themeSwitchTimer) clearTimeout(themeSwitchTimer);
  themeSwitchTimer = setTimeout(() => root.classList.remove("theme-switching"), 450);
  applyAppTheme();
  saveState();
  showToast(state.theme === "dark" ? "تم تشغيل الوضع الليلي." : "تم تشغيل الوضع النهاري.");
}

function saveBusinessName() {
  const value = (els.businessNameInput.value || "").trim();
  if (!value) { showToast("اكتب اسم المحل."); return; }
  state.businessName = value;
  saveState();
  applyBusinessName();
  showToast("تم حفظ الاسم.");
}

function renderGuide() {
  if (els.businessNameInput && document.activeElement !== els.businessNameInput) {
    els.businessNameInput.value = businessName();
  }
  if (!els.guideLive) return;
  const cash = cashOnHand().total.current;
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  const backupText = last ? `آخر نسخة احتياطية قبل ${days} يوم` : "ما في نسخة احتياطية بعد ⚠️";
  const backupClass = (!last || days >= 7) ? "guide-live-warn" : "guide-live-ok";
  const lastClose = (state.periodCloses || []).slice().sort((a, b) => String(b.to).localeCompare(String(a.to)))[0];
  const health = dataHealthReport();
  const healthClass = health.ok ? "guide-live-ok" : "guide-live-warn";
  const healthText = health.ok ? "سليم" : health.issues.slice(0, 2).join("، ");
  if (els.guideBackupStatus) {
    els.guideBackupStatus.textContent = last
      ? `آخر نسخة قبل ${days} يوم — ${days >= 7 ? "متأخرة، صدّر نسخة الآن" : "تمام"}`
      : "ما في نسخة بعد — صدّر نسخة واحفظها بمكان آمن";
  }
  renderBackupCenter();
  if (typeof renderFolderBackupSetting === "function") renderFolderBackupSetting();
  els.guideLive.innerHTML = `
    <article class="guide-live-card"><span>💵 الكاش اللي معك الآن</span><strong>${money(cash)}</strong></article>
    <article class="guide-live-card ${backupClass}"><span>🛡️ النسخ الاحتياطي</span><strong>${backupText}</strong></article>
    <article class="guide-live-card"><span>🔒 آخر إغلاق</span><strong>${lastClose ? lastClose.to : "لا يوجد"}</strong></article>
    <article class="guide-live-card ${healthClass}"><span>🧪 صحة البيانات</span><strong>${escapeHtml(healthText || "راجع البيانات")}</strong></article>
    <article class="guide-live-card"><span>🧾 سجل التدقيق</span><strong>${(state.auditLog || []).length} عملية</strong></article>
  `;

  const auditHost = document.getElementById("auditLogList");
  if (auditHost) {
    const rows = (state.auditLog || []).slice(0, 8);
    auditHost.innerHTML = rows.length
      ? `<div class="audit-log-head"><strong>آخر عمليات التدقيق</strong><span>آخر ${rows.length} من ${state.auditLog.length}</span></div>
        ${rows.map((entry) => `
          <article class="audit-log-row">
            <span>${escapeHtml(auditActionLabel(entry.action))}</span>
            <small>${formatDate(entry.createdAt)}</small>
          </article>
        `).join("")}`
      : "";
  }
}

function backupSourceLabel(source) {
  return {
    manual: "حفظ يدوي",
    daily: "نسخة يومية",
    auto: "حفظ تلقائي",
    before_restore: "قبل استرجاع",
    before_import: "قبل استيراد"
  }[source] || "نسخة داخلية";
}

function backupSizeText(bytes) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} م.ب`;
  if (size >= 1024) return `${Math.round(size / 1024)} ك.ب`;
  return `${size} بايت`;
}

function backupSnapshotStats(nextState) {
  return [
    `فواتير ${quantityText(nextState.invoices.length)}`,
    `عملاء ${quantityText(nextState.customers.length)}`,
    `أصناف ${quantityText(nextState.menu.length)}`,
    `عمال ${quantityText(nextState.workers.length)}`,
    `تمويل شركاء ${quantityText((nextState.partnerFundingTransactions || []).length)}`,
    `موردين ${quantityText((nextState.supplierTransactions || []).length + (nextState.supplierPayments || []).length)}`
  ].join(" | ");
}

async function renderBackupCenter() {
  if (!els.backupCenter) return;
  const snapshots = await backupSnapshots();
  const latest = snapshots[0] || null;
  const latestState = snapshotState(latest);
  if (els.restoreLatestBackupButton) {
    els.restoreLatestBackupButton.disabled = !latestState;
  }

  if (!latest || !latestState) {
    els.backupCenter.innerHTML = `
      <article class="backup-center-card is-empty">
        <span>النسخ الداخلية</span>
        <strong>لا توجد نسخة داخلية بعد</strong>
        <small>اضغط حفظ نسخة داخلية أو انتظر الحفظ التلقائي بعد استخدام البرنامج.</small>
      </article>
    `;
    return;
  }

  const latestHealth = dataHealthReport(latestState);
  const rows = snapshots.slice(0, 8).map((snapshot, index) => {
    const nextState = snapshotState(snapshot);
    if (!nextState) return "";
    const health = dataHealthReport(nextState);
    const key = backupSnapshotKey(snapshot);
    const isLatest = index === 0;
    return `
      <article class="backup-snapshot-row ${isLatest ? "is-latest" : ""}">
        <div>
          <strong>${escapeHtml(formatDate(snapshot.createdAt))}</strong>
          <small>${escapeHtml(backupSourceLabel(snapshot.source))} | ${backupSnapshotStats(nextState)} | ${backupSizeText(snapshot.payloadSize)}</small>
          <em class="${health.ok ? "is-ok" : "is-warn"}">${health.ok ? "سليمة" : `تحتاج مراجعة: ${escapeHtml(health.issues.join("، "))}`}</em>
        </div>
        <div class="backup-snapshot-actions">
          <button class="secondary-button" type="button" data-download-backup-snapshot="${escapeAttr(key)}">تنزيل</button>
          <button class="invoice-cancel-button" type="button" data-restore-backup-snapshot="${escapeAttr(key)}">استرجاع</button>
        </div>
      </article>
    `;
  }).join("");

  els.backupCenter.innerHTML = `
    <article class="backup-center-card ${latestHealth.ok ? "is-ok" : "is-warn"}">
      <span>آخر نسخة داخلية</span>
      <strong>${formatDate(latest.createdAt)}</strong>
      <small>${quantityText(Math.max(snapshots.length, 1))} محفوظة | ${backupSnapshotStats(latestState)} | ${latestHealth.ok ? "النسخة سليمة" : `ملاحظات: ${escapeHtml(latestHealth.issues.join("، "))}`}</small>
    </article>
    <div class="backup-snapshot-list">
      ${rows || '<div class="empty-state">لا توجد نسخ داخلية صالحة للعرض.</div>'}
    </div>
  `;
}

function auditActionLabel(action) {
  return {
    "backup.internal": "حفظ نسخة داخلية",
    "backup.import": "استيراد نسخة احتياطية",
    "backup.restore": "استرجاع نسخة داخلية",
    "customer.update": "تعديل عميل",
    "customer.payment.pos": "دفعة عميل من صفحة البيع",
    "customer.merge": "دمج عميلين",
    "customers.import": "استيراد عملاء",
    "invoices.import": "استيراد فواتير",
    "menu.import": "استيراد أصناف",
    "invoice.cancel": "إلغاء فاتورة",
    "invoice.edit": "تعديل فاتورة",
    "invoice.delete": "حذف فاتورة",
    "table.merge": "دمج/نقل طاولة",
    "purchase.create": "إضافة فاتورة مشتريات",
    "purchase.edit": "تعديل فاتورة مشتريات",
    "purchase.delete": "حذف فاتورة مشتريات",
    "supplier.transaction": "حركة حساب مورد",
    "supplier.transaction.edit": "تعديل حركة مورد",
    "supplier.transaction.delete": "حذف حركة مورد",
    "expense.create": "إضافة مصروف",
    "expense.edit": "تعديل مصروف",
    "expense.delete": "حذف مصروف",
    "owner_withdrawal.create": "تسجيل سحب حصة",
    "owner_withdrawal.delete": "حذف سحب حصة",
    "partner.withdrawal_create": "إضافة سحب شريك",
    "partner.withdrawal_edit": "تعديل سحب شريك",
    "partner.withdrawal_delete": "حذف سحب شريك",
    "worker.transaction.create": "إضافة حركة عامل",
    "worker.transaction.edit": "تعديل حركة عامل",
    "worker.transaction.delete": "حذف حركة عامل",
    "worker.consumption.create": "إضافة مشروب عامل",
    "worker.consumption.edit": "تعديل مشروب عامل",
    "worker.consumption.delete": "حذف مشروب عامل",
    "partner.worker_link": "ربط عامل كشريك",
    "partner.funding_create": "إضافة تمويل شريك",
    "partner.funding_edit": "تعديل تمويل شريك",
    "partner.funding_delete": "حذف تمويل شريك",
    "period_close.approve": "اعتماد إغلاق فترة",
    "period_close.delete": "حذف إغلاق فترة",
    "workers.pay_all": "تسوية رواتب العمال"
  }[action] || action || "عملية";
}

// ─── تقرير نهاية اليوم (Z-Report) ───────────────────────────────────────────

function printDayReport() {
  const range = selectedReportRange();
  const data = reportData(range);
  const cashbox = cashboxBreakdown(data);
  const itemRows = reportItemRows(range);
  const customerRows = reportCustomerRows();
  const managerHealth = reportManagerHealth(data, cashbox);
  const managerInsights = reportActionInsights(data, cashbox, itemRows);

  const averageInvoice = data.saleInvoices.length ? data.salesTotal / data.saleInvoices.length : 0;
  const collectionRate = data.salesTotal > 0 ? (data.paidTotal / data.salesTotal) * 100 : 0;
  const itemProfitMargin = data.salesTotal > 0 ? (data.itemProfit / data.salesTotal) * 100 : 0;
  const inventoryNet = Number(data.inventorySummary.net || 0);
  const profitAfterInventory = data.profitWithWorkersPayrollAndInventory;

  const kpiRow = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;
  const insightRows = managerInsights.length
    ? managerInsights.map((insight) => `<tr><th>${escapeHtml(insight.title)}</th><td>${escapeHtml(insight.detail)}</td></tr>`).join("")
    : `<tr><td colspan="2">لا توجد ملاحظات مهمة</td></tr>`;

  const methodRows = paymentMethods.map((method) => `
    <tr>
      <td>${paymentLabels[method]}</td>
      <td>${money(cashbox.boxIn[method])}</td>
      <td>${money(cashbox.boxOut[method])}</td>
      <td class="${cashbox.boxNet[method] >= 0 ? "is-pos" : "is-neg"}">${cashbox.boxNet[method] >= 0 ? "+" : "−"}${money(Math.abs(cashbox.boxNet[method]))}</td>
    </tr>
  `).join("");

  const itemRowsHtml = itemRows.length
    ? itemRows.map(({ item, stats, workerStats }) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${quantityText(stats.qty)}</td>
        <td>${workerStats.qty > 0 ? quantityText(workerStats.qty) : "-"}</td>
        <td>${money(stats.sales)}</td>
        <td>${money(stats.profit)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">لا توجد مبيعات أصناف بهالفترة</td></tr>`;

  const customerRowsHtml = customerRows.length
    ? customerRows.map((customer) => `<tr><td>${escapeHtml(customer.name)}</td><td>${balanceText(Number(customer.balance || 0))}</td></tr>`).join("")
    : `<tr><td colspan="2">لا يوجد أرصدة حالية</td></tr>`;

  const host = document.createElement("div");
  host.className = "print-host";
  host.innerHTML = `
    <div class="print-invoice">
      <header class="pro-report-header">
        <h1>${escapeHtml(businessName())}</h1>
        <p class="pro-report-subtitle">🧾 تقرير مالي شامل</p>
        <p class="pro-report-period">${escapeHtml(rangeText(range))} | طبع بتاريخ ${formatDate(new Date().toISOString())}</p>
      </header>

      <section class="pro-report-section">
        <h2>مركز المدير</h2>
        <table class="statement-table">
          ${kpiRow("الحالة العامة", managerHealth.label)}
          ${kpiRow("قراءة مختصرة", escapeHtml(managerHealth.sentence))}
          ${kpiRow("الربح الصافي", money(profitAfterInventory))}
          ${kpiRow("صافي الصندوق", money(cashbox.cashNet))}
          ${kpiRow("نسبة التحصيل", data.salesTotal > 0 ? `${collectionRate.toFixed(1)}%` : "لا يوجد")}
          ${kpiRow("ديون العملاء الحالية (كل الفترات)", data.customerSummary.debt > 0.001 ? money(data.customerSummary.debt) : "لا يوجد")}
        </table>
        <table class="statement-table">
          <thead><tr><th>ملاحظة</th><th>التفصيل</th></tr></thead>
          <tbody>${insightRows}</tbody>
        </table>
      </section>

      <section class="pro-report-section">
        <h2>📊 نظرة سريعة</h2>
        <table class="statement-table">
          ${kpiRow("عدد فواتير البيع", quantityText(data.saleInvoices.length))}
          ${kpiRow("إجمالي المبيعات", money(data.salesTotal))}
          ${kpiRow("المقبوض داخل فواتير البيع", money(data.paidTotal))}
          ${kpiRow("تسديد ديون عملاء بالفترة", money(cashbox.paymentsReceived || 0))}
          ${kpiRow("متوسط الفاتورة", data.saleInvoices.length ? money(averageInvoice) : "لا يوجد")}
          ${kpiRow("نسبة التحصيل", data.salesTotal > 0 ? `${collectionRate.toFixed(1)}%` : "لا يوجد")}
          ${kpiRow("هامش ربح الأصناف", data.salesTotal > 0 ? `${itemProfitMargin.toFixed(1)}%` : "لا يوجد")}
        </table>
      </section>

      <section class="pro-report-section">
        <h2>💰 الصندوق حسب طريقة الدفع</h2>
        <table class="statement-table">
          <thead><tr><th>الطريقة</th><th>دخل</th><th>طلع</th><th>الصافي</th></tr></thead>
          <tbody>${methodRows}</tbody>
        </table>
        <p class="pro-report-total">صافي الصندوق كامل (كل الطرق): <strong>${money(cashbox.cashNet)}</strong></p>
      </section>

      <section class="pro-report-section">
        <h2>📉 المصروفات والالتزامات</h2>
        <table class="statement-table">
          ${kpiRow("مشتريات", money(data.purchasesTotal))}
          ${Number(data.purchaseDiscountTotal || 0) > 0.001 ? kpiRow("خصومات مشتريات", money(data.purchaseDiscountTotal)) : ""}
          ${kpiRow("مدفوع للموردين", money(data.supplierPaymentsTotal))}
          ${kpiRow("دين مباشر لمورد", money(data.supplierDirectDebtsTotal || 0))}
          ${kpiRow("مصروفات عامة", money(data.expensesTotal))}
          ${expenseCategoryIds.map((category) => {
            const total = data.expenses
              .filter((expense) => inferExpenseCategory(expense) === category)
              .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
            return total > 0.001 ? kpiRow(`مصروفات: ${expenseCategoryLabel(category)}`, money(total)) : "";
          }).join("")}
          ${kpiRow("سلف عمال", money(data.workerTransactionSummary.advances))}
          ${kpiRow("قبضات عمال مدفوعة", money(data.workerTransactionSummary.salaryPaid))}
          ${kpiRow("دفعات من العمال", money(data.workerTransactionSummary.paymentIn))}
          ${kpiRow("سحب أرباح", money(data.ownerWithdrawalSummary?.profit || 0))}
          ${kpiRow("سحب شخصي للشركاء", money(data.ownerWithdrawalSummary?.personal || 0))}
        </table>
      </section>

      <section class="pro-report-section">
        <h2>📦 الجرد</h2>
        <table class="statement-table">
          ${kpiRow("فرق الجرد (للمعرفة فقط)", money(inventoryNet))}
          ${kpiRow("قيمة الزيادة", money(data.inventorySummary.increase))}
          ${kpiRow("قيمة النقص", money(data.inventorySummary.decrease))}
          ${kpiRow("تالف مخزون", money(data.inventoryWasteTotal || 0))}
        </table>
      </section>

      <section class="pro-report-section">
        <h2>📈 الربح</h2>
        <table class="statement-table">
          ${kpiRow("ربح الأصناف المباعة", money(data.itemProfit))}
          ${kpiRow("صافي استهلاك العمال", money(data.workerSummary.net))}
          ${kpiRow("الربح الصافي النهائي", money(profitAfterInventory))}
        </table>
      </section>

      <section class="pro-report-section">
        <h2>🏆 كل الأصناف (مبيعات + استهلاك عمال)</h2>
        <table class="statement-table">
          <thead><tr><th>الصنف</th><th>المباعة</th><th>استهلاك عمال</th><th>المبيعات</th><th>الربح</th></tr></thead>
          <tbody>${itemRowsHtml}</tbody>
        </table>
      </section>

      <section class="pro-report-section">
        <h2>👥 ديون العملاء الحالية</h2>
        <table class="statement-table">
          <thead><tr><th>العميل</th><th>الحالة</th></tr></thead>
          <tbody>${customerRowsHtml}</tbody>
        </table>
      </section>

      <footer class="pro-report-footer">
        <div class="pro-report-signature">
          <span>توقيع المسؤول: ______________________</span>
          <span>التاريخ: ______________________</span>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(host);
  window.print();
  host.remove();
}

// ─── تنبيه نقص المخزون ──────────────────────────────────────────────────────

function lowStockItems() {
  const threshold = Number(state.lowStockThreshold || 0);
  const purchaseItems = purchaseInventoryItems();
  const menuItems = state.menu.filter((item) => isStockTracked(item) && !menuItemComponents(item).length);
  return purchaseItems.concat(menuItems)
    .filter((item) => typeof purchaseInventoryCanAlert !== "function" || purchaseInventoryCanAlert(item))
    .filter((item) => Number(item.stockQty || 0) <= threshold)
    .sort((a, b) => Number(a.stockQty || 0) - Number(b.stockQty || 0));
}

function inactiveLowPurchaseItems() {
  if (typeof normalizePurchaseInventoryStatus !== "function") return [];
  const threshold = Number(state.lowStockThreshold || 0);
  return purchaseInventoryItems()
    .filter((item) => !item.hidden)
    .filter((item) => normalizePurchaseInventoryStatus(item.availabilityStatus) !== "active")
    .filter((item) => Number(item.stockQty || 0) <= threshold)
    .sort((a, b) => Number(a.stockQty || 0) - Number(b.stockQty || 0));
}

function purchaseSuggestionTarget() {
  const threshold = Math.max(Number(state.lowStockThreshold || 0), 0);
  return threshold > 0 ? Math.max(threshold * 2, threshold + 1) : 1;
}

function purchaseSuggestionForItem(item) {
  const current = Number(item.stockQty || 0);
  const target = purchaseSuggestionTarget();
  const needed = Math.max(target - current, 1);
  const unit = itemUnit(item);
  let buyText = quantityWithUnit(needed, unit);
  let detailText = `ارفعه إلى ${quantityWithUnit(target, unit)}`;

  if (typeof purchaseInventoryPackageInfo === "function") {
    const packageInfo = purchaseInventoryPackageInfo(item);
    if (packageInfo?.stockPerPurchase > 0 && packageInfo.purchaseUnit) {
      const purchaseQty = Math.max(Math.ceil(needed / packageInfo.stockPerPurchase), 1);
      const stockQty = purchaseQty * packageInfo.stockPerPurchase;
      buyText = quantityWithUnit(purchaseQty, packageInfo.purchaseUnit);
      detailText = `يدخل تقريباً ${quantityWithUnit(stockQty, packageInfo.stockUnit || unit)} | ${detailText}`;
    }
  }

  return { item, buyText, detailText };
}

function renderPurchaseSuggestions(items = lowStockItems()) {
  if (!els.purchaseSuggestionsList) return;
  const suggestions = items.map(purchaseSuggestionForItem);
  els.purchaseSuggestionsList.innerHTML = suggestions.length
    ? `
      <div class="purchase-suggestions-head">
        <div>
          <strong>قائمة شراء مقترحة</strong>
          <small>${quantityText(suggestions.length)} صنف نشط</small>
        </div>
        <button class="secondary-button" type="button" data-go-purchases-from-inventory>فتح المشتريات</button>
      </div>
      ${suggestions.map(({ item, buyText, detailText }) => `
        <article class="purchase-suggestion-row">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <small>المتوفر الآن: ${quantityWithUnit(Number(item.stockQty || 0), itemUnit(item))}</small>
            ${item.inventorySource === "purchase" ? purchaseInventoryStatusBadge(item) : ""}
          </div>
          <span class="purchase-suggestion-qty">${escapeHtml(buyText)}</span>
          <small>${escapeHtml(detailText)}</small>
        </article>
      `).join("")}
    `
    : "";
}

function renderLowStock() {
  if (!els.lowStockPanel) return;
  els.lowStockThresholdInput.value = state.lowStockThreshold;
  const items = lowStockItems();
  const inactiveItems = inactiveLowPurchaseItems();
  const emptyItems = items.filter((item) => Number(item.stockQty || 0) <= 0);
  const lowItems = items.length - emptyItems.length;
  const inactiveNote = inactiveItems.length
    ? `<div class="low-stock-muted-note">تم فصل ${quantityText(inactiveItems.length)} مادة تصفية/موقوفة عن اقتراحات الشراء.</div>`
    : "";

  els.lowStockList.innerHTML = `
    <div class="low-stock-overview">
      <span>نشط ناقص</span>
      <strong>${quantityText(items.length)}</strong>
      <small>فارغ ${quantityText(emptyItems.length)} | على الحد ${quantityText(lowItems)}</small>
    </div>
    ${items.length
      ? items.map((item) => `
      <article class="low-stock-row ${Number(item.stockQty || 0) <= 0 ? "is-empty" : ""}">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${item.inventorySource === "purchase" ? purchaseInventoryStatusLabel(item.availabilityStatus) : "صنف بيع"}</small>
        </div>
        <span>${quantityWithUnit(Number(item.stockQty || 0), itemUnit(item))}</span>
      </article>
    `).join("")
      : '<div class="empty-state">كل المخزون النشط فوق حد التنبيه ✓</div>'}
    ${inactiveNote}
  `;
  renderPurchaseSuggestions(items);

  // شارة على تبويب الجرد
  const inventoryTab = Array.from(els.tabs).find((tab) => tab.dataset.view === "inventory");
  if (inventoryTab) {
    let badge = inventoryTab.querySelector(".tab-alert-badge");
    if (items.length) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "tab-alert-badge";
        inventoryTab.appendChild(badge);
      }
      badge.textContent = items.length;
    } else if (badge) {
      badge.remove();
    }
  }
}

// ─── الأكثر مبيعاً + أوقات الذروة ───────────────────────────────────────────

function reportSaleInvoices(range) {
  return (state.invoices || []).filter((invoice) => {
    return invoice.type === "sale" && !invoiceIsCancelled(invoice) && invoiceMatchesDateRange(invoice, range);
  });
}

function reportTopItemRows(range) {
  const totals = new Map();
  reportSaleInvoices(range).forEach((invoice) => {
    (invoice.items || []).forEach((line) => {
      const key = String(line.id || line.name || "صنف");
      const net = invoiceLineNet(invoice, line);
      const cost = Number(line.cost || 0) * Number(line.qty || 0);
      const entry = totals.get(key) || { name: line.name || "صنف", qty: 0, sales: 0, profit: 0 };
      entry.qty += Number(line.qty || 0);
      entry.sales += net;
      entry.profit += net - cost;
      totals.set(key, entry);
    });
  });
  return Array.from(totals.values()).sort((a, b) => b.qty - a.qty || b.sales - a.sales);
}

function renderTopItemsAndPeakHours() {
  if (!els.reportTopItemsList) return;
  const range = selectedReportRange();
  const saleInvoices = reportSaleInvoices(range);

  // الأكثر مبيعاً
  const top = reportTopItemRows(range).slice(0, 10);
  const maxQty = top.length ? top[0].qty : 0;

  els.reportTopItemsList.innerHTML = top.length
    ? top.map((entry, index) => `
      <article class="top-item-row">
        <span class="top-item-rank">${index + 1}</span>
        <div class="top-item-info">
          <strong>${escapeHtml(entry.name)}</strong>
          <div class="top-item-bar"><div class="top-item-bar-fill" style="width:${maxQty ? Math.round((entry.qty / maxQty) * 100) : 0}%"></div></div>
        </div>
        <span class="top-item-figures">${quantityText(entry.qty)} | مبيعات ${money(entry.sales)} | ربح ${money(entry.profit)}</span>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد مبيعات ضمن الفترة.</div>';

  // أوقات الذروة
  const hours = new Array(24).fill(0);
  saleInvoices.forEach((invoice) => {
    const hour = new Date(invoice.createdAt).getHours();
    hours[hour] += Number(invoice.total || 0);
  });
  const maxHour = Math.max(...hours);

  els.reportHoursChart.innerHTML = maxHour > 0
    ? `<div class="peak-hours-bars">${hours.map((value, hour) => `
        <div class="peak-hour-col ${value === maxHour ? "is-peak" : ""}" title="الساعة ${hour}:00 — ${money(value)}">
          <div class="peak-hour-bar" style="height:${Math.max(Math.round((value / maxHour) * 100), value > 0 ? 4 : 0)}%"></div>
          <span class="peak-hour-label">${hour}</span>
        </div>
      `).join("")}</div>
      <p class="peak-hours-note">أعلى ذروة: الساعة ${hours.indexOf(maxHour)}:00 بمبيعات ${money(maxHour)}</p>`
    : '<div class="empty-state">لا توجد مبيعات ضمن الفترة.</div>';

  // مبيعات آخر 14 يوم (مستقل عن فلتر الفترة)
  const dailyHost = document.getElementById("reportDailyChart");
  if (dailyHost) {
    const dayKeyFor = (date) => {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 10);
    };
    const days = [];
    const dayIndex = {};
    const base = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const key = dayKeyFor(d);
      dayIndex[key] = days.length;
      days.push({ key, label: `${d.getDate()}/${d.getMonth() + 1}`, total: 0 });
    }
    state.invoices.forEach((invoice) => {
      if (invoice.type !== "sale" || invoiceIsCancelled(invoice)) return;
      const k = (invoice.createdAt || "").slice(0, 10);
      if (k in dayIndex) days[dayIndex[k]].total += Number(invoice.total || 0);
    });
    const maxDay = Math.max(...days.map((d) => d.total), 0);
    const totalRange = days.reduce((sum, d) => sum + d.total, 0);
    dailyHost.innerHTML = maxDay > 0
      ? `<div class="daily-bars">${days.map((d) => `
          <div class="daily-col ${d.total === maxDay ? "is-peak" : ""}" title="${d.label} — ${money(d.total)}">
            <div class="daily-bar" style="height:${Math.max(Math.round((d.total / maxDay) * 100), d.total > 0 ? 4 : 0)}%"></div>
            <span class="daily-label">${d.label}</span>
          </div>`).join("")}</div>
        <p class="peak-hours-note">إجمالي آخر 14 يوم: ${money(totalRange)} — أعلى يوم: ${money(maxDay)}</p>`
      : '<div class="empty-state">لا توجد مبيعات في آخر 14 يوم.</div>';
  }

  // تحليلات أعمق: ربح كل تصنيف + مقارنة بالشهر الماضي
  renderCategoryProfit(range);
  renderMonthComparison();
}

// ─── تحليلات: ربح كل تصنيف ──────────────────────────────────────
function lineCategoryName(line) {
  if (!line || !line.id) return "أصناف مؤقتة";
  const baseId = String(line.id).split("__")[0];
  const item = (state.menu || []).find((m) => m.id === baseId);
  if (item) return item.category || "بدون تصنيف";
  return line.temporary ? "أصناف مؤقتة" : "أخرى";
}

function reportCategoryRows(range) {
  const map = new Map();
  reportSaleInvoices(range).forEach((invoice) => {
    (invoice.items || []).forEach((line) => {
      const cat = lineCategoryName(line);
      const net = invoiceLineNet(invoice, line);
      const cost = Number(line.cost || 0) * Number(line.qty || 0);
      const entry = map.get(cat) || { category: cat, qty: 0, sales: 0, profit: 0 };
      entry.qty += Number(line.qty || 0);
      entry.sales += net;
      entry.profit += net - cost;
      map.set(cat, entry);
    });
  });
  return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
}

function renderCategoryProfit(range) {
  const host = document.getElementById("reportCategoryList");
  if (!host) return;
  const rows = reportCategoryRows(range);
  const maxProfit = rows.reduce((m, r) => Math.max(m, r.profit), 0) || 1;
  host.innerHTML = rows.length
    ? rows.map((r) => `
      <article class="report-row category-row">
        <div class="category-row-main">
          <strong>${escapeHtml(r.category)}</strong>
          <div class="cat-bar"><div style="width:${Math.max(0, Math.round((r.profit / maxProfit) * 100))}%"></div></div>
        </div>
        <div class="category-row-figures">
          <span>مبيعات ${money(r.sales)}</span>
          <strong class="cat-profit ${r.profit < 0 ? "is-neg" : ""}">ربح ${money(r.profit)}</strong>
          <small>${quantityText(r.qty)} مباع</small>
        </div>
      </article>`).join("")
    : '<div class="empty-state">لا توجد مبيعات ضمن الفترة.</div>';
}

// ─── تحليلات: مقارنة بالشهر الماضي ──────────────────────────────
function monthRangeFor(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const key = (d) => {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  return { minDate: key(start), maxDate: key(end) };
}

function monthSalesProfit(range) {
  let sales = 0, profit = 0, count = 0;
  reportSaleInvoices(range).forEach((invoice) => {
    sales += Number(invoice.total || 0);
    profit += invoiceItemProfit(invoice);
    count += 1;
  });
  return { sales, profit, count };
}

function renderMonthComparison() {
  const host = document.getElementById("reportComparison");
  if (!host) return;
  const cur = monthSalesProfit(monthRangeFor(0));
  const prev = monthSalesProfit(monthRangeFor(-1));
  const row = (label, c, p, isMoney) => {
    const diff = c - p;
    const pct = p > 0 ? (diff / p) * 100 : (c > 0 ? 100 : 0);
    const up = diff >= 0;
    const fmt = isMoney ? money : (v) => quantityText(v);
    return `
      <article class="cmp-row ${up ? "is-up" : "is-down"}">
        <span class="cmp-label">${label}</span>
        <div class="cmp-vals"><strong>${fmt(c)}</strong><small>الشهر الماضي ${fmt(p)}</small></div>
        <span class="cmp-delta">${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%</span>
      </article>`;
  };
  host.innerHTML = row("المبيعات", cur.sales, prev.sales, true)
    + row("ربح الأصناف", cur.profit, prev.profit, true)
    + row("عدد الفواتير", cur.count, prev.count, false);
}

// ═══ قفل البرنامج برمز PIN ══════════════════════════════════════
// تخزين الرمز مُجزّأ (hash) حتى لا يظهر صريحًا في النسخة الاحتياطية.
function hashPin(raw) {
  const text = String(raw || "");
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return "p" + h.toString(36);
}

function hasAppPin() {
  return !!(state.appPin && String(state.appPin).length);
}

function isValidPinFormat(raw) {
  return /^\d{4,6}$/.test(String(raw || ""));
}

function setAppPin(raw) {
  if (!isValidPinFormat(raw)) {
    showToast("الرمز لازم يكون 4 إلى 6 أرقام.");
    return false;
  }
  state.appPin = hashPin(raw);
  saveState();
  showToast("تم تفعيل قفل البرنامج. 🔒");
  renderPinSettings();
  return true;
}

function clearAppPin(currentRaw) {
  if (!hasAppPin()) return true;
  if (hashPin(currentRaw) !== state.appPin) {
    showToast("الرمز الحالي غير صحيح.");
    return false;
  }
  state.appPin = "";
  saveState();
  currentUserRole = "manager";
  showToast("تم إلغاء قفل البرنامج.");
  renderPinSettings();
  render();
  return true;
}

function setUserRole(role, options = {}) {
  currentUserRole = role === "manager" ? "manager" : "cashier";
  ensurePermittedView();
  if (typeof syncRoleUi === "function") syncRoleUi();
  renderTabs();
  renderActiveView();
  saveState();
  if (!options.quiet) {
    showToast(isManagerMode() ? "تم تفعيل وضع المدير." : "تم الرجوع لوضع الكاشير.");
  }
}

function syncRoleUi() {
  if (document?.documentElement) document.documentElement.dataset.userRole = currentUserRole;
  if (els.roleToggleButton) {
    els.roleToggleButton.classList.toggle("is-manager", isManagerMode());
    els.roleToggleButton.classList.toggle("is-cashier", !isManagerMode());
    els.roleToggleButton.textContent = isManagerMode() ? "مدير" : "دخول مدير";
    els.roleToggleButton.title = isManagerMode() ? "الخروج إلى وضع الكاشير" : "إدخال رمز المدير";
  }

  els.tabs.forEach((tab) => {
    const hidden = isManagerOnlyView(tab.dataset.view) && !isManagerMode();
    tab.hidden = hidden;
    tab.setAttribute("aria-hidden", hidden ? "true" : "false");
    if (hidden) tab.classList.remove("is-active");
  });

  document.querySelectorAll("[data-manager-only]").forEach((node) => {
    const hidden = !isManagerMode();
    if (hidden) {
      if (!node.dataset.managerOriginalHidden) node.dataset.managerOriginalHidden = node.hidden ? "true" : "false";
      node.hidden = true;
    } else if (node.dataset.managerOriginalHidden) {
      node.hidden = node.dataset.managerOriginalHidden === "true";
      delete node.dataset.managerOriginalHidden;
    }
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
  });

  document.querySelectorAll("[data-manager-disabled]").forEach((node) => {
    node.disabled = !isManagerMode();
    node.setAttribute("aria-disabled", !isManagerMode() ? "true" : "false");
  });

  if (els.mobileMoreButton) {
    const visibleMoreItems = Array.from(document.querySelectorAll(".mobile-more-item"))
      .some((button) => !button.hidden);
    els.mobileMoreButton.hidden = !isManagerMode() || !visibleMoreItems;
  }
}

function showManagerLoginCard(nextView = "") {
  if (document.getElementById("managerLoginOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "managerLoginOverlay";
  overlay.className = "app-lock-overlay manager-login-overlay";
  overlay.innerHTML = `
    <div class="app-lock-box manager-login-box">
      <div class="app-lock-icon">🔐</div>
      <h2>دخول المدير</h2>
      <p>اكتب رمز المدير لفتح العملاء والفواتير والتقارير والإعدادات والجرد.</p>
      <input id="managerLoginInput" class="app-lock-input" type="password" inputmode="numeric" autocomplete="off" maxlength="6" />
      <div class="app-lock-error" id="managerLoginError" hidden>الرمز غير صحيح</div>
      <button class="primary-button wide" id="managerLoginSubmitButton" type="button">دخول مدير</button>
      <button class="secondary-button wide manager-login-cancel" id="managerLoginCancelButton" type="button">إلغاء</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = document.getElementById("managerLoginInput");
  const submit = document.getElementById("managerLoginSubmitButton");
  const cancel = document.getElementById("managerLoginCancelButton");
  const close = () => overlay.remove();
  const tryLogin = () => {
    if (hashPin(input.value) === state.appPin) {
      close();
      setUserRole("manager", { quiet: true });
      showToast("تم دخول المدير.");
      if (nextView) switchView(nextView);
      return;
    }
    const err = document.getElementById("managerLoginError");
    if (err) err.hidden = false;
    const box = overlay.querySelector(".app-lock-box");
    if (box) {
      box.classList.remove("is-shake");
      void box.offsetWidth;
      box.classList.add("is-shake");
    }
    input.value = "";
    input.focus();
  };
  submit.addEventListener("click", tryLogin);
  cancel.addEventListener("click", close);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") tryLogin();
    if (event.key === "Escape") close();
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  setTimeout(() => input.focus(), 50);
}

function requestManagerAccess(nextView = "") {
  if (isManagerMode()) {
    if (nextView) switchView(nextView);
    return;
  }
  if (!hasAppPin()) {
    setUserRole("manager", { quiet: true });
    showToast("وضع المدير مفتوح. فعّل رمز المدير من الدليل لحماية الصلاحيات.");
    if (nextView) switchView(nextView);
    return;
  }
  showManagerLoginCard(nextView);
}

// شاشة القفل عند فتح البرنامج
function showLockScreen() {
  if (!hasAppPin()) return;
  if (document.getElementById("appLockOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "appLockOverlay";
  overlay.className = "app-lock-overlay";
  overlay.innerHTML = `
    <div class="app-lock-box">
      <div class="app-lock-icon">🔒</div>
      <h2>${escapeHtml(state.businessName || "دفتر المقهى")}</h2>
      <p>اكتب رمز الدخول</p>
      <input id="appLockInput" class="app-lock-input" type="password" inputmode="numeric" autocomplete="off" maxlength="6" />
      <div class="app-lock-error" id="appLockError" hidden>الرمز غير صحيح</div>
      <button class="primary-button wide" id="appLockSubmitButton" type="button">دخول</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("is-locked");
  const input = document.getElementById("appLockInput");
  const submit = document.getElementById("appLockSubmitButton");
  const tryUnlock = () => {
    if (hashPin(input.value) === state.appPin) {
      overlay.remove();
      document.body.classList.remove("is-locked");
      setUserRole("manager", { quiet: true });
    } else {
      const err = document.getElementById("appLockError");
      if (err) err.hidden = false;
      const box = overlay.querySelector(".app-lock-box");
      if (box) {
        box.classList.remove("is-shake");
        void box.offsetWidth;
        box.classList.add("is-shake");
      }
      input.value = "";
      input.focus();
    }
  };
  submit.addEventListener("click", tryUnlock);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  setTimeout(() => input.focus(), 50);
}

// صندوق إعداد القفل في صفحة الدليل
function renderPinSettings() {
  const statusEl = document.getElementById("pinStatusText");
  const setBox = document.getElementById("pinSetBox");
  const clearBox = document.getElementById("pinClearBox");
  if (!statusEl || !setBox || !clearBox) return;
  if (hasAppPin()) {
    statusEl.textContent = "القفل مُفعّل — البرنامج بيطلب الرمز عند الفتح.";
    setBox.hidden = true;
    clearBox.hidden = false;
  } else {
    statusEl.textContent = "القفل غير مفعّل — أي حدا بيفتح الجهاز بيشوف كل البيانات.";
    setBox.hidden = false;
    clearBox.hidden = true;
  }
}

// ═══ حجم الطباعة (A4 / إيصال حراري 80mm / 58mm) ═════════════════
function applyPrintSize() {
  const mode = ["a4", "80mm", "58mm"].includes(state.printSize) ? state.printSize : "a4";
  let styleEl = document.getElementById("printPageSizeStyle");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "printPageSizeStyle";
    document.head.appendChild(styleEl);
  }
  if (mode === "a4") { styleEl.textContent = ""; return; }
  const pageW = mode === "58mm" ? "58mm" : "80mm";
  const invW = mode === "58mm" ? "52mm" : "74mm";
  const fs = mode === "58mm" ? "11px" : "12px";
  const h1 = mode === "58mm" ? "14px" : "16px";
  const margin = mode === "58mm" ? "2mm" : "3mm";
  styleEl.textContent = `@media print {
    @page { size: ${pageW} auto; margin: ${margin}; }
    .print-host { padding: 0 !important; }
    .print-invoice { width: ${invW} !important; margin: 0 auto !important; font-size: ${fs} !important; }
    .print-invoice h1 { font-size: ${h1} !important; text-align: center !important; margin-bottom: 4px !important; }
    .print-meta { text-align: center !important; font-size: 10.5px !important; margin-bottom: 8px !important; }
    .print-lines p, .print-total p { font-size: ${fs} !important; }
    .statement-table, .statement-summary { font-size: 9px !important; }
  }`;
}

function renderPrintSizeSetting() {
  const sel = document.getElementById("printSizeSelect");
  if (sel) sel.value = state.printSize || "a4";
}
