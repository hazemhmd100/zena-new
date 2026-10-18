// ═══ دفتر المقهى ═══ 04-customers-invoices.js — العملاء، التسديد، الفواتير، تعديل وتصدير الفواتير
// (مقسوم من app.js — الأسطر 1964-2929)

function addCustomerFromCustomersPage(event) {
  event.preventDefault();
  const name = els.customerAddNameInput.value.trim();
  const phone = els.customerAddPhoneInput.value.trim();
  const customer = upsertCustomer(name, phone ? { phone } : {});

  if (!customer) {
    showToast("اكتب اسم العميل أولاً.");
    els.customerAddNameInput.focus();
    return;
  }

  selectedCustomerId = customer.id;
  els.customerSearchInput.value = "";
  els.customerStatusFilter.value = "all";
  els.customerAddForm.reset();
  showToast("تم حفظ العميل.");
  render();
}

async function deleteCustomer(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return;

  const invoiceCount = state.invoices.filter((invoice) => invoice.customerId === customer.id).length;
  const balance = Number(customer.balance || 0);
  const balanceWarning = Math.abs(balance) > 0.001 ? `\nرصيده الحالي: ${balanceText(balance)}` : "";
  const invoiceWarning = invoiceCount ? `\nفواتيره القديمة ستبقى في سجل الفواتير باسم العميل.` : "";
  const confirmed = await appConfirm(`حذف العميل "${customer.name}"؟${balanceWarning}${invoiceWarning}`);
  if (!confirmed) return;

  state.customers = state.customers.filter((item) => item.id !== customer.id);
  state.invoices.forEach((invoice) => {
    if (invoice.customerId === customer.id) invoice.customerId = null;
  });
  Object.values(state.openOrders).forEach((order) => {
    if (order.customerId === customer.id) {
      order.customerId = null;
      order.customerName = "";
      order.customerPhone = "";
    }
  });
  if (selectedCustomerId === customer.id) {
    selectedCustomerId = state.customers[0]?.id || null;
  }
  showToast("تم حذف العميل.");
  render();
}

function updateCustomerInfo(customerId, nextName, nextPhone) {
  const customer = getCustomer(customerId);
  if (!customer) return false;

  const name = String(nextName || "").trim();
  const phone = String(nextPhone || "").trim();
  if (!name) {
    showToast("اكتب اسم العميل.");
    return false;
  }

  const duplicate = state.customers.find((item) => {
    return item.id !== customer.id && String(item.name || "").trim().toLowerCase() === name.toLowerCase();
  });
  if (duplicate) {
    showToast("يوجد عميل آخر بنفس الاسم. اختر اسم مختلف أو ادمج الحسابات لاحقاً.");
    return false;
  }

  const oldName = customer.name;
  const oldPhone = customer.phone || "";
  if (oldName === name && oldPhone === phone) {
    showToast("لا يوجد تغيير على بيانات العميل.");
    return false;
  }

  Object.assign(customer, { name, phone, updatedAt: new Date().toISOString() });
  state.invoices.forEach((invoice) => {
    if (invoice.customerId === customer.id) invoice.customerName = name;
  });
  Object.values(state.openOrders || {}).forEach((order) => {
    if (order.customerId === customer.id) {
      order.customerName = name;
      order.customerPhone = phone;
    }
  });
  selectedCustomerId = customer.id;
  rebuildCustomerAccountsFromInvoices(state);
  auditAction("customer.update", {
    id: customer.id,
    oldName,
    newName: name,
    phoneChanged: oldPhone !== phone
  });
  saveState();
  showToast("تم تعديل بيانات العميل.");
  render();
  return true;
}

function customerMergeOptionLabel(customer) {
  const phone = customer.phone ? ` | ${customer.phone}` : "";
  return `${customer.name}${phone} | ${balanceText(Number(customer.balance || 0))}`;
}

function renderCustomerMergeTargets() {
  if (!els.customerMergeTargetInput || !editingCustomerId) return;
  const targets = state.customers.filter((customer) => customer.id !== editingCustomerId);
  els.customerMergeTargetInput.innerHTML = targets.length
    ? ['<option value="">اختر العميل الأساسي</option>']
      .concat(targets.map((customer) => `<option value="${escapeAttr(customer.id)}">${escapeHtml(customerMergeOptionLabel(customer))}</option>`))
      .join("")
    : '<option value="">لا يوجد عميل آخر للدمج</option>';
  if (els.customerMergeApplyButton) els.customerMergeApplyButton.disabled = !targets.length;
}

function hideCustomerMergeBox() {
  if (els.customerMergeBox) els.customerMergeBox.hidden = true;
  if (els.customerMergeTargetInput) els.customerMergeTargetInput.value = "";
}

function toggleCustomerMergeBox() {
  if (!els.customerMergeBox) return;
  els.customerMergeBox.hidden = !els.customerMergeBox.hidden;
  if (!els.customerMergeBox.hidden) {
    renderCustomerMergeTargets();
    els.customerMergeTargetInput?.focus();
  }
}

function mergeCustomerPrices(sourceId, targetId) {
  state.customerPrices = state.customerPrices || [];
  const targetKeys = new Set(
    state.customerPrices
      .filter((price) => price.customerId === targetId)
      .map((price) => price.itemId)
  );

  state.customerPrices = state.customerPrices
    .map((price) => {
      if (price.customerId !== sourceId) return price;
      if (targetKeys.has(price.itemId)) return null;
      targetKeys.add(price.itemId);
      return { ...price, customerId: targetId };
    })
    .filter(Boolean);
}

function transferCustomerPrices(sourceId, targetId) {
  const source = getCustomer(sourceId);
  const target = getCustomer(targetId);
  if (!source || !target || source.id === target.id) {
    return { ok: false, moved: 0, skipped: 0, source, target };
  }

  state.customerPrices = state.customerPrices || [];
  const targetKeys = new Set(
    state.customerPrices
      .filter((price) => price.customerId === target.id)
      .map((price) => price.itemId)
  );
  let moved = 0;
  let skipped = 0;

  state.customerPrices = state.customerPrices.map((price) => {
    if (price.customerId !== source.id) return price;
    if (targetKeys.has(price.itemId)) {
      skipped += 1;
      return price;
    }
    moved += 1;
    targetKeys.add(price.itemId);
    return { ...price, customerId: target.id };
  });

  if (moved > 0) {
    source.updatedAt = new Date().toISOString();
    target.updatedAt = new Date().toISOString();
    auditAction("customer.prices.transfer", {
      sourceId: source.id,
      sourceName: source.name,
      targetId: target.id,
      targetName: target.name,
      moved,
      skipped
    });
    saveState();
  }

  return { ok: true, moved, skipped, source, target };
}

function mergeCustomers(sourceId, targetId) {
  const source = getCustomer(sourceId);
  const target = getCustomer(targetId);
  if (!source || !target || source.id === target.id) return false;

  if (!target.phone && source.phone) target.phone = source.phone;
  target.updatedAt = new Date().toISOString();
  const sourceName = String(source.name || "").trim();
  state.invoices.forEach((invoice) => {
    const namedSourceInvoice = !invoice.customerId && sourceName && String(invoice.customerName || "").trim() === sourceName;
    if (invoice.customerId === source.id || namedSourceInvoice) {
      invoice.customerId = target.id;
      invoice.customerName = target.name;
    }
  });
  Object.values(state.openOrders || {}).forEach((order) => {
    if (order.customerId === source.id) {
      order.customerId = target.id;
      order.customerName = target.name;
      order.customerPhone = target.phone || "";
    }
  });
  mergeCustomerPrices(source.id, target.id);
  state.customers = state.customers.filter((customer) => customer.id !== source.id);
  selectedCustomerId = target.id;
  editingCustomerId = null;
  rebuildCustomerAccountsFromInvoices(state);
  auditAction("customer.merge", {
    sourceId: source.id,
    sourceName: source.name,
    targetId: target.id,
    targetName: target.name
  });
  saveState();
  return true;
}

async function mergeEditingCustomer() {
  const source = getCustomer(editingCustomerId);
  const target = getCustomer(els.customerMergeTargetInput?.value);
  if (!source) {
    showToast("اختر العميل المراد دمجه.");
    return;
  }
  if (!target || source.id === target.id) {
    showToast("اختر العميل الأساسي الذي تريد الدمج داخله.");
    return;
  }

  const invoiceCount = state.invoices.filter((invoice) => invoice.customerId === source.id).length;
  const priceCount = (state.customerPrices || []).filter((price) => price.customerId === source.id).length;
  const confirmed = await appConfirm(
    `دمج "${source.name}" داخل "${target.name}"؟\n\nسيتم نقل ${invoiceCount} فاتورة و ${priceCount} سعر خاص، ثم حذف بطاقة "${source.name}".`,
    { icon: "⇄", yesLabel: "دمج", cancelLabel: "إلغاء", danger: false }
  );
  if (!confirmed) return;

  if (!mergeCustomers(source.id, target.id)) {
    showToast("تعذر دمج العملاء.");
    return;
  }
  closeCustomerEditCard();
  showToast(`تم دمج ${source.name} داخل ${target.name}.`);
  render();
}

function closeCustomerEditCard() {
  editingCustomerId = null;
  if (els.customerEditModal) els.customerEditModal.hidden = true;
  hideCustomerMergeBox();
  if (els.customerEditForm) els.customerEditForm.reset();
}

function editCustomer(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return;

  editingCustomerId = customer.id;
  if (!els.customerEditModal || !els.customerEditNameInput || !els.customerEditPhoneInput) {
    showToast("تعذر فتح بطاقة تعديل العميل.");
    return;
  }
  if (els.customerEditTitle) els.customerEditTitle.textContent = `تعديل ${customer.name}`;
  if (els.customerEditMeta) els.customerEditMeta.textContent = balanceText(customer.balance || 0);
  els.customerEditNameInput.value = customer.name || "";
  els.customerEditPhoneInput.value = customer.phone || "";
  hideCustomerMergeBox();
  renderCustomerMergeTargets();
  els.customerEditModal.hidden = false;
  window.setTimeout(() => {
    els.customerEditNameInput.focus();
    els.customerEditNameInput.select();
  }, 0);
}

function saveCustomerEditCard(event) {
  event.preventDefault();
  if (!editingCustomerId) {
    closeCustomerEditCard();
    return;
  }
  const saved = updateCustomerInfo(
    editingCustomerId,
    els.customerEditNameInput?.value || "",
    els.customerEditPhoneInput?.value || ""
  );
  if (saved) closeCustomerEditCard();
}

function invoiceBalanceDelta(invoice) {
  if (invoiceIsCancelled(invoice)) return 0;
  if (invoice.type === "payment") return -(Number(invoice.paid || 0) + Number(invoice.discount || 0));
  if (invoice.type === "payout") return Number(invoice.paid || 0);
  if (invoice.type === "debt") return Number(invoice.total || 0);
  if (invoice.type === "sale") {
    const delta = Number(invoice.delta);
    return Number.isFinite(delta) ? delta : Number(invoice.total || 0) - Number(invoice.paid || 0);
  }
  return 0;
}

// يحسب تاريخ بداية الدين لكل العملاء بمسح وحيد للفواتير (بدل مسح كامل الفواتير لكل عميل لحاله)
function customerDebtSinceMap() {
  const byCustomer = new Map();
  state.invoices.forEach((invoice) => {
    if (!invoice.customerId) return;
    if (!byCustomer.has(invoice.customerId)) byCustomer.set(invoice.customerId, []);
    byCustomer.get(invoice.customerId).push(invoice);
  });

  const result = new Map();
  byCustomer.forEach((invoices, customerId) => {
    invoices.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    let balance = 0;
    let debtStart = null;
    invoices.forEach((invoice) => {
      const before = balance;
      balance += invoiceBalanceDelta(invoice);
      if (balance > 0.001 && before <= 0.001) debtStart = invoice.createdAt;
      if (balance <= 0.001) debtStart = null;
    });
    result.set(customerId, debtStart || invoices[invoices.length - 1].createdAt);
  });
  return result;
}

function customerDebtAgeDays(customer, sinceMap) {
  if (!customer || Number(customer.balance || 0) <= 0.001) return null;

  const since = sinceMap ? sinceMap.get(customer.id) : (() => {
    const invoices = state.invoices
      .filter((invoice) => invoice.customerId === customer.id)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    if (!invoices.length) return null;
    let balance = 0;
    let debtStart = null;
    invoices.forEach((invoice) => {
      const before = balance;
      balance += invoiceBalanceDelta(invoice);
      if (balance > 0.001 && before <= 0.001) debtStart = invoice.createdAt;
      if (balance <= 0.001) debtStart = null;
    });
    return debtStart || invoices[invoices.length - 1].createdAt;
  })();
  if (!since) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000));
}

function debtAgeBadge(customer, sinceMap) {
  const days = customerDebtAgeDays(customer, sinceMap);
  if (days === null) return "";
  const tone = days >= 30 ? "is-old" : days >= 14 ? "is-aging" : "";
  const label = days === 0 ? "دين من اليوم" : days === 1 ? "دين من أمس" : `دين من ${days} يوم`;
  return `<span class="debt-age-badge ${tone}">🕐 ${label}</span>`;
}

