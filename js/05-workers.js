// ═══ دفتر المقهى ═══ 05-workers.js — عرض المشتريات + العمال: رواتب، سلف، استهلاك
// (مقسوم من app.js — الأسطر 2930-3401)

let selectedWorkerSection = "account";
let editingWorkerPartnerFundingId = null;
let editingWorkerPartnerWithdrawalId = null;

function setWorkerSection(section) {
  const allowed = ["account", "drinks", "salary", "partner"];
  selectedWorkerSection = allowed.includes(section) ? section : "account";
  document.querySelectorAll("[data-worker-section-tab]").forEach((button) => {
    const active = button.dataset.workerSectionTab === selectedWorkerSection;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-worker-section-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.workerSectionPanel !== selectedWorkerSection;
  });
}

function setPurchaseSection(section, options = {}) {
  const allowed = ["invoice", "expenses", "records", "suppliers"];
  selectedPurchaseSection = allowed.includes(section) ? section : "invoice";
  els.purchaseSectionTabs?.forEach((button) => {
    const active = button.dataset.purchaseSectionTab === selectedPurchaseSection;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });
  els.purchaseSectionPanels?.forEach((panel) => {
    panel.hidden = panel.dataset.purchaseSectionPanel !== selectedPurchaseSection;
  });
  if (options.persist !== false) saveUiState();
  if (options.scroll) document.querySelector("#view-purchases .purchase-section-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function currentPurchaseRecordFilter() {
  const value = els.purchaseRecordFilterInput?.value || "all";
  return ["all", "inventory", "expenses", ...expenseCategoryIds].includes(value) ? value : "all";
}

function currentExpensePurposeFilter() {
  const value = els.purchaseExpensePurposeFilterInput?.value || "all";
  return value === "operations" || value === "renovation" ? value : "all";
}

function expenseMatchesPurchaseFilter(expense, filter = currentPurchaseRecordFilter()) {
  if (filter === "inventory") return false;
  if (filter === "all" || filter === "expenses") return true;
  return inferExpenseCategory(expense) === filter;
}

function expenseMatchesPurposeFilter(expense, filter = currentExpensePurposeFilter()) {
  return filter === "all" || expensePurpose(expense) === filter;
}

function expenseSearchText(expense) {
  return `${expense.title || ""} ${expense.note || ""} ${expenseCategoryLabel(expense)} ${expensePurposeLabel(expense)} ${paymentLabels[expense.method] || expense.method || ""}`;
}

function expensePurposeTotalsFor(expenses = []) {
  return expensePurposeIds.reduce((totals, purpose) => {
    totals[purpose] = expenses
      .filter((expense) => expensePurpose(expense) === purpose)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    return totals;
  }, {});
}

function expenseCategoryTotalsFor(expenses = []) {
  return expenseCategoryIds.reduce((totals, category) => {
    totals[category] = expenses
      .filter((expense) => inferExpenseCategory(expense) === category)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    return totals;
  }, {});
}

function purchaseExpenseFilterLabel(filter = currentPurchaseRecordFilter()) {
  return expenseCategoryIds.includes(filter) ? expenseCategoryLabel(filter) : "";
}

function purchaseGlobalFilterState() {
  const query = String(els.purchaseSearchInput?.value || "").trim().toLowerCase();
  const dFrom = $("#purchaseDateFromInput")?.value || "";
  const dTo = $("#purchaseDateToInput")?.value || "";
  return {
    query,
    range: {
      minDate: (dFrom && dTo && dFrom > dTo) ? dTo : dFrom,
      maxDate: (dFrom && dTo && dFrom > dTo) ? dFrom : dTo
    },
    oldestFirst: $("#purchaseDateSortInput")?.value === "oldest"
  };
}

function sortPurchaseFilteredRows(rows, dateSelector = (row) => row?.createdAt) {
  const { oldestFirst } = purchaseGlobalFilterState();
  return rows.slice().sort((a, b) => {
    const diff = new Date(dateSelector(b) || 0) - new Date(dateSelector(a) || 0);
    return oldestFirst ? -diff : diff;
  });
}

function renderPurchaseItemsPreview(lines = []) {
  const renderLine = (line) => {
    const qty = Number(line.qty || 0);
    const amount = Number(line.amount || 0);
    const purchaseUnitPrice = qty > 0 ? amount / qty : amount;
    const unitLabel = normalizeUnit(line.unit || "") || "وحدة";
    return `
      <div class="purchase-item-preview-line">
        <div class="purchase-item-preview-info">
          <strong>${escapeHtml(line.item || "مادة")}</strong>
          <small>${quantityWithUnit(qty, line.unit)} · ${purchaseLineStockText(line)}</small>
        </div>
        <div class="purchase-item-preview-price">
          <span>سعر ${escapeHtml(unitLabel)}: <b>${money(purchaseUnitPrice)}</b></span>
          <span>الإجمالي: <b>${money(amount)}</b></span>
        </div>
      </div>`;
  };
  const visible = lines.slice(0, 3);
  const remaining = lines.slice(3);
  return `
    <div class="purchase-items-preview">${visible.map(renderLine).join("")}</div>
    ${remaining.length ? `<details class="purchase-more-items"><summary>إظهار ${remaining.length} ${remaining.length === 1 ? "صنف إضافي" : "أصناف إضافية"}</summary><div>${remaining.map(renderLine).join("")}</div></details>` : ""}
  `;
}

function renderPurchases() {
  const { query, range, oldestFirst } = purchaseGlobalFilterState();
  const recordFilter = currentPurchaseRecordFilter();
  const purposeFilter = currentExpensePurposeFilter();
  const showPurchases = recordFilter === "all" || recordFilter === "inventory";
  const activeExpenseCategoryLabel = purchaseExpenseFilterLabel(recordFilter);
  // فلترة + ترتيب بالتاريخ
  const dateFiltered = (showPurchases ? state.purchases : [])
    .filter((purchase) => invoiceMatchesDateRange(purchase, range))
    .slice()
    .sort((a, b) => {
      const diff = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      return oldestFirst ? -diff : diff;
    });
  const purchaseMatches = dateFiltered.map((purchase) => purchaseSearchInfo(purchase, query)).filter((match) => match.matches);
  const purchases = purchaseMatches.map((match) => match.purchase);
  const byMethod = { cash: 0, bank: 0, wallet: 0 };
  const totalAmount = purchaseMatches.reduce((sum, match) => {
    const amt = query ? purchaseLinesAmount(match.statLines) : purchaseAmount(match.purchase);
    return sum + amt;
  }, 0);
  const paidTotal = purchaseMatches.reduce((sum, match) => sum + purchasePaidAmount(match.purchase), 0);
  const overpaymentTotal = purchaseMatches.reduce((sum, match) => sum + purchaseSupplierOverpayment(match.purchase), 0);
  const creditUsedTotal = purchaseMatches.reduce((sum, match) => sum + purchaseSupplierCreditUsed(match.purchase), 0);
  const invoiceDebtCreatedTotal = purchaseMatches.reduce((sum, match) => sum + purchaseSupplierDebt(match.purchase), 0);
  const currentSupplierDebtTotal = (typeof supplierAllNames === "function" && typeof supplierAccountForName === "function")
    ? supplierAllNames().reduce((sum, name) => sum + Number(supplierAccountForName(name).debt || 0), 0)
    : invoiceDebtCreatedTotal;
  const discountTotal = query ? 0 : purchaseMatches.reduce((sum, match) => sum + purchaseDiscount(match.purchase), 0);
  purchaseMatches.forEach((match) => {
    const payments = normalizePurchasePayments(match.purchase);
    paymentMethods.forEach((method) => {
      byMethod[method] += Number(payments[method] || 0);
    });
  });
  const searchStats = purchaseSearchSalesStats(purchaseMatches);

  // المصروفات العامة لنفس الفترة (للإجمالي العام)
  const periodExpenses = (state.expenses || [])
    .filter((expense) => invoiceMatchesDateRange(expense, range))
    .filter((expense) => expenseMatchesPurposeFilter(expense, purposeFilter))
    .filter((expense) => !query || searchMatch(expenseSearchText(expense), query));
  const expensesTotal = periodExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const categoryTotals = expenseCategoryTotalsFor(periodExpenses);
  const purposeTotals = expensePurposeTotalsFor(periodExpenses);
  const grandByMethod = { cash: byMethod.cash, bank: byMethod.bank, wallet: byMethod.wallet };
  periodExpenses.forEach((expense) => {
    const m = paymentMethods.includes(expense.method) ? expense.method : "cash";
    grandByMethod[m] += Number(expense.amount || 0);
  });
  const supplierSettlementRows = typeof supplierTransactionRows === "function"
    ? supplierTransactionRows(Number.MAX_SAFE_INTEGER)
      .filter((entry) => entry.type === "payment_out")
      .filter((entry) => invoiceMatchesDateRange(entry, range))
      .filter((entry) => !query || searchMatch(`${entry.supplier || ""} ${entry.note || ""} تسديد مورد`, query))
    : [];
  const supplierSettlementsTotal = supplierSettlementRows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  supplierSettlementRows.forEach((entry) => {
    const method = paymentMethods.includes(entry.method) ? entry.method : "cash";
    grandByMethod[method] += Number(entry.amount || 0);
  });
  const actualOutTotal = paymentMethods.reduce((sum, method) => sum + Number(grandByMethod[method] || 0), 0);

  const periodText = (range.minDate || range.maxDate)
    ? `الفترة: ${range.minDate || "البداية"} ← ${range.maxDate || "اليوم"}`
    : "كل الفترات";
  els.purchaseTotalBox.innerHTML = `
    <div class="purchase-summary-heading"><span>${query ? "نتيجة البحث" : "أهم أرقام الفترة"}</span><small>${periodText} · ${purchases.length} فاتورة</small></div>
    <div class="purchase-important-numbers">
      <div><span>قيمة البضاعة</span><strong>${money(totalAmount)}</strong></div>
      <div><span>المدفوع فعلياً</span><strong>${money(paidTotal)}</strong></div>
      <div><span>تسديدات الموردين</span><strong>${money(supplierSettlementsTotal)}</strong></div>
      <div><span>دين الموردين الحالي</span><strong>${money(currentSupplierDebtTotal)}</strong></div>
      <div><span>مصاريف المحل</span><strong>${money(expensesTotal)}</strong></div>
    </div>
    <details class="purchase-account-details">
      <summary>تفاصيل الحساب</summary>
      <div class="purchase-search-stats">
        <span>الخارج فعلياً مع المصاريف: ${money(actualOutTotal)}</span>
        <span>خصومات الفواتير: ${money(discountTotal)}</span>
        <span>دين نشأ من الفواتير الظاهرة: ${money(invoiceDebtCreatedTotal)}</span>
        <span>رصيد مورد مستخدم: ${money(creditUsedTotal)}</span>
        ${overpaymentTotal > 0.001 ? `<span>رصيد جديد من زيادة الدفع: ${money(overpaymentTotal)}</span>` : ""}
        <span>كاش: ${money(grandByMethod.cash)}</span>
        <span>بنك: ${money(grandByMethod.bank)}</span>
        <span>محفظة: ${money(grandByMethod.wallet)}</span>
        <span>الأصناف: ${quantityText(searchStats.itemCount)}</span>
        <span>الكمية المشتراة: ${quantityText(searchStats.purchaseQty)}</span>
        <span>كمية المخزون الداخلة: ${quantityText(searchStats.stockQty)}</span>
      </div>
      <div class="purchase-category-details-grid">${expenseCategoryIds.map((category) => `<span>${expenseCategoryLabel(category)} <strong>${money(categoryTotals[category])}</strong></span>`).join("")}</div>
    </details>`;

  const purchasePayIcon = { none: "⚠️", cash: "💵", bank: "🏦", wallet: "📱", credit: "↩", "paid-credit": "🔀", mixed: "🔀" };
  els.purchasesList.innerHTML = purchases.length
    ? `<div class="invoice-table-wrap">
        <table class="invoice-table purchase-table">
          <thead>
            <tr>
              <th>الفاتورة والتاريخ</th>
              <th>المورد</th>
              <th>الأصناف</th>
              <th>القيمة والدفع</th>
              <th>حالة الفاتورة</th>
              <th>الملاحظة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${purchaseMatches.map((match) => {
              const purchase = match.purchase;
              const lines = query ? match.statLines : match.lines;
              const qtyTotal = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
              const stockQtyTotal = lines.reduce((sum, line) => sum + purchaseLineStockQty(line), 0);
              const rowAmount = query ? purchaseLinesAmount(lines) : purchaseAmount(purchase);
              const rowSubtotal = purchaseSubtotal(purchase);
              const rowDiscount = query ? 0 : purchaseDiscount(purchase);
              const debt = purchaseSupplierDebt(purchase);
              const paidAmount = purchasePaidAmount(purchase);
              const overpayment = purchaseSupplierOverpayment(purchase);
              const creditUsed = purchaseSupplierCreditUsed(purchase);
              const payCategory = purchasePaymentCategory(purchase);
              const rowCategory = debt > 0.001 ? "none" : payCategory;
              const paymentLabel = purchasePaymentText(purchase);
              const supplierCurrentDebt = purchase.supplier && typeof supplierAccountForName === "function"
                ? Number(supplierAccountForName(purchase.supplier).debt || 0)
                : debt;
              const statusLabel = debt > 0.001
                ? paidAmount > 0.001 && creditUsed > 0.001
                  ? `بقي وقت الشراء ${money(debt)}`
                  : creditUsed > 0.001
                    ? `بقي وقت الشراء ${money(debt)}`
                    : supplierCurrentDebt <= 0.001
                      ? `كان دينًا · حساب المورد مسدد الآن`
                      : `بقي وقت الشراء ${money(debt)} · الدين الحالي ${money(supplierCurrentDebt)}`
                : overpayment > 0.001
                  ? `مدفوعة وزيادة ${money(overpayment)} رصيد لك`
                : payCategory === "paid-credit"
                  ? "مدفوعة + رصيد"
                  : payCategory === "credit"
                    ? "مسددة من رصيد المورد"
                    : "مدفوعة بالكامل";
              const statusClass = debt > 0.001 ? "debt" : overpayment > 0.001 || payCategory === "paid-credit" || payCategory === "credit" ? "credit" : "clear";
              return `
                <tr class="invoice-pay-row is-pay-${rowCategory} ${editingPurchaseId === purchase.id ? "is-editing-row" : ""}">
                  <td class="purchase-invoice-identity">
                    <strong>${escapeHtml(purchase.number || "سجل مشتريات")}</strong>
                    <small>${formatDate(purchase.createdAt)}</small>
                  </td>
                  <td class="purchase-supplier-cell">${purchase.supplier ? `<button class="supplier-open-link" type="button" data-open-supplier="${escapeAttr(purchase.supplier)}">${escapeHtml(purchase.supplier)}</button>` : "<span>بدون مورد</span>"}</td>
                  <td class="invoice-items-cell purchase-items-cell">
                    ${renderPurchaseItemsPreview(lines)}
                    <small class="purchase-items-total">${lines.length} صنف · الكمية ${quantityText(qtyTotal)} · دخل المخزون ${quantityText(stockQtyTotal)}</small>
                  </td>
                  <td class="purchase-money-cell">
                    <strong>${money(rowAmount)}</strong>
                    ${rowDiscount > 0.001 ? `<small>قبل الخصم ${money(rowSubtotal)}</small><small class="purchase-discount-text">خصم ${money(rowDiscount)}</small>` : ""}
                    <small>مدفوع ${money(paidAmount)}</small>
                    ${overpayment > 0.001 ? `<small>رصيد جديد لك عند المورد ${money(overpayment)}</small>` : ""}
                    ${creditUsed > 0.001 ? `<small>رصيد مستخدم ${money(creditUsed)}</small>` : ""}
                    ${debt > 0.001 ? `<small>باقي دين ${money(debt)}</small>` : ""}
                  </td>
                  <td class="purchase-status-cell">
                    <span class="invoice-payment-method is-pay-${payCategory}">${purchasePayIcon[payCategory] || ""} ${escapeHtml(paymentLabel)}</span>
                    <span class="balance-badge ${statusClass}">${statusLabel}</span>
                  </td>
                  <td class="invoice-note-cell">${purchase.note ? escapeHtml(purchase.note) : "-"}</td>
                  <td>
                    <div class="invoice-actions-cell">
                      <button class="invoice-edit-button" type="button" data-edit-purchase="${purchase.id}">تعديل</button>
                      <button class="invoice-delete-button" type="button" data-remove-purchase="${purchase.id}">حذف</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : `<div class="empty-state">${showPurchases ? "لا توجد فواتير بضاعة مطابقة." : activeExpenseCategoryLabel ? `عرض مصاريف ${escapeHtml(activeExpenseCategoryLabel)} فقط.` : "الفلتر الحالي يعرض المصاريف فقط."}</div>`;

  renderGeneralExpenses();
}

function renderGeneralExpenses() {
  if (!els.generalExpensesList) return;
  if (!els.generalExpenseDateInput.value) els.generalExpenseDateInput.value = todayDateInputValue();
  if (els.generalExpenseMethodInput) els.generalExpenseMethodInput.value = paymentMethods.includes(els.generalExpenseMethodInput.value)
    ? els.generalExpenseMethodInput.value
    : getLastPaymentMethod();
  if (els.generalExpenseCategoryInput && !expenseCategoryIds.includes(els.generalExpenseCategoryInput.value)) {
    els.generalExpenseCategoryInput.value = "operations";
  }

  const { query, range } = purchaseGlobalFilterState();
  const recordFilter = currentPurchaseRecordFilter() === "inventory" ? "expenses" : currentPurchaseRecordFilter();
  const purposeFilter = currentExpensePurposeFilter();
  const localCategoryFilter = expenseCategoryIds.includes(els.generalExpenseCategoryFilter?.value) ? els.generalExpenseCategoryFilter.value : "all";
  const localPurposeFilter = expensePurposeIds.includes(els.generalExpensePurposeFilter?.value) ? els.generalExpensePurposeFilter.value : "all";
  const localMethodFilter = paymentMethods.includes(els.generalExpenseMethodFilter?.value) ? els.generalExpenseMethodFilter.value : "all";
  const expenses = sortPurchaseFilteredRows((state.expenses || [])
    .filter((expense) => invoiceMatchesDateRange(expense, range))
    .filter((expense) => expenseMatchesPurchaseFilter(expense, recordFilter))
    .filter((expense) => expenseMatchesPurposeFilter(expense, purposeFilter))
    .filter((expense) => localCategoryFilter === "all" || inferExpenseCategory(expense) === localCategoryFilter)
    .filter((expense) => localPurposeFilter === "all" || expensePurpose(expense) === localPurposeFilter)
    .filter((expense) => localMethodFilter === "all" || expense.method === localMethodFilter)
    .filter((expense) => {
      if (!query) return true;
      return searchMatch(expenseSearchText(expense), query);
    }));
  const expByMethod = { cash: 0, bank: 0, wallet: 0 };
  const total = expenses.reduce((sum, expense) => {
    const m = paymentMethods.includes(expense.method) ? expense.method : "cash";
    expByMethod[m] += Number(expense.amount || 0);
    return sum + Number(expense.amount || 0);
  }, 0);
  const purposeTotals = expensePurposeTotalsFor(expenses);
  const categoryTotals = expenseCategoryTotalsFor(expenses);
  const activeFilterCount = [localCategoryFilter, localPurposeFilter, localMethodFilter].filter((value) => value !== "all").length;

  if (els.generalExpenseResultLabel) {
    els.generalExpenseResultLabel.textContent = `${expenses.length} مصروف ظاهر${activeFilterCount ? ` · ${activeFilterCount} تصفية مفعّلة` : ""}`;
  }

  els.generalExpenseTotalBox.innerHTML = `
    <div class="purchase-total-head">
      <span class="purchase-total-label">${query ? "نتيجة البحث في مصاريف المحل" : "مصاريف المحل الظاهرة"}</span>
      <small class="purchase-total-count">${expenses.length} مصروف</small>
    </div>
    <strong class="purchase-total-amount">${money(total)}</strong>
    <div class="expense-purpose-summary">
      <span class="is-operations">تشغيل الكافيه <strong>${money(purposeTotals.operations)}</strong></span>
      <span class="is-renovation">تجديد وتجهيز <strong>${money(purposeTotals.renovation)}</strong></span>
      <span class="is-total">إجمالي الخارج <strong>${money(total)}</strong></span>
    </div>
    <div class="expense-category-summary">
      ${expenseCategoryIds.map((category) => `<span><small>${escapeHtml(expenseCategoryLabel(category))}</small><strong>${money(categoryTotals[category])}</strong></span>`).join("")}
    </div>
    <div class="purchase-search-stats">
      <span>💵 كاش: ${money(expByMethod.cash)}</span>
      <span>🏦 بنك: ${money(expByMethod.bank)}</span>
      <span>📱 محفظة: ${money(expByMethod.wallet)}</span>
    </div>
  `;

  els.generalExpensesList.innerHTML = expenses.length
    ? expenses.map((expense) => `
      <article class="purchase-row">
        <header>
          <div>
            <div class="expense-title-line">
              <strong>${escapeHtml(expense.title || "مصروف")}</strong>
              <span class="expense-category-badge is-${inferExpenseCategory(expense)}">${escapeHtml(expenseCategoryLabel(expense))}</span>
              <span class="expense-purpose-badge is-${expensePurpose(expense)}">${escapeHtml(expensePurposeLabel(expense))}</span>
            </div>
            <p>${formatDate(expense.createdAt)} | ${paymentLabels[expense.method] || expense.method}</p>
          </div>
          <span class="purchase-amount">${money(expense.amount)}</span>
        </header>
        ${expense.note ? `<p>${escapeHtml(expense.note)}</p>` : ""}
        <label class="expense-record-category-select">
          <span>التصنيف</span>
          <select data-quick-expense-category data-expense-id="${escapeAttr(expense.id)}" aria-label="تغيير تصنيف ${escapeAttr(expense.title || "المصروف")}">
            ${expenseCategoryIds.map((category) => `<option value="${category}" ${inferExpenseCategory(expense) === category ? "selected" : ""}>${escapeHtml(expenseCategoryLabel(category))}</option>`).join("")}
          </select>
        </label>
        <div class="purchase-row-actions">
          <button class="secondary-button" type="button" data-edit-general-expense="${expense.id}">تعديل</button>
          <button class="invoice-delete-button" type="button" data-remove-general-expense="${expense.id}">حذف</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">${recordFilter === "inventory" ? "اختر كل المصاريف أو قسمًا منها لعرضها هنا." : activeExpenseCategoryLabel ? `لا توجد مصاريف ${escapeHtml(activeExpenseCategoryLabel)} مطابقة.` : "لا توجد مصاريف مطابقة."}</div>`;
}

function syncGeneralExpensePurposeToCategory() {
  if (!els.generalExpenseCategoryInput) return;
  const purpose = els.generalExpenseCategoryInput.value === "renovation" ? "renovation" : "operations";
  Array.from(els.generalExpensePurposeInputs || []).forEach((input) => { input.checked = input.value === purpose; });
}

function clearGeneralExpenseFilters() {
  if (els.generalExpenseCategoryFilter) els.generalExpenseCategoryFilter.value = "all";
  if (els.generalExpensePurposeFilter) els.generalExpensePurposeFilter.value = "all";
  if (els.generalExpenseMethodFilter) els.generalExpenseMethodFilter.value = "all";
  renderGeneralExpenses();
}

function todayDateInputValue() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function monthStartInputValue(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-01`;
}

function renderWorkerItemSelect() {
  const selected = els.workerItemInput.value;
  els.workerItemInput.innerHTML = ['<option value="">اختر صنف</option>']
    .concat(state.menu.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)} - ${money(item.price)}</option>`))
    .join("");
  els.workerItemInput.value = state.menu.some((item) => item.id === selected) ? selected : "";
}

