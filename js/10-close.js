// ═══ دفتر المقهى ═══ 10-close.js — إغلاق الفترة
// (مقسوم من app.js — الأسطر 4988-5341)

// ─── Period Close ──────────────────────────────────────────────────────────

function fmtNum(value) {
  return _moneyFormatter.format(Number(value || 0));
}

function toStdRange(range) {
  // Convert {from, to} ? {minDate, maxDate} for dateMatchesRange
  if (!range) return {};
  return { minDate: range.from || range.minDate, maxDate: range.to || range.maxDate };
}

// المدى المفتوح الحالي = من اليوم اللي بعد آخر إغلاق → اليوم
// (لو ما في إغلاقات: من بداية الشهر الميلادي كنقطة بداية)
function currentPeriodRange() {
  const last = lastPeriodClose();
  let from;
  if (last) {
    const next = new Date(last.to);
    next.setDate(next.getDate() + 1);
    from = next.toISOString().slice(0, 10);
  } else {
    from = monthStartInputValue();
  }
  return { minDate: from, maxDate: todayDateInputValue() };
}

// يستخدم نفس حساب صفحة العمال (موحّد) — راتب نسبي + نفس الخصومات
function workerPeriodAccount(worker, range) {
  return workerAccountForRange(worker, range);
}

function periodFinancialSummary(range) {
  const stdRange = toStdRange(range);
  const invoices = state.invoices.filter((inv) => dateMatchesRange(inv, stdRange));
  const purchases = (state.purchases || []).filter((p) => dateMatchesRange(p, stdRange));
  const supplierTransactions = supplierLedgerTransactions().filter((payment) => dateMatchesRange(payment, stdRange));
  const supplierPayments = supplierPaymentOutTransactions(supplierTransactions);
  const supplierReceipts = supplierReceiptTransactions(supplierTransactions);
  const expenses = (state.expenses || []).filter((e) => dateMatchesRange(e, stdRange) && !e.workerId);

  // Cash basis: actual cash/bank/wallet received
  const saleCashReceived = invoices
    .filter((inv) => inv.type === "sale" && !invoiceIsCancelled(inv))
    .reduce((sum, inv) => sum + paymentTotal(invoiceCashboxPayments(inv)), 0);
  const debtCashReceived = invoices
    .filter((inv) => inv.type === "payment" && !invoiceIsCancelled(inv))
    .reduce((sum, inv) => {
      const byMethod = paymentTotal(invoiceCashboxPayments(inv));
      return sum + (byMethod > 0 ? byMethod : Number(inv.paid || inv.amount || 0));
    }, 0);
  const workerDrinksPaid = (state.workerConsumptions || [])
    .filter((entry) => entry.type === "worker_price" && dateMatchesRange(entry, stdRange))
    .reduce((sum, entry) => sum + Number(entry.total || 0), 0);
  const workerPaymentIn = (state.workerTransactions || [])
    .filter((entry) => entry.type === WORKER_PAYMENT_IN_TYPE && dateMatchesRange(entry, stdRange))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const supplierReceiptsTotal = supplierReceipts.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const ownerWithdrawalReturns = (state.ownerWithdrawals || [])
    .filter((entry) => ownerWithdrawalMatchesRange(entry, stdRange) && ownerWithdrawalDirection(entry) === "in")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const cashReceived = saleCashReceived + debtCashReceived + workerDrinksPaid + workerPaymentIn + supplierReceiptsTotal + ownerWithdrawalReturns;

  // دفعات مدفوعة للعملاء (أرصدة رجعناها)
  const payoutsPaid = invoices
    .filter((inv) => inv.type === "payout" && !invoiceIsCancelled(inv))
    .reduce((sum, inv) => sum + paymentTotal(invoiceCashboxPayments(inv)), 0);

  // Accrual: total billed (including debt customers)
  const totalBilled = invoices
    .filter((inv) => inv.type === "sale" && !invoiceIsCancelled(inv))
    .reduce((sum, inv) => sum + Number(inv.total || 0), 0);

  // الدين الحقيقي غير المقبوض من مبيعات الفترة = مجموع المتبقي (delta) الموجب لكل فاتورة
  const periodUnpaid = invoices
    .filter((inv) => inv.type === "sale" && !invoiceIsCancelled(inv))
    .reduce((sum, inv) => {
      const delta = Number(inv.delta);
      const d = Number.isFinite(delta) ? delta : Number(inv.total || 0) - Number(inv.paid || 0);
      return sum + Math.max(0, d);
    }, 0);

  const totalPurchases = purchases.reduce((sum, p) => sum + purchasePaidAmount(p), 0);
  const totalSupplierPayments = supplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const workers = (state.workers || []).filter((w) => w.active !== false);
  const totalWorkersDue = workers.reduce((sum, w) => {
    const acc = workerPeriodAccount(w, range);
    return sum + Math.max(0, acc.due);
  }, 0);
  const workerTransactions = (state.workerTransactions || []).filter((entry) => dateMatchesRange(entry, stdRange));
  const workerTransactionSummary = workerTransactionTotals(workerTransactions);
  const totalWorkerAdvances = workerTransactionSummary.advances;
  const totalWorkerSalaryPaid = workerTransactionSummary.salaryPaid;
  const totalWorkerCashOut = totalWorkerAdvances + totalWorkerSalaryPaid;

  const totalOut = totalPurchases + totalSupplierPayments + totalExpenses + totalWorkerCashOut + payoutsPaid;

  // فرق الجرد بالفترة: مؤشر ربحية/بضاعة فقط (سالب = خسارة، موجب = زيادة) — لا يُحسب ضمن الكاش أبداً
  const inv = periodInventory(range);

  const netCash = cashReceived - totalOut;
  const netAccrual = totalBilled - totalOut;

  // سحوبات صاحب المحل (حصته) خلال الفترة
  const withdrawals = (state.ownerWithdrawals || [])
    .filter((w) => ownerWithdrawalMatchesRange(w, stdRange) && ownerWithdrawalDirection(w) === "out")
    .reduce((sum, w) => sum + Number(w.amount || 0), 0);

  // الباقي الفعلي المتوقع بالصندوق = كاش فقط ناقص السحوبات — الجرد مؤشر منفصل وما بيغيّر هالرقم
  const netAfterWithdrawals = netCash - withdrawals;

  return {
    cashReceived,
    saleCashReceived,
    debtCashReceived,
    workerDrinksPaid,
    workerPaymentIn,
    supplierReceiptsTotal,
    ownerWithdrawalReturns,
    totalBilled,
    totalPurchases,
    totalSupplierPayments,
    totalExpenses,
    totalWorkersDue,
    totalWorkerAdvances,
    totalWorkerSalaryPaid,
    totalWorkerCashOut,
    payoutsPaid,
    totalOut,
    netCash,
    netAccrual,
    periodUnpaid,
    inventoryDiff: inv.diffValue,        // معلومة بضاعة فقط — لا تدخل بحساب الكاش
    inventoryCount: inv.count,
    withdrawals,
    netAfterWithdrawals
  };
}