function renderCustomers() {
  const totals = customerTotals();
  const customerTotalCount = document.getElementById("customerTotalCount");
  if (customerTotalCount) customerTotalCount.textContent = String(state.customers.length);
  els.customerTotalDebt.textContent = money(totals.debt);
  els.customerTotalCredit.textContent = money(totals.credit);

  const query = els.customerSearchInput.value.trim().toLowerCase();
  const status = els.customerStatusFilter.value;
  let customers = state.customers.filter((customer) => {
    const matchesQuery = searchMatch(`${customer.name} ${customer.phone || ""}`, query);
    const matchesStatus =
      status === "all" ||
      ((status === "debt" || status === "oldest-debt") && customer.balance > 0.001) ||
      (status === "credit" && customer.balance < -0.001) ||
      (status === "clear" && Math.abs(customer.balance) <= 0.001);
    return matchesQuery && matchesStatus;
  });

  const debtSinceMap = customerDebtSinceMap();

  if (status === "oldest-debt") {
    customers = customers
      .map((customer) => ({ customer, age: customerDebtAgeDays(customer, debtSinceMap) ?? -1 }))
      .sort((a, b) => b.age - a.age)
      .map((entry) => entry.customer);
  }

  if (!customers.length) {
    els.customersList.innerHTML = state.customers.length
      ? '<div class="empty-state">لا يوجد عملاء مطابقين للتصفية.</div>'
      : '<div class="empty-state">لا يوجد عملاء بعد. أضف عميل من النموذج بالأعلى.</div>';
    return;
  }

  // اضمن ظهور العميل المختار (مثلاً بعد الفتح من الفواتير) حتى لو كان بعد حد العرض الحالي
  if (selectedCustomerId) {
    const selectedIndex = customers.findIndex((customer) => customer.id === selectedCustomerId);
    if (selectedIndex >= customerViewLimit) customerViewLimit = selectedIndex + 1;
  }

  if (customerViewLimit < CUSTOMER_VIEW_STEP) customerViewLimit = CUSTOMER_VIEW_STEP;
  const shownCustomers = customers.slice(0, customerViewLimit);
  const remaining = customers.length - shownCustomers.length;
  const moreButton = remaining > 0
    ? `<button class="secondary-button customer-more-button" type="button" data-show-more-customers>⬇ عرض ${Math.min(remaining, CUSTOMER_VIEW_STEP)} عميل أكثر (متبقّي ${remaining})</button>`
    : "";

  els.customersList.innerHTML = shownCustomers.map((customer) => `
    <article class="customer-card ${customer.id === selectedCustomerId ? "is-active" : ""} ${customer.balance > 70 ? "has-high-debt" : ""}" data-customer-card="${customer.id}">
      <header>
        <strong>${escapeHtml(customer.name)}</strong>
        <span class="customer-badges">
          ${customer.balance > 70 ? '<span class="customer-alert-badge">دين +70</span>' : ""}
          ${debtAgeBadge(customer, debtSinceMap)}
          <span class="balance-badge ${balanceClass(customer.balance)}">${balanceText(customer.balance)}</span>
        </span>
      </header>
      <div class="customer-card-footer">
        <div class="customer-card-info">
          <small class="customer-card-phone">${customer.phone ? escapeHtml(customer.phone) : "بدون رقم جوال"}</small>
          <div class="customer-card-metrics">
            <span><small>الفواتير</small><b>${money(customer.totalBilled)}</b></span>
            <span><small>الدفعات</small><b>${money(customer.totalPaid)}</b></span>
          </div>
        </div>
        <div class="customer-card-actions">
          ${customer.balance > 0.01 ? `<button class="customer-wa-button" type="button" data-whatsapp-customer="${customer.id}">📲 تذكير</button>` : ""}
          ${customer.balance > 0.01 ? `<button class="customer-settle-button" type="button" data-settle-customer="${customer.id}">💵 تسديد</button>` : ""}
          <button class="customer-edit-button" type="button" data-edit-customer="${customer.id}">تعديل</button>
          ${canUsePermission("customer.delete") ? `<button class="customer-delete-button" type="button" data-remove-customer="${customer.id}">حذف</button>` : ""}
        </div>
      </div>
    </article>
  `).join("") + moreButton;
}

function renderLedgerItems(invoice) {
  const cancellationNote = invoiceIsCancelled(invoice)
    ? `<p class="ledger-note invoice-cancel-note">ملغاة${invoice.cancelledReason ? `: ${escapeHtml(invoice.cancelledReason)}` : ""}</p>`
    : "";
  if (invoice.type === "payment" || invoice.type === "payout") {
    const discount = invoice.type === "payment" ? Number(invoice.discount || 0) : 0;
    const note = invoice.note ? escapeHtml(invoice.note) : "";
    const discountLine = discount > 0 ? `<br><small>خصم عند التسديد: ${money(discount)}</small>` : "";
    const movementNote = note || discountLine ? `<p class="ledger-note">${note}${discountLine}</p>` : "";
    return `${cancellationNote}${movementNote}`;
  }

  if (!invoice.items?.length) {
    return `${cancellationNote}<p class="ledger-note">${escapeHtml(invoice.note || "دين بدون أصناف")}</p>`;
  }

  const changeLine = Number(invoice.changeReturned || 0) > 0
    ? `<p class="ledger-note">راجع للعميل: ${money(invoice.changeReturned)}</p>`
    : "";
  const itemsTotal = invoice.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  return `
    <div class="ledger-items ledger-items-detailed">
      ${invoice.items.map((item) => {
        const qty = Number(item.qty || 0);
        const price = Number(item.price || 0);
        const lineTotal = price * qty;
        return `
        <div class="ledger-item-line ${item.temporary ? "is-temporary" : ""}">
          <span class="li-name">${escapeHtml(item.name)}${item.isCombo ? " 🍱" : ""}${item.isCustomPrice ? " ⭐" : ""}${item.temporary ? " <em>مؤقت</em>" : ""}</span>
          <span class="li-calc">${quantityText(qty)} × ${money(price)} = <b>${money(lineTotal)}</b></span>
        </div>`;
      }).join("")}
      <div class="ledger-items-summary">${invoice.items.length} صنف · إجمالي الأصناف ${money(itemsTotal)}</div>
    </div>
    ${changeLine}
    ${cancellationNote}
  `;
}

function hasTemporaryItems(invoice) {
  return invoice.type === "sale" && (invoice.items || []).some((item) => item.temporary);
}

function invoiceDebtDelta(invoice) {
  if (invoiceIsCancelled(invoice)) return 0;
  const delta = Number(invoice.delta);
  if (Number.isFinite(delta)) return delta;
  return invoiceBalanceDelta(invoice);
}

function roundLedgerMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function customerLedgerRows(customerId) {
  const chronological = state.invoices
    .map((invoice, index) => ({ invoice, index }))
    .filter((entry) => entry.invoice.customerId === customerId)
    .sort((a, b) => {
      const byDate = new Date(a.invoice.createdAt || 0) - new Date(b.invoice.createdAt || 0);
      return byDate || b.index - a.index;
    });

  let runningBalance = 0;
  return chronological.map((entry) => {
    const before = roundLedgerMoney(runningBalance);
    const delta = roundLedgerMoney(invoiceDebtDelta(entry.invoice));
    runningBalance = roundLedgerMoney(runningBalance + delta);
    return {
      invoice: entry.invoice,
      before,
      delta,
      after: runningBalance
    };
  }).reverse();
}

function renderCustomerLedgerBalance(row) {
  const delta = Number(row.delta || 0);
  const isOffset = row.invoice?.source === "customer_offset";
  const deltaClass = isOffset ? "is-payment" : delta > 0.001 ? "is-debt" : delta < -0.001 ? "is-payment" : "is-clear";
  const deltaText = isOffset
    ? `نقص رصيد العميل ${money(delta)}`
    : delta > 0.001
    ? `زاد الدين ${money(delta)}`
    : delta < -0.001
      ? `نقص الدين ${money(Math.abs(delta))}`
      : "ما تغيّر الدين";
  return `
    <div class="customer-ledger-balance">
      <span><em>قبل الحركة</em><b>${balanceText(row.before)}</b></span>
      <span class="${deltaClass}"><em>هذه الحركة</em><b>${deltaText}</b></span>
      <span><em>بعد الحركة</em><b>${balanceText(row.after)}</b></span>
    </div>
  `;
}

function invoiceFinancialType(invoice) {
  if (invoiceIsCancelled(invoice)) return "cancelled";
  if (invoice.source === "customer_offset") return "sale-offset";
  if (invoice.type === "payment") return "payment";
  if (invoice.type === "payout") return "payout";
  if (invoice.type === "debt") return "manual-debt";
  if (invoice.type !== "sale") return invoice.type || "other";
  const delta = invoiceDebtDelta(invoice);
  if (delta > 0.001) return "sale-debt";
  if (delta < -0.001) return "sale-credit";
  return "sale-paid";
}

function invoicePaymentAmountByMethod(invoice, method) {
  const payments = typeof invoiceCashboxPayments === "function" ? invoiceCashboxPayments(invoice) : invoice.payments || {};
  const exact = Number(payments[method] || 0);
  if (exact > 0.001 || method !== "cash") return Math.max(exact, 0);
  const paid = Number(invoice.paid || 0);
  return paymentTotal(payments) <= 0.001 && paid > 0.001 ? paid : 0;
}

function buildInvoiceFinancialSummary(rows = []) {
  const summary = {
    salesTotal: 0,
    paidNoDebt: 0,
    salePaidAtSale: 0,
    saleDebt: 0,
    debtSettled: 0,
    manualDebt: 0,
    debtDiscount: 0,
    customerCredit: 0,
    payout: 0,
    collected: 0,
    netCollected: 0,
    incomingByMethod: { cash: 0, bank: 0, wallet: 0 },
    payoutByMethod: { cash: 0, bank: 0, wallet: 0 },
    counts: {
      salePaid: 0,
      saleDebt: 0,
      payment: 0,
      manualDebt: 0,
      saleCredit: 0,
      payout: 0,
      temporary: 0,
      cancelled: 0
    }
  };

  rows.forEach((invoice) => {
    if (invoiceIsCancelled(invoice)) {
      summary.counts.cancelled += 1;
      return;
    }
    const type = invoiceFinancialType(invoice);
    const paid = Number(invoice.paid || 0);
    const total = Number(invoice.total || 0);
    const delta = invoiceDebtDelta(invoice);

    if (type === "temporary") summary.counts.temporary += 1;

    if (invoice.type === "sale") {
      summary.salesTotal += total;
      summary.salePaidAtSale += paid;
      paymentMethods.forEach((method) => {
        summary.incomingByMethod[method] += invoicePaymentAmountByMethod(invoice, method);
      });
      if (type === "sale-offset") {
        summary.paidNoDebt += total;
        summary.counts.salePaid += 1;
      } else if (type === "sale-debt") {
        summary.saleDebt += Math.max(delta, 0);
        summary.counts.saleDebt += 1;
      } else if (type === "sale-credit") {
        summary.customerCredit += Math.abs(Math.min(delta, 0));
        summary.counts.saleCredit += 1;
      } else {
        summary.paidNoDebt += total;
        summary.counts.salePaid += 1;
      }
      return;
    }

    if (invoice.type === "payment") {
      summary.debtSettled += paid;
      summary.debtDiscount += Number(invoice.discount || 0);
      summary.counts.payment += 1;
      paymentMethods.forEach((method) => {
        summary.incomingByMethod[method] += invoicePaymentAmountByMethod(invoice, method);
      });
      return;
    }

    if (invoice.type === "debt") {
      summary.manualDebt += Math.max(total - paid, 0);
      summary.counts.manualDebt += 1;
      return;
    }

    if (invoice.type === "payout") {
      summary.payout += paid;
      summary.customerCredit += paid;
      summary.counts.payout += 1;
      paymentMethods.forEach((method) => {
        summary.payoutByMethod[method] += invoicePaymentAmountByMethod(invoice, method);
      });
    }
  });

  summary.collected = summary.salePaidAtSale + summary.debtSettled;
  summary.netCollected = summary.collected - summary.payout;
  return summary;
}

function renderInvoiceFinancialSummary(rows, displayedCount, totalMatchCount, cashier) {
  const summary = buildInvoiceFinancialSummary(rows);
  const setStat = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = money(value);
  };

  // الرصيد الجديد الصافي للعملاء (دفعوا زيادة) = كل "رصيد/دفع" ناقص اللي فعليًا رجع نقدًا (payout)
  const newCustomerCredit = Math.max(summary.customerCredit - summary.payout, 0);

  els.invoiceNetTotal.textContent = money(summary.salesTotal);
  els.invoicePaidTotal.textContent = money(summary.netCollected);
  setStat("invoiceStatNewDebt", summary.saleDebt + summary.manualDebt);
  setStat("invoiceStatSalePaidAtSale", summary.salePaidAtSale);
  setStat("invoiceStatSettled", summary.debtSettled);
  setStat("invoiceStatPayout", summary.payout);
  setStat("invoiceStatDebt", summary.saleDebt);
  setStat("invoiceStatManualDebt", summary.manualDebt);
  setStat("invoiceStatDebtDiscount", summary.debtDiscount);
  setStat("invoiceStatCustomerCredit", newCustomerCredit);

  if (els.invoicePaymentBreakdown) {
    els.invoicePaymentBreakdown.innerHTML = `
      <span>طرق الدفع للمقبوض</span>
      <strong>${paymentMethods.map((method) => `${paymentLabels[method]} ${money(summary.incomingByMethod[method] || 0)}`).join(" | ")}</strong>
      ${summary.payout > 0.001 ? `<small>خارج للعميل: ${paymentMethods.map((method) => `${paymentLabels[method]} ${money(summary.payoutByMethod[method] || 0)}`).join(" | ")}</small>` : ""}
    `;
  }

  const countText = cashier
    ? `آخر ${displayedCount} من ${totalMatchCount} حركة مطابقة`
    : `ظاهر ${displayedCount} من ${totalMatchCount} حركة مطابقة`;
  const detailText = [
    `بيع مباشر ${summary.counts.salePaid}`,
    `بيع بدين ${summary.counts.saleDebt}`,
    `تسديد ${summary.counts.payment}`,
    `دين يدوي ${summary.counts.manualDebt}`,
    `دفع زيادة/رصيد ${summary.counts.saleCredit + summary.counts.payout}`,
    `ملغاة ${summary.counts.cancelled}`
  ].join(" | ");
  els.invoiceNetCount.textContent = `${countText} - ${detailText}`;
}