function fillWorkerItemCost() {
  const item = findMenuItem(els.workerItemInput.value);
  if (!item) {
    els.expenseAmountInput.value = "";
    return;
  }

  const cost = menuItemRecipeCost(item);
  els.expenseAmountInput.value = inputNumberValue(cost);
}

function workerCafeFundingTotals(worker, transactions = workerTransactionsFor(worker)) {
  return transactions.reduce((totals, entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.type === WORKER_CAFE_FUNDING_TYPE) totals.deposited += amount;
    if (entry.type === WORKER_CAFE_FUNDING_REFUND_TYPE) totals.refunded += amount;
    totals.outstanding = Math.max(totals.deposited - totals.refunded, 0);
    return totals;
  }, { deposited: 0, refunded: 0, outstanding: 0 });
}

function workerCafeFundingLedgerValidation(transactions) {
  let balance = 0;
  const rows = transactions.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  for (const entry of rows) {
    if (entry.type === WORKER_CAFE_FUNDING_TYPE) balance += Number(entry.amount || 0);
    if (entry.type === WORKER_CAFE_FUNDING_REFUND_TYPE) balance -= Number(entry.amount || 0);
    if (balance < -0.001) return { valid: false, shortage: Math.abs(balance) };
  }
  return { valid: true, shortage: 0 };
}