// كل عمليات الجرد بالفترة + صافي فرق القيمة
function periodInventoryCounts(range) {
  if (!state.inventoryCounts || !state.inventoryCounts.length) return [];
  const stdRange = toStdRange(range);
  return state.inventoryCounts
    .filter((c) => dateMatchesRange(c, stdRange))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function periodInventory(range) {
  const counts = periodInventoryCounts(range);
  const diffValue = counts.reduce((sum, c) => {
    return sum + (c.lines || []).reduce((s, line) => s + Number(line.value || 0), 0);
  }, 0);
  const wasteLoss = inventoryWasteTotal(inventoryWasteRecords(toStdRange(range)));
  return { count: counts.length, diffValue: diffValue - wasteLoss, wasteLoss };
}

function getLastInventoryCount(range) {
  return periodInventoryCounts(range)[0] || null;
}

function getPeriodRange() {
  const from = els.closePeriodFrom.value;
  const to = els.closePeriodTo.value;
  if (!from || !to) return null;
  if (new Date(from) > new Date(to)) return null;
  if (to > todayDateInputValue()) return null; // ما تقدر تقفل فترة لسا ما صارت
  return { from, to };
}

function periodCloseCashSource() {
  return state.periodCloseCashSource === "onHand" ? "onHand" : "period";
}

function periodCloseCashSourceLabel(source = periodCloseCashSource()) {
  return source === "onHand" ? "كل الفلوس اللي معي" : "صندوق الفترة";
}

function periodCloseMoneyOnHand() {
  return typeof cashOnHand === "function" ? cashOnHand() : null;
}

function setPeriodCloseCashSource(source) {
  state.periodCloseCashSource = source === "onHand" ? "onHand" : "period";
  saveState();
  renderPeriodClose();
}

function renderPeriodCloseCashSourcePicker(summary) {
  const source = periodCloseCashSource();
  const onHand = periodCloseMoneyOnHand();
  const onHandTotal = onHand ? Number(onHand.total.current || 0) : 0;
  const onHandDetails = onHand ? paymentMethods
    .map((method) => `${paymentLabels[method] || method}: ${money(onHand.methods[method].current)}`)
    .join(" | ") : "";
  const periodAvailable = Number(summary.netAfterWithdrawals ?? summary.netCash ?? 0);
  const selectedAmount = source === "onHand" ? onHandTotal : periodAvailable;
  return `
    <div class="partners-basis-toggle close-cash-source-toggle">
      <span>اعتمد الإغلاق على:</span>
      <button type="button" class="partners-basis-btn ${source === "period" ? "is-active" : ""}" data-close-cash-source="period">💵 صندوق الفترة</button>
      <button type="button" class="partners-basis-btn ${source === "onHand" ? "is-active" : ""}" data-close-cash-source="onHand">💼 كل الفلوس اللي معي</button>
    </div>
    <div class="partners-summary-box close-cash-source-box">
      <div class="partners-summary-row ${source === "period" ? "is-chosen" : ""}">
        <span>💵 صندوق الفترة بعد السحوبات <small>حسب التاريخ المحدد لهذا الإغلاق</small></span><strong>${money(periodAvailable)}</strong>
      </div>
      ${onHand ? `<div class="partners-summary-row partners-money-row ${source === "onHand" ? "is-chosen" : ""}">
        <span>💼 إجمالي الفلوس اللي معي الآن <small>${onHandDetails}</small></span><strong>${money(onHandTotal)}</strong>
      </div>` : ""}
      <div class="partners-summary-chosen">👈 الإغلاق سيعتمد على: <strong>${periodCloseCashSourceLabel(source)}</strong> (${money(selectedAmount)})</div>
    </div>`;
}

// لما يتغير أي تاريخ: حدّث عدّاد الأيام وأخفِ النتيجة القديمة (لازم يضغط احسب من جديد)
function onClosePeriodDateChange() {
  updatePeriodDaysLabel();
  els.closePeriodResult.hidden = true;
  if (els.closeOverlapWarning) els.closeOverlapWarning.hidden = true;
}

function updatePeriodDaysLabel() {
  const range = getPeriodRange();
  if (!range) { els.closePeriodDays.textContent = ""; return; }
  const days = Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1;
  els.closePeriodDays.textContent = `${days} يوم`;
}

function renderPeriodClose() {
  const range = getPeriodRange();
  if (!range) {
    els.closePeriodResult.hidden = true;
    return;
  }
  els.closePeriodResult.hidden = false;

  const workers = (state.workers || []).filter((w) => w.active !== false);
  const periodDays = Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1;

  // ── Step 1: Workers (اختياري، مطوي) ──────────────────────────────────────
  // التسوية تتبع حساب العامل الفعلي (فترته الخاصة حتى اليوم) — نفس اللي بصفحة العمال
  if (!workers.length) {
    els.closeWorkersTable.innerHTML = `<p class="close-empty">لا يوجد عمال مسجلون.</p>`;
    els.closePayAllButton.hidden = true;
    if (els.closeWorkerSubtitle) els.closeWorkerSubtitle.textContent = "لا يوجد عمال مسجلون";
  } else {
    let anyDue = false;
    let totalDue = 0;
    const rows = workers.map((worker) => {
      const acc = workerMonthlyAccount(worker);
      const due = acc.due;
      if (due > 0) { anyDue = true; totalDue += due; }
      const dueClass = due > 0 ? "close-due-positive" : due < 0 ? "close-due-negative" : "";
      const dueLabel = due > 0 ? `متبقي: ${fmtNum(due)} ج` : due < 0 ? `زيادة: ${fmtNum(Math.abs(due))} ج` : "مسوّى";
      return `<tr>
        <td>${escapeHtml(worker.name)}</td>
        <td>${fmtNum(acc.salary)} ج <small>(${acc.periodDays}/30 × ${fmtNum(worker.salary || 0)})</small></td>
        <td>${fmtNum(acc.salaryPaid)} ج</td>
        <td>${fmtNum(acc.deductions)} ج</td>
        <td class="${dueClass}">${dueLabel}</td>
      </tr>`;
    }).join("");

    els.closeWorkersTable.innerHTML = `
      <table class="close-workers-table">
        <thead><tr>
          <th>العامل</th>
          <th>المستحق للفترة</th>
          <th>المدفوع</th>
          <th>سلف / مشروبات</th>
          <th>الرصيد</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    els.closePayAllButton.hidden = !anyDue;
    if (els.closeWorkerSubtitle) {
      els.closeWorkerSubtitle.textContent = anyDue
        ? `⚠️ في مستحقات ما اتدفعت: ${fmtNum(totalDue)} ج`
        : "✓ كل العمال متسوّين";
    }
  }

  // ── Step 2: Inventory (اختياري، مطوي) ────────────────────────────────────
  const lastCount = getLastInventoryCount(range);
  const inv = periodInventory(range);
  if (!lastCount) {
    els.closeInventoryInfo.innerHTML = `
      <div class="close-inventory-warning">
        ⚠️ ما عملت جرد لهالفترة بعد — اعمل جرد أول عشان خسارة/زيادة البضاعة تنحسب بالصافي.
        <button class="secondary-button" type="button" id="closeGoInventoryInlineButton">📊 روح اعمل جرد الآن</button>
      </div>`;
    const goBtn = document.getElementById("closeGoInventoryInlineButton");
    if (goBtn) goBtn.addEventListener("click", () => { state.view = "inventory"; render(); });
    if (els.closeInventorySubtitle) els.closeInventorySubtitle.textContent = "⚠️ ما عملت جرد لهالفترة (اختياري)";
  } else {
    const date = formatDate(lastCount.createdAt);
    const lines = lastCount.lines || [];
    const lastDiff = lines.reduce((sum, l) => sum + Number(l.value || 0), 0);
    const lastDiffClass = lastDiff >= 0 ? "close-due-positive" : "close-due-negative";
    const totalClass = inv.diffValue >= 0 ? "close-due-positive" : "close-due-negative";
    const totalLabel = inv.diffValue >= 0 ? "زيادة" : "خسارة";
    els.closeInventoryInfo.innerHTML = `
      <div class="close-inventory-summary">
        <span>📦 آخر جرد: <strong>${date}</strong></span>
        <span>عدد الأصناف: <strong>${lines.length}</strong></span>
        <span class="${lastDiffClass}">فرق آخر جرد: <strong>${lastDiff >= 0 ? "+" : ""}${fmtNum(lastDiff)} ج</strong></span>
        ${inv.count > 1 ? `<span class="${totalClass}">صافي ${totalLabel} الفترة (${inv.count} جرد): <strong>${inv.diffValue >= 0 ? "+" : ""}${fmtNum(inv.diffValue)} ج</strong></span>` : ""}
      </div>`;
    if (els.closeInventorySubtitle) els.closeInventorySubtitle.textContent = `✓ آخر جرد: ${date}`;
  }

  // ── Step 3: Financial Summary ────────────────────────────────────────────
  const summary = periodFinancialSummary(range);
  // الدين الفعلي الحالي = مجموع أرصدة العملاء الموجبة (اللي عليهم فعلاً الآن، بعد أي تسديد)
  const pendingDebt = customerTotals().debt;
  const invDiff = summary.inventoryDiff;
  const hasInvDiff = Math.abs(invDiff) > 0.001;
  const closeOutParts = [
    { label: "مشتريات مدفوعة", amount: summary.totalPurchases },
    { label: "تسديد موردين", amount: summary.totalSupplierPayments },
    { label: "مصروفات", amount: summary.totalExpenses },
    { label: "سلف عمال", amount: summary.totalWorkerAdvances },
    { label: "قبضات عمال مدفوعة", amount: summary.totalWorkerSalaryPaid },
    { label: "دفعات لعملاء", amount: summary.payoutsPaid }
  ].filter((part) => Number(part.amount || 0) > 0.001);
  const closeOutText = closeOutParts.length
    ? closeOutParts.map((part) => `${part.label} ${money(part.amount)}`).join(" + ")
    : "لا يوجد طالع فعلي";
  els.closeSummary.innerHTML = `
    ${renderPeriodCloseCashSourcePicker(summary)}
    <div class="cashbox-card ${summary.netCash >= 0 ? "is-positive" : "is-negative"}">
      <div class="cashbox-main">
        <span>💰 صافي الفترة — اللي بضل معك</span>
        <strong>${money(summary.netCash)}</strong>
        <small>بعد المصاريف المدفوعة فعلياً فقط</small>
      </div>
      <div class="cashbox-breakdown">
        <div class="cashbox-flow cashbox-in">
          <strong>⬇ دخل: ${money(summary.cashReceived)}</strong>
          <small>بيع ${money(summary.saleCashReceived)} + تسديد ديون ${money(summary.debtCashReceived)}${Number(summary.workerDrinksPaid || 0) > 0.001 ? ` + مشروبات عمال ${money(summary.workerDrinksPaid)}` : ""}${Number(summary.supplierReceiptsTotal || 0) > 0.001 ? ` + قبض موردين ${money(summary.supplierReceiptsTotal)}` : ""}</small>
        </div>
        <div class="cashbox-flow cashbox-out">
          <strong>⬆ طلع: ${money(summary.totalOut)}</strong>
          <small>${closeOutText}</small>
        </div>
      </div>
    </div>
    ${summary.totalWorkersDue > 0.001 ? `
    <p class="close-pending-note">📌 مستحق عمال غير مدفوع: ${money(summary.totalWorkersDue)} — هذا لا يدخل في الطالع إلا لما تسجل قبضة فعلية.</p>
    ` : ""}
    ${summary.withdrawals > 0.001 ? `
    <div class="cashbox-card ${summary.netAfterWithdrawals >= 0 ? "is-positive" : "is-negative"}" style="margin-top:12px;">
      <div class="cashbox-main">
        <span>🏦 الباقي الفعلي المتوقع بالصندوق</span>
        <strong>${money(summary.netAfterWithdrawals)}</strong>
        <small>الصافي (كاش فقط) ${money(summary.netCash)} − حصتك المسحوبة ${money(summary.withdrawals)}</small>
      </div>
      <div class="cashbox-breakdown">
        <div class="cashbox-flow cashbox-out">
          <strong>💸 سحبت حصتك: ${money(summary.withdrawals)}</strong>
          <small>طلعت من الصندوق لجيبك</small>
        </div>
      </div>
    </div>
    ` : ""}
    ${hasInvDiff ? `
    <div class="close-inventory-note ${invDiff < 0 ? "is-loss" : "is-gain"}">
      <strong>${invDiff < 0 ? "📉 خسارة جرد" : "📈 زيادة جرد"}: ${money(Math.abs(invDiff))}</strong>
      <p>مؤشر بضاعة فقط (فرق بين النظام والعدّ الفعلي، ${summary.inventoryCount} عملية جرد) — ما بيغيّر الكاش يلي بالصندوق ولا يدخل بحساب "الباقي الفعلي" فوق.</p>
    </div>
    ` : ""}
    ${closePartnerDistributionPreviewHtml(range)}
    ${pendingDebt > 0.001 ? `
    <p class="close-pending-note">📌 عملاؤك عليهم ديون حالياً مجموعها ${money(pendingDebt)} لسا ما انقبضت — لو حصّلتها بيزيد الكاش عندك بمقدارها.</p>
    ` : ""}`;

  // قائمة السحوبات داخل الفترة + حقل الإدخال + خيارات الشركاء
  renderCloseWithdrawals(range, summary);
  if (typeof populateWithdrawPartnerSelect === "function") populateWithdrawPartnerSelect();
}

function periodWithdrawals(range) {
  const stdRange = toStdRange(range);
  return (state.ownerWithdrawals || [])
    .filter((w) => ownerWithdrawalMatchesRange(w, stdRange))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function renderCloseWithdrawals(range, summary) {
  if (!els.closeWithdrawList) return;
  const list = periodWithdrawals(range);
  els.closeWithdrawList.innerHTML = list.length
    ? `<div class="close-withdraw-items">${list.map((w) => `
        <article class="close-withdraw-item">
          <span>💸 ${money(w.amount)} <small>(${ownerWithdrawalTypeLabel(ownerWithdrawalKind(w))} · ${paymentLabels[w.method] || w.method})</small>${w.partnerName ? ` <small class="close-withdraw-partner">— ${escapeHtml(w.partnerName)}</small>` : ""}</span>
          <small>${formatDate(w.createdAt)}</small>
          <button class="inventory-history-delete" type="button" data-remove-withdrawal="${w.id}" title="حذف السحب">🗑</button>
        </article>
      `).join("")}
      <div class="close-withdraw-total">إجمالي سحوبات الشركاء بالفترة: <strong>${money(summary.withdrawals)}</strong></div>
      </div>`
    : "";
}

function recordCloseWithdrawal() {
  const range = getPeriodRange();
  if (!range) { showToast("احسب الفترة أولاً."); return; }
  const amount = Math.max(Number(els.closeWithdrawAmount.value || 0), 0);
  if (amount <= 0) { showToast("اكتب مبلغ السحب."); els.closeWithdrawAmount.focus(); return; }
  const method = paymentMethods.includes(els.closeWithdrawMethod.value) ? els.closeWithdrawMethod.value : "cash";
  if (!guardClosedPeriod(`${range.to}T12:00:00`, "تسجيل سحب حصة")) return;
  const partnerId = els.closeWithdrawPartner ? els.closeWithdrawPartner.value : "";
  const partner = partnerId ? getPartner(partnerId) : null;
  if (!partner) { showToast("اختار الشريك حتى ينخصم السحب من حسابه الصحيح."); return; }
  const closeDist = partnerDistribution({ minDate: range.from, maxDate: range.to }, "cash", periodCloseCashSource());
  const partnerRow = closeDist.rows.find((row) => row.partner.id === partner.id);
  const available = Math.max(Number(partnerRow?.boxPayout || 0), 0);
  if (amount > available + 0.001) {
    showToast(`ربح ${partner.name} المتاح للسحب هو ${money(available)} فقط. سجّل المبلغ الزائد كسحب شخصي من قسم الشركاء.`);
    return;
  }
  state.ownerWithdrawals = state.ownerWithdrawals || [];
  const withdrawal = normalizeOwnerWithdrawal({
    id: uid("withdraw"),
    kind: OWNER_WITHDRAWAL_PROFIT,
    amount,
    method,
    partnerId: partner ? partner.id : "",
    partnerName: partner ? partner.name : "",
    note: partner ? `حصة ${partner.name}` : "حصة صاحب المحل",
    source: "period_close",
    periodFrom: range.from,
    periodTo: range.to,
    createdAt: new Date(`${range.to}T12:00:00`).toISOString()
  });
  state.ownerWithdrawals.push(withdrawal);
  auditAction("owner_withdrawal.create", {
    amount,
    method,
    kind: withdrawal.kind,
    partnerId: withdrawal.partnerId,
    period: `${range.from} — ${range.to}`,
    createdAt: withdrawal.createdAt
  });
  saveState();
  els.closeWithdrawAmount.value = "";
  showToast(partner
    ? `💸 سحب ${partner.name}: ${money(amount)} (${paymentLabels[method]}) — انخصم من الصندوق.`
    : `💸 سحبت حصتك ${money(amount)} (${paymentLabels[method]}) — انخصمت من الصندوق.`);
  renderPeriodClose();
  renderCloseInfo();
}

async function removeOwnerWithdrawal(id) {
  const entry = (state.ownerWithdrawals || []).find((w) => w.id === id);
  if (!entry) return;
  if (!guardClosedPeriod(entry.createdAt, "حذف سحب ضمن فترة مغلقة")) return;
  if (!(await appConfirm(`حذف سحب ${money(entry.amount)}؟`))) return;
  state.ownerWithdrawals = state.ownerWithdrawals.filter((w) => w.id !== id);
  auditAction("owner_withdrawal.delete", {
    amount: entry.amount,
    method: entry.method,
    createdAt: entry.createdAt
  });
  saveState();
  showToast("تم حذف السحب.");
  renderPeriodClose();
  renderCloseInfo();
}

function lastPeriodClose() {
  const closes = state.periodCloses || [];
  if (!closes.length) return null;
  return closes.slice().sort((a, b) => String(b.to).localeCompare(String(a.to)))[0];
}

function rangeOverlapsClose(range) {
  return (state.periodCloses || []).some((c) => range.from <= c.to && range.to >= c.from);
}

function closedPeriodFor(dateIso) {
  const day = String(dateIso || "").slice(0, 10);
  if (!day) return null;
  return (state.periodCloses || []).find((c) => day >= c.from && day <= c.to) || null;
}

function guardClosedPeriod(dateIso, actionLabel) {
  const closed = closedPeriodFor(dateIso);
  if (!closed) return true;
  showToast(`🔒 لا يمكن ${actionLabel} — التاريخ ضمن فترة مغلقة (${closed.from} — ${closed.to}). احذف الإغلاق من سجل الإغلاقات أولاً إذا لزم.`);
  return false;
}

function renderCloseInfo() {
  // شريط آخر إغلاق
  const last = lastPeriodClose();
  if (last) {
    els.lastCloseBanner.hidden = false;
    els.lastCloseBanner.innerHTML = `🔒 آخر إغلاق: <strong>${last.to}</strong> (فترة ${last.from} — ${last.to})`;
  } else {
    els.lastCloseBanner.hidden = true;
  }

  // تعبئة التواريخ تلقائياً إذا فاضية
  if (!els.closePeriodFrom.value) {
    if (last) {
      const next = new Date(last.to);
      next.setDate(next.getDate() + 1);
      els.closePeriodFrom.value = next.toISOString().slice(0, 10);
    }
  }
  if (!els.closePeriodTo.value) {
    els.closePeriodTo.value = todayDateInputValue();
  }
  els.closePeriodFrom.max = todayDateInputValue();
  els.closePeriodTo.max = todayDateInputValue();
  updatePeriodDaysLabel();

  // سجل الإغلاقات
  const closes = (state.periodCloses || []).slice().sort((a, b) => String(b.to).localeCompare(String(a.to)));
  els.closeHistoryList.innerHTML = closes.length
    ? closes.map((c) => {
      const expanded = c.id === expandedCloseId;
      return `
      <article class="close-history-row ${expanded ? "is-expanded" : ""}">
        <div class="close-history-head" data-toggle-close="${c.id}">
          <div class="close-history-main">
            <strong>${c.from} — ${c.to}</strong>
            <small>أُغلقت في ${formatDate(c.closedAt)}</small>
          </div>
          <div class="close-history-figures">
            <span>الصافي: <strong class="${Number(c.netCash) >= 0 ? 'close-due-positive' : 'close-due-negative'}">${fmtNum(c.netCash)} ج</strong></span>
            <span>الباقي: <strong class="${closeRemaining(c) >= 0 ? 'close-due-positive' : 'close-due-negative'}">${fmtNum(closeRemaining(c))} ج</strong></span>
            <span class="close-history-caret">${expanded ? "▲" : "▼"}</span>
          </div>
          <button class="inventory-history-delete" type="button" data-remove-period-close="${c.id}" title="حذف الإغلاق" aria-label="حذف الإغلاق">🗑</button>
        </div>
        ${expanded ? closeDetailHtml(c) : ""}
      </article>`;
    }).join("")
    : '<div class="empty-state">لا يوجد إغلاقات بعد.</div>';
}

// الباقي الفعلي بعد الجرد وسحب الحصة (مع توافق للإغلاقات القديمة)
function closeRemaining(c) {
  if (c.netAfterWithdrawals !== undefined) return Number(c.netAfterWithdrawals || 0);
  if (c.netAfterInventory !== undefined) return Number(c.netAfterInventory || 0);
  return Number(c.netCash || 0);
}

function closePartnerDistributionForRange(range) {
  if (!Array.isArray(state.partners) || !state.partners.length || typeof partnerDistribution !== "function") return null;
  return partnerDistribution(range, "cash", periodCloseCashSource());
}

function validatePartnersForClose(range) {
  const dist = closePartnerDistributionForRange(range);
  if (!dist) return { ok: true, dist: null };
  const shareTotal = Number(dist.totalSharePercent || 0);
  if (Math.abs(shareTotal - 100) > 0.01) {
    showToast(`نِسب الشركاء حالياً ${quantityText(shareTotal)}%. لازم تكون 100% قبل الإغلاق.`);
    return { ok: false, dist };
  }
  if (Number(dist.unassignedWithdrawn || 0) > 0.001) {
    showToast(`في سحوبات ${money(dist.unassignedWithdrawn)} غير منسوبة لشريك. اربطها بالشريك الصحيح قبل الإغلاق.`);
    return { ok: false, dist };
  }
  return { ok: true, dist };
}

function snapshotPartnerDistribution(dist) {
  if (!dist || !Array.isArray(dist.rows) || !dist.rows.length) return null;
  const n = (v) => Number(v || 0);
  return {
    basis: "cash",
    source: dist.source || "period",
    base: n(dist.base),
    profit: n(dist.profit),
    cashNet: n(dist.cashNet),
    periodCashNet: n(dist.periodCashNet),
    moneyOnHand: n(dist.moneyOnHand),
    distributableNow: n(dist.distributableNow),
    cashBeforeDraws: n(dist.cashBeforeDraws),
    totalSharePercent: n(dist.totalSharePercent),
    totalRemaining: n(dist.totalRemaining),
    totalBoxPayout: n(dist.totalBoxPayout),
    totalOutsideDue: n(dist.totalOutsideDue),
    totalOverdrawn: n(dist.totalOverdrawn),
    assignedWithdrawn: n(dist.assignedWithdrawn),
    unassignedWithdrawn: n(dist.unassignedWithdrawn),
    totalWithdrawn: n(dist.totalWithdrawn),
    totalPartnerAdvances: n(dist.totalPartnerAdvances),
    totalPartnerProducts: n(dist.totalPartnerProducts),
    totalCarryInDebt: n(dist.totalCarryInDebt),
    rows: dist.rows.map((r) => ({
      partnerId: r.partner?.id || "",
      partnerName: r.partner?.name || "شريك",
      sharePercent: n(r.sharePercent),
      shareAmount: n(r.shareAmount),
      withdrawnCash: n(r.withdrawnCash),
      profitWithdrawals: n(r.profitWithdrawals),
      personalWithdrawals: n(r.personalWithdrawals),
      advances: n(r.advances),
      withdrawnProducts: n(r.withdrawnProducts),
      withdrawn: n(r.withdrawn),
      carryInDebt: n(r.carryInDebt),
      totalShareDeductions: n(r.totalShareDeductions),
      remaining: n(r.remaining),
      boxPayout: n(r.boxPayout),
      outsideDue: n(r.outsideDue),
      overdrawn: n(r.overdrawn)
    }))
  };
}

function partnerPayoutStatus(row) {
  const payout = Number(row.boxPayout || 0);
  const overdrawn = Number(row.overdrawn || 0);
  const outsideDue = Number(row.outsideDue || 0);
  if (overdrawn > 0.001) return `<span class="close-due-negative">أخذ زيادة ${money(overdrawn)}</span>`;
  if (outsideDue > 0.001) return `<span class="close-due-negative">ناقصه ${money(outsideDue)} بسبب نقص الكاش</span>`;
  return payout > 0.001
    ? `<span class="close-due-positive">جاهز للاستلام</span>`
    : `<span>لا يوجد مبلغ</span>`;
}

function closePartnerDistributionPreviewHtml(range) {
  const dist = closePartnerDistributionForRange(range);
  if (!dist) return "";
  const shareWarn = Math.abs(Number(dist.totalSharePercent || 0) - 100) > 0.01
    ? `<p class="partners-warn">⚠️ مجموع نسب الشركاء ${quantityText(dist.totalSharePercent)}% — لازم تكون 100% قبل الإغلاق.</p>`
    : "";
  const unassignedWarn = Number(dist.unassignedWithdrawn || 0) > 0.001
    ? `<p class="partners-warn">📌 في سحوبات ${money(dist.unassignedWithdrawn)} غير منسوبة لشريك.</p>`
    : "";
  const rows = dist.rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.partner.name)}</td>
      <td>${quantityText(r.sharePercent)}%</td>
      <td>${money(r.shareAmount)}</td>
      <td>${money(r.withdrawn)}</td>
      <td>${money(r.carryInDebt)}</td>
      <td><strong>${money(r.boxPayout)}</strong></td>
      <td>${partnerPayoutStatus(r)}</td>
    </tr>`).join("");
  const sourceLabel = periodCloseCashSourceLabel(dist.source);
  return `
    <div class="partners-close-preview">
      <div class="partners-summary-chosen">🤝 مصدر الإغلاق: ${sourceLabel}. المبلغ ${money(dist.cashNet)} + اللي أخذوه ${money(dist.totalWithdrawn)} = أساس القسمة ${money(dist.base)}. الاستلام الفعلي: <strong>${money(dist.totalBoxPayout)}</strong></div>
      ${shareWarn}${unassignedWarn}
      <div class="partners-table-wrap">
        <table class="partners-table">
          <thead><tr><th>الشريك</th><th>النسبة</th><th>حصته الحالية</th><th>أخذ في الفترة</th><th>مرحل عليه</th><th>يستلم فعلياً</th><th>الحالة</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function closePartnerDistributionDetailHtml(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.rows) || !snapshot.rows.length) return "";
  const rows = snapshot.rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.partnerName)}</td>
      <td>${quantityText(r.sharePercent)}%</td>
      <td>${money(r.shareAmount)}</td>
      <td>${money(r.withdrawn)}</td>
      <td>${money(r.carryInDebt || 0)}</td>
      <td><strong>${money(r.boxPayout)}</strong></td>
      <td>${partnerPayoutStatus(r)}</td>
    </tr>`).join("");
  const sourceLabel = periodCloseCashSourceLabel(snapshot.source);
  return `
    <div class="partners-close-preview is-history">
      <div class="partners-summary-chosen">🤝 توزيع الشركاء المحفوظ وقت الإغلاق (${sourceLabel}): <strong>${money(snapshot.totalBoxPayout)}</strong></div>
      <div class="partners-table-wrap">
        <table class="partners-table">
          <thead><tr><th>الشريك</th><th>النسبة</th><th>حصته الحالية</th><th>أخذ في الفترة</th><th>مرحل عليه</th><th>استلم فعلياً</th><th>الحالة</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function closeDetailHtml(c) {
  const n = (v) => Number(v || 0);
  const row = (label, value, cls = "") => `
    <div class="close-detail-row">
      <span>${label}</span>
      <strong class="${cls}">${fmtNum(value)} ج</strong>
    </div>`;
  const textRow = (label, value) => `
    <div class="close-detail-row">
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`;
  const signCls = (v) => (n(v) >= 0 ? "close-due-positive" : "close-due-negative");
  const hasInv = c.inventoryDiff !== undefined && Math.abs(n(c.inventoryDiff)) > 0.001;
  const hasWithdraw = n(c.withdrawals) > 0.001;

  return `
    <div class="close-detail">
      <div class="close-detail-group">
        <h5>⬇ الداخل</h5>
        ${row("المقبوض فعلياً", c.cashReceived, "close-due-positive")}
        ${n(c.saleCashReceived) > 0.001 ? row("مقبوض البيع", c.saleCashReceived, "close-due-positive") : ""}
        ${n(c.debtCashReceived) > 0.001 ? row("تسديد ديون", c.debtCashReceived, "close-due-positive") : ""}
        ${n(c.workerDrinksPaid) > 0.001 ? row("مشروبات عمال مدفوعة", c.workerDrinksPaid, "close-due-positive") : ""}
        ${n(c.supplierReceiptsTotal) > 0.001 ? row("قبض من موردين", c.supplierReceiptsTotal, "close-due-positive") : ""}
        ${row("إجمالي المبيعات المفوترة", c.totalBilled)}
      </div>
      <div class="close-detail-group">
        <h5>⬆ الطالع</h5>
        ${row("مشتريات", c.totalPurchases, "close-due-negative")}
        ${n(c.totalSupplierPayments) > 0.001 ? row("تسديد موردين", c.totalSupplierPayments, "close-due-negative") : ""}
        ${row("مصروفات", c.totalExpenses, "close-due-negative")}
        ${row("سلف عمال", c.totalWorkerAdvances, "close-due-negative")}
        ${row("قبضات عمال مدفوعة", c.totalWorkerSalaryPaid, "close-due-negative")}
        ${n(c.payoutsPaid) > 0.001 ? row("دفعات لعملاء", c.payoutsPaid, "close-due-negative") : ""}
      </div>
      <div class="close-detail-group">
        <h5>📊 النتيجة</h5>
        ${c.closeCashSource ? textRow("مصدر اعتماد الإغلاق", periodCloseCashSourceLabel(c.closeCashSource)) : ""}
        ${c.closeCashAvailable !== undefined ? row("المبلغ المعتمد للإغلاق", c.closeCashAvailable, signCls(c.closeCashAvailable)) : ""}
        ${row("صافي الفترة (نقدي)", c.netCash, signCls(c.netCash))}
        ${hasInv ? row(n(c.inventoryDiff) < 0 ? "خسارة جرد" : "زيادة جرد", Math.abs(n(c.inventoryDiff)), signCls(c.inventoryDiff)) : ""}
        ${c.netAfterInventory !== undefined ? row("الصافي بعد الجرد", c.netAfterInventory, signCls(c.netAfterInventory)) : ""}
        ${hasWithdraw ? row("حصتك المسحوبة", c.withdrawals, "close-due-negative") : ""}
        ${c.netAfterWithdrawals !== undefined && hasWithdraw ? row("الباقي الفعلي المتوقع بالصندوق", c.netAfterWithdrawals, signCls(c.netAfterWithdrawals)) : ""}
        ${n(c.totalWorkersDue) > 0.001 ? row("مستحق عمال (وقت الإغلاق)", c.totalWorkersDue) : ""}
      </div>
    </div>
    ${closePartnerDistributionDetailHtml(c.partnerDistribution)}`;
}

function toggleCloseDetail(id) {
  expandedCloseId = expandedCloseId === id ? null : id;
  renderCloseInfo();
}

function periodDeleteRange(closeEntry) {
  return { minDate: closeEntry.from, maxDate: closeEntry.to, from: closeEntry.from, to: closeEntry.to, closeId: closeEntry.id };
}

function entryInPeriodDeleteRange(entry, range) {
  return dateMatchesRange(entry, range);
}

function ownerWithdrawalInPeriodDeleteRange(entry, range) {
  return ownerWithdrawalMatchesRange(entry, range);
}

function closeGeneratedOwnerWithdrawalMatchesPeriod(entry, range) {
  const source = String(entry?.source || "");
  if (source === "period_close") return ownerWithdrawalMatchesRange(entry, range);
  return storedPeriodMatchesRange(entry, range) && String(entry?.note || "").includes("إغلاق");
}

function closeGeneratedWorkerTransactionMatchesPeriod(entry, range) {
  const type = String(entry?.type || "");
  if (type !== "salary_payment") return false;
  const source = String(entry?.source || "");
  const note = String(entry?.note || "");
  const from = String(range?.minDate || range?.from || "").slice(0, 10);
  const to = String(range?.maxDate || range?.to || "").slice(0, 10);
  if (source === "period_close") return storedPeriodMatchesRange(entry, range) || dateMatchesRange(entry, range);
  if (storedPeriodMatchesRange(entry, range) && note.includes("إغلاق فترة")) return true;
  return Boolean(from && to && note.includes("إغلاق فترة") && note.includes(from) && note.includes(to));
}

function leaveInPeriodDeleteRange(entry, range) {
  const minDay = String(range.minDate || "").slice(0, 10);
  const maxDay = String(range.maxDate || "").slice(0, 10);
  const from = String(entry.from || entry.createdAt || "").slice(0, 10);
  const to = String(entry.to || from).slice(0, 10) || from;
  if (!from) return false;
  return (!minDay || to >= minDay) && (!maxDay || from <= maxDay);
}

function splitPeriodEntries(key, range, matcher = entryInPeriodDeleteRange) {
  const removed = [];
  const kept = [];
  (state[key] || []).forEach((entry) => {
    if (matcher(entry, range)) removed.push(entry);
    else kept.push(entry);
  });
  state[key] = kept;
  return removed;
}

function cleanupPurchaseInventoryAdjustments() {
  if (!state.purchaseInventoryAdjustments || typeof state.purchaseInventoryAdjustments !== "object") return 0;
  if (typeof purchaseInventoryKey !== "function") return 0;
  const validKeys = new Set();
  (state.purchases || []).forEach((purchase) => {
    purchaseLines(purchase).forEach((line) => {
      const name = String(line.item || "").trim();
      const qty = purchaseLineStockQty(line);
      if (!name || qty <= 0) return;
      validKeys.add(purchaseInventoryKey(name, purchaseLineStockUnit(line)));
    });
  });
  let removed = 0;
  Object.keys(state.purchaseInventoryAdjustments).forEach((key) => {
    if (!validKeys.has(key)) {
      delete state.purchaseInventoryAdjustments[key];
      removed += 1;
    }
  });
  return removed;
}

function periodDataDeleteSummary(closeEntry) {
  const range = periodDeleteRange(closeEntry);
  const count = (key, matcher) => (state[key] || []).filter((entry) => matcher(entry, range)).length;
  return {
    ownerWithdrawals: count("ownerWithdrawals", closeGeneratedOwnerWithdrawalMatchesPeriod),
    workerTransactions: count("workerTransactions", closeGeneratedWorkerTransactionMatchesPeriod)
  };
}

function periodDataDeleteSummaryText(stats) {
  const rows = [
    ["سحوبات الحصة من الإغلاق", stats.ownerWithdrawals],
    ["قبضات العمال من الإغلاق", stats.workerTransactions]
  ].filter(([, value]) => Number(value || 0) > 0);
  return rows.length ? rows.map(([label, value]) => `${label}: ${quantityText(value)}`).join("\n") : "لا توجد سحوبات حصة أو قبضات عمال مرتبطة بهذا الإغلاق.";
}

function deleteClosePeriodGeneratedEntries(closeEntry) {
  const range = periodDeleteRange(closeEntry);
  const stats = {
    ownerWithdrawals: splitPeriodEntries("ownerWithdrawals", range, closeGeneratedOwnerWithdrawalMatchesPeriod).length,
    workerTransactions: splitPeriodEntries("workerTransactions", range, closeGeneratedWorkerTransactionMatchesPeriod).length
  };
  state.workers = reconcileWorkers(state.workers || [], state.workerConsumptions || [], state.workerTransactions || [], state.workerLeaves || []);
  return stats;
}

function deleteDataInsideClosedPeriod(closeEntry) {
  return deleteClosePeriodGeneratedEntries(closeEntry);
}

async function approvePeriodClose() {
  const range = getPeriodRange();
  if (!range) { showToast(periodRangeErrorMessage()); return; }
  if (rangeOverlapsClose(range)) {
    const ok = await appConfirm("هذه الفترة متداخلة مع إغلاق سابق. هل تريد اعتمادها على أي حال؟");
    if (!ok) return;
  }
  const partnerCheck = validatePartnersForClose(range);
  if (!partnerCheck.ok) return;
  const summary = periodFinancialSummary(range);
  const partnerSnapshot = snapshotPartnerDistribution(partnerCheck.dist);
  const closeCashSource = periodCloseCashSource();
  const moneyOnHand = periodCloseMoneyOnHand();
  const closeCashAvailable = partnerCheck.dist
    ? Number(partnerCheck.dist.cashNet || 0)
    : closeCashSource === "onHand" && moneyOnHand
      ? Number(moneyOnHand.total.current || 0)
      : Number(summary.netAfterWithdrawals ?? summary.netCash ?? 0);
  state.periodCloses = state.periodCloses || [];
  const closeEntry = {
    id: uid("close"),
    from: range.from,
    to: range.to,
    closedAt: new Date().toISOString(),
    cashReceived: summary.cashReceived,
    saleCashReceived: summary.saleCashReceived,
    debtCashReceived: summary.debtCashReceived,
    workerDrinksPaid: summary.workerDrinksPaid,
    supplierReceiptsTotal: summary.supplierReceiptsTotal,
    closeCashSource,
    closeCashAvailable,
    periodCashAvailable: summary.netAfterWithdrawals,
    moneyOnHand: moneyOnHand ? Number(moneyOnHand.total.current || 0) : 0,
    totalBilled: summary.totalBilled,
    totalPurchases: summary.totalPurchases,
    totalSupplierPayments: summary.totalSupplierPayments,
    totalExpenses: summary.totalExpenses,
    totalWorkersDue: summary.totalWorkersDue,
    totalWorkerAdvances: summary.totalWorkerAdvances,
    totalWorkerSalaryPaid: summary.totalWorkerSalaryPaid,
    totalWorkerCashOut: summary.totalWorkerCashOut,
    payoutsPaid: summary.payoutsPaid,
    netCash: summary.netCash,
    netAccrual: summary.netAccrual,
    inventoryDiff: summary.inventoryDiff,
    withdrawals: summary.withdrawals,
    netAfterWithdrawals: summary.netAfterWithdrawals,
    partnerDistribution: partnerSnapshot
  };
  state.periodCloses.push(closeEntry);
  auditAction("period_close.approve", {
    id: closeEntry.id,
    from: closeEntry.from,
    to: closeEntry.to,
    closeCashSource: closeEntry.closeCashSource,
    closeCashAvailable: closeEntry.closeCashAvailable,
    netCash: closeEntry.netCash,
    netAfterWithdrawals: closeEntry.netAfterWithdrawals
  });
  saveState();
  showToast(`✅ تم اعتماد إغلاق الفترة ${range.from} — ${range.to}.`);
  els.closePeriodResult.hidden = true;
  els.closePeriodFrom.value = "";
  els.closePeriodTo.value = "";
  renderCloseInfo();
}

async function removePeriodClose(id) {
  const entry = (state.periodCloses || []).find((c) => c.id === id);
  if (!entry) return;
  const ok = await appConfirm(`حذف الفترة ${entry.from} — ${entry.to}؟`, {
    icon: "🗑",
    yesLabel: "متابعة",
    cancelLabel: "رجوع"
  });
  if (!ok) return;
  const dataStats = periodDataDeleteSummary(entry);
  const deleteData = await appConfirm(
    `سيتم حذف سجل الإغلاق فقط، ومعه سحب الحصة وقبضات العمال التي سُجلت من شاشة الإغلاق.\n\n${periodDataDeleteSummaryText(dataStats)}\n\nلن يتم حذف الفواتير أو المشتريات أو المصاريف العادية.`,
    {
      icon: "⚠️",
      yesLabel: "حذف الإغلاق",
      cancelLabel: "رجوع"
    }
  );
  if (!deleteData) return;
  const deletedDataStats = deleteClosePeriodGeneratedEntries(entry);
  state.periodCloses = state.periodCloses.filter((c) => c.id !== id);
  auditAction("period_close.delete", {
    id: entry.id,
    from: entry.from,
    to: entry.to,
    netCash: entry.netCash,
    deleteData: true,
    deletedDataStats
  });
  saveState();
  showToast("تم حذف الإغلاق وسحوبات/قبضات الإغلاق فقط.");
  expandedCloseId = null;
  render();
}

// رسالة دقيقة توضح سبب رفض الفترة (بدل رسالة عامة دايماً)
function periodRangeErrorMessage() {
  const from = els.closePeriodFrom.value;
  const to = els.closePeriodTo.value;
  if (!from || !to) return "اختر تاريخ البداية والنهاية.";
  if (new Date(from) > new Date(to)) return "تاريخ البداية بعد تاريخ النهاية.";
  if (to > todayDateInputValue()) return "ما تقدر تقفل فترة تنتهي بتاريخ مستقبلي — اختر تاريخ اليوم أو قبله.";
  return "فترة غير صالحة.";
}

function calcPeriodClose() {
  const range = getPeriodRange();
  if (!range) {
    showToast(periodRangeErrorMessage());
    return;
  }
  els.closeOverlapWarning.hidden = !rangeOverlapsClose(range);
  renderPeriodClose();
}

function closePayAll() {
  const range = getPeriodRange();
  if (!range) return;
  const paidAt = new Date(`${range.to}T12:00:00`).toISOString();
  const workers = (state.workers || []).filter((w) => w.active !== false);
  let count = 0;
  workers.forEach((worker) => {
    const acc = workerPeriodAccount(worker, range);
    if (acc.due <= 0.001) return;
    const transaction = {
      id: uid("wtx"),
      workerId: worker.id,
      workerName: worker.name,
      type: "salary_payment",
      amount: acc.due,
      method: getLastPaymentMethod(),
      note: `تسوية حساب عند إغلاق فترة ${range.from} — ${range.to}`,
      source: "period_close",
      periodFrom: range.from,
      periodTo: range.to,
      createdAt: paidAt
    };
    state.workerTransactions = state.workerTransactions || [];
    state.workerTransactions.push(transaction);
    count++;
  });
  if (!count) { showToast("لا يوجد عمال برصيد مستحق."); return; }
  auditAction("workers.pay_all", {
    count,
    period: `${range.from} — ${range.to}`,
    createdAt: paidAt
  });
  saveState();
  showToast(`تم تسجيل دفع رواتب ${count} عامل/عمال.`);
  renderPeriodClose();
}