function selectedInvoiceFilters() {
  const dateFrom = els.invoiceDateFromInput.value;
  const dateTo = els.invoiceDateToInput.value;
  return {
    query: els.invoiceSearchInput.value.trim().toLowerCase(),
    recordType: els.invoiceStatusFilter.value,
    minDate: dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom,
    maxDate: dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo,
    dateSort: els.invoiceDateSortInput.value
  };
}

function invoiceMatchesRecordType(invoice, recordType = "all") {
  if (recordType === "all") return true;
  const hasTemporary = hasTemporaryItems(invoice);
  if (recordType === "temporary") return hasTemporary;
  if (recordType === "sales") return !invoiceIsCancelled(invoice) && invoice.type === "sale";
  return invoiceFinancialType(invoice) === recordType;
}

function invoiceRecordFilterLabel(recordType = "all") {
  return {
    all: "كل الحركات",
    sales: "كل فواتير البيع",
    "sale-paid": "البيع المدفوع",
    "sale-debt": "بيع بقي منه دين",
    "sale-credit": "دفع زيادة وأصبح له رصيد",
    payment: "تسديدات الديون القديمة",
    "manual-debt": "الدين المضاف يدوياً",
    payout: "المبالغ المدفوعة للعملاء",
    cancelled: "الفواتير الملغاة",
    temporary: "فواتير فيها صنف مؤقت"
  }[recordType] || "كل الحركات";
}

function invoiceStatusDisplayText(invoice) {
  if (invoice?.status === "credit") return "دفع زيادة وأصبح له رصيد";
  return statusText(invoice?.status);
}

function renderInvoiceResultLabel(filters, totalMatchCount) {
  const label = document.getElementById("invoiceResultLabel");
  if (!label) return;
  const range = filters.minDate || filters.maxDate
    ? `${filters.minDate ? formatDateOnly(filters.minDate) : "البداية"} إلى ${filters.maxDate ? formatDateOnly(filters.maxDate) : "اليوم"}`
    : "كل الفترات";
  const normalized = els.invoiceDateFromInput.value && els.invoiceDateToInput.value
    && els.invoiceDateFromInput.value > els.invoiceDateToInput.value;
  const queryText = filters.query ? `، بحث: ${escapeHtml(els.invoiceSearchInput.value.trim())}` : "";
  label.innerHTML = `<strong>${invoiceRecordFilterLabel(filters.recordType)}</strong><span>${range}${normalized ? " (تم ترتيب التاريخين تلقائياً)" : ""}${queryText} · ${totalMatchCount} حركة مطابقة</span>`;
}

function invoicePaymentSearchText(invoice) {
  const payments = invoice.payments || {};
  const aliases = {
    cash: ["cash", "كاش", "نقد", "نقدي"],
    bank: ["bank", "بنك", "تطبيق بنك", "بنكي"],
    wallet: ["wallet", "محفظة", "محفظه"]
  };
  const activeMethods = paymentMethods.filter((method) => Number(payments[method] || 0) > 0);
  const parts = [
    invoicePaymentText(invoice),
    ...activeMethods,
    ...activeMethods.map((method) => paymentLabels[method] || ""),
    ...activeMethods.flatMap((method) => aliases[method] || [])
  ];
  if (!activeMethods.length) parts.push("بدون دفع", "غير مدفوعة", "no payment");
  return parts.join(" ");
}

function invoiceIsPaidClear(invoice) {
  if (invoiceIsCancelled(invoice)) return false;
  const status = invoice.status || invoiceStatus(invoiceDebtDelta(invoice), invoice.type || "sale");
  if (status === "paid" || status === "credit" || status === "payment") return true;
  const type = invoiceFinancialType(invoice);
  return type === "sale-paid" || type === "sale-credit" || type === "payment";
}

function invoiceMatchesFilters(invoice, filters) {
  const invoiceDate = String(invoice.createdAt || "").slice(0, 10);
  const hasTemporary = hasTemporaryItems(invoice);
  const itemText = invoice.items?.map((item) => `${item.name} ${item.temporary ? "صنف مؤقت مؤقت" : ""}`).join(" ") || "";
  const paymentText = invoicePaymentSearchText(invoice);
  // بحث بالمصاري: الإجمالي، المدفوع، والمتبقي (دين/رصيد) كأرقام خام تدعم بحث جزئي
  const amountText = `${Number(invoice.total || 0)} ${Number(invoice.paid || 0)} ${Math.abs(Number(invoice.delta || 0))}`;
  const haystack = `${invoice.number} ${invoice.customerName} ${invoice.tableLabel} ${itemText} ${paymentText} ${invoice.note || ""} ${amountText}`.toLowerCase();
  const matchesQuery = searchMatch(haystack, filters.query);
  const matchesRecordType = invoiceMatchesRecordType(invoice, filters.recordType);
  const matchesDateFrom = !filters.minDate || invoiceDate >= filters.minDate;
  const matchesDateTo = !filters.maxDate || invoiceDate <= filters.maxDate;
  return matchesQuery && matchesRecordType && matchesDateFrom && matchesDateTo;
}

function filteredInvoicesForView() {
  const filters = selectedInvoiceFilters();
  return state.invoices.filter((invoice) => invoiceMatchesFilters(invoice, filters)).sort((a, b) => {
    const first = new Date(a.createdAt || 0).getTime();
    const second = new Date(b.createdAt || 0).getTime();
    return filters.dateSort === "oldest" ? first - second : second - first;
  });
}

function applySettlementMode(customer) {
  const hasCredit = customer && Number(customer.balance || 0) < -0.001;
  const offsetMode = Boolean(hasCredit && settlementOffsetMode);
  const payoutMode = Boolean(hasCredit && !offsetMode);
  const debtMode = settlementDebtMode && !hasCredit;
  const hasDebt = customer && Number(customer.balance || 0) > 0.001;
  const fillableBalance = customer ? Math.abs(Number(customer.balance || 0)) : 0;

  els.settlementModeToggle.style.display = customer ? "" : "none";
  els.settlementModePayment.textContent = hasCredit ? "دفع له" : "تسديد";
  els.settlementModeDebt.hidden = Boolean(hasCredit);
  els.settlementModeOffset.hidden = !hasCredit;
  els.settlementMethodField.style.display = debtMode || offsetMode ? "none" : "";
  els.settlementDiscountField.style.display = !payoutMode && !debtMode && hasDebt ? "" : "none";
  els.settlementNoteField.style.display = debtMode || offsetMode ? "" : "none";
  if (els.settlementFillBalanceButton) {
    const canFill = !debtMode && fillableBalance > 0.001;
    els.settlementFillBalanceButton.hidden = !canFill;
    els.settlementFillBalanceButton.disabled = !canFill;
    els.settlementFillBalanceButton.textContent = payoutMode ? "تعبئة كامل الرصيد" : "تعبئة كامل الدين";
  }

  els.settlementModePayment.classList.toggle("is-active", !debtMode && !offsetMode);
  els.settlementModeDebt.classList.toggle("is-active", false);
  els.settlementModeDebt.classList.toggle("is-debt-active", debtMode);
  els.settlementModeOffset.classList.toggle("is-active", offsetMode);

  els.settlementForm.classList.toggle("is-payout-mode", payoutMode);
  els.settlementForm.classList.toggle("is-debt-mode", debtMode);
  els.settlementForm.classList.toggle("is-offset-mode", offsetMode);

  if (offsetMode) {
    els.settlementTitle.textContent = "خصم مشاريب من رصيد العميل";
    els.settlementSubmitButton.textContent = "تسجيل المقاصة";
    els.settlementAmountInput.placeholder = `حد أقصى ${money(Math.abs(Number(customer.balance || 0)))}`;
    els.settlementAmountInput.max = String(Math.abs(Number(customer.balance || 0)));
    els.settlementNoteInput.placeholder = "مثال: مشاريب أخذها من الكفي";
    els.settlementDiscountInput.value = "";
  } else if (payoutMode) {
    els.settlementTitle.textContent = "دفع رصيد للعميل";
    els.settlementSubmitButton.textContent = "تسجيل دفع للعميل";
    els.settlementAmountInput.placeholder = `حد أقصى ${money(Math.abs(Number(customer.balance || 0)))}`;
    els.settlementAmountInput.max = String(Math.abs(Number(customer.balance || 0)));
    els.settlementDiscountInput.value = "";
  } else if (debtMode) {
    els.settlementTitle.textContent = "إضافة دين على العميل";
    els.settlementSubmitButton.textContent = "تسجيل الدين";
    els.settlementAmountInput.placeholder = "";
    els.settlementAmountInput.removeAttribute("max");
    els.settlementDiscountInput.value = "";
    els.settlementNoteInput.placeholder = "سبب الدين...";
  } else {
    els.settlementTitle.textContent = "تسديد دفعة على الحساب";
    els.settlementSubmitButton.textContent = "تسجيل دفعة";
    els.settlementAmountInput.placeholder = "";
    els.settlementAmountInput.removeAttribute("max");
    els.settlementDiscountInput.placeholder = hasDebt ? `اختياري حتى ${money(Number(customer.balance || 0))}` : "اختياري";
    if (!hasDebt) els.settlementDiscountInput.value = "";
  }
  updateSettlementLossHint(customer);
}

// يوضّح إذا خصم التسديد أكبر من هامش الربح المتوقع على هالمبلغ (يعني فعليًا خسارة، مش بس تقليل ربح)
function updateSettlementLossHint(customer) {
  if (!els.settlementLossHint) return;
  const hasCredit = customer && Number(customer.balance || 0) < -0.001;
  const offsetMode = Boolean(hasCredit && settlementOffsetMode);
  const payoutMode = Boolean(hasCredit && !offsetMode);
  const debtMode = settlementDebtMode && !hasCredit;
  const discount = Math.max(Number(els.settlementDiscountInput.value || 0), 0);

  if (!customer || payoutMode || debtMode || offsetMode || discount <= 0.001) {
    els.settlementLossHint.hidden = true;
    els.settlementLossHint.innerHTML = "";
    return;
  }

  const amount = Math.max(Number(els.settlementAmountInput.value || 0), 0);
  const settleValue = amount + discount;
  const marginRatio = customerMarginRatio(customer);
  const marginAmount = settleValue * marginRatio;
  const marginPercentText = `${Math.round(marginRatio * 100)}%`;

  els.settlementLossHint.hidden = false;
  if (discount > marginAmount + 0.001) {
    const lossAmount = discount - marginAmount;
    els.settlementLossHint.className = "settlement-loss-hint is-loss";
    els.settlementLossHint.innerHTML = `⚠️ هذا الخصم بيخليك تخسر تقريبًا <b>${money(lossAmount)}</b> — أكبر من هامش ربحك التقديري (${marginPercentText}) على هالمبلغ.`;
  } else {
    const remainingProfit = marginAmount - discount;
    els.settlementLossHint.className = "settlement-loss-hint is-ok";
    els.settlementLossHint.innerHTML = `✅ مش خسارة، بس بينزل من ربحك. ربحك المتبقي التقديري على هالمبلغ ≈ <b>${money(remainingProfit)}</b> (هامش ${marginPercentText}).`;
  }
}

function fillSettlementBalance() {
  const customer = getCustomer(selectedCustomerId);
  if (!customer) {
    showToast("اختر عميل أولاً.");
    return;
  }

  const balance = Number(customer.balance || 0);
  const hasCredit = balance < -0.001;
  const offsetMode = hasCredit && settlementOffsetMode;
  const payoutMode = hasCredit && !offsetMode;
  const debtMode = settlementDebtMode && !hasCredit;
  if (debtMode) {
    showToast("التعبئة الكاملة متاحة للتسديد أو دفع رصيد العميل فقط.");
    return;
  }

  const amount = payoutMode || offsetMode ? Math.abs(balance) : Math.max(balance, 0);
  if (amount <= 0.001) {
    showToast("لا يوجد دين أو رصيد لتعبئته.");
    return;
  }

  els.settlementAmountInput.value = inputNumberValue(amount);
  if (els.settlementDiscountInput) els.settlementDiscountInput.value = "";
  els.settlementAmountInput.focus();
  showToast(payoutMode || offsetMode ? "تم تعبئة كامل رصيد العميل." : "تم تعبئة كامل الدين.");
}

function startCustomerSettlement(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) {
    showToast("العميل غير موجود.");
    return;
  }
  selectedCustomerId = customer.id;
  settlementDebtMode = false;
  settlementOffsetMode = false;
  render();
  fillSettlementBalance();
  els.settlementForm?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderCustomerPriceTransferTargets(prices = null) {
  if (!els.cpTransferTargetInput || !els.cpTransferButton) return;
  const source = getCustomer(selectedCustomerId);
  const activePrices = Array.isArray(prices) ? prices : selectedCustomerId ? customerPricesFor(selectedCustomerId) : [];
  const targets = source ? state.customers.filter((customer) => customer.id !== source.id) : [];
  els.cpTransferTargetInput.innerHTML = targets.length
    ? ['<option value="">اختر عميل...</option>']
      .concat(targets.map((customer) => `<option value="${escapeAttr(customer.id)}">${escapeHtml(customerMergeOptionLabel(customer))}</option>`))
      .join("")
    : '<option value="">لا يوجد عميل آخر</option>';
  const disabled = !source || !activePrices.length || !targets.length;
  els.cpTransferTargetInput.disabled = disabled;
  els.cpTransferButton.disabled = disabled;
}