function workerFilterMatches(worker, stats, account, query, status, cafeFunding = 0) {
  const matchesQuery = searchMatch(`${worker.name} ${worker.phone || ""}`, query);
  const matchesStatus =
    status === "all" ||
    (status === "due" && account.due > 0.001) ||
    (status === "advance" && (account.advances > 0.001 || account.due < -0.001)) ||
    (status === "charged" && stats.charged > 0.001) ||
    (status === "free" && stats.freeCost > 0.001) ||
    (status === "funded" && cafeFunding > 0.001) ||
    (status === "active" && (stats.count > 0 || account.transactions.length > 0));
  return matchesQuery && matchesStatus;
}

function workerBadge(account, stats) {
  if (account.due > 0.001) {
    return { className: "credit", text: workerBalanceText(account.due) };
  }
  if (account.due < -0.001) {
    return { className: "debt", text: workerBalanceText(account.due) };
  }
  if (account.salary || account.salaryPaid || account.advances || account.paymentIn || stats.charged) {
    return { className: "clear", text: "صافي الشهر" };
  }
  if (stats.freeCost > 0.001) {
    return { className: "debt", text: `مجاني ${money(stats.freeCost)}` };
  }
  return { className: "clear", text: "لا حركات" };
}

function partnerLinkedToWorker(workerId) {
  return (state.partners || []).find((partner) => partner.workerId === workerId) || null;
}

function unlinkedPartnerMatchingWorker(worker) {
  const workerName = String(worker?.name || "").trim();
  if (!workerName) return null;
  return (state.partners || []).find((partner) => !partner.workerId && String(partner.name || "").trim() === workerName) || null;
}

function workerPartnerActionHtml(worker) {
  if (!worker) return "";
  const partner = partnerLinkedToWorker(worker.id);
  if (partner) {
    const shareText = Number(partner.sharePercent || 0) > 0.001 ? `${quantityText(partner.sharePercent)}%` : "بدون نسبة";
    return `<button class="worker-partner-button is-linked" type="button" data-worker-partner-action="open">🤝 شريك (${shareText})</button>`;
  }
  return `<button class="worker-partner-button" type="button" data-worker-partner-action="mark">🤝 هذا شريك</button>`;
}

function renderWorkerPartnerActions(worker) {
  if (!els.workerPartnerActions) return;
  els.workerPartnerActions.innerHTML = workerPartnerActionHtml(worker);
}