async function transferSelectedCustomerPrices() {
  if (!requireManagerPermission("customer.price", "نقل الأسعار الخاصة")) return;
  const source = getCustomer(selectedCustomerId);
  const target = getCustomer(els.cpTransferTargetInput?.value);
  if (!source) {
    showToast("اختر العميل الذي تريد نقل أسعاره الخاصة.");
    return;
  }
  if (!target || source.id === target.id) {
    showToast("اختر العميل الذي تريد النقل إليه.");
    return;
  }

  const sourcePrices = customerPricesFor(source.id);
  if (!sourcePrices.length) {
    showToast("لا توجد أسعار خاصة لنقلها.");
    return;
  }
  const targetItemIds = new Set(customerPricesFor(target.id).map((price) => price.itemId));
  const movableCount = sourcePrices.filter((price) => !targetItemIds.has(price.itemId)).length;
  const skippedCount = sourcePrices.length - movableCount;
  if (movableCount <= 0) {
    showToast("كل الأسعار الخاصة موجودة مسبقاً عند العميل الثاني.");
    return;
  }

  const confirmed = await appConfirm(
    `نقل ${movableCount} سعر خاص من "${source.name}" إلى "${target.name}"؟${skippedCount ? `\n\nسيبقى ${skippedCount} صنف لأن له سعر خاص عند العميل الثاني.` : ""}`,
    { icon: "⇄", yesLabel: "نقل", cancelLabel: "إلغاء", danger: false }
  );
  if (!confirmed) return;

  const result = transferCustomerPrices(source.id, target.id);
  if (!result.ok || result.moved <= 0) {
    showToast("تعذر نقل الأسعار الخاصة.");
    return;
  }
  selectedCustomerId = target.id;
  showToast(`تم نقل ${result.moved} سعر خاص إلى ${target.name}${result.skipped ? `، وبقي ${result.skipped} موجود مسبقاً` : ""}.`);
  render();
}

function renderCustomerPrices() {
  // ملء قائمة الأصناف
  els.cpItemSelect.innerHTML = ['<option value="">اختر صنف...</option>']
    .concat(state.menu.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)} — ${money(item.price)}</option>`))
    .join("");

  if (!selectedCustomerId) {
    els.customerPricesList.innerHTML = "";
    renderCustomerPriceTransferTargets([]);
    return;
  }
  const prices = customerPricesFor(selectedCustomerId);
  renderCustomerPriceTransferTargets(prices);
  els.customerPricesList.innerHTML = prices.length
    ? prices.map((cp) => {
      const menuItem = state.menu.find((m) => m.id === cp.itemId);
      if (!menuItem) return "";
      return `
        <div class="customer-price-row">
          <span class="cp-name">${escapeHtml(menuItem.name)}</span>
          <span class="cp-original">${money(menuItem.price)}</span>
          <span class="cp-arrow">←</span>
          <span class="cp-custom">${money(cp.price)}</span>
          <button class="cp-remove" type="button" data-cp-remove="${escapeAttr(cp.itemId)}" title="حذف">✕</button>
        </div>
      `;
    }).join("")
    : '<div class="empty-state" style="font-size:12px">لا توجد أسعار خاصة. أضف من الأعلى.</div>';
}

function renderCustomerDetail() {
  const customer = getCustomer(selectedCustomerId);
  if (!customer) {
    els.customerDetailName.textContent = "اختر عميل";
    els.customerDetailMeta.textContent = "لعرض الحساب والحركات";
    els.customerStatementButton.disabled = true;
    els.customerKpis.innerHTML = '<div class="empty-state">اختر عميل من القائمة.</div>';
    settlementDebtMode = false;
    settlementOffsetMode = false;
    applySettlementMode(null);
    els.ledgerList.innerHTML = "";
    renderCustomerPrices();
    return;
  }

  els.customerDetailName.textContent = customer.name;
  els.customerDetailMeta.textContent = customer.phone ? `${customer.phone} | تم إنشاؤه ${formatDate(customer.createdAt)}` : `تم إنشاؤه ${formatDate(customer.createdAt)}`;
  els.customerStatementButton.disabled = false;
  els.customerKpis.innerHTML = `
    <article class="current-balance-card"><span>الرصيد الحالي</span><strong>${balanceText(customer.balance)}</strong></article>
    <article><span>إجمالي الفواتير</span><strong>${money(customer.totalBilled)}</strong></article>
    <article><span>إجمالي الدفعات</span><strong>${money(customer.totalPaid)}</strong></article>
    ${loyaltyConfig().enabled ? loyaltyCardHtml(customer) : ""}
  `;
  applySettlementMode(customer);

  if (customerLedgerRenderedFor !== customer.id) customerLedgerRenderedFor = customer.id;
  const allEntries = customerLedgerRows(customer.id);
  const entries = allEntries;
  els.ledgerList.innerHTML = (entries.length
    ? entries.map((row) => {
      const invoice = row.invoice;
      return `
      <article class="ledger-row">
        <header>
          <div>
            <strong>${invoice.source === "customer_offset" ? "مقاصة مشاريب" : invoice.type === "payment" ? "دفعة على الحساب" : invoice.type === "payout" ? "دفع للعميل" : invoice.type === "debt" ? "دين مضاف يدوياً" : invoice.type === "reward" ? "🎁 مكافأة ولاء" : `فاتورة ${invoice.number}`}</strong>
            <p>${formatDate(invoice.createdAt)} | ${invoice.source === "customer_offset" ? "مقاصة من رصيده" : statusText(invoice.status)}</p>
          </div>
          <span class="balance-badge ${invoice.status === "cancelled" ? "cancelled" : invoice.status === "debt" ? "debt" : invoice.status === "credit" || invoice.status === "payout" ? "credit" : "clear"}">
            ${invoice.type === "payment" ? `${money(invoice.paid)}${Number(invoice.discount || 0) > 0 ? ` + خصم ${money(invoice.discount)}` : ""}` : invoice.type === "payout" ? `له ${money(invoice.paid)}` : `${money(invoice.total)} / ${money(invoice.paid)}`}
          </span>
        </header>
        ${renderCustomerLedgerBalance(row)}
        ${renderLedgerItems(invoice)}
        ${(invoice.type !== "payment" && invoice.type !== "payout" && invoice.items?.length && invoice.note) ? `<p class="ledger-note">📝 ${escapeHtml(invoice.note)}</p>` : ""}
        ${canUsePermission("invoice.edit") || canUsePermission("invoice.cancel") || canUsePermission("invoice.delete") ? `
          <div class="invoice-actions-cell customer-ledger-actions">
            ${canUsePermission("invoice.edit") && invoiceCanBeCancelled(invoice) ? `<button class="invoice-edit-button" type="button" data-edit-customer-ledger="${invoice.id}">تعديل</button>` : ""}
            ${canUsePermission("invoice.edit") && invoiceCanBeCancelled(invoice) ? `<button class="invoice-transfer-button" type="button" data-transfer-customer-ledger="${invoice.id}">نقل</button>` : ""}
            ${canUsePermission("invoice.cancel") && invoiceCanBeCancelled(invoice) ? `<button class="invoice-cancel-button" type="button" data-cancel-customer-ledger="${invoice.id}">إلغاء</button>` : ""}
            ${canUsePermission("invoice.delete") ? `<button class="invoice-delete-button" type="button" data-delete-customer-ledger="${invoice.id}">حذف</button>` : ""}
          </div>
        ` : ""}
      </article>
    `;
    }).join("")
    : '<div class="empty-state">لا توجد حركات لهذا العميل.</div>');
  renderCustomerPrices();
}

const CASHIER_INVOICE_LIMIT = 10;

function renderInvoiceItemsPreview(invoice) {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const renderPreviewItem = (item) => {
    const qty = Number(item.qty || 0);
    return `<div class="invoice-preview-item" title="${escapeHtml(item.name || "صنف")}">
      <strong>${escapeHtml(item.name || "صنف")}</strong>
      <span>× ${quantityText(qty)}</span>
    </div>`;
  };

  if (!items.length) {
    const fallback = invoice.type === "payment" ? "تسديد حساب" : invoice.type === "debt" ? "دين بدون أصناف" : invoice.type === "payout" ? "دفع للعميل" : "لا توجد أصناف";
    return `<span class="invoice-items-empty">${fallback}</span>${invoice.note ? `<small class="invoice-items-note">${escapeHtml(invoice.note)}</small>` : ""}`;
  }

  const visibleItems = items.slice(0, 3);
  const remainingItems = items.slice(3);
  return `
    <div class="invoice-items-preview">${visibleItems.map(renderPreviewItem).join("")}</div>
    ${remainingItems.length ? `
      <details class="invoice-more-items">
        <summary>إظهار ${remainingItems.length} ${remainingItems.length === 1 ? "صنف إضافي" : "أصناف إضافية"}</summary>
        <div>${remainingItems.map(renderPreviewItem).join("")}</div>
      </details>
    ` : ""}
    ${invoice.note ? `<small class="invoice-items-note">${escapeHtml(invoice.note)}</small>` : ""}
  `;
}

function renderInvoices() {
  const cashier = !isManagerMode();
  const selectedFilters = selectedInvoiceFilters();
  const filteredRows = filteredInvoicesForView();
  let allRows = filteredRows;
  // الكاشير يشوف آخر 10 فواتير فقط (الأحدث)
  if (cashier) {
    allRows = allRows.slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, CASHIER_INVOICE_LIMIT);
  }
  // عرض جزء فقط لتفادي تجميد الجدول مع آلاف الفواتير (المدير فقط؛ الكاشير محدود بـ10)
  let rows;
  let moreRow = "";
  if (cashier) {
    rows = allRows;
  } else {
    if (invoiceViewLimit < INVOICE_VIEW_STEP) invoiceViewLimit = INVOICE_VIEW_STEP;
    rows = allRows.slice(0, invoiceViewLimit);
    const remaining = allRows.length - rows.length;
    moreRow = remaining > 0
      ? `<tr class="invoice-more-row"><td colspan="7">
           <button class="secondary-button" type="button" data-show-more-invoices>⬇ عرض ${Math.min(remaining, INVOICE_VIEW_STEP)} فاتورة أكثر (متبقّي ${remaining})</button>
         </td></tr>`
      : "";
  }

  renderInvoiceFinancialSummary(allRows, rows.length, filteredRows.length, cashier);
  renderInvoiceResultLabel(selectedFilters, filteredRows.length);

  els.invoiceTableBody.innerHTML = rows.length
    ? rows.map((invoice) => {
      const payCategory = invoiceIsCancelled(invoice) ? "cancelled" : invoicePaymentCategory(invoice);
      const financialType = invoiceFinancialType(invoice);
      const debtAmount = Math.max(Number(invoiceDebtDelta(invoice) || 0), 0);
      const creditAmount = Math.abs(Math.min(Number(invoiceDebtDelta(invoice) || 0), 0));
      const financialDetail = invoiceIsCancelled(invoice)
        ? `<strong>لا أثر مالي</strong><small>القيم الأصلية ظاهرة للمراجعة فقط</small>`
        : invoice.type === "payment"
          ? `<strong class="is-collected">تسديد ${money(invoice.paid)}</strong>${Number(invoice.discount || 0) > 0 ? `<small>خصم ${money(invoice.discount)}</small>` : ""}`
          : invoice.type === "debt"
            ? `<strong class="is-debt">دين يدوي ${money(debtAmount)}</strong>`
            : invoice.type === "payout"
              ? `<strong class="is-credit">دفع للعميل ${money(invoice.paid)}</strong>`
              : invoice.source === "customer_offset"
                ? `<strong class="is-credit">مقاصة من رصيده ${money(invoice.total)}</strong><small>بدون قبض أو حركة صندوق</small>`
                : `<strong>مدفوع ${invoicePaidDisplay(invoice)}</strong>${debtAmount > 0.001 ? `<small class="is-debt">متبقي دين ${money(debtAmount)}</small>` : ""}${creditAmount > 0.001 ? `<small class="is-credit">له رصيد ${money(creditAmount)}</small>` : ""}`;
      const recordTitle = invoice.source === "customer_offset" ? "مقاصة مشاريب" : invoice.type === "payment" ? "دفعة حساب" : invoice.type === "debt" ? "دين يدوي" : invoice.type === "payout" ? "دفع للعميل" : `فاتورة ${escapeHtml(invoice.number)}`;
      const itemsPreview = renderInvoiceItemsPreview(invoice);
      return `
      <tr class="invoice-pay-row is-pay-${payCategory} is-record-${financialType}">
        <td class="invoice-id-date-cell">
          <span class="invoice-record-kind">${financialType === "sale-offset" ? "بيع بالمقاصة" : financialType === "payment" ? "تسديد حساب" : financialType === "manual-debt" ? "دين مسجل" : financialType === "payout" ? "صرف للعميل" : "بيع"}</span>
          <strong class="invoice-record-title">${recordTitle}</strong>
          <small class="invoice-record-date">${formatDateOnly(invoice.createdAt)} · ${formatTimeOnly(invoice.createdAt)}</small>
        </td>
        <td class="invoice-party-cell"><span class="invoice-cell-label">العميل</span>${invoice.customerId ? `<button type="button" class="invoice-customer-link" data-open-invoice-customer="${invoice.customerId}" title="فتح حساب العميل">${escapeHtml(invoice.customerName || "زبون نقدي")}</button>` : `<strong>${escapeHtml(invoice.customerName || "زبون نقدي")}</strong>`}<small>${invoice.tableLabel ? `الطاولة: ${escapeHtml(invoice.tableLabel)}` : "بدون طاولة"}</small></td>
        <td class="invoice-items-cell">
          ${itemsPreview}
        </td>
        <td class="invoice-sale-value"><span class="invoice-cell-label">${financialType === "manual-debt" ? "قيمة الدين" : financialType === "payment" ? "قيمة الحركة" : "قيمة البيع"}</span><strong>${invoiceTotalDisplay(invoice)}</strong></td>
        <td class="invoice-money-cell"><span class="invoice-cell-label">التحصيل والحساب</span><div class="invoice-financial-detail">${financialDetail}</div></td>
        <td class="invoice-state-payment-cell">
          <span class="invoice-cell-label">الحالة والدفع</span>
          <div class="invoice-status-cell">
            <span class="balance-badge ${invoice.status === "cancelled" ? "cancelled" : invoice.status === "debt" ? "debt" : invoice.status === "credit" || invoice.status === "payout" ? "credit" : "clear"}">${invoiceStatusDisplayText(invoice)}</span>
            ${hasTemporaryItems(invoice) ? '<span class="temporary-status-badge">صنف مؤقت</span>' : ""}
          </div>
          <span class="invoice-payment-method is-pay-${payCategory}">${escapeHtml(invoicePaymentText(invoice))}</span>
        </td>
        <td>
          <div class="invoice-actions-cell">
            <button class="invoice-print-button" type="button" data-print-invoice="${invoice.id}">طباعة</button>
            ${(canUsePermission("invoice.edit") && invoiceCanBeCancelled(invoice)) || (canUsePermission("invoice.cancel") && invoiceCanBeCancelled(invoice)) || canUsePermission("invoice.delete") ? `
              <details class="invoice-row-more">
                <summary>إجراءات أخرى</summary>
                <div>
                  ${canUsePermission("invoice.edit") && invoiceCanBeCancelled(invoice) ? `<button class="invoice-edit-button" type="button" data-edit-invoice="${invoice.id}">تعديل</button>` : ""}
                  ${canUsePermission("invoice.edit") && invoiceCanBeCancelled(invoice) ? `<button class="invoice-transfer-button" type="button" data-transfer-invoice="${invoice.id}">نقل الفاتورة</button>` : ""}
                  ${canUsePermission("invoice.cancel") && invoiceCanBeCancelled(invoice) ? `<button class="invoice-cancel-button" type="button" data-cancel-invoice="${invoice.id}">إلغاء الفاتورة</button>` : ""}
                  ${canUsePermission("invoice.delete") ? `<button class="invoice-delete-button" type="button" data-delete-invoice="${invoice.id}">حذف نهائي</button>` : ""}
                </div>
              </details>
            ` : ""}
          </div>
        </td>
      </tr>
    `;
    }).join("") + moreRow
    : '<tr><td colspan="7"><div class="empty-state">لا توجد حركات مطابقة. جرّب مسح الفلاتر أو تغيير الفترة.</div></td></tr>';
}

function invoicePaidDisplay(invoice) {
  if (invoiceIsCancelled(invoice)) {
    const original = cancelledInvoiceOriginal(invoice);
    const originalPaid = Number(original?.paid || 0);
    return `${money(0)}${originalPaid > 0 ? `<br><small>قبل الإلغاء ${money(originalPaid)}</small>` : ""}`;
  }
  const changeReturned = Number(invoice.changeReturned || 0);
  if (changeReturned <= 0) return money(invoice.paid);
  const received = Number(invoice.received ?? (Number(invoice.paid || 0) + changeReturned));
  return `${money(invoice.paid)}<br><small>استلم ${money(received)} | راجع ${money(changeReturned)}</small>`;
}

function invoiceTotalDisplay(invoice) {
  if (!invoiceIsCancelled(invoice)) return money(invoice.total);
  const original = cancelledInvoiceOriginal(invoice);
  const originalTotal = Number(original?.total || 0);
  return `${money(0)}${originalTotal > 0 ? `<br><small>قبل الإلغاء ${money(originalTotal)}</small>` : ""}`;
}

function invoiceAuditSummary(invoice = {}) {
  return {
    id: invoice.id || "",
    number: invoice.number || "",
    type: invoice.type || "sale",
    customerName: invoice.customerName || "",
    total: Number(invoice.total || 0),
    paid: Number(invoice.paid || 0),
    delta: Number(invoice.delta || 0),
    status: invoice.status || "",
    createdAt: invoice.createdAt || ""
  };
}

function cancelledInvoiceOriginal(invoice = {}) {
  return invoice.cancelledOriginal || invoice.cancelled?.original || null;
}

function invoiceCanBeCancelled(invoice) {
  return invoice && !invoiceIsCancelled(invoice);
}

function reverseInvoiceFromCustomer(invoice) {
  if (invoiceIsCancelled(invoice)) return;
  if (!invoice.customerId) return;
  const customer = getCustomer(invoice.customerId);
  if (!customer) return;

  customer.totalBilled = Math.max(0, Number(customer.totalBilled || 0) - Number(invoice.total || 0));
  if (invoice.type === "payout") {
    customer.totalPaid = Number(customer.totalPaid || 0) + Number(invoice.paid || 0);
  } else {
    customer.totalPaid = Math.max(0, Number(customer.totalPaid || 0) - Number(invoice.paid || 0));
  }
  customer.balance = Number(customer.balance || 0) - Number(invoice.delta || 0);
  customer.updatedAt = new Date().toISOString();
}

function reverseInvoiceStock(invoice) {
  if (invoiceIsCancelled(invoice)) return;
  if (invoice.type !== "sale") return;
  restoreStockForSoldItems(invoice.items);
}

// ─── نقاط الولاء (مشتقّة من إجمالي المشتريات؛ لا تلمس المحاسبة) ──
function loyaltyConfig() {
  const l = (state.loyalty && typeof state.loyalty === "object") ? state.loyalty : {};
  return {
    enabled: l.enabled !== false,
    perShekel: Number(l.perShekel) > 0 ? Number(l.perShekel) : 1,
    rewardPoints: Number(l.rewardPoints) > 0 ? Number(l.rewardPoints) : 100,
    rewardValue: Number(l.rewardValue) > 0 ? Number(l.rewardValue) : 10
  };
}

function customerRedeemedPoints(customer) {
  if (!customer) return 0;
  return (state.invoices || [])
    .filter((inv) => inv.type === "reward" && inv.customerId === customer.id)
    .reduce((sum, inv) => sum + Number(inv.loyaltyPoints || 0), 0);
}

function customerLoyaltyPoints(customer) {
  if (!customer) return 0;
  const earned = Math.floor(Number(customer.totalBilled || 0) * loyaltyConfig().perShekel);
  return Math.max(earned - customerRedeemedPoints(customer), 0);
}

function loyaltyCardHtml(customer) {
  const cfg = loyaltyConfig();
  const pts = customerLoyaltyPoints(customer);
  const canRedeem = pts >= cfg.rewardPoints;
  const pct = canRedeem ? 100 : Math.round(((pts % cfg.rewardPoints) / cfg.rewardPoints) * 100);
  const remaining = canRedeem ? 0 : cfg.rewardPoints - pts;
  return `
    <article class="loyalty-card">
      <span>🎁 نقاط الولاء</span>
      <strong>${quantityText(pts)} نقطة</strong>
      <div class="loyalty-progress"><div style="width:${pct}%"></div></div>
      <small>${canRedeem ? `جاهز — مكافأة ${money(cfg.rewardValue)}` : `باقي ${quantityText(remaining)} نقطة للمكافأة`}</small>
      <button class="secondary-button loyalty-redeem-btn" type="button" data-redeem-loyalty="${customer.id}" ${canRedeem ? "" : "disabled"}>🎁 استبدال مكافأة</button>
    </article>
  `;
}

function redeemLoyalty(customerId) {
  const cfg = loyaltyConfig();
  if (!cfg.enabled) { showToast("نظام النقاط غير مفعّل."); return; }
  const customer = getCustomer(customerId || selectedCustomerId);
  if (!customer) { showToast("اختر عميل أولاً."); return; }
  if (customerLoyaltyPoints(customer) < cfg.rewardPoints) {
    showToast(`النقاط غير كافية — يحتاج ${cfg.rewardPoints} نقطة.`);
    return;
  }
  const reward = {
    id: uid("reward"),
    number: nextInvoiceNumber(),
    type: "reward",
    customerId: customer.id,
    customerName: customer.name,
    tableLabel: "-",
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    paid: 0,
    delta: -cfg.rewardValue,
    loyaltyPoints: cfg.rewardPoints,
    payments: { cash: 0, bank: 0, wallet: 0 },
    status: "credit",
    note: `مكافأة ولاء — رصيد ${money(cfg.rewardValue)} مقابل ${cfg.rewardPoints} نقطة`,
    createdAt: new Date().toISOString()
  };
  customer.balance = Number(customer.balance || 0) + reward.delta;
  customer.updatedAt = new Date().toISOString();
  state.invoices.unshift(reward);
  if (typeof auditAction === "function") auditAction("loyalty.redeem", { customer: customer.name, points: cfg.rewardPoints, value: cfg.rewardValue });
  saveState();
  render();
  showToast(`🎁 تم استبدال ${cfg.rewardPoints} نقطة — أُضيف رصيد ${money(cfg.rewardValue)} للعميل.`);
}

function renderInvoiceEditMenuSelect() {
  els.invoiceEditMenuItemInput.innerHTML = ['<option value="">اختر صنف</option>']
    .concat(state.menu.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)} - ${money(item.price)}</option>`))
    .join("");
}