function renderWorkerPartnerAccount(worker) {
  if (!els.workerPartnerAccountEmpty || !els.workerPartnerAccountContent) return;
  const partner = worker ? partnerLinkedToWorker(worker.id) : null;
  els.workerPartnerAccountEmpty.hidden = Boolean(partner);
  els.workerPartnerAccountContent.hidden = !partner;
  if (!partner) {
    els.workerPartnerAccountEmpty.innerHTML = worker
      ? `هذا العامل غير مربوط بحساب شريك.<br><button class="primary-button" type="button" data-worker-partner-action="mark">تعيينه كشريك</button>`
      : "اختر عاملاً لعرض حساب الشريك.";
    return;
  }
  const editedFunding = editingWorkerPartnerFundingId ? (state.partnerFundingTransactions || []).find((item) => item.id === editingWorkerPartnerFundingId) : null;
  const editedWithdrawal = editingWorkerPartnerWithdrawalId ? (state.ownerWithdrawals || []).find((item) => item.id === editingWorkerPartnerWithdrawalId) : null;
  if (editingWorkerPartnerFundingId && (!editedFunding || editedFunding.partnerId !== partner.id)) resetWorkerPartnerFundingForm();
  if (editingWorkerPartnerWithdrawalId && (!editedWithdrawal || editedWithdrawal.partnerId !== partner.id)) resetWorkerPartnerWithdrawalForm();

  const funding = partnerFundingBalance(partner.id);
  const withdrawals = (state.ownerWithdrawals || []).filter((entry) => entry.partnerId === partner.id).map(normalizeOwnerWithdrawal).filter(Boolean);
  const withdrawalTotals = ownerWithdrawalTotals(withdrawals);
  els.workerPartnerAccountSummary.innerHTML = `
    <article><span>تمويل مسترد دفعه</span><strong>${money(funding.refundableDeposited)}</strong><small>المتبقي له ${money(funding.outstandingRefundable)}</small></article>
    <article><span>رأس مال أضافه</span><strong>${money(funding.capital)}</strong><small>ليس ديناً على الكافي</small></article>
    <article><span>سحوبات أرباح</span><strong>${money(withdrawalTotals.profit)}</strong><small>من حصته في الربح</small></article>
    <article><span>صافي السحوبات الشخصية</span><strong>${money(withdrawalTotals.personal)}</strong><small>أعاد منها ${money(withdrawalTotals.personalReturned)}</small></article>`;

  const allRows = [
    ...partnerFundingTransactionsFor(partner.id).map((entry) => ({ kind: "funding", entry, createdAt: entry.createdAt })),
    ...withdrawals.map((entry) => ({ kind: "withdrawal", entry, createdAt: entry.createdAt }))
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const ledgerType = ["funding", "withdrawal"].includes(els.workerPartnerLedgerTypeFilter?.value) ? els.workerPartnerLedgerTypeFilter.value : "all";
  const rawFrom = els.workerPartnerLedgerDateFromInput?.value || "";
  const rawTo = els.workerPartnerLedgerDateToInput?.value || "";
  const ledgerRange = {
    minDate: rawFrom && rawTo && rawFrom > rawTo ? rawTo : rawFrom,
    maxDate: rawFrom && rawTo && rawFrom > rawTo ? rawFrom : rawTo
  };
  const rows = allRows
    .filter((row) => ledgerType === "all" || row.kind === ledgerType)
    .filter((row) => dateMatchesRange(row.entry, ledgerRange));
  const visibleWithdrawals = rows.filter((row) => row.kind === "withdrawal").map((row) => row.entry);
  const visibleWithdrawalTotal = ownerWithdrawalTotals(visibleWithdrawals).total;
  const periodFunding = partnerFundingTotals(allRows
    .filter((row) => row.kind === "funding")
    .filter((row) => dateMatchesRange(row.entry, ledgerRange))
    .map((row) => row.entry));
  const periodWithdrawals = ownerWithdrawalTotals(allRows
    .filter((row) => row.kind === "withdrawal")
    .filter((row) => dateMatchesRange(row.entry, ledgerRange))
    .map((row) => row.entry));
  if (els.workerPartnerLedgerFilterSummary) {
    const periodText = ledgerRange.minDate || ledgerRange.maxDate
      ? `${ledgerRange.minDate || "البداية"} إلى ${ledgerRange.maxDate || "اليوم"}`
      : "كل التواريخ";
    els.workerPartnerLedgerFilterSummary.textContent = `${periodText} · ${rows.length} حركة · السحوبات ${money(visibleWithdrawalTotal)}`;
  }
  if (els.workerPartnerPeriodSummary) {
    els.workerPartnerPeriodSummary.innerHTML = `
      <article><span>تمويل مسترد دخل</span><strong>${money(periodFunding.refundableDeposited)}</strong></article>
      <article><span>زيادة رأس مال</span><strong>${money(periodFunding.capital)}</strong></article>
      <article class="is-out"><span>تمويل تم إرجاعه</span><strong>${money(periodFunding.refunded)}</strong></article>
      <article class="is-out"><span>سحب أرباح</span><strong>${money(periodWithdrawals.profit)}</strong></article>
      <article class="is-out"><span>سحب شخصي</span><strong>${money(periodWithdrawals.personalGross)}</strong></article>
      <article><span>إرجاع سحب شخصي</span><strong>${money(periodWithdrawals.personalReturned)}</strong></article>`;
  }
  els.workerPartnerAccountLedger.innerHTML = rows.length ? rows.map((row) => {
    const entry = row.entry;
    const isFunding = row.kind === "funding";
    const isOut = isFunding ? entry.type === PARTNER_FUNDING_REFUND : ownerWithdrawalDirection(entry) === "out";
    const label = isFunding ? partnerFundingTypeLabel(entry.type) : ownerWithdrawalTypeLabel(ownerWithdrawalKind(entry));
    const editAttr = isFunding ? "data-edit-worker-partner-funding" : "data-edit-worker-partner-withdrawal";
    const deleteAttr = isFunding ? "data-delete-partner-funding" : "data-delete-partner-withdrawal";
    return `<article class="worker-partner-ledger-row ${isOut ? "is-out" : "is-in"}">
      <div><span>${escapeHtml(label)}</span><strong>${isOut ? "−" : "+"}${money(entry.amount)}</strong></div>
      <p>${formatDate(entry.createdAt)} · ${paymentLabels[entry.method] || entry.method}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</p>
      <div class="worker-partner-ledger-actions"><button class="secondary-button" type="button" ${editAttr}="${escapeAttr(entry.id)}">تعديل</button><button class="customer-delete-button" type="button" ${deleteAttr}="${escapeAttr(entry.id)}">حذف</button></div>
    </article>`;
  }).join("") : '<div class="empty-state">لا توجد حركات مطابقة للفترة والتصفية.</div>';

  if (els.workerPartnerFundingDateInput && !els.workerPartnerFundingDateInput.value) els.workerPartnerFundingDateInput.value = todayDateInputValue();
  if (els.workerPartnerWithdrawalDateInput && !els.workerPartnerWithdrawalDateInput.value) els.workerPartnerWithdrawalDateInput.value = todayDateInputValue();
  if (els.workerPartnerFundingMethodInput && !editingWorkerPartnerFundingId) els.workerPartnerFundingMethodInput.value = getLastPaymentMethod();
  if (els.workerPartnerWithdrawalMethodInput && !editingWorkerPartnerWithdrawalId) els.workerPartnerWithdrawalMethodInput.value = getLastPaymentMethod();
}

function resetWorkerPartnerFundingForm() {
  editingWorkerPartnerFundingId = null;
  els.workerPartnerFundingForm?.reset();
  if (els.workerPartnerFundingDateInput) els.workerPartnerFundingDateInput.value = todayDateInputValue();
  if (els.workerPartnerFundingMethodInput) els.workerPartnerFundingMethodInput.value = getLastPaymentMethod();
  if (els.workerPartnerFundingSubmitButton) els.workerPartnerFundingSubmitButton.textContent = "تسجيل التمويل";
  if (els.workerPartnerFundingCancelButton) els.workerPartnerFundingCancelButton.hidden = true;
}

function resetWorkerPartnerWithdrawalForm() {
  editingWorkerPartnerWithdrawalId = null;
  els.workerPartnerWithdrawalForm?.reset();
  if (els.workerPartnerWithdrawalDateInput) els.workerPartnerWithdrawalDateInput.value = todayDateInputValue();
  if (els.workerPartnerWithdrawalMethodInput) els.workerPartnerWithdrawalMethodInput.value = getLastPaymentMethod();
  if (els.workerPartnerWithdrawalSubmitButton) els.workerPartnerWithdrawalSubmitButton.textContent = "تسجيل السحب";
  if (els.workerPartnerWithdrawalCancelButton) els.workerPartnerWithdrawalCancelButton.hidden = true;
}

function startEditWorkerPartnerFunding(id) {
  const entry = (state.partnerFundingTransactions || []).find((item) => item.id === id);
  if (!entry) { showToast("لم أجد حركة التمويل."); return; }
  if (!guardClosedPeriod(entry.createdAt, "تعديل حركة تمويل ضمن فترة مغلقة")) return;
  editingWorkerPartnerFundingId = id;
  els.workerPartnerFundingTypeInput.value = entry.type;
  els.workerPartnerFundingAmountInput.value = Number(entry.amount || 0) || "";
  els.workerPartnerFundingDateInput.value = invoiceDateInputValue(entry);
  els.workerPartnerFundingMethodInput.value = entry.method;
  els.workerPartnerFundingNoteInput.value = entry.note || "";
  els.workerPartnerFundingSubmitButton.textContent = "حفظ تعديل التمويل";
  els.workerPartnerFundingCancelButton.hidden = false;
  els.workerPartnerFundingForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEditWorkerPartnerWithdrawal(id) {
  const entry = (state.ownerWithdrawals || []).find((item) => item.id === id);
  if (!entry) { showToast("لم أجد حركة السحب."); return; }
  if (!guardClosedPeriod(entry.createdAt, "تعديل سحب ضمن فترة مغلقة")) return;
  editingWorkerPartnerWithdrawalId = id;
  els.workerPartnerWithdrawalTypeInput.value = ownerWithdrawalKind(entry);
  els.workerPartnerWithdrawalAmountInput.value = Number(entry.amount || 0) || "";
  els.workerPartnerWithdrawalDateInput.value = invoiceDateInputValue(entry);
  els.workerPartnerWithdrawalMethodInput.value = entry.method;
  els.workerPartnerWithdrawalNoteInput.value = entry.note || "";
  els.workerPartnerWithdrawalSubmitButton.textContent = "حفظ تعديل السحب";
  els.workerPartnerWithdrawalCancelButton.hidden = false;
  els.workerPartnerWithdrawalForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function recordWorkerPartnerFunding(event) {
  event.preventDefault();
  const worker = getWorker(selectedWorkerId);
  const partner = worker && partnerLinkedToWorker(worker.id);
  const amount = Number(els.workerPartnerFundingAmountInput?.value || 0);
  const type = partnerFundingTypes.includes(els.workerPartnerFundingTypeInput?.value) ? els.workerPartnerFundingTypeInput.value : PARTNER_FUNDING_REFUNDABLE;
  const method = paymentMethods.includes(els.workerPartnerFundingMethodInput?.value) ? els.workerPartnerFundingMethodInput.value : "cash";
  const createdAt = invoiceDateFromInput(els.workerPartnerFundingDateInput?.value);
  const editingEntry = editingWorkerPartnerFundingId ? (state.partnerFundingTransactions || []).find((item) => item.id === editingWorkerPartnerFundingId) : null;
  if (!partner) { showToast("هذا العامل غير مربوط بشريك."); return; }
  if (!Number.isFinite(amount) || amount <= 0) { showToast("اكتب مبلغاً أكبر من صفر."); els.workerPartnerFundingAmountInput?.focus(); return; }
  if (editingWorkerPartnerFundingId && !editingEntry) { resetWorkerPartnerFundingForm(); showToast("حركة التمويل غير موجودة."); return; }
  if (editingEntry && !guardClosedPeriod(editingEntry.createdAt, "تعديل حركة تمويل ضمن فترة مغلقة")) return;
  if (!guardClosedPeriod(createdAt, editingEntry ? "نقل حركة تمويل إلى فترة مغلقة" : "تسجيل تمويل ضمن فترة مغلقة")) return;
  const entry = normalizePartnerFundingTransaction({ id: editingEntry?.id, partnerId: partner.id, partnerName: partner.name, type, amount, method, note: els.workerPartnerFundingNoteInput?.value.trim(), createdAt });
  const next = (state.partnerFundingTransactions || []).filter((item) => item.id !== editingEntry?.id).concat(entry);
  const validation = partnerFundingLedgerValidation(next, partner.id);
  if (!validation.valid) { showToast(`لا يمكن رد هذا المبلغ؛ المتبقي من التمويل المسترد أقل بـ ${money(validation.shortage)}.`); return; }
  state.partnerFundingTransactions = next;
  auditAction(editingEntry ? "partner.funding_edit" : "partner.funding_create", { id: entry.id, partnerId: partner.id, type, amount, method, createdAt });
  setLastPaymentMethod(method);
  resetWorkerPartnerFundingForm();
  saveState();
  showToast(`${editingEntry ? "تم تعديل" : "تم تسجيل"} ${partnerFundingTypeLabel(type)} بقيمة ${money(amount)}.`);
  render();
}

function recordWorkerPartnerWithdrawal(event) {
  event.preventDefault();
  const worker = getWorker(selectedWorkerId);
  const partner = worker && partnerLinkedToWorker(worker.id);
  const amount = Number(els.workerPartnerWithdrawalAmountInput?.value || 0);
  const kind = ownerWithdrawalKinds.includes(els.workerPartnerWithdrawalTypeInput?.value) ? els.workerPartnerWithdrawalTypeInput.value : OWNER_WITHDRAWAL_PROFIT;
  const method = paymentMethods.includes(els.workerPartnerWithdrawalMethodInput?.value) ? els.workerPartnerWithdrawalMethodInput.value : "cash";
  const createdAt = invoiceDateFromInput(els.workerPartnerWithdrawalDateInput?.value);
  const editingEntry = editingWorkerPartnerWithdrawalId ? (state.ownerWithdrawals || []).find((item) => item.id === editingWorkerPartnerWithdrawalId) : null;
  if (!partner) { showToast("هذا العامل غير مربوط بشريك."); return; }
  if (!Number.isFinite(amount) || amount <= 0) { showToast("اكتب مبلغاً أكبر من صفر."); els.workerPartnerWithdrawalAmountInput?.focus(); return; }
  if (editingWorkerPartnerWithdrawalId && !editingEntry) { resetWorkerPartnerWithdrawalForm(); showToast("حركة السحب غير موجودة."); return; }
  if (editingEntry && !guardClosedPeriod(editingEntry.createdAt, "تعديل سحب ضمن فترة مغلقة")) return;
  if (!guardClosedPeriod(createdAt, editingEntry ? "نقل سحب إلى فترة مغلقة" : "تسجيل سحب ضمن فترة مغلقة")) return;
  if (kind === OWNER_WITHDRAWAL_PROFIT) {
    const available = partnerProfitWithdrawalLimit(partner.id, selectedReportRange(), editingEntry);
    if (amount > available + 0.001) { showToast(`ربح ${partner.name} المتاح للسحب هو ${money(available)} فقط. للمبلغ الزائد اختر سحب شخصي.`); return; }
  }
  const note = els.workerPartnerWithdrawalNoteInput?.value.trim();
  let entry = normalizeOwnerWithdrawal({ id: editingEntry?.id, kind, partnerId: partner.id, partnerName: partner.name, amount, method, note, createdAt });
  let split = null;
  let nextWithdrawals = (state.ownerWithdrawals || []).filter((item) => item.id !== editingEntry?.id);
  let nextFunding = (state.partnerFundingTransactions || []).filter((item) => item.sourcePersonalReturnId !== editingEntry?.id);
  if (kind === OWNER_WITHDRAWAL_PERSONAL_RETURN) {
    split = buildPersonalWithdrawalReturnSplit({ partner, editingEntry, amount, method, note, createdAt });
    entry = split.returnEntry;
    if (entry) nextWithdrawals.push(entry);
    nextFunding = (state.partnerFundingTransactions || []).filter((item) => item.id !== split.linkedFunding?.id && item.sourcePersonalReturnId !== split.returnId);
    if (split.fundingEntry) nextFunding.push(split.fundingEntry);
  } else {
    nextWithdrawals.push(entry);
  }
  const validation = ownerWithdrawalLedgerValidation(nextWithdrawals, partner.id);
  if (!validation.valid) { showToast(`تعذر توزيع مبلغ الإرجاع. النقص ${money(validation.shortage)}.`); return; }
  state.ownerWithdrawals = nextWithdrawals;
  state.partnerFundingTransactions = nextFunding;
  auditAction(editingEntry ? "partner.withdrawal_edit" : "partner.withdrawal_create", { id: entry?.id || split?.returnId, partnerId: partner.id, kind, amount, returnedAmount: split?.returnedAmount, excessFunding: split?.excessFunding, method, createdAt });
  setLastPaymentMethod(method);
  resetWorkerPartnerWithdrawalForm();
  saveState();
  const returnBalance = kind === OWNER_WITHDRAWAL_PERSONAL_RETURN ? cashOnHand().methods[method]?.current : null;
  showToast(kind === OWNER_WITHDRAWAL_PERSONAL_RETURN && split?.excessFunding > 0.001
    ? `تم إرجاع ${money(split.returnedAmount)} من السحب، وتحويل الزيادة ${money(split.excessFunding)} إلى تمويل مسترد. رصيد ${paymentLabels[method] || method} الآن ${money(returnBalance)}.`
    : `${editingEntry ? "تم تعديل" : "تم تسجيل"} ${ownerWithdrawalTypeLabel(kind)} بقيمة ${money(amount)}${kind === OWNER_WITHDRAWAL_PERSONAL_RETURN ? `؛ رصيد ${paymentLabels[method] || method} الآن ${money(returnBalance)}.` : "."}`);
  render();
}

function highlightPartnerRow(partnerId) {
  const panel = els.partnersPanel || document.getElementById("partnersPanel");
  if (panel) panel.open = true;
  setTimeout(() => {
    const rows = Array.from(document.querySelectorAll("[data-partner-row]"));
    const row = rows.find((item) => item.dataset.partnerRow === partnerId);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("is-highlighted");
    setTimeout(() => row.classList.remove("is-highlighted"), 1400);
  }, 50);
}

function openWorkerPartner(workerId = selectedWorkerId) {
  const worker = getWorker(workerId);
  if (!worker) { showToast("اختر العامل أولاً."); return; }
  const partner = partnerLinkedToWorker(worker.id);
  if (!partner) {
    markWorkerAsPartner(worker.id);
    return;
  }
  state.view = "reports";
  saveState();
  render();
  highlightPartnerRow(partner.id);
  showToast("عدّل نسبة الشريك من قسم الشركاء.");
}

function markWorkerAsPartner(workerId = selectedWorkerId) {
  const worker = getWorker(workerId);
  if (!worker) { showToast("اختر العامل أولاً."); return; }
  state.partners = state.partners || [];

  let partner = partnerLinkedToWorker(worker.id);
  if (partner) {
    openWorkerPartner(worker.id);
    return;
  }

  partner = unlinkedPartnerMatchingWorker(worker);
  const linkedExisting = Boolean(partner);
  if (partner) {
    partner.workerId = worker.id;
  } else {
    partner = normalizePartner({ name: worker.name, sharePercent: 0, workerId: worker.id });
    state.partners.unshift(partner);
  }

  auditAction("partner.worker_link", {
    partnerId: partner.id,
    workerId: worker.id,
    linkedExisting
  });
  saveState();
  showToast(`تم وضع ${worker.name} كشريك. عدّل نسبته من قسم الشركاء.`);
  renderExpenses();
  if (typeof renderPartnersPanel === "function") renderPartnersPanel(selectedReportRange());
  if (typeof populateWithdrawPartnerSelect === "function") populateWithdrawPartnerSelect();
}

function addWorkerFromWorkersPage(event) {
  event.preventDefault();
  const phone = els.workerAddPhoneInput.value.trim();
  const salaryValue = els.workerAddSalaryInput.value === "" ? null : Math.max(Number(els.workerAddSalaryInput.value || 0), 0);
  const extra = {};
  if (phone) extra.phone = phone;
  if (salaryValue !== null) extra.salary = salaryValue;
  const worker = upsertWorker(els.workerAddNameInput.value, extra);
  if (!worker) {
    showToast("اكتب اسم العامل أولا.");
    els.workerAddNameInput.focus();
    return;
  }

  selectedWorkerId = worker.id;
  els.workerSearchInput.value = "";
  els.workerStatusFilter.value = "all";
  els.workerAddForm.reset();
  showToast("تم حفظ العامل.");
  render();
}

async function deleteWorker(workerId) {
  const worker = getWorker(workerId);
  if (!worker) return;

  const movementCount = workerEntriesFor(worker).length + workerTransactionsFor(worker).length;
  const movementWarning = movementCount ? `\nحركاته السابقة ستبقى في التقارير لكنها لن تظهر كحساب عامل محفوظ.` : "";
  const confirmed = await appConfirm(`حذف العامل "${worker.name}"؟${movementWarning}`);
  if (!confirmed) return;

  state.workers = (state.workers || []).filter((item) => item.id !== worker.id);
  (state.workerConsumptions || []).forEach((entry) => {
    if (entry.workerId === worker.id) {
      entry.workerId = "";
      entry.workerDeleted = true;
    }
  });
  (state.workerTransactions || []).forEach((entry) => {
    if (entry.workerId === worker.id) {
      entry.workerId = "";
      entry.workerDeleted = true;
    }
  });
  (state.partners || []).forEach((partner) => {
    if (partner.workerId === worker.id) partner.workerId = "";
  });
  if (selectedWorkerId === worker.id) {
    selectedWorkerId = state.workers[0]?.id || null;
  }
  showToast("تم حذف العامل.");
  render();
}

function renderWorkers() {
  state.workers = reconcileWorkers(state.workers || [], state.workerConsumptions || [], state.workerTransactions || []);
  if (selectedWorkerId && !getWorker(selectedWorkerId)) selectedWorkerId = state.workers[0]?.id || null;
  if (!selectedWorkerId && state.workers.length) selectedWorkerId = state.workers[0].id;

  // نحسب حساب كل عامل مرة وحدة (بدل مرتين) ونعيد استخدامه للمجاميع وللقائمة
  const workerRows = (state.workers || []).map((worker) => {
    const entries = workerEntriesFor(worker);
    return { worker, entries, stats: workerConsumptionTotals(entries), account: workerMonthlyAccount(worker), cafeFunding: workerCafeFundingTotals(worker) };
  });

  const overview = workerRows.reduce((totals, row) => {
    totals.due += Math.max(row.account.due, 0);
    totals.advances += row.account.advances;
    totals.salaryPaid += row.account.salaryPaid;
    totals.paymentIn += row.account.paymentIn;
    totals.cafeFunding += row.cafeFunding.outstanding;
    totals.charged += row.account.drinkStats.charged;
    return totals;
  }, { due: 0, advances: 0, salaryPaid: 0, paymentIn: 0, cafeFunding: 0, charged: 0 });
  if (els.workerTotalDue) els.workerTotalDue.textContent = money(overview.due);
  if (els.workerTotalAdvance) els.workerTotalAdvance.textContent = money(overview.advances);
  if (els.workerTotalSalaryPaid) els.workerTotalSalaryPaid.textContent = money(overview.salaryPaid);
  if (els.workerTotalPaymentIn) els.workerTotalPaymentIn.textContent = money(overview.paymentIn);
  if (els.workerTotalCafeFunding) els.workerTotalCafeFunding.textContent = money(overview.cafeFunding);
  if (els.workerTotalCharged) els.workerTotalCharged.textContent = money(overview.charged);

  const query = els.workerSearchInput.value.trim().toLowerCase();
  const status = els.workerStatusFilter.value;
  const workers = workerRows
    .filter((row) => workerFilterMatches(row.worker, row.stats, row.account, query, status, row.cafeFunding.deposited))
    .sort((a, b) => {
      const lastA = Math.max(
        new Date(a.entries[0]?.createdAt || 0).getTime(),
        new Date(a.account.transactions[0]?.createdAt || 0).getTime(),
        new Date(a.worker.updatedAt || 0).getTime()
      );
      const lastB = Math.max(
        new Date(b.entries[0]?.createdAt || 0).getTime(),
        new Date(b.account.transactions[0]?.createdAt || 0).getTime(),
        new Date(b.worker.updatedAt || 0).getTime()
      );
      return lastB - lastA;
    });

  if (!workers.length) {
    els.workersList.innerHTML = state.workers.length
      ? '<div class="empty-state">لا يوجد عمال مطابقين للتصفية.</div>'
      : '<div class="empty-state">لا يوجد عمال بعد. أضف عامل من النموذج بالأعلى.</div>';
    return;
  }

  els.workersList.innerHTML = workers.map(({ worker, entries, stats, account, cafeFunding }) => {
    const badge = workerBadge(account, stats);
    const linkedPartner = partnerLinkedToWorker(worker.id);
    const partnerBadge = linkedPartner ? '<span class="balance-badge worker-partner-badge">🤝 شريك</span>' : "";
    const partnerButton = linkedPartner
      ? `<button class="worker-partner-mini-button is-linked" type="button" data-open-worker-partner="${escapeAttr(worker.id)}">شريك</button>`
      : `<button class="worker-partner-mini-button" type="button" data-mark-worker-partner="${escapeAttr(worker.id)}">هذا شريك</button>`;
    const lastMovementDate = [entries[0]?.createdAt, account.transactions[0]?.createdAt]
      .filter(Boolean)
      .sort((a, b) => new Date(b || 0) - new Date(a || 0))[0];
    const lastMovement = lastMovementDate ? ` | آخر حركة: ${formatDate(lastMovementDate)}` : "";
    return `
      <article class="customer-card ${worker.id === selectedWorkerId ? "is-active" : ""} ${workerIsFinished(worker) ? "worker-finished" : ""}" data-worker-card="${worker.id}">
        <header>
          <strong>${escapeHtml(worker.name)}</strong>
          <span class="customer-badges">
            ${partnerBadge}
            ${cafeFunding.deposited > 0.001 ? `<span class="balance-badge worker-cafe-funding-badge">${cafeFunding.outstanding > 0.001 ? `تمويل متبقي ${money(cafeFunding.outstanding)}` : "تمويله مرجّع بالكامل"}</span>` : ""}
            ${workerIsFinished(worker) ? '<span class="balance-badge cancelled">🏁 خلّص</span>' : ""}
            <span class="balance-badge ${badge.className}">${badge.text}</span>
          </span>
        </header>
        <div class="customer-card-footer">
          <div class="worker-card-summary">
            <small>${worker.phone ? `${escapeHtml(worker.phone)} | ` : ""}راتب ${money(account.monthlySalary)}${lastMovement}</small>
            <div class="worker-card-metrics">
              <span><small>المستحق</small><b>${money(Math.max(account.due, 0))}</b></span>
              <span><small>السلف</small><b>${money(account.advances)}</b></span>
              <span><small>المدفوع</small><b>${money(account.salaryPaid)}</b></span>
            </div>
          </div>
          <div class="worker-card-actions">
            ${partnerButton}
            <button class="customer-delete-button" type="button" data-remove-worker="${worker.id}">حذف</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function setWorkerFormDisabled(disabled) {
  [els.expenseForm, els.workerTransactionForm, els.workerLeaveForm, els.workerRaiseForm].forEach((form) => {
    if (!form) return;
    form.querySelectorAll("input, select, textarea, button").forEach((control) => {
      control.disabled = disabled;
    });
  });
}

function workerTodayInputValue() {
  return typeof todayDateInputValue === "function"
    ? todayDateInputValue()
    : new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function resetWorkerTransactionForm() {
  editingWorkerTransactionId = null;
  if (els.workerTransactionDateInput) els.workerTransactionDateInput.value = workerTodayInputValue();
  if (els.workerTransactionTypeInput) {
    els.workerTransactionTypeInput.value = workerTransactionTypeLabels[state.lastWorkerTransactionType]
      ? state.lastWorkerTransactionType
      : WORKER_ADVANCE_TYPE;
  }
  if (els.workerTransactionAmountInput) els.workerTransactionAmountInput.value = "";
  if (els.workerTransactionMethodInput) els.workerTransactionMethodInput.value = getLastPaymentMethod();
  if (els.workerTransactionNoteInput) els.workerTransactionNoteInput.value = "";
  if (els.workerTransactionCancelEditButton) els.workerTransactionCancelEditButton.hidden = true;
  renderWorkerTransactionTypeState(workerMonthlyAccount(getWorker(selectedWorkerId)));
}

function resetWorkerConsumptionForm() {
  editingWorkerConsumptionId = null;
  workerConsumptionMode = workerConsumptionTypeLabels[state.lastWorkerConsumptionMode]
    ? state.lastWorkerConsumptionMode
    : "worker_price";
  if (els.expenseTitleInput) els.expenseTitleInput.value = getWorker(selectedWorkerId)?.name || "";
  if (els.expenseDateInput) els.expenseDateInput.value = workerTodayInputValue();
  if (els.expenseAmountInput) els.expenseAmountInput.value = "";
  if (els.workerItemInput) els.workerItemInput.value = "";
  if (els.workerQtyInput) els.workerQtyInput.value = "1";
  if (els.expenseMethodInput) els.expenseMethodInput.value = getLastPaymentMethod();
  if (els.expenseNoItemToggle) els.expenseNoItemToggle.checked = false;
  if (els.expenseNoItemLabelInput) els.expenseNoItemLabelInput.value = "";
  if (els.expenseNoteInput) els.expenseNoteInput.value = "";
  if (els.expenseCancelEditButton) els.expenseCancelEditButton.hidden = true;
  renderConsumptionTypeState();
}

function renderWorkerTransactionTypeState(account = null) {
  if (!editingWorkerTransactionId && workerTransactionTypeLabels[state.lastWorkerTransactionType]) {
    els.workerTransactionTypeInput.value = state.lastWorkerTransactionType;
  }
  const type = els.workerTransactionTypeInput.value || WORKER_ADVANCE_TYPE;
  els.workerTransactionSubmitButton.textContent = editingWorkerTransactionId
    ? "حفظ تعديل الحركة"
    : type === WORKER_CAFE_FUNDING_REFUND_TYPE
      ? "إرجاع تمويل للعامل"
    : type === WORKER_CAFE_FUNDING_TYPE
      ? "تسجيل تمويل العامل"
    : type === WORKER_PAYMENT_IN_TYPE
      ? "تسجيل دفعة منه"
      : type === WORKER_SALARY_PAYMENT_TYPE ? "تسجيل دفع راتب" : "تسجيل سلفة";
  if (type === WORKER_SALARY_PAYMENT_TYPE && account?.due > 0.001) {
    els.workerTransactionAmountInput.placeholder = `الصافي ${money(account.due)}`;
  } else if (type === WORKER_CAFE_FUNDING_REFUND_TYPE) {
    const funding = workerCafeFundingTotals(getWorker(selectedWorkerId));
    els.workerTransactionAmountInput.placeholder = `المتاح للإرجاع ${money(funding.outstanding)}`;
  } else if (type === WORKER_CAFE_FUNDING_TYPE) {
    els.workerTransactionAmountInput.placeholder = "تمويل لا يؤثر على حساب العامل";
  } else if (type === WORKER_PAYMENT_IN_TYPE) {
    els.workerTransactionAmountInput.placeholder = "المبلغ اللي دفعه العامل";
  } else {
    els.workerTransactionAmountInput.placeholder = "اكتب المبلغ";
  }
}

function renderWorkerDetail() {
  const worker = getWorker(selectedWorkerId);
  if (!worker) {
    els.workerDetailName.textContent = "اختر عامل";
    els.workerDetailMeta.textContent = "لعرض حساب العامل وحركاته";
    renderWorkerPartnerActions(null);
    renderWorkerPartnerAccount(null);
    els.workerKpis.innerHTML = '<div class="empty-state">اختر عامل من القائمة أو أضف عامل جديد.</div>';
    els.workerLedgerList.innerHTML = "";
    els.expenseTitleInput.value = "";
    const periodLabel = document.getElementById("workerAccountPeriod");
    if (periodLabel) periodLabel.textContent = "";
    if (els.workerPeriodRow) els.workerPeriodRow.hidden = true;
    setWorkerFormDisabled(true);
    return;
  }

  setWorkerFormDisabled(false);
  els.expenseTitleInput.value = worker.name;
  els.workerDetailName.textContent = worker.name;
  renderWorkerPartnerActions(worker);
  renderWorkerPartnerAccount(worker);
  const finished = workerIsFinished(worker);
  const dailyRate = money(Math.round(Number(worker.salary || 0) / 30));
  const metaBase = worker.phone
    ? `${worker.phone} | راتبه ${money(worker.salary)} (${dailyRate}/يوم) | تم إنشاؤه ${formatDate(worker.createdAt)}`
    : `راتبه ${money(worker.salary)} (${dailyRate}/يوم) | تم إنشاؤه ${formatDate(worker.createdAt)}`;
  els.workerDetailMeta.textContent = finished ? `${metaBase} | 🏁 خلّص بتاريخ ${worker.periodTo}` : metaBase;

  const entries = workerEntriesFor(worker);
  const stats = workerConsumptionTotals(entries);
  const account = workerMonthlyAccount(worker);
  const periodLabel = document.getElementById("workerAccountPeriod");
  if (periodLabel) {
    periodLabel.textContent = `الحساب الحالي من ${formatDate(account.range.minDate)} إلى ${formatDate(account.range.maxDate)}`;
  }
  renderWorkerTransactionTypeState(account);

  // خانة فترة هذا العامل + نهاية العمل
  if (els.workerPeriodRow) {
    els.workerPeriodRow.hidden = false;
    els.workerOwnPeriodInput.value = worker.periodFrom || workerRangeFor(worker).minDate;
    if (els.workerEndDateInput) els.workerEndDateInput.value = worker.periodTo || "";
    if (els.workerEndDateClearButton) els.workerEndDateClearButton.hidden = !worker.periodTo;
  }

  // سجل الراتب + تعبئة تاريخ الرفع الافتراضي
  if (els.workerRaiseDateInput && !els.workerRaiseDateInput.value) els.workerRaiseDateInput.value = todayDateInputValue();
  if (els.workerSalaryHistory) {
    const hist = Array.isArray(worker.salaryHistory) ? worker.salaryHistory : [];
    const perDay = (s) => money(Math.round((Number(s) || 0) / 30));
    els.workerSalaryHistory.innerHTML = hist.length > 1
      ? `<div class="worker-salary-history-title">📈 تغييرات الراتب</div>` + hist.slice().reverse().map((h) =>
          `<div class="worker-salary-history-row"><span>من ${h.from}</span><strong>${money(h.salary)} <small>(${perDay(h.salary)}/يوم)</small></strong></div>`).join("")
      : `<div class="worker-salary-current">الراتب الحالي: <strong>${money(worker.salary)}</strong> <small>(${perDay(worker.salary)}/يوم)</small></div>`;
  }
  els.workerKpis.innerHTML = `
    <article class="current-balance-card"><span>الخلاصة الآن</span><strong>${workerBalanceText(account.due)}</strong></article>
    ${Math.abs(account.openingDue) > 0.001 ? `<article><span>رصيد مرحّل من الملف السابق</span><strong>${workerBalanceText(account.openingDue)}</strong></article>` : ""}
    <article><span>مستحق الفترة (${account.leaveDays > 0 ? `${account.payableDays} من ${account.periodDays}` : account.periodDays} يوم)</span><strong>${money(account.salary)}</strong></article>
    ${account.leaveDays > 0 ? `<article><span>🏖 أيام إجازة (بدون راتب)</span><strong>${quantityText(account.leaveDays)} يوم</strong></article>` : ""}
    <article><span>السلف المعطاة</span><strong>${money(account.advances)}</strong></article>
    <article><span>رواتب دُفعت له</span><strong>${money(account.salaryPaid)}</strong></article>
    <article><span>مبالغ استلمناها منه</span><strong>${money(account.paymentIn)}</strong></article>
    <article><span>خصم مشروبات من الراتب</span><strong>${money(account.drinkStats.salaryDeductions)}</strong></article>
  `;

  const allLedgerRows = [
    ...entries.map((entry) => ({ kind: "drink", createdAt: entry.createdAt, entry })),
    ...workerTransactionsFor(worker).map((entry) => ({ kind: "transaction", createdAt: entry.createdAt, entry })),
    ...workerLeavesFor(worker).map((entry) => ({ kind: "leave", createdAt: entry.createdAt, entry }))
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const ledgerFilter = els.workerLedgerFilterInput?.value || "all";
  const filteredLedgerRows = allLedgerRows.filter((row) => {
    if (ledgerFilter === "all") return true;
    if (ledgerFilter === "financial") return row.kind === "transaction";
    if (ledgerFilter === "drink" || ledgerFilter === "leave") return row.kind === ledgerFilter;
    if (ledgerFilter === "cafe_funding_activity") return row.kind === "transaction" && [WORKER_CAFE_FUNDING_TYPE, WORKER_CAFE_FUNDING_REFUND_TYPE].includes(row.entry.type);
    return row.kind === "transaction" && row.entry.type === ledgerFilter;
  });
  const filterLabels = {
    all: "كل الحركات",
    financial: "الدفعات والسلف",
    advance: "السلف",
    salary_payment: "دفعات الراتب للعامل",
    payment_in: "دفعات من العامل",
    cafe_funding_activity: "تمويل العامل وإرجاعه",
    drink: "المشروبات",
    leave: "الإجازات"
  };
  if (els.workerLedgerResultLabel) {
    els.workerLedgerResultLabel.textContent = `${filterLabels[ledgerFilter] || "الحركات"}: ${quantityText(filteredLedgerRows.length)} حركة`;
  }

  if (workerLedgerRenderedFor !== worker.id) {
    workerLedgerRenderedFor = worker.id;
    workerLedgerViewLimit = WORKER_LEDGER_STEP;
  }
  if (workerLedgerViewLimit < WORKER_LEDGER_STEP) workerLedgerViewLimit = WORKER_LEDGER_STEP;
  const ledgerRows = filteredLedgerRows.slice(0, workerLedgerViewLimit);
  const workerLedgerRemaining = filteredLedgerRows.length - ledgerRows.length;
  const workerLedgerMoreButton = workerLedgerRemaining > 0
    ? `<button class="secondary-button worker-ledger-more-button" type="button" data-show-more-worker-ledger>⬇ عرض ${Math.min(workerLedgerRemaining, WORKER_LEDGER_STEP)} حركة أكثر (متبقّي ${workerLedgerRemaining})</button>`
    : "";

  els.workerLedgerList.innerHTML = (ledgerRows.length
    ? ledgerRows.map((row) => {
      if (row.kind === "leave") {
        const entry = row.entry;
        return `
          <article class="ledger-row worker-ledger-row is-leave">
            <header>
              <div>
                <strong>🏖 إجازة</strong>
                <p>${entry.from === entry.to ? entry.from : `${entry.from} → ${entry.to}`} | ${quantityText(entry.days)} يوم</p>
              </div>
              <span class="balance-badge cancelled">بدون راتب</span>
            </header>
            ${entry.note ? `<p class="ledger-note">${escapeHtml(entry.note)}</p>` : ""}
            <div class="expense-row-actions">
              <button class="invoice-delete-button" type="button" data-remove-worker-leave="${entry.id}">حذف</button>
            </div>
          </article>
        `;
      }
      if (row.kind === "transaction") {
        const entry = row.entry;
        const isAdvance = entry.type === WORKER_ADVANCE_TYPE;
        const isPaymentIn = entry.type === WORKER_PAYMENT_IN_TYPE;
        const isCafeFunding = entry.type === WORKER_CAFE_FUNDING_TYPE;
        const isCafeFundingRefund = entry.type === WORKER_CAFE_FUNDING_REFUND_TYPE;
        const badgeClass = isAdvance ? "debt" : "credit";
        const badgeText = isAdvance
          ? `عليه ${money(entry.amount)}`
          : isCafeFunding ? `تمويل داخل ${money(entry.amount)}`
          : isCafeFundingRefund ? `تمويل مرجّع ${money(entry.amount)}`
          : isPaymentIn ? `دفع على حسابه ${money(entry.amount)}` : `مدفوع له ${money(entry.amount)}`;
        return `
          <article class="ledger-row worker-ledger-row ${isAdvance ? "is-advance" : isCafeFunding ? "is-cafe-funding" : isCafeFundingRefund ? "is-funding-refund" : isPaymentIn ? "is-payment-in" : "is-salary"}">
            <header>
              <div>
                <strong>${workerTransactionTypeLabel(entry.type)}</strong>
                <p>${formatDate(entry.createdAt)} | ${paymentLabels[entry.method] || entry.method}</p>
              </div>
              <span class="balance-badge ${badgeClass}">${badgeText}</span>
            </header>
            ${entry.note ? `<p class="ledger-note">${escapeHtml(entry.note)}</p>` : ""}
            <div class="expense-row-actions">
              <button class="secondary-button" type="button" data-edit-worker-transaction="${entry.id}">تعديل</button>
              <button class="invoice-delete-button" type="button" data-remove-worker-transaction="${entry.id}">حذف</button>
            </div>
          </article>
        `;
      }

      const entry = row.entry;
      const isFree = entry.type === FREE_WORKER_CONSUMPTION_TYPE;
      const hasItem = Boolean(entry.itemId);
      const badgeClass = isFree ? "debt" : "credit";
      const badgeText = isFree ? `تكلفة ${money(entry.costTotal)}` : money(entry.total);
      return `
        <article class="ledger-row worker-ledger-row">
          <header>
            <div>
              <strong>${escapeHtml(entry.itemName)}</strong>
              <p>${formatDate(entry.createdAt)} | ${workerConsumptionTypeLabel(entry.type)}${hasItem ? ` | الكمية: ${quantityText(entry.qty)}` : ""}${entry.type === "worker_price" ? ` | ${paymentLabels[entry.method] || entry.method}` : ""}</p>
            </div>
            <span class="balance-badge ${badgeClass}">${badgeText}</span>
          </header>
          <p class="ledger-note">${hasItem ? `تكلفة الصنف: ${money(entry.costTotal)}` : "مبلغ بدون صنف من المخزون"}${!isFree ? ` | يخصم من الحساب: ${money(Number(entry.total || 0))}` : ""}</p>
          ${entry.note ? `<p class="ledger-note">${escapeHtml(entry.note)}</p>` : ""}
          <div class="expense-row-actions">
            <button class="secondary-button" type="button" data-edit-expense="${entry.id}">تعديل</button>
            <button class="invoice-delete-button" type="button" data-remove-expense="${entry.id}">حذف</button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">لا توجد ${escapeHtml(filterLabels[ledgerFilter] || "حركات")} لهذا العامل.</div>`) + workerLedgerMoreButton;
  setWorkerSection(selectedWorkerSection);
}

function renderExpenses() {
  renderWorkerItemSelect();
  if (!els.expenseDateInput.value) els.expenseDateInput.value = todayDateInputValue();
  if (!els.workerTransactionDateInput.value) els.workerTransactionDateInput.value = todayDateInputValue();
  if (els.workerLeaveFromInput && !els.workerLeaveFromInput.value) els.workerLeaveFromInput.value = todayDateInputValue();
  if (els.workerLeaveToInput && !els.workerLeaveToInput.value) els.workerLeaveToInput.value = todayDateInputValue();
  renderConsumptionTypeState();
  renderWorkers();
  renderWorkerDetail();
}

function renderConsumptionTypeState() {
  if (!els.consumptionTypeToggle) return;
  els.consumptionTypeToggle.querySelectorAll("[data-consumption-type]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.consumptionType === workerConsumptionMode);
  });
  if (els.expenseSubmitButton) {
    els.expenseSubmitButton.textContent = editingWorkerConsumptionId ? "حفظ تعديل المشروب" : "تسجيل مشروب العامل";
  }
  if (els.expenseCancelEditButton) {
    els.expenseCancelEditButton.hidden = !editingWorkerConsumptionId;
  }

  const isFree = workerConsumptionMode === FREE_WORKER_CONSUMPTION_TYPE;
  const isSalary = workerConsumptionMode === SALARY_WORKER_CONSUMPTION_TYPE;
  // "مجاني" لازم يكون على صنف حقيقي من المخزون (تعطيه ببلاش)، فخيار "بدون صنف" ما إله معنى هون
  if (isFree && els.expenseNoItemToggle) els.expenseNoItemToggle.checked = false;
  const noItem = !isFree && Boolean(els.expenseNoItemToggle?.checked);

  if (els.expenseNoItemField) els.expenseNoItemField.style.display = isFree ? "none" : "";
  if (els.workerItemField) els.workerItemField.style.display = noItem ? "none" : "";
  if (els.workerQtyField) els.workerQtyField.style.display = noItem ? "none" : "";
  if (els.expenseNoItemLabelField) els.expenseNoItemLabelField.hidden = !noItem;

  // المبلغ يختفي بالمجاني، ويتغير عنوانه حسب النوع (إجمالي بدون صنف، للوحدة مع صنف)
  if (els.expenseAmountField) els.expenseAmountField.style.display = isFree ? "none" : "";
  if (els.expenseAmountLabel) {
    if (noItem) {
      els.expenseAmountLabel.textContent = isSalary ? "المبلغ الإجمالي اللي ينخصم من راتبه" : "المبلغ الإجمالي اللي دفعه";
    } else {
      els.expenseAmountLabel.textContent = isSalary ? "المبلغ اللي ينخصم من راتبه (للوحدة)" : "السعر اللي دفعه للوحدة";
    }
  }
  // طريقة الدفع تظهر بس لما يدفع كاش
  if (els.expenseMethodField) els.expenseMethodField.style.display = workerConsumptionMode === "worker_price" ? "" : "none";
}

function setConsumptionMode(mode) {
  workerConsumptionMode = ["worker_price", SALARY_WORKER_CONSUMPTION_TYPE, FREE_WORKER_CONSUMPTION_TYPE].includes(mode) ? mode : "worker_price";
  state.lastWorkerConsumptionMode = workerConsumptionMode;
  saveState();
  renderConsumptionTypeState();
}

function setWorkerOwnPeriod(value) {
  const worker = getWorker(selectedWorkerId);
  if (!worker) return;
  worker.periodFrom = value || "";
  worker.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function resetWorkerOwnPeriod() {
  const worker = getWorker(selectedWorkerId);
  if (!worker) return;
  worker.periodFrom = "";
  worker.updatedAt = new Date().toISOString();
  saveState();
  showToast("رجعت فترة العامل لبداية الفترة الحالية.");
  render();
}

// تحديد تاريخ نهاية عمل العامل (خلّص شغل) — الراتب يتوقف عند هالتاريخ بدل ما يضل يزيد لليوم
function setWorkerEndDate(value) {
  const worker = getWorker(selectedWorkerId);
  if (!worker) return;
  const end = String(value || "").slice(0, 10);
  if (end) {
    if (!guardClosedPeriod(end, "إنهاء فترة العامل بهذا التاريخ")) { render(); return; }
    const start = worker.periodFrom || workerRangeFor(worker).minDate;
    if (end < start) { showToast("تاريخ نهاية العمل لازم يكون بعد بداية فترة العامل."); render(); return; }
  }
  worker.periodTo = end;
  worker.updatedAt = new Date().toISOString();
  saveState();
  showToast(end ? `تم تحديد نهاية عمل ${worker.name} بتاريخ ${end}.` : "تم إلغاء تاريخ نهاية العمل.");
  render();
}

function clearWorkerEndDate() {
  const worker = getWorker(selectedWorkerId);
  if (!worker) return;
  worker.periodTo = "";
  worker.updatedAt = new Date().toISOString();
  saveState();
  showToast(`رجع ${worker.name} شغّال (بدون تاريخ نهاية).`);
  render();
}

// رفع راتب العامل بشكل دائم ساري من تاريخ معيّن
function raiseWorkerSalary(event) {
  event.preventDefault();
  const worker = getWorker(selectedWorkerId);
  if (!worker) { showToast("اختر عامل أولاً."); return; }
  const newSalary = Math.max(Number(els.workerRaiseSalaryInput.value || 0), 0);
  if (!(newSalary > 0)) { showToast("اكتب الراتب الجديد."); els.workerRaiseSalaryInput.focus(); return; }
  const effective = els.workerRaiseDateInput.value || todayDateInputValue();
  if (!guardClosedPeriod(effective, "رفع راتب العامل بهذا التاريخ")) return;
  applyWorkerSalaryChange(worker, newSalary, effective);
  worker.updatedAt = new Date().toISOString();
  saveState();
  els.workerRaiseSalaryInput.value = "";
  showToast(`تم رفع راتب ${worker.name} إلى ${money(newSalary)} شهري (${money(Math.round(newSalary / 30))}/يوم) من ${effective}.`);
  render();
}

function startEditWorkerTransaction(transactionId) {
  setWorkerSection("account");
  const entry = (state.workerTransactions || []).find((item) => item.id === transactionId);
  if (!entry) {
    showToast("لم أجد حركة العامل المطلوبة.");
    return;
  }
  if (!guardClosedPeriod(entry.createdAt, "تعديل حركة عامل ضمن فترة مغلقة")) return;
  const worker = getWorker(entry.workerId);
  if (worker) selectedWorkerId = worker.id;

  editingWorkerTransactionId = entry.id;
  els.workerTransactionDateInput.value = invoiceDateInputValue(entry);
  els.workerTransactionTypeInput.value = workerTransactionTypeLabels[entry.type] ? entry.type : WORKER_ADVANCE_TYPE;
  els.workerTransactionAmountInput.value = Number(entry.amount || 0) || "";
  els.workerTransactionMethodInput.value = paymentMethods.includes(entry.method) ? entry.method : getLastPaymentMethod();
  els.workerTransactionNoteInput.value = entry.note || "";
  if (els.workerTransactionCancelEditButton) els.workerTransactionCancelEditButton.hidden = false;
  renderWorkerTransactionTypeState(workerMonthlyAccount(getWorker(selectedWorkerId)));
  els.workerTransactionForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  els.workerTransactionAmountInput.focus();
  showToast("عدل الحركة ثم اضغط حفظ تعديل الحركة.");
}

function startEditWorkerConsumption(expenseId) {
  setWorkerSection("drinks");
  const entry = (state.workerConsumptions || []).find((item) => item.id === expenseId);
  if (!entry) {
    showToast("لم أجد مشروب العامل المطلوب.");
    return;
  }
  if (!guardClosedPeriod(entry.createdAt, "تعديل مشروب عامل ضمن فترة مغلقة")) return;
  const worker = getWorker(entry.workerId);
  if (worker) selectedWorkerId = worker.id;

  editingWorkerConsumptionId = entry.id;
  workerConsumptionMode = workerConsumptionTypeLabels[entry.type] ? entry.type : "worker_price";
  if (els.expenseDateInput) els.expenseDateInput.value = invoiceDateInputValue(entry);
  if (els.expenseNoItemToggle) els.expenseNoItemToggle.checked = !entry.itemId && workerConsumptionMode !== FREE_WORKER_CONSUMPTION_TYPE;
  renderWorkerItemSelect();
  renderConsumptionTypeState();
  if (els.workerItemInput) els.workerItemInput.value = entry.itemId || "";
  if (els.workerQtyInput) els.workerQtyInput.value = entry.itemId ? inputNumberValue(entry.qty || 1) : "1";
  if (els.expenseNoItemLabelInput) els.expenseNoItemLabelInput.value = entry.itemId ? "" : entry.itemName || "";
  if (els.expenseAmountInput) els.expenseAmountInput.value = inputNumberValue(entry.itemId ? entry.price : (entry.total || entry.price || 0));
  if (els.expenseMethodInput) els.expenseMethodInput.value = paymentMethods.includes(entry.method) ? entry.method : getLastPaymentMethod();
  if (els.expenseNoteInput) els.expenseNoteInput.value = entry.note || "";
  if (els.expenseTitleInput) els.expenseTitleInput.value = getWorker(selectedWorkerId)?.name || entry.workerName || "";
  renderConsumptionTypeState();
  els.expenseForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (entry.itemId) els.workerItemInput.focus();
  else els.expenseAmountInput.focus();
  showToast("عدل المشروب ثم اضغط حفظ تعديل المشروب.");
}

function recordWorkerTransaction(event) {
  if (event) event.preventDefault();
  const editingEntry = editingWorkerTransactionId
    ? (state.workerTransactions || []).find((item) => item.id === editingWorkerTransactionId)
    : null;
  const worker = editingEntry ? (getWorker(editingEntry.workerId) || getWorker(selectedWorkerId)) : getWorker(selectedWorkerId);
  if (!worker) {
    showToast("اختر عامل محفوظ أولا.");
    return;
  }

  const type = workerTransactionTypeLabels[els.workerTransactionTypeInput.value]
    ? els.workerTransactionTypeInput.value
    : WORKER_ADVANCE_TYPE;
  const amount = Math.max(Number(els.workerTransactionAmountInput.value || 0), 0);
  const method = paymentMethods.includes(els.workerTransactionMethodInput.value)
    ? els.workerTransactionMethodInput.value
    : getLastPaymentMethod();

  if (amount <= 0) {
    showToast("اكتب مبلغ الحركة المالية.");
    els.workerTransactionAmountInput.focus();
    return;
  }

  const createdAt = invoiceDateFromInput(els.workerTransactionDateInput.value);
  if (editingWorkerTransactionId && !editingEntry) {
    resetWorkerTransactionForm();
    showToast("الحركة التي كنت تعدلها غير موجودة.");
    return;
  }
  if (editingEntry && !guardClosedPeriod(editingEntry.createdAt, "تعديل حركة عامل ضمن فترة مغلقة")) return;
  if (!guardClosedPeriod(createdAt, editingEntry ? "نقل حركة عامل إلى فترة مغلقة" : "التسجيل بتاريخ ضمن فترة مغلقة")) return;

  const entry = normalizeWorkerTransaction({
    id: editingEntry ? editingEntry.id : uid("worker-tx"),
    workerId: worker.id,
    workerName: worker.name,
    type,
    amount,
    method,
    note: els.workerTransactionNoteInput.value.trim(),
    createdAt
  });

  if ([WORKER_CAFE_FUNDING_TYPE, WORKER_CAFE_FUNDING_REFUND_TYPE].includes(type)) {
    const fundingTransactions = (state.workerTransactions || [])
      .filter((item) => item.workerId === worker.id && item.id !== editingEntry?.id)
      .concat(entry);
    const validation = workerCafeFundingLedgerValidation(fundingTransactions);
    if (!validation.valid) {
      showToast(`لا يمكن إرجاع هذا المبلغ؛ تمويل العامل المتبقي أقل بـ ${money(validation.shortage)}.`);
      return;
    }
  }

  if (editingEntry) {
    state.workerTransactions = state.workerTransactions.map((item) => item.id === entry.id ? entry : item);
    auditAction("worker.transaction.edit", {
      id: entry.id,
      workerId: entry.workerId,
      workerName: entry.workerName,
      before: {
        type: editingEntry.type,
        amount: editingEntry.amount,
        method: editingEntry.method,
        createdAt: editingEntry.createdAt
      },
      after: {
        type: entry.type,
        amount: entry.amount,
        method: entry.method,
        createdAt: entry.createdAt
      }
    });
  } else {
    state.workerTransactions.unshift(entry);
    auditAction("worker.transaction.create", {
      id: entry.id,
      workerId: entry.workerId,
      workerName: entry.workerName,
      type: entry.type,
      amount: entry.amount,
      method: entry.method,
      createdAt: entry.createdAt
    });
  }
  worker.updatedAt = entry.createdAt;
  state.lastWorkerTransactionType = type;
  setLastPaymentMethod(method);
  resetWorkerTransactionForm();
  showToast(editingEntry
    ? "تم تعديل حركة العامل."
    : type === WORKER_CAFE_FUNDING_REFUND_TYPE
    ? "تم إرجاع التمويل للعامل وخصمه من الصندوق دون التأثير على راتبه أو سلفه."
    : type === WORKER_CAFE_FUNDING_TYPE
    ? "تم تسجيل تمويل العامل وإضافته للصندوق دون التأثير على راتبه أو سلفه."
    : type === WORKER_PAYMENT_IN_TYPE
    ? "تم استلام المبلغ من العامل وإضافته إلى الصندوق."
    : type === WORKER_SALARY_PAYMENT_TYPE ? "تم تسجيل دفع الراتب للعامل." : "تم تسجيل السلفة.");
  render();
}

function recordWorkerLeave(event) {
  event.preventDefault();
  const worker = getWorker(selectedWorkerId);
  if (!worker) {
    showToast("اختر عامل محفوظ أولا.");
    return;
  }

  const from = els.workerLeaveFromInput.value;
  const to = els.workerLeaveToInput.value || from;
  if (!from) {
    showToast("اختر تاريخ بداية الإجازة.");
    els.workerLeaveFromInput.focus();
    return;
  }
  if (to < from) {
    showToast("تاريخ نهاية الإجازة قبل تاريخ البداية.");
    els.workerLeaveToInput.focus();
    return;
  }

  if (!guardClosedPeriod(from, "تسجيل إجازة ضمن فترة مغلقة")) return;

  const entry = normalizeWorkerLeave({
    id: uid("leave"),
    workerId: worker.id,
    workerName: worker.name,
    from,
    to,
    note: els.workerLeaveNoteInput.value.trim(),
    createdAt: new Date().toISOString()
  });

  state.workerLeaves = state.workerLeaves || [];
  state.workerLeaves.unshift(entry);
  worker.updatedAt = entry.createdAt;
  auditAction("worker.leave.create", { workerId: worker.id, workerName: worker.name, from, to, days: entry.days });
  els.workerLeaveFromInput.value = "";
  els.workerLeaveToInput.value = "";
  els.workerLeaveNoteInput.value = "";
  showToast(`تم تسجيل إجازة ${quantityText(entry.days)} يوم لـ${worker.name}.`);
  render();
}

async function deleteWorkerLeave(id) {
  const entry = (state.workerLeaves || []).find((item) => item.id === id);
  if (!entry) return;
  if (!guardClosedPeriod(entry.from, "حذف إجازة ضمن فترة مغلقة")) return;
  const confirmed = await appConfirm(`حذف إجازة ${entry.workerName} (${entry.from} → ${entry.to})؟`);
  if (!confirmed) return;

  state.workerLeaves = (state.workerLeaves || []).filter((item) => item.id !== id);
  auditAction("worker.leave.delete", { workerId: entry.workerId, workerName: entry.workerName, from: entry.from, to: entry.to });
  showToast("تم حذف الإجازة.");
  render();
}

async function deleteWorkerTransaction(transactionId) {
  const entry = (state.workerTransactions || []).find((item) => item.id === transactionId);
  if (!entry) return;
  if (!guardClosedPeriod(entry.createdAt, "حذف حركة ضمن فترة مغلقة")) return;
  const confirmed = await appConfirm(`حذف حركة ${workerTransactionTypeLabel(entry.type)} للعامل ${entry.workerName}؟`);
  if (!confirmed) return;

  state.workerTransactions = state.workerTransactions.filter((item) => item.id !== transactionId);
  if (editingWorkerTransactionId === transactionId) resetWorkerTransactionForm();
  auditAction("worker.transaction.delete", {
    id: entry.id,
    workerId: entry.workerId,
    workerName: entry.workerName,
    type: entry.type,
    amount: entry.amount,
    method: entry.method,
    createdAt: entry.createdAt
  });
  showToast("تم حذف حركة العامل.");
  render();
}

function recordExpense(event) {
  if (event) event.preventDefault();
  const editingEntry = editingWorkerConsumptionId
    ? (state.workerConsumptions || []).find((item) => item.id === editingWorkerConsumptionId)
    : null;
  const worker = editingEntry ? (getWorker(editingEntry.workerId) || getWorker(selectedWorkerId)) : getWorker(selectedWorkerId);
  const workerName = worker?.name || "";
  const type = ["worker_price", SALARY_WORKER_CONSUMPTION_TYPE, FREE_WORKER_CONSUMPTION_TYPE].includes(workerConsumptionMode) ? workerConsumptionMode : "worker_price";
  const isFree = type === FREE_WORKER_CONSUMPTION_TYPE;
  const noItem = !isFree && Boolean(els.expenseNoItemToggle?.checked);
  const price = isFree ? 0 : Math.max(Number(els.expenseAmountInput.value || 0), 0);
  const method = paymentMethods.includes(els.expenseMethodInput.value) ? els.expenseMethodInput.value : getLastPaymentMethod();

  if (!worker) {
    showToast("اختر عامل محفوظ أولا.");
    return;
  }

  let item = null;
  let qty = 1;
  if (noItem) {
    if (price <= 0) {
      showToast(type === SALARY_WORKER_CONSUMPTION_TYPE ? "اكتب المبلغ اللي ينخصم من راتبه." : "اكتب المبلغ اللي دفعه.");
      els.expenseAmountInput.focus();
      return;
    }
  } else {
    item = findMenuItem(els.workerItemInput.value);
    qty = Math.max(Number(els.workerQtyInput.value || 0), 0);
    if (!item || qty <= 0) {
      showToast("اختر الصنف والكمية.");
      return;
    }
    if (!isFree && price <= 0) {
      showToast(type === SALARY_WORKER_CONSUMPTION_TYPE ? "اكتب المبلغ اللي ينخصم من راتبه." : "اكتب السعر اللي دفعه، أو اختر مجاني.");
      els.expenseAmountInput.focus();
      return;
    }
  }

  const consumptionDate = invoiceDateFromInput(els.expenseDateInput.value);
  if (editingWorkerConsumptionId && !editingEntry) {
    resetWorkerConsumptionForm();
    showToast("المشروب الذي كنت تعدله غير موجود.");
    return;
  }
  if (editingEntry && !guardClosedPeriod(editingEntry.createdAt, "تعديل مشروب عامل ضمن فترة مغلقة")) return;
  if (!guardClosedPeriod(consumptionDate, editingEntry ? "نقل مشروب عامل إلى فترة مغلقة" : "التسجيل بتاريخ ضمن فترة مغلقة")) return;

  const itemLabel = noItem ? (els.expenseNoItemLabelInput?.value.trim() || "مبلغ عام (بدون صنف)") : item.name;
  const stockUsage = noItem ? [] : stockUsageFromMenuItem(item);
  const entry = normalizeWorkerConsumption({
    id: editingEntry ? editingEntry.id : uid("worker"),
    type,
    workerId: worker.id,
    workerName,
    itemId: noItem ? "" : item.id,
    itemName: itemLabel,
    qty,
    price,
    cost: noItem ? 0 : menuItemRecipeCost(item),
    method,
    note: els.expenseNoteInput.value.trim(),
    stockUsage,
    createdAt: consumptionDate
  });

  if (editingEntry) restoreStockForSoldItems([workerConsumptionLine(editingEntry)]);
  const stockResult = noItem ? [] : reduceStockForSoldItems([workerConsumptionLine(entry)]);
  if (editingEntry) {
    state.workerConsumptions = state.workerConsumptions.map((item) => item.id === entry.id ? entry : item);
    auditAction("worker.consumption.edit", {
      id: entry.id,
      workerId: entry.workerId,
      workerName: entry.workerName,
      before: {
        type: editingEntry.type,
        itemName: editingEntry.itemName,
        qty: editingEntry.qty,
        total: editingEntry.total,
        method: editingEntry.method,
        createdAt: editingEntry.createdAt
      },
      after: {
        type: entry.type,
        itemName: entry.itemName,
        qty: entry.qty,
        total: entry.total,
        method: entry.method,
        createdAt: entry.createdAt
      }
    });
  } else {
    state.workerConsumptions.unshift(entry);
    auditAction("worker.consumption.create", {
      id: entry.id,
      workerId: entry.workerId,
      workerName: entry.workerName,
      type: entry.type,
      itemName: entry.itemName,
      qty: entry.qty,
      total: entry.total,
      method: entry.method,
      createdAt: entry.createdAt
    });
  }
  worker.updatedAt = entry.createdAt;
  state.lastWorkerConsumptionMode = type;
  setLastPaymentMethod(method);
  resetWorkerConsumptionForm();
  const msg = editingEntry
    ? "تم تعديل مشروب العامل."
    : type === SALARY_WORKER_CONSUMPTION_TYPE
    ? `تم التسجيل وخصم ${money(price * qty)} من راتب ${worker.name}.`
    : type === FREE_WORKER_CONSUMPTION_TYPE
      ? "تم التسجيل كمجاني (تتحمّل التكلفة فقط)."
      : `تم التسجيل ودخل ${money(price * qty)} للصندوق.`;
  let stockMsg = "";
  if (!noItem) {
    const stockText = stockUsageAppliedText(stockResult);
    stockMsg = stockText
      ? ` خصم من المخزون: ${stockText}.`
      : stockUsage.length
        ? " تم التسجيل، لكن لم أجد المخزون المرتبط حتى أخصمه."
        : " تم التسجيل بدون خصم مخزون لأن الصنف غير مربوط بالمخزون.";
  }
  showToast(`${msg}${stockMsg}`);
  render();
}

async function deleteExpense(expenseId) {
  const entry = (state.workerConsumptions || []).find((item) => item.id === expenseId);
  if (!entry) return;
  if (!guardClosedPeriod(entry.createdAt, "حذف حركة ضمن فترة مغلقة")) return;
  const confirmed = await appConfirm(`حذف مشروب ${entry.itemName} للعامل ${entry.workerName}؟`);
  if (!confirmed) return;
  restoreStockForSoldItems([workerConsumptionLine(entry)]);
  state.workerConsumptions = state.workerConsumptions.filter((item) => item.id !== expenseId);
  if (editingWorkerConsumptionId === expenseId) resetWorkerConsumptionForm();
  auditAction("worker.consumption.delete", {
    id: entry.id,
    workerId: entry.workerId,
    workerName: entry.workerName,
    type: entry.type,
    itemName: entry.itemName,
    qty: entry.qty,
    total: entry.total,
    method: entry.method,
    createdAt: entry.createdAt
  });
  showToast("تم حذف مشروب العامل ورجوع المخزون.");
  render();
}