function sameCustomerName(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function sortedInvoiceTransferCustomers() {
  return [...(state.customers || [])]
    .filter((customer) => customer && customer.id && String(customer.name || "").trim())
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
}

function renderInvoiceTransferCustomers(selectedId = "") {
  if (!els.invoiceTransferCustomerInput) return;
  const customers = sortedInvoiceTransferCustomers();
  els.invoiceTransferCustomerInput.innerHTML = ['<option value="">اختر عميل محفوظ</option>']
    .concat(customers.map((customer) => {
      const phone = customer.phone ? ` - ${customer.phone}` : "";
      return `<option value="${escapeAttr(customer.id)}">${escapeHtml(customer.name)}${escapeHtml(phone)}</option>`;
    }))
    .join("");
  els.invoiceTransferCustomerInput.value = customers.some((customer) => customer.id === selectedId) ? selectedId : "";
}

function selectedInvoiceTransferCustomer(customerName = "") {
  const selectedId = els.invoiceEditCustomerInput?.dataset?.transferCustomerId || els.invoiceTransferCustomerInput?.value;
  if (!selectedId) return null;
  const customer = getCustomer(selectedId);
  if (!customer) return null;
  if (els.invoiceEditCustomerInput?.dataset?.transferCustomerId === selectedId) return customer;
  return sameCustomerName(customer.name, customerName) ? customer : null;
}

function applyInvoiceTransferCustomer() {
  const customer = getCustomer(els.invoiceTransferCustomerInput?.value);
  if (!customer) {
    showToast("اختر العميل الذي تريد نقل الفاتورة له.");
    return;
  }
  els.invoiceEditCustomerInput.value = customer.name || "";
  els.invoiceEditPhoneInput.value = customer.phone || "";
  els.invoiceEditCustomerInput.dataset.transferCustomerId = customer.id;
  els.invoiceEditCustomerInput.focus();
}

function clearInvoiceTransferCustomerSelection() {
  if (els.invoiceEditCustomerInput?.dataset) delete els.invoiceEditCustomerInput.dataset.transferCustomerId;
  if (els.invoiceTransferCustomerInput) els.invoiceTransferCustomerInput.value = "";
}

function resolveEditedInvoiceCustomer(customerName, phone) {
  if (!customerName) return null;
  const selectedCustomer = selectedInvoiceTransferCustomer(customerName);
  const customer = selectedCustomer || findCustomerByName(customerName) || upsertCustomer(customerName, phone ? { phone } : {});
  if (customer && phone && String(customer.phone || "") !== phone) {
    customer.phone = phone;
    customer.updatedAt = new Date().toISOString();
  }
  return customer;
}

function invoiceEditItemsSubtotal(items = invoiceEditItemsDraft) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function updateInvoiceEditItemTotals(syncTotal = false) {
  let subtotal = 0;
  Array.from(els.invoiceEditItemsList.querySelectorAll("[data-invoice-edit-row]")).forEach((row) => {
    const qty = Math.max(Number(row.querySelector("[data-invoice-edit-qty]")?.value || 0), 0);
    const price = Math.max(Number(row.querySelector("[data-invoice-edit-price]")?.value || 0), 0);
    const lineTotal = qty * price;
    subtotal += lineTotal;
    const output = row.querySelector("[data-invoice-edit-line-total]");
    if (output) output.textContent = money(lineTotal);
  });

  els.invoiceEditSubtotalValue.textContent = money(subtotal);
  if (syncTotal) els.invoiceEditTotalInput.value = inputNumberValue(subtotal);
}

function invoiceEditItemFromInput(original, name, qty, price) {
  const matchedItem = findMenuItemByName(name);
  if (matchedItem) {
    if (!original.temporary && original.id === matchedItem.id) {
      return {
        ...original,
        name: matchedItem.name,
        qty,
        price,
        cost: Number(original.cost || menuItemRecipeCost(matchedItem) || 0),
        stockUsage: Array.isArray(original.stockUsage) && original.stockUsage.length
          ? mergeStockUsage(original.stockUsage)
          : stockUsageFromMenuItem(matchedItem)
      };
    }

    const originalPrice = Number(original.price || 0);
    const typedPrice = Number(price || 0);
    const nextPrice = Math.abs(typedPrice - originalPrice) <= 0.001
      ? Number(matchedItem.price || typedPrice)
      : typedPrice;

    return {
      id: matchedItem.id,
      name: matchedItem.name,
      qty,
      price: nextPrice,
      cost: menuItemRecipeCost(matchedItem),
      temporary: false,
      stockUsage: stockUsageFromMenuItem(matchedItem)
    };
  }

  const originalName = String(original.name || "").trim().toLowerCase();
  const nextName = String(name || "").trim().toLowerCase();
  if (!original.temporary && originalName !== nextName) {
    return {
      id: uid("custom-item"),
      name,
      qty,
      price,
      cost: 0,
      temporary: true,
      stockUsage: []
    };
  }

  return {
    ...original,
    name,
    qty,
    price,
    cost: Number(original.cost || 0),
    stockUsage: Array.isArray(original.stockUsage) ? mergeStockUsage(original.stockUsage) : []
  };
}

function readInvoiceEditItemsFromForm(showErrors = false) {
  const items = Array.from(els.invoiceEditItemsList.querySelectorAll("[data-invoice-edit-row]")).map((row) => {
    const index = Number(row.dataset.invoiceEditRow);
    const original = invoiceEditItemsDraft[index];
    if (!original) return null;

    const name = row.querySelector("[data-invoice-edit-name]")?.value.trim() || "";
    const qty = Math.max(Number(row.querySelector("[data-invoice-edit-qty]")?.value || 0), 0);
    const price = Math.max(Number(row.querySelector("[data-invoice-edit-price]")?.value || 0), 0);
    if (!name || qty <= 0) return { invalid: true };

    return invoiceEditItemFromInput(original, name, qty, price);
  }).filter(Boolean);

  if (items.some((item) => item.invalid)) {
    if (showErrors) showToast("تأكد من اسم الصنف والكمية داخل الفاتورة.");
    return null;
  }

  return items;
}

function renderInvoiceEditItems(syncTotal = false) {
  els.invoiceEditItemsList.innerHTML = invoiceEditItemsDraft.length
    ? invoiceEditItemsDraft.map((item, index) => `
      <article class="invoice-edit-item-row" data-invoice-edit-row="${index}">
        <label class="field compact">
          <span>الصنف</span>
          <input data-invoice-edit-name type="text" value="${escapeAttr(item.name)}" />
        </label>
        <label class="field compact">
          <span>الكمية</span>
          <input data-invoice-edit-qty type="number" min="0" step="any" inputmode="decimal" value="${escapeAttr(inputNumberValue(item.qty) || "1")}" />
        </label>
        <label class="field compact">
          <span>السعر</span>
          <input data-invoice-edit-price type="number" min="0" step="any" inputmode="decimal" value="${escapeAttr(inputNumberValue(item.price))}" />
        </label>
        <div class="invoice-edit-line-total">
          <span>المجموع</span>
          <strong data-invoice-edit-line-total>${money(Number(item.qty || 0) * Number(item.price || 0))}</strong>
        </div>
        <button class="invoice-edit-remove-item" type="button" data-remove-invoice-edit-item="${index}">حذف</button>
      </article>
    `).join("")
    : '<div class="empty-state">لا توجد أصناف في هذه الفاتورة. تقدر تضيف صنف من الأعلى.</div>';

  els.invoiceEditSubtotalValue.textContent = money(invoiceEditItemsSubtotal());
  if (syncTotal) els.invoiceEditTotalInput.value = inputNumberValue(invoiceEditItemsSubtotal());
}

function addInvoiceEditMenuItem() {
  const item = findMenuItem(els.invoiceEditMenuItemInput.value);
  if (!item) {
    showToast("اختر صنف من القائمة.");
    return;
  }

  const currentItems = readInvoiceEditItemsFromForm(false);
  if (currentItems) invoiceEditItemsDraft = currentItems;
  const existing = invoiceEditItemsDraft.find((line) => line.id === item.id && !line.temporary);
  if (existing) existing.qty = Number(existing.qty || 0) + 1;
  else invoiceEditItemsDraft.push({
    id: item.id,
    name: item.name,
    price: Number(item.price || 0),
    cost: menuItemRecipeCost(item),
    qty: 1,
    stockUsage: stockUsageFromMenuItem(item)
  });

  els.invoiceEditMenuItemInput.value = "";
  renderInvoiceEditItems(true);
}

function addInvoiceEditCustomItem() {
  const name = els.invoiceEditCustomNameInput.value.trim();
  const price = Number(els.invoiceEditCustomPriceInput.value || 0);
  if (!name || price <= 0) {
    showToast("اكتب اسم الصنف المؤقت وسعره.");
    return;
  }

  const currentItems = readInvoiceEditItemsFromForm(false);
  if (currentItems) invoiceEditItemsDraft = currentItems;
  invoiceEditItemsDraft.push({
    id: uid("custom-item"),
    name,
    price,
    cost: 0,
    qty: 1,
    temporary: true,
    stockUsage: []
  });

  els.invoiceEditCustomNameInput.value = "";
  els.invoiceEditCustomPriceInput.value = "";
  renderInvoiceEditItems(true);
}

function removeInvoiceEditItem(index) {
  const currentItems = readInvoiceEditItemsFromForm(false);
  if (currentItems) invoiceEditItemsDraft = currentItems;
  invoiceEditItemsDraft.splice(Number(index), 1);
  renderInvoiceEditItems(true);
}

function startEditInvoice(invoiceId, options = {}) {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  if (!invoice) return;
  if (invoiceIsCancelled(invoice)) {
    showToast("لا يمكن تعديل فاتورة ملغاة.");
    return;
  }
  if (!guardClosedPeriod(invoice.createdAt, "تعديل الفاتورة")) return;

  editingInvoiceId = invoice.id;
  const customer = getCustomer(invoice.customerId);
  const isSale = invoice.type === "sale";
  const isDebt = invoice.type === "debt";
  const isPayment = invoice.type === "payment";
  els.invoiceEditForm.hidden = false;
  els.invoiceEditTitle.textContent = options.transfer ? `نقل ${invoice.number} إلى عميل آخر` : `تعديل ${invoice.number}`;
  els.invoiceEditCustomerInput.value = invoice.customerName || "";
  if (els.invoiceEditCustomerInput?.dataset) delete els.invoiceEditCustomerInput.dataset.transferCustomerId;
  els.invoiceEditPhoneInput.value = customer?.phone || "";
  renderInvoiceTransferCustomers(invoice.customerId || "");
  els.invoiceEditDateInput.value = invoiceDateInputValue(invoice);
  els.invoiceEditTableInput.value = invoice.tableLabel || "";
  els.invoiceEditTotalInput.value = inputNumberValue(invoice.total);
  els.invoiceEditPaidInput.value = inputNumberValue(invoice.paid);
  els.invoiceEditDiscountInput.value = inputNumberValue(isPayment ? invoice.discount : 0);
  els.invoiceEditMethodInput.value = paymentMethodFromPayments(invoice.payments);
  els.invoiceEditNoteInput.value = invoice.note || "";
  els.invoiceEditTotalInput.disabled = !(isSale || isDebt);
  els.invoiceEditPaidInput.disabled = isDebt;
  els.invoiceEditDiscountField.hidden = !isPayment;
  els.invoiceEditMethodInput.disabled = isDebt;
  els.invoiceEditTableInput.disabled = !isSale;
  els.invoiceEditItemsSection.hidden = !isSale;
  invoiceEditItemsDraft = isSale ? (invoice.items || []).map(cloneInvoiceItem) : [];
  renderInvoiceEditMenuSelect();
  renderInvoiceEditItems(false);
  els.invoiceEditForm.scrollIntoView({ behavior: "smooth", block: "start" });
  if (options.transfer && els.invoiceTransferCustomerInput) {
    els.invoiceTransferCustomerInput.focus();
    showToast("اختر العميل الجديد ثم احفظ التعديل.");
  } else {
    els.invoiceEditCustomerInput.focus();
  }
}

function startTransferInvoice(invoiceId) {
  startEditInvoice(invoiceId, { transfer: true });
}

function cancelInvoiceEdit() {
  editingInvoiceId = null;
  invoiceEditItemsDraft = [];
  els.invoiceEditForm.hidden = true;
  els.invoiceEditItemsSection.hidden = true;
  els.invoiceEditForm.reset();
  els.invoiceEditTotalInput.disabled = false;
  els.invoiceEditPaidInput.disabled = false;
  els.invoiceEditDiscountField.hidden = true;
  els.invoiceEditDiscountInput.value = "";
  els.invoiceEditMethodInput.disabled = false;
  els.invoiceEditTableInput.disabled = false;
  if (els.invoiceTransferCustomerInput) els.invoiceTransferCustomerInput.value = "";
  if (els.invoiceEditCustomerInput?.dataset) delete els.invoiceEditCustomerInput.dataset.transferCustomerId;
}

function saveEditedInvoice(event) {
  event.preventDefault();
  const invoice = state.invoices.find((item) => item.id === editingInvoiceId);
  if (!invoice) {
    cancelInvoiceEdit();
    return;
  }

  const type = invoice.type || "sale";
  const isDebt = type === "debt";
  const isPayment = type === "payment";
  const customerName = els.invoiceEditCustomerInput.value.trim();
  const phone = els.invoiceEditPhoneInput.value.trim();
  const paid = isDebt ? 0 : Math.max(Number(els.invoiceEditPaidInput.value || 0), 0);
  const settlementDiscount = isPayment ? Math.max(Number(els.invoiceEditDiscountInput.value || 0), 0) : 0;
  const method = paymentMethods.includes(els.invoiceEditMethodInput.value) ? els.invoiceEditMethodInput.value : getLastPaymentMethod();
  const updatedItems = type === "sale" ? readInvoiceEditItemsFromForm(true) : (invoice.items || []).map(cloneInvoiceItem);
  if (!updatedItems) return;

  const lineSubtotal = updatedItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const totalInput = type === "sale" && els.invoiceEditTotalInput.value.trim() === ""
    ? lineSubtotal
    : Math.max(Number(els.invoiceEditTotalInput.value || 0), 0);
  const total = type === "sale" || isDebt ? totalInput : 0;
  const delta = isDebt ? total : isPayment ? -(paid + settlementDiscount) : type === "payout" ? paid : total - paid;
  if ((delta > 0.001 || delta < -0.001 || type !== "sale") && !customerName) {
    showToast("اكتب اسم العميل قبل حفظ التعديل.");
    els.invoiceEditCustomerInput.focus();
    return;
  }

  const nextCreatedAt = editedInvoiceDateFromInput(els.invoiceEditDateInput.value, invoice.createdAt);
  if (!guardClosedPeriod(nextCreatedAt, "حفظ الفاتورة بتاريخ ضمن فترة مغلقة")) return;

  const before = cloneInvoice(invoice);
  reverseInvoiceFromCustomer(before);
  reverseInvoiceStock(before);
  const editedCustomer = resolveEditedInvoiceCustomer(customerName, phone);

  invoice.customerName = customerName || "زبون نقدي";
  invoice.customerId = editedCustomer?.id || null;
  invoice.tableLabel = type === "sale" ? els.invoiceEditTableInput.value.trim() || "-" : "-";
  invoice.createdAt = nextCreatedAt;
  invoice.items = type === "sale" ? updatedItems : invoice.items || [];
  invoice.total = total;
  invoice.subtotal = type === "sale" ? Math.max(lineSubtotal, total) : isDebt ? total : 0;
  invoice.discount = type === "sale" ? Math.max(invoice.subtotal - total, 0) : isPayment ? settlementDiscount : 0;
  invoice.paid = paid;
  invoice.received = paid;
  invoice.changeReturned = 0;
  invoice.delta = delta;
  invoice.payments = { cash: 0, bank: 0, wallet: 0 };
  if (!isDebt) invoice.payments[method] = paid;
  invoice.status = invoiceStatus(delta, type);
  invoice.note = els.invoiceEditNoteInput.value.trim();

  if (editedCustomer) invoice.customerName = editedCustomer.name || invoice.customerName;
  if (type === "sale") reduceStockForSoldItems(invoice.items);
  applyImportedInvoiceToCustomer(invoice);
  rebuildCustomerAccountsFromInvoices(state);
  const customerChanged = !sameCustomerName(before.customerName, invoice.customerName) || before.customerId !== invoice.customerId;
  auditAction(customerChanged ? "invoice.transfer" : "invoice.edit", {
    number: invoice.number,
    before: invoiceAuditSummary(before),
    after: invoiceAuditSummary(invoice)
  });
  if (lastClosedInvoice?.id === invoice.id) lastClosedInvoice = invoice;
  cancelInvoiceEdit();
  showToast(customerChanged ? `تم نقل الفاتورة إلى ${invoice.customerName}.` : "تم حفظ تعديل الفاتورة.");
  render();
}

async function cancelInvoice(invoiceId) {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  if (!invoice) return;
  if (invoiceIsCancelled(invoice)) {
    showToast("الفاتورة ملغاة مسبقاً.");
    return;
  }
  if (typeof guardClosedPeriod === "function" && !guardClosedPeriod(invoice.createdAt, "إلغاء الفاتورة")) return;

  let reason = "";
  if (typeof window !== "undefined" && typeof window.prompt === "function") {
    const raw = window.prompt(`سبب إلغاء الفاتورة ${invoice.number}:`, "");
    if (raw === null) return;
    reason = String(raw || "").trim();
  }
  if (!reason) reason = "بدون سبب";

  const confirmed = await appConfirm(
    `إلغاء الفاتورة ${invoice.number}؟\nسيتم عكس أثرها من حساب العميل والمخزون، وستبقى ظاهرة في السجل كفاتورة ملغاة.`,
    { icon: "↩", yesLabel: "إلغاء الفاتورة", cancelLabel: "رجوع" }
  );
  if (!confirmed) return;

  const before = cloneInvoice(invoice);
  reverseInvoiceFromCustomer(before);
  reverseInvoiceStock(before);

  invoice.cancelledAt = new Date().toISOString();
  invoice.cancelledReason = reason;
  invoice.cancelledOriginal = {
    ...invoiceAuditSummary(before),
    subtotal: Number(before.subtotal || 0),
    discount: Number(before.discount || 0),
    received: Number(before.received ?? (Number(before.paid || 0) + Number(before.changeReturned || 0))),
    changeReturned: Number(before.changeReturned || 0),
    payments: { ...(before.payments || {}) },
    itemCount: (before.items || []).length
  };
  invoice.originalType = before.type || invoice.originalType || "";
  invoice.originalStatus = before.status || invoice.originalStatus || "";
  invoice.type = "cancelled";
  invoice.status = "cancelled";
  invoice.subtotal = 0;
  invoice.discount = 0;
  invoice.total = 0;
  invoice.paid = 0;
  invoice.received = 0;
  invoice.changeReturned = 0;
  invoice.delta = 0;
  invoice.payments = { cash: 0, bank: 0, wallet: 0 };
  invoice.note = `ملغاة: ${reason}`;

  rebuildCustomerAccountsFromInvoices(state);
  auditAction("invoice.cancel", {
    invoice: invoiceAuditSummary(before),
    reason
  });
  if (lastClosedInvoice?.id === invoice.id) lastClosedInvoice = invoice;
  showToast(`تم إلغاء الفاتورة ${invoice.number}.`);
  render();
}

async function deleteInvoice(invoiceId) {
  const invoiceIndex = state.invoices.findIndex((invoice) => invoice.id === invoiceId);
  if (invoiceIndex === -1) return;

  const invoice = state.invoices[invoiceIndex];
  if (!guardClosedPeriod(invoice.createdAt, "حذف الفاتورة")) return;
  const confirmed = await appConfirm(`حذف الفاتورة ${invoice.number}؟ لا يمكن التراجع عن الحذف.`);
  if (!confirmed) return;

  reverseInvoiceFromCustomer(invoice);
  reverseInvoiceStock(invoice);
  state.invoices.splice(invoiceIndex, 1);
  rebuildCustomerAccountsFromInvoices(state);
  auditAction("invoice.delete", {
    invoice: invoiceAuditSummary(invoice)
  });
  if (lastClosedInvoice?.id === invoice.id) {
    lastClosedInvoice = state.invoices[0] || null;
  }
  showToast(`تم حذف الفاتورة ${invoice.number}.`);
  render();
}

function statementItemsText(invoice) {
  if (invoice.type === "payment") {
    const discount = Number(invoice.discount || 0);
    const note = escapeHtml(invoice.note || "دفعة على الحساب");
    return discount > 0 ? `${note}<br><small>خصم عند التسديد: ${money(discount)}</small>` : note;
  }
  if (invoice.type === "payout") return escapeHtml(invoice.note || "دفع للعميل");
  if (!invoice.items?.length && invoice.note) return escapeHtml(invoice.note);
  if (!invoice.items?.length) return "لا توجد تفاصيل أصناف";

  const items = invoice.items.map((item) => `${escapeHtml(item.name)} × ${item.qty}`).join("، ");
  return invoice.discount > 0 ? `${items}<br><small>خصم: ${money(invoice.discount)}</small>` : items;
}

function normalizeWhatsappPhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "970" + digits.slice(1); // افتراضي: فلسطين
  return digits;
}

function debtReminderMessage(customer) {
  const balance = Number(customer?.balance || 0);
  const shop = state.businessName || "دفتر المقهى";
  return `مرحبا ${customer?.name || ""} 👋\nتذكير ودي من ${shop}:\nرصيدك المستحق حاليا ${money(balance)}.\nشكرا لتعاملك معنا 🌿`;
}

function debtReminderUrl(customer) {
  const message = debtReminderMessage(customer);
  const phone = normalizeWhatsappPhone(customer?.phone);
  return phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function debtReminderCustomers() {
  const debtSinceMap = customerDebtSinceMap();
  return state.customers
    .filter((customer) => Number(customer.balance || 0) > 0.01)
    .map((customer) => ({
      customer,
      age: customerDebtAgeDays(customer, debtSinceMap) ?? -1,
      balance: Number(customer.balance || 0)
    }))
    .sort((a, b) => {
      if (b.age !== a.age) return b.age - a.age;
      if (b.balance !== a.balance) return b.balance - a.balance;
      return String(a.customer.name || "").localeCompare(String(b.customer.name || ""));
    })
    .map((entry) => entry.customer);
}

function debtReminderAgeText(customer, sinceMap) {
  const days = customerDebtAgeDays(customer, sinceMap);
  if (days === null) return "بدون تاريخ دين";
  if (days === 0) return "من اليوم";
  if (days === 1) return "من أمس";
  return `من ${days} يوم`;
}

function bulkReminderText(customers) {
  return customers.map((customer, index) => {
    const phone = customer.phone ? customer.phone : "بدون رقم";
    return `${index + 1}. ${customer.name} | ${phone} | ${money(customer.balance)}\n${debtReminderMessage(customer)}`;
  }).join("\n\n---\n\n");
}

async function copyTextToClipboard(text, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.insetInlineStart = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = typeof document.execCommand === "function" && document.execCommand("copy");
    textarea.remove();
    showToast(copied ? successMessage : "تعذر النسخ تلقائيا من المتصفح.");
    return Boolean(copied);
  } catch (error) {
    showToast("تعذر النسخ تلقائيا من المتصفح.");
    return false;
  }
}

function renderCustomerReminderList(customers) {
  if (!els.customerReminderList) return;
  const debtSinceMap = customerDebtSinceMap();
  els.customerReminderList.innerHTML = customers.map((customer) => {
    const phone = customer.phone ? escapeHtml(customer.phone) : "بدون رقم";
    const url = debtReminderUrl(customer);
    const message = debtReminderMessage(customer);
    return `
      <article class="customer-reminder-row">
        <div class="customer-reminder-main">
          <div>
            <strong>${escapeHtml(customer.name)}</strong>
            <small>${phone} | ${escapeHtml(debtReminderAgeText(customer, debtSinceMap))}</small>
          </div>
          <span>${money(customer.balance)}</span>
        </div>
        <p class="customer-reminder-message">${escapeHtml(message)}</p>
        <div class="customer-reminder-row-actions">
          <button class="secondary-button" type="button" data-copy-reminder="${escapeAttr(customer.id)}">نسخ الرسالة</button>
          <a class="primary-button" href="${escapeAttr(url)}" target="_blank" rel="noopener">فتح واتساب</a>
        </div>
      </article>
    `;
  }).join("");
}

function openBulkDebtReminders() {
  const customers = debtReminderCustomers();
  if (!customers.length) {
    showToast("لا يوجد عملاء عليهم دين حاليا.");
    return;
  }
  if (!els.customerReminderModal || !els.customerReminderList) return;

  renderCustomerReminderList(customers);
  if (els.customerReminderMeta) {
    const total = customers.reduce((sum, customer) => sum + Number(customer.balance || 0), 0);
    els.customerReminderMeta.textContent = `${customers.length} عميل | إجمالي الديون ${money(total)}`;
  }
  els.customerReminderModal.hidden = false;
  els.customerReminderCopyButton?.focus();
}

function closeBulkDebtReminders() {
  if (els.customerReminderModal) els.customerReminderModal.hidden = true;
}

function copyBulkDebtReminders() {
  const customers = debtReminderCustomers();
  if (!customers.length) {
    showToast("لا يوجد عملاء عليهم دين حاليا.");
    return;
  }
  copyTextToClipboard(bulkReminderText(customers), "تم نسخ رسائل الديون.");
}

function copyCustomerDebtReminder(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return;
  copyTextToClipboard(debtReminderMessage(customer), "تم نسخ رسالة العميل.");
}

function whatsappReminder(customerId) {
  const customer = getCustomer(customerId || selectedCustomerId);
  if (!customer) { showToast("اختر عميل أولاً."); return; }
  const balance = Number(customer.balance || 0);
  if (balance <= 0.01) { showToast("هذا العميل ما عليه دين."); return; }
  window.open(debtReminderUrl(customer), "_blank");
}

function printCustomerStatement() {
  const customer = getCustomer(selectedCustomerId);
  if (!customer) {
    showToast("اختر عميل لطباعة كشف الحساب.");
    return;
  }

  const entries = state.invoices
    .filter((invoice) => invoice.customerId === customer.id)
    .slice()
    .reverse();
  let runningBalance = 0;
  const rows = entries.length
    ? entries.map((invoice) => {
      const delta = Number(invoice.delta ?? (Number(invoice.total || 0) - Number(invoice.paid || 0)));
      runningBalance += delta;
      const title = invoice.type === "payment" ? "دفعة على الحساب" : invoice.type === "payout" ? "دفع للعميل" : `فاتورة ${escapeHtml(invoice.number)}`;
      const table = invoice.tableLabel && invoice.tableLabel !== "-" ? ` | ${escapeHtml(invoice.tableLabel)}` : "";

      return `
        <tr>
          <td>${formatDate(invoice.createdAt)}</td>
          <td>${title}<br><small>${statusText(invoice.status)}${table}</small></td>
          <td>${statementItemsText(invoice)}</td>
          <td>${invoice.type === "payment" || invoice.type === "payout" ? "-" : money(invoice.total)}</td>
          <td>${money(invoice.paid)}</td>
          <td>${balanceText(runningBalance)}</td>
        </tr>
      `;
    }).join("")
    : '<tr><td colspan="6">لا توجد حركات لهذا العميل.</td></tr>';

  const host = document.createElement("div");
  host.className = "print-host";
  host.innerHTML = `
    <section class="print-invoice account-statement" dir="rtl">
      <h1>كشف حساب عميل</h1>
      <p class="print-meta">${escapeHtml(customer.name)}${customer.phone ? ` | ${escapeHtml(customer.phone)}` : ""} | طبع بتاريخ ${formatDate(new Date().toISOString())}</p>
      <div class="statement-summary">
        <article><span>إجمالي الفواتير</span><strong>${money(customer.totalBilled)}</strong></article>
        <article><span>إجمالي الدفعات</span><strong>${money(customer.totalPaid)}</strong></article>
        <article class="current-balance-card"><span>الرصيد الحالي</span><strong>${balanceText(customer.balance)}</strong></article>
      </div>
      <table class="statement-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>البيان</th>
            <th>المشتريات</th>
            <th>الصافي</th>
            <th>المدفوع</th>
            <th>الرصيد بعد الحركة</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
  document.body.appendChild(host);
  window.print();
  host.remove();
}

function customerDebtAgeText(customer, sinceMap) {
  const days = customerDebtAgeDays(customer, sinceMap);
  if (days === null) return "-";
  if (days === 0) return "من اليوم";
  if (days === 1) return "من أمس";
  return `${days} يوم`;
}

function printCustomerDebtList() {
  const debtSinceMap = customerDebtSinceMap();
  // آخر حركة لكل عميل بمسح وحيد (الفواتير مرتّبة الأحدث أولاً أصلاً)
  const lastMovementMap = new Map();
  state.invoices.forEach((invoice) => {
    if (!invoice.customerId || lastMovementMap.has(invoice.customerId)) return;
    lastMovementMap.set(invoice.customerId, invoice.createdAt);
  });
  const debtCustomers = (state.customers || [])
    .filter((customer) => Number(customer.balance || 0) > 0.001)
    .map((customer) => ({
      customer,
      age: customerDebtAgeDays(customer, debtSinceMap) ?? -1,
      lastMovement: lastMovementMap.get(customer.id) || ""
    }))
    .sort((a, b) => b.age - a.age || Number(b.customer.balance || 0) - Number(a.customer.balance || 0));

  if (!debtCustomers.length) {
    showToast("لا توجد ديون حالياً للطباعة.");
    return;
  }

  const totalDebt = debtCustomers.reduce((sum, entry) => sum + Number(entry.customer.balance || 0), 0);
  const oldest = debtCustomers[0]?.customer;
  const rows = debtCustomers.map(({ customer, lastMovement }) => `
    <tr>
      <td>${escapeHtml(customer.name)}</td>
      <td>${customer.phone ? escapeHtml(customer.phone) : "-"}</td>
      <td>${money(customer.balance)}</td>
      <td>${customerDebtAgeText(customer, debtSinceMap)}</td>
      <td>${lastMovement ? formatDate(lastMovement) : "-"}</td>
    </tr>
  `).join("");

  const host = document.createElement("div");
  host.className = "print-host";
  host.innerHTML = `
    <section class="print-invoice account-statement debt-list-statement" dir="rtl">
      <h1>قائمة ديون العملاء</h1>
      <p class="print-meta">${state.businessName || "دفتر المقهى"} | طبع بتاريخ ${formatDate(new Date().toISOString())}</p>
      <div class="statement-summary">
        <article class="current-balance-card"><span>إجمالي الديون</span><strong>${money(totalDebt)}</strong></article>
        <article><span>عدد العملاء</span><strong>${debtCustomers.length}</strong></article>
        <article><span>أقدم دين</span><strong>${oldest ? `${escapeHtml(oldest.name)} - ${customerDebtAgeText(oldest, debtSinceMap)}` : "-"}</strong></article>
      </div>
      <table class="statement-table">
        <thead>
          <tr>
            <th>العميل</th>
            <th>الجوال</th>
            <th>الدين</th>
            <th>عمر الدين</th>
            <th>آخر حركة</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
  document.body.appendChild(host);
  window.print();
  host.remove();
}

function invoiceItemsExcelText(invoice) {
  if (invoice.type === "payment") {
    const discount = Number(invoice.discount || 0);
    return `${invoice.note || "دفعة على الحساب"}${discount > 0 ? `\nخصم عند التسديد: ${money(discount)}` : ""}`;
  }
  if (invoice.type === "payout") return invoice.note || "دفع للعميل";
  if (!invoice.items?.length && invoice.note) return invoice.note;
  if (!invoice.items?.length) return "";
  return invoice.items.map((item) => `${item.name} × ${item.qty} @ ${item.price}`).join("\n");
}

function invoiceExcelPayload(invoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    type: invoice.type || "sale",
    tableId: invoice.tableId || "",
    tableLabel: invoice.tableLabel || "",
    customerId: invoice.customerId || null,
    customerName: invoice.customerName || "زبون نقدي",
    items: invoice.items || [],
    subtotal: Number(invoice.subtotal || 0),
    discount: Number(invoice.discount || 0),
    total: Number(invoice.total || 0),
    paid: Number(invoice.paid || 0),
    received: Number(invoice.received ?? (Number(invoice.paid || 0) + Number(invoice.changeReturned || 0))),
    changeReturned: Number(invoice.changeReturned || 0),
    delta: Number(invoice.delta ?? (Number(invoice.total || 0) - Number(invoice.paid || 0))),
    payments: invoice.payments || { cash: Number(invoice.paid || 0), bank: 0, wallet: 0 },
    status: invoice.status || invoiceStatus(Number(invoice.delta || 0), invoice.type || "sale"),
    note: invoice.note || "",
    createdAt: invoice.createdAt || new Date().toISOString()
  };
}

function excelCell(value, attrs = "") {
  return `<td${attrs ? ` ${attrs}` : ""}>${escapeHtml(value)}</td>`;
}

function exportCustomersExcel() {
  if (!state.customers.length) { showToast("لا يوجد عملاء للتصدير."); return; }

  const rows = state.customers.map((c) => {
    const payload = JSON.stringify({
      id: c.id, name: c.name, phone: c.phone || "",
      balance: Number(c.balance || 0),
      totalBilled: Number(c.totalBilled || 0),
      totalPaid: Number(c.totalPaid || 0)
    });
    const bal = Number(c.balance || 0);
    const status = bal > 0.001 ? "عليه دين" : bal < -0.001 ? "له رصيد" : "مسدد";
    return `
      <tr>
        ${excelCell(payload, 'data-field="customer-payload" style="display:none;mso-hide:all"')}
        ${excelCell(c.name)}
        ${excelCell(c.phone || "")}
        ${excelCell(bal)}
        ${excelCell(status)}
        ${excelCell(Number(c.totalBilled || 0))}
        ${excelCell(Number(c.totalPaid || 0))}
      </tr>`;
  }).join("");

  const html = `<!doctype html>
<html dir="rtl" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Tahoma, Arial, sans-serif; direction: rtl; }
      th, td { border: 1px solid #999; padding: 6px 10px; text-align: right; vertical-align: middle; }
      th { background: #e8f4f2; font-weight: 700; }
    </style>
  </head>
  <body>
    <table>
      <thead>
        <tr>
          <th data-field="customer-payload" style="display:none;mso-hide:all">بيانات</th>
          <th>اسم العميل</th>
          <th>رقم الجوال</th>
          <th>الرصيد</th>
          <th>الحالة</th>
          <th>إجمالي الفواتير</th>
          <th>إجمالي المدفوع</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;

  downloadExcelBlob(html, `cafe-pos-customers-${new Date().toISOString().slice(0, 10)}.xls`);
  showToast(`تم تصدير ${state.customers.length} عميل Excel.`);
}

function importCustomersExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const doc = new DOMParser().parseFromString(String(reader.result || ""), "text/html");
      const payloadCells = Array.from(doc.querySelectorAll('td[data-field="customer-payload"]'));
      if (!payloadCells.length) {
        showToast("ملف Excel غير صحيح أو ليس من تصدير العملاء.");
        return;
      }

      let added = 0;
      let updated = 0;

      payloadCells.forEach((cell) => {
        let data;
        try { data = JSON.parse(cell.textContent.trim()); } catch { return; }
        if (!data || !data.name) return;

        const name = String(data.name).trim();
        const phone = String(data.phone || "").trim();
        const balance = Number(data.balance || 0);
        const totalBilled = Number(data.totalBilled || 0);
        const totalPaid = Number(data.totalPaid || 0);

        let existing = data.id ? state.customers.find((c) => c.id === data.id) : null;
        if (!existing) existing = state.customers.find((c) => c.name.trim() === name);

        if (existing) {
          existing.name = name;
          if (phone) existing.phone = phone;
          existing.balance = balance;
          existing.totalBilled = totalBilled;
          existing.totalPaid = totalPaid;
          existing.updatedAt = new Date().toISOString();
          updated += 1;
        } else {
          state.customers.push({
            id: data.id || uid("customer"),
            name,
            phone,
            balance,
            totalBilled,
            totalPaid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          added += 1;
        }
      });

      rebuildCustomerAccountsFromInvoices(state);
      auditAction("customers.import", { added, updated, fileName: file.name || "" });
      showToast(`تم استيراد ${added} عميل جديد${updated ? ` وتحديث ${updated}` : ""}.`);
      saveState();
      render();
    } catch (error) {
      console.warn("Could not import customers Excel", error);
      showToast("حدث خطأ أثناء قراءة الملف.");
    } finally {
      els.customerExcelImportInput.value = "";
    }
  };
  reader.readAsText(file);
}

function exportInvoicesExcel() {
  const exportRows = filteredInvoicesForView();
  if (!exportRows.length) {
    showToast("لا توجد فواتير مطابقة للتصدير.");
    return;
  }

  const rows = exportRows.map((invoice) => {
    const payload = invoiceExcelPayload(invoice);
    const typeText = payload.type === "payment" ? "دفعة حساب" : payload.type === "payout" ? "دفع للعميل" : "فاتورة بيع";
    const payments = payload.payments || {};
    return `
      <tr>
        ${excelCell(JSON.stringify(payload), 'data-field="payload" style="display:none;mso-hide:all"')}
        ${excelCell(payload.number)}
        ${excelCell(payload.createdAt)}
        ${excelCell(typeText)}
        ${excelCell(payload.customerName)}
        ${excelCell(payload.tableLabel || "-")}
        ${excelCell(invoiceItemsExcelText(payload), 'style="white-space:pre-wrap"')}
        ${excelCell(payload.subtotal)}
        ${excelCell(payload.discount)}
        ${excelCell(payload.total)}
        ${excelCell(payload.paid)}
        ${excelCell(payload.received)}
        ${excelCell(payload.changeReturned)}
        ${excelCell(payload.delta)}
        ${excelCell(statusText(payload.status))}
        ${excelCell(Number(payments.cash || 0))}
        ${excelCell(Number(payments.bank || 0))}
        ${excelCell(Number(payments.wallet || 0))}
        ${excelCell(payload.note)}
      </tr>
    `;
  }).join("");

  const html = `<!doctype html>
<html dir="rtl" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Tahoma, Arial, sans-serif; direction: rtl; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: right; vertical-align: top; }
      th { background: #efefef; font-weight: 700; }
    </style>
  </head>
  <body>
    <table>
      <thead>
        <tr>
          <th data-field="payload" style="display:none;mso-hide:all">بيانات داخلية</th>
          <th>رقم الفاتورة</th>
          <th>التاريخ</th>
          <th>النوع</th>
          <th>العميل</th>
          <th>الطاولة</th>
          <th>المشتريات</th>
          <th>الإجمالي قبل الخصم</th>
          <th>الخصم</th>
          <th>الصافي</th>
          <th>المدفوع</th>
          <th>المستلم قبل الراجع</th>
          <th>الراجع للعميل</th>
          <th>المتبقي / الرصيد</th>
          <th>الحالة</th>
          <th>كاش</th>
          <th>تطبيق بنك</th>
          <th>محفظة</th>
          <th>ملاحظة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cafe-pos-invoices-${new Date().toISOString().slice(0, 10)}.xls`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
  showToast(`تم تصدير ${exportRows.length} فاتورة Excel.`);
}

function invoiceImportKey(invoice) {
  return `${invoice.number || ""}__${invoice.createdAt || ""}`;
}

function normalizeImportedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeImportedPayments(rawPayments, paid) {
  const payments = {
    cash: Number(rawPayments?.cash || 0),
    bank: Number(rawPayments?.bank || 0),
    wallet: Number(rawPayments?.wallet || 0)
  };

  if (!paymentTotal(payments) && paid > 0) {
    payments.cash = paid;
  }

  return payments;
}

function normalizeImportedInvoice(rawInvoice) {
  if (!rawInvoice || typeof rawInvoice !== "object") return null;

  const type = ["payment", "payout"].includes(rawInvoice.type) ? rawInvoice.type : "sale";
  const items = Array.isArray(rawInvoice.items)
    ? rawInvoice.items.map((item) => ({
      id: item.id || uid("item"),
      name: String(item.name || "").trim(),
      price: Number(item.price || 0),
      cost: Number(item.cost || 0),
      qty: Math.max(Number(item.qty || 1), 1),
      temporary: Boolean(item.temporary),
      stockUsage: Array.isArray(item.stockUsage) ? mergeStockUsage(item.stockUsage) : []
    })).filter((item) => item.name)
    : [];
  const subtotal = Number(rawInvoice.subtotal ?? items.reduce((sum, item) => sum + item.price * item.qty, 0));
  const discount = Math.max(Number(rawInvoice.discount || 0), 0);
  const total = Math.max(Number(rawInvoice.total ?? Math.max(subtotal - discount, 0)), 0);
  const paid = Math.max(Number(rawInvoice.paid || 0), 0);
  const changeReturned = Math.max(Number(rawInvoice.changeReturned || 0), 0);
  const received = Math.max(Number(rawInvoice.received ?? (paid + changeReturned)), 0);
  const delta = Number(rawInvoice.delta ?? (type === "payment" ? -(paid + discount) : type === "payout" ? paid : total - paid));
  const status = ["paid", "debt", "credit", "payment", "payout"].includes(rawInvoice.status)
    ? rawInvoice.status
    : invoiceStatus(delta, type);

  return {
    id: rawInvoice.id || uid(type === "payment" ? "payment" : type === "payout" ? "payout" : "invoice"),
    number: String(rawInvoice.number || nextInvoiceNumber()).trim(),
    type,
    tableId: rawInvoice.tableId || null,
    tableLabel: String(rawInvoice.tableLabel || "-").trim(),
    customerId: rawInvoice.customerId || null,
    customerName: String(rawInvoice.customerName || "زبون نقدي").trim(),
    items,
    subtotal,
    discount,
    total,
    paid,
    received,
    changeReturned,
    delta,
    payments: normalizeImportedPayments(rawInvoice.payments, paid),
    status,
    note: String(rawInvoice.note || "").trim(),
    createdAt: normalizeImportedDate(rawInvoice.createdAt)
  };
}

function isCashCustomerName(name) {
  const cleaned = String(name || "").trim();
  return !cleaned || cleaned === "زبون نقدي";
}

function applyImportedInvoiceToCustomer(invoice) {
  if (isCashCustomerName(invoice.customerName) && !invoice.customerId) return;

  let customer = invoice.customerId ? getCustomer(invoice.customerId) : null;
  if (!customer) {
    customer = findCustomerByName(invoice.customerName) || upsertCustomer(invoice.customerName);
  }
  if (!customer) return;

  invoice.customerId = customer.id;
  invoice.customerName = customer.name;
  customer.totalBilled = Number(customer.totalBilled || 0) + Number(invoice.total || 0);
  customer.totalPaid = invoice.type === "payout"
    ? Math.max(0, Number(customer.totalPaid || 0) - Number(invoice.paid || 0))
    : Number(customer.totalPaid || 0) + Number(invoice.paid || 0);
  customer.balance = Number(customer.balance || 0) + Number(invoice.delta || 0);
  customer.updatedAt = new Date().toISOString();
}

function parseInvoicesExcel(text) {
  const documentNode = new DOMParser().parseFromString(text, "text/html");
  const payloadCells = Array.from(documentNode.querySelectorAll('td[data-field="payload"]'));
  return payloadCells
    .map((cell) => {
      try {
        return JSON.parse(cell.textContent.trim());
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function importInvoicesExcel(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedRows = parseInvoicesExcel(String(reader.result || ""));
      if (!importedRows.length) {
        showToast("ملف Excel لا يحتوي فواتير صادرة من البرنامج.");
        return;
      }

      const existingKeys = new Set(state.invoices.map(invoiceImportKey));
      let importedCount = 0;
      let skippedCount = 0;

      importedRows.forEach((row) => {
        const invoice = normalizeImportedInvoice(row);
        if (!invoice) {
          skippedCount += 1;
          return;
        }

        const key = invoiceImportKey(invoice);
        if (existingKeys.has(key)) {
          skippedCount += 1;
          return;
        }

        applyImportedInvoiceToCustomer(invoice);
        if (invoice.type === "sale") reduceStockForSoldItems(invoice.items);
        state.invoices.unshift(invoice);
        existingKeys.add(key);
        importedCount += 1;
      });

      state.invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      rebuildCustomerAccountsFromInvoices(state);
      lastClosedInvoice = state.invoices[0] || null;
      selectedCustomerId = selectedCustomerId && getCustomer(selectedCustomerId) ? selectedCustomerId : state.customers[0]?.id || null;
      auditAction("invoices.import", { imported: importedCount, skipped: skippedCount, fileName: file.name || "" });
      showToast(importedCount ? `تم استيراد ${importedCount} فاتورة${skippedCount ? ` وتخطي ${skippedCount} موجودة.` : "."}` : "كل الفواتير موجودة مسبقاً.");
      render();
    } catch (error) {
      console.warn("Could not import invoices Excel", error);
      showToast("ملف Excel غير صحيح أو ليس من تصدير البرنامج.");
    } finally {
      els.invoiceExcelImportInput.value = "";
    }
  };
  reader.readAsText(file);
}
