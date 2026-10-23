// ═══ دفتر المقهى ═══ 02-domain.js — الحسابات المشتركة: نقود، طلبات، عملاء، عمال، تقارير، مخزون
// (مقسوم من app.js — الأسطر 515-1455)

// مُنسّقات Intl تُنشأ مرة واحدة (إنشاؤها لكل نداء كان يثقّل كل الشاشات).
const _moneyFormatter = new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const _qtyFormatterWhole = new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const _qtyFormatterFraction = new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const _dateFormatter = new Intl.DateTimeFormat("ar", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: true
});
const _dateOnlyFormatter = new Intl.DateTimeFormat("ar", { year: "numeric", month: "2-digit", day: "2-digit" });
const _timeOnlyFormatter = new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit", hour12: true });

function money(value) {
  return `₪${_moneyFormatter.format(Number(value || 0))}`;
}

function inputNumberValue(value) {
  const number = Number(value || 0);
  return number ? String(number) : "";
}

function getLastPaymentMethod() {
  return paymentMethods.includes(state.lastPaymentMethod) ? state.lastPaymentMethod : "cash";
}

function setLastPaymentMethod(method) {
  if (!paymentMethods.includes(method)) return;
  state.lastPaymentMethod = method;
  if (els.settlementMethodInput) els.settlementMethodInput.value = method;
  if (els.purchaseMethodInput) els.purchaseMethodInput.value = method;
  if (els.expenseMethodInput) els.expenseMethodInput.value = method;
  if (els.workerTransactionMethodInput) els.workerTransactionMethodInput.value = method;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultTableLabel(tableId) {
  return `طاولة ${tableId}`;
}

function getTableCount() {
  state.tableCount = Math.max(1, Math.floor(Number(state.tableCount || DEFAULT_TABLE_COUNT)));
  return state.tableCount;
}

function getTableLabel(tableId = state.selectedTable) {
  return state.tableNames?.[String(tableId)]?.trim() || defaultTableLabel(tableId);
}

function normalizeTableLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function tableLabelConflict(tableId, value) {
  const targetId = Number(tableId);
  const labelKey = normalizeTableLabel(value || defaultTableLabel(tableId));
  if (!labelKey) return null;
  const count = getTableCount();
  for (let id = 1; id <= count; id += 1) {
    if (Number(id) === targetId) continue;
    if (normalizeTableLabel(getTableLabel(id)) === labelKey) return id;
  }
  return null;
}

function setTableLabel(tableId, value, options = {}) {
  const key = String(tableId);
  const label = String(value || "").trim();
  state.tableNames = state.tableNames || {};
  const finalLabel = label || defaultTableLabel(tableId);
  const conflictId = tableLabelConflict(tableId, finalLabel);
  if (conflictId) {
    if (options.notify !== false && typeof showToast === "function") {
      showToast(`اسم الطاولة "${finalLabel}" مستخدم على ${getTableLabel(conflictId)}.`);
    }
    return false;
  }

  if (!label || label === defaultTableLabel(tableId)) {
    delete state.tableNames[key];
  } else {
    state.tableNames[key] = label;
  }
  return true;
}

function getOpenOrder(tableId = state.selectedTable) {
  const key = String(tableId);
  if (!state.openOrders[key]) {
    state.openOrders[key] = {
      id: uid("order"),
      tableId,
      customerId: null,
      customerName: "",
      customerPhone: "",
      items: [],
      discount: 0,
      paymentMethod: getLastPaymentMethod(),
      payments: { cash: 0, bank: 0, wallet: 0 },
      changeReturned: 0,
      note: "",
      saleDate: state.lastPosSaleDate || todayDateInputValue(),
      createdAt: new Date().toISOString()
    };
  }
  return state.openOrders[key];
}

function getExistingOrder(tableId = state.selectedTable) {
  return state.openOrders[String(tableId)] || null;
}

function getCustomer(id) {
  return state.customers.find((customer) => customer.id === id) || null;
}

function getCustomerItemPrice(customerId, itemId) {
  if (!customerId || !itemId) return null;
  const entry = (state.customerPrices || []).find(
    (cp) => cp.customerId === customerId && cp.itemId === itemId
  );
  return entry ? Number(entry.price) : null;
}

function setCustomerItemPrice(customerId, itemId, price) {
  state.customerPrices = state.customerPrices || [];
  const idx = state.customerPrices.findIndex(
    (cp) => cp.customerId === customerId && cp.itemId === itemId
  );
  if (idx >= 0) {
    state.customerPrices[idx].price = price;
  } else {
    state.customerPrices.push({ customerId, itemId, price });
  }
}

function removeCustomerItemPrice(customerId, itemId) {
  state.customerPrices = (state.customerPrices || []).filter(
    (cp) => !(cp.customerId === customerId && cp.itemId === itemId)
  );
}

function customerPricesFor(customerId) {
  return (state.customerPrices || []).filter((cp) => cp.customerId === customerId);
}

function findCustomerByName(name) {
  const cleanedName = String(name || "").trim().toLowerCase();
  if (!cleanedName) return null;
  return state.customers.find((customer) => customer.name.trim().toLowerCase() === cleanedName) || null;
}

function normalizeWorker(worker = {}) {
  const name = String(worker.name || worker.workerName || worker.title || "").trim();
  let salary = Math.max(Number(worker.salary || worker.monthlySalary || 0), 0);
  // سجل تغييرات الراتب (رفع الراتب المؤرّخ): كل عنصر { from, salary } — أحدث تاريخ ساري = الراتب الحالي
  const histMap = new Map();
  (Array.isArray(worker.salaryHistory) ? worker.salaryHistory : []).forEach((h) => {
    const from = String(h.from || h.date || "").slice(0, 10);
    if (!from) return;
    histMap.set(from, Math.max(Number(h.salary || 0), 0));
  });
  const salaryHistory = [...histMap.entries()]
    .map(([from, sal]) => ({ from, salary: sal }))
    .sort((a, b) => a.from.localeCompare(b.from));
  if (salaryHistory.length) salary = salaryHistory[salaryHistory.length - 1].salary;
  return {
    id: worker.id || uid("worker-profile"),
    name: name || "عامل",
    phone: String(worker.phone || "").trim(),
    salary,
    salaryHistory,
    openingDue: Number(worker.openingDue || 0),
    openingAccount: worker.openingAccount && typeof worker.openingAccount === "object"
      ? {
        due: Number(worker.openingAccount.due || worker.openingDue || 0),
        salary: Number(worker.openingAccount.salary || 0),
        advances: Number(worker.openingAccount.advances || 0),
        salaryPaid: Number(worker.openingAccount.salaryPaid || 0),
        paymentIn: Number(worker.openingAccount.paymentIn || 0),
        salaryDeductions: Number(worker.openingAccount.salaryDeductions || 0),
        sourceWorkspace: String(worker.openingAccount.sourceWorkspace || "").trim(),
        transferredAt: String(worker.openingAccount.transferredAt || "")
      }
      : null,
    periodFrom: typeof worker.periodFrom === "string" ? worker.periodFrom : "",
    periodTo: typeof worker.periodTo === "string" ? worker.periodTo.slice(0, 10) : "",
    createdAt: normalizeImportedDate(worker.createdAt || new Date().toISOString()),
    updatedAt: normalizeImportedDate(worker.updatedAt || worker.createdAt || new Date().toISOString())
  };
}

function reconcileWorkers(workers = [], entries = [], transactions = [], leaves = []) {
  const normalized = [];
  const byName = new Map();
  const byId = new Map();

  function attachSource(source) {
    if (source.workerDeleted) return;
    const workerName = String(source.workerName || "").trim();
    if (!workerName) return;

    let worker = source.workerId ? byId.get(source.workerId) : null;
    if (!worker) worker = byName.get(workerName.toLowerCase());
    if (!worker) {
      worker = normalizeWorker({
        name: workerName,
        createdAt: source.createdAt || new Date().toISOString()
      });
      normalized.push(worker);
      byName.set(worker.name.trim().toLowerCase(), worker);
      byId.set(worker.id, worker);
    }

    source.workerId = worker.id;
    source.workerName = worker.name;
  }

  workers.map(normalizeWorker).forEach((worker) => {
    const key = worker.name.trim().toLowerCase();
    if (byName.has(key)) return;
    normalized.push(worker);
    byName.set(key, worker);
    byId.set(worker.id, worker);
  });

  entries.forEach(attachSource);
  transactions.forEach(attachSource);
  leaves.forEach(attachSource);

  return normalized;
}

function getWorker(id) {
  return (state.workers || []).find((worker) => worker.id === id) || null;
}

function findWorkerByName(name) {
  const cleanedName = String(name || "").trim().toLowerCase();
  if (!cleanedName) return null;
  return (state.workers || []).find((worker) => worker.name.trim().toLowerCase() === cleanedName) || null;
}

function upsertWorker(name, extra = {}) {
  const cleanedName = String(name || "").trim();
  if (!cleanedName) return null;

  state.workers = Array.isArray(state.workers) ? state.workers : [];
  const existing = findWorkerByName(cleanedName);
  if (existing) {
    Object.assign(existing, extra, { updatedAt: new Date().toISOString() });
    return existing;
  }

  const worker = normalizeWorker({
    name: cleanedName,
    phone: extra.phone || "",
    salary: extra.salary || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  state.workers.push(worker);
  return worker;
}

function workerEntriesFor(worker) {
  if (!worker) return [];
  const workerName = worker.name.trim().toLowerCase();
  return (state.workerConsumptions || [])
    .filter((entry) => !entry.workerDeleted)
    .filter((entry) => {
      return entry.workerId === worker.id || (!entry.workerId && String(entry.workerName || "").trim().toLowerCase() === workerName);
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function workerTransactionsFor(worker) {
  if (!worker) return [];
  const workerName = worker.name.trim().toLowerCase();
  return (state.workerTransactions || [])
    .filter((entry) => !entry.workerDeleted)
    .filter((entry) => {
      return entry.workerId === worker.id || (!entry.workerId && String(entry.workerName || "").trim().toLowerCase() === workerName);
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function workerTransactionTypeLabel(type) {
  return workerTransactionTypeLabels[type] || workerTransactionTypeLabels[WORKER_ADVANCE_TYPE];
}

function workerTransactionIsInflow(entry) {
  return entry?.type === WORKER_PAYMENT_IN_TYPE || entry?.type === WORKER_CAFE_FUNDING_TYPE;
}

function workerTransactionTotals(transactions = []) {
  return transactions.reduce((totals, entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.type === WORKER_SALARY_PAYMENT_TYPE) totals.salaryPaid += amount;
    else if (entry.type === WORKER_PAYMENT_IN_TYPE) totals.paymentIn += amount;
    else if (entry.type === WORKER_ADVANCE_TYPE) totals.advances += amount;
    return totals;
  }, { advances: 0, salaryPaid: 0, paymentIn: 0 });
}

// عدد أيام المدى (يقبل {from,to} أو {minDate,maxDate})
function periodDaysForRange(range) {
  const from = range?.minDate || range?.from;
  const to = range?.maxDate || range?.to;
  if (!from || !to) return 30;
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
}

function dayBeforeIso(iso) {
  // حساب بتوقيت UTC حتى ما يتغير اليوم حسب المنطقة الزمنية (فلسطين UTC+2/+3)
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86400000).toISOString().slice(0, 10);
}

// الراتب الشهري الساري بتاريخ معيّن (يدعم رفع الراتب المؤرّخ عبر salaryHistory)
function workerSalaryRateOn(worker, dateIso) {
  const history = (worker && Array.isArray(worker.salaryHistory)) ? worker.salaryHistory : [];
  if (!history.length) return Number(worker?.salary || 0);
  const day = String(dateIso || "").slice(0, 10);
  let rate = history[0].salary; // قبل أول تغيير مسجّل: نستخدم أقدم راتب
  for (const h of history) {
    if (h.from <= day) rate = h.salary; else break;
  }
  return Number(rate || 0);
}

// إجمالي الراتب المستحق لمدى، مع مراعاة رفع الراتب المؤرّخ وأيام الإجازة.
// = مجموع، لكل مقطع براتب ثابت: (أيام المقطع القابلة للدفع ÷ 30) × راتب المقطع الشهري.
// غير مقرّب — التقريب مرة وحدة عند الاستخدام (نفس نتيجة الحساب القديم لو ما في رفع راتب).
function workerGrossSalaryForRange(worker, rangeFrom, rangeTo) {
  if (!rangeFrom || !rangeTo || rangeTo < rangeFrom) return 0;
  const history = (worker && Array.isArray(worker.salaryHistory) && worker.salaryHistory.length)
    ? worker.salaryHistory
    : [{ from: rangeFrom, salary: Number(worker?.salary || 0) }];
  const boundaries = [rangeFrom];
  history.forEach((h) => {
    if (h.from > rangeFrom && h.from <= rangeTo && !boundaries.includes(h.from)) boundaries.push(h.from);
  });
  boundaries.sort((a, b) => a.localeCompare(b));
  let gross = 0;
  for (let i = 0; i < boundaries.length; i++) {
    const segStart = boundaries[i];
    const segEnd = (i + 1 < boundaries.length) ? dayBeforeIso(boundaries[i + 1]) : rangeTo;
    if (segEnd < segStart) continue;
    const segDays = Math.round((new Date(segEnd) - new Date(segStart)) / 86400000) + 1;
    const segLeave = workerLeaveDaysInRange(worker, { minDate: segStart, maxDate: segEnd });
    const segPayable = Math.max(segDays - segLeave, 0);
    gross += (segPayable / 30) * workerSalaryRateOn(worker, segStart);
  }
  return gross;
}

// رفع/تعديل راتب العامل ساري من تاريخ معيّن (يحفظ الراتب القديم بالسجل عشان الأيام السابقة تظل بسعرها)
function applyWorkerSalaryChange(worker, newSalary, effectiveDate) {
  if (!worker) return;
  worker.salaryHistory = Array.isArray(worker.salaryHistory) ? worker.salaryHistory : [];
  const effDate = String(effectiveDate || "").slice(0, 10) || todayDateInputValue();
  if (!worker.salaryHistory.length) {
    const baseFrom = worker.periodFrom || String(worker.createdAt || new Date().toISOString()).slice(0, 10);
    const seedFrom = baseFrom < effDate ? baseFrom : dayBeforeIso(effDate);
    worker.salaryHistory.push({ from: seedFrom, salary: Number(worker.salary || 0) });
  }
  worker.salaryHistory = worker.salaryHistory.filter((h) => h.from !== effDate);
  worker.salaryHistory.push({ from: effDate, salary: Math.max(Number(newSalary || 0), 0) });
  worker.salaryHistory.sort((a, b) => a.from.localeCompare(b.from));
  worker.salary = workerSalaryRateOn(worker, todayDateInputValue());
}

// العامل خلّص شغل: إله تاريخ نهاية وهو اليوم أو قبله
function workerIsFinished(worker) {
  return Boolean(worker && worker.periodTo && worker.periodTo <= todayDateInputValue());
}

// المصدر الموحّد لحساب العامل لأي مدى — تستخدمه صفحة العمال وإغلاق الفترة معاً
// الراتب نسبي حسب أيام المدى: (الأيام ÷ 30) × الراتب الشهري
function workerAccountForRange(worker, range) {
  const r = { minDate: range?.minDate || range?.from, maxDate: range?.maxDate || range?.to };
  const consumptions = workerEntriesFor(worker).filter((entry) => dateMatchesRange(entry, r));
  const transactions = workerTransactionsFor(worker).filter((entry) => dateMatchesRange(entry, r));
  const drinkStats = workerConsumptionTotals(consumptions);
  const transactionStats = workerTransactionTotals(transactions);
  const monthlySalary = Number(worker?.salary || 0);
  const periodDays = periodDaysForRange(r);
  // أيام الإجازة (بدون راتب) اللي وقعت جوا الفترة تُطرح قبل حساب الراتب النسبي
  const leaveDays = Math.min(workerLeaveDaysInRange(worker, r), periodDays);
  const payableDays = Math.max(periodDays - leaveDays, 0);
  // نسبي حسب الأيام، ويدعم رفع الراتب المؤرّخ (كل مقطع بسعره)
  const salary = Math.round(workerGrossSalaryForRange(worker, r.minDate, r.maxDate));
  // يُخصم من الراتب: السلف + المشروبات نوع "خصم من الراتب" فقط
  // (مشروبات "سعر عامل" دفعها كاش، فما تُخصم من الراتب — كانت تُحسب مرتين)
  const deductions = transactionStats.advances + drinkStats.salaryDeductions;
  const openingDue = Number(worker?.openingDue || 0);
  const due = openingDue + salary + transactionStats.paymentIn - deductions - transactionStats.salaryPaid;
  return {
    range: r,
    periodDays,
    leaveDays,
    payableDays,
    monthlySalary,
    salary,
    consumptions,
    transactions,
    drinkStats,
    advances: transactionStats.advances,
    salaryPaid: transactionStats.salaryPaid,
    paymentIn: transactionStats.paymentIn,
    openingDue,
    deductions,
    due
  };
}

// مدى العامل: بدايته الخاصة (إن وُجدت) ← وإلا بداية الفترة الحالية (بعد آخر إغلاق).
// النهاية = تاريخ نهاية العمل (لو العامل خلّص) وإلا لليوم. لا نحسب راتب بعد ما يخلص.
function workerRangeFor(worker) {
  const from = (worker && worker.periodFrom) || currentPeriodRange().minDate;
  const today = todayDateInputValue();
  const workspaceEnd = String(state.workspaceEndedAt || "").slice(0, 10);
  let to = workspaceEnd && workspaceEnd < today ? workspaceEnd : today;
  if (worker && worker.periodTo && worker.periodTo < to) to = worker.periodTo;
  if (to < from) to = from;
  return { minDate: from, maxDate: to };
}

function workerMonthlyAccount(worker) {
  return workerAccountForRange(worker, workerRangeFor(worker));
}

function workerBalanceText(value) {
  if (value > 0.001) return `له ${money(value)}`;
  if (value < -0.001) return `عليه ${money(Math.abs(value))}`;
  return "حسابه صافي";
}

function getOrderCustomerName(order) {
  if (!order) return "";
  return order.customerName?.trim() || getCustomer(order.customerId)?.name || "";
}

function manualDebtAmount(order) {
  if (order.items.length) return 0;
  const amount = paymentTotal(order.payments);
  const hasCustomer = Boolean(order.customerId || order.customerName?.trim());
  return hasCustomer && amount > 0 ? amount : 0;
}

function upsertCustomer(name, extra = {}) {
  const cleanedName = String(name || "").trim();
  if (!cleanedName) return null;

  const existing = state.customers.find((customer) => customer.name.trim() === cleanedName);
  if (existing) {
    Object.assign(existing, extra, { updatedAt: new Date().toISOString() });
    return existing;
  }

  const customer = {
    id: uid("customer"),
    name: cleanedName,
    phone: extra.phone || "",
    balance: 0,
    totalBilled: 0,
    totalPaid: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.customers.unshift(customer);
  return customer;
}

function orderMath(order) {
  const manualDebt = manualDebtAmount(order);
  if (manualDebt > 0) {
    return {
      subtotal: manualDebt,
      discount: 0,
      total: manualDebt,
      cost: 0,
      profit: manualDebt,
      paid: 0,
      rawPaid: manualDebt,
      changeReturned: 0,
      delta: manualDebt,
      manualDebt: true
    };
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const discount = Math.min(Number(order.discount || 0), subtotal);
  const total = Math.max(subtotal - discount, 0);
  const cost = order.items.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.qty || 0), 0);
  const profit = total - cost;
  const rawPaid = paymentTotal(order.payments);
  const changeReturned = Math.min(Math.max(Number(order.changeReturned || 0), 0), rawPaid);
  const paid = Math.max(rawPaid - changeReturned, 0);
  const delta = total - paid;
  return { subtotal, discount, total, cost, profit, paid, rawPaid, changeReturned, delta };
}

function paymentTotal(payments = {}) {
  return Number(payments.cash || 0) + Number(payments.bank || 0) + Number(payments.wallet || 0);
}

function paymentsAfterChangeReturned(payments = {}, changeReturned = 0, preferredMethod = "cash") {
  const next = {
    cash: Number(payments.cash || 0),
    bank: Number(payments.bank || 0),
    wallet: Number(payments.wallet || 0)
  };
  let remaining = Math.max(Number(changeReturned || 0), 0);
  const methods = [preferredMethod, ...paymentMethods.filter((method) => method !== preferredMethod)]
    .filter((method) => paymentMethods.includes(method));

  methods.forEach((method) => {
    if (remaining <= 0) return;
    const take = Math.min(next[method] || 0, remaining);
    next[method] = Math.max((next[method] || 0) - take, 0);
    remaining -= take;
  });

  return next;
}

function paymentMethodFromPayments(payments = {}) {
  return paymentMethods.find((method) => Number(payments[method] || 0) > 0) || getLastPaymentMethod();
}

function normalizedPaymentMap(payments = {}) {
  return {
    cash: Math.max(Number(payments.cash || 0), 0),
    bank: Math.max(Number(payments.bank || 0), 0),
    wallet: Math.max(Number(payments.wallet || 0), 0)
  };
}

function invoiceCashboxPayments(invoice = {}) {
  if (typeof invoiceIsCancelled === "function" && invoiceIsCancelled(invoice)) return { cash: 0, bank: 0, wallet: 0 };

  const payments = normalizedPaymentMap(invoice.payments || {});
  const byMethod = paymentTotal(payments);
  const paid = Math.max(Number(invoice.paid ?? invoice.amount ?? 0), 0);
  const changeReturned = Math.max(Number(invoice.changeReturned || 0), 0);
  const received = Math.max(Number(invoice.received || 0), 0);

  if (changeReturned > 0.001 && byMethod > paid + 0.001) {
    const expectedReceived = received > 0.001 ? received : paid + changeReturned;
    const looksLikeGrossPayment = Math.abs(byMethod - expectedReceived) <= 0.01
      || Math.abs(byMethod - (paid + changeReturned)) <= 0.01;
    if (looksLikeGrossPayment) {
      return paymentsAfterChangeReturned(payments, changeReturned, paymentMethodFromPayments(payments));
    }
  }

  if (byMethod <= 0.001 && paid > 0.001) return { cash: paid, bank: 0, wallet: 0 };
  return payments;
}

function invoicePaymentText(invoice) {
  const payments = invoiceCashboxPayments(invoice);
  const paidMethods = paymentMethods.filter((method) => Number(payments[method] || 0) > 0);
  const changeReturned = Number(invoice?.changeReturned || 0);
  const changeText = changeReturned > 0 ? ` | راجع ${money(changeReturned)}` : "";
  if (!paidMethods.length) return `بدون دفع${changeText}`;
  if (paidMethods.length === 1) return `${paymentLabels[paidMethods[0]] || paidMethods[0]}${changeText}`;
  return `${paidMethods.map((method) => `${paymentLabels[method] || method}: ${money(payments[method])}`).join("، ")}${changeText}`;
}

// تصنيف طريقة دفع الفاتورة لتمييزها بصريًا: بدون دفع / كاش / بنك / محفظة / متعددة
function invoicePaymentCategory(invoice = {}) {
  const payments = invoiceCashboxPayments(invoice);
  const paidMethods = paymentMethods.filter((method) => Number(payments[method] || 0) > 0.001);
  if (!paidMethods.length) return "none";
  if (paidMethods.length > 1) return "mixed";
  return paidMethods[0];
}

function invoiceLineGross(item) {
  return Number(item.price || 0) * Number(item.qty || 0);
}

function invoiceLineNet(invoice, item) {
  const gross = invoiceLineGross(item);
  const subtotal = Number(invoice.subtotal || 0) || (invoice.items || []).reduce((sum, line) => sum + invoiceLineGross(line), 0);
  const discount = Math.min(Number(invoice.discount || 0), subtotal);
  const discountShare = subtotal > 0 && discount > 0 ? discount * (gross / subtotal) : 0;
  return Math.max(gross - discountShare, 0);
}

function invoiceItemProfit(invoice) {
  if (invoice.type !== "sale") return 0;
  return (invoice.items || []).reduce((sum, item) => {
    return sum + invoiceLineNet(invoice, item) - Number(item.cost || 0) * Number(item.qty || 0);
  }, 0);
}

// نسبة هامش الربح (ربح/مبيعات) لعميل معيّن من فواتير بيعه الفعلية؛ لو ما عندو مبيعات (دين يدوي مثلاً) بترجع متوسط هامش المحل كله كتقدير.
function salesMarginRatio(invoices = []) {
  const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const cost = invoices.reduce((sum, invoice) => {
    return sum + (invoice.items || []).reduce((lineSum, item) => lineSum + Number(item.cost || 0) * Number(item.qty || 0), 0);
  }, 0);
  return revenue > 0.001 ? Math.max(Math.min((revenue - cost) / revenue, 1), 0) : null;
}

function customerMarginRatio(customer) {
  const customerSales = state.invoices.filter((invoice) => invoice.customerId === customer?.id && invoice.type === "sale" && !invoiceIsCancelled(invoice));
  const customerRatio = salesMarginRatio(customerSales);
  if (customerRatio !== null) return customerRatio;
  const shopSales = state.invoices.filter((invoice) => invoice.type === "sale" && !invoiceIsCancelled(invoice));
  return salesMarginRatio(shopSales) ?? 0;
}

function cloneInvoiceItem(item) {
  return {
    ...item,
    stockUsage: Array.isArray(item.stockUsage) ? item.stockUsage.map((line) => ({ ...line })) : []
  };
}

function cloneInvoice(invoice) {
  return {
    ...invoice,
    items: (invoice.items || []).map(cloneInvoiceItem),
    payments: { ...(invoice.payments || {}) }
  };
}

function invoiceDateInputValue(invoice) {
  return String(invoice.createdAt || new Date().toISOString()).slice(0, 10);
}

function invoiceDateFromInput(dateValue) {
  return dateValue ? `${dateValue}T12:00:00.000Z` : new Date().toISOString();
}

function editedInvoiceDateFromInput(dateValue, originalIso = "") {
  if (!dateValue) return originalIso || new Date().toISOString();
  const originalDate = String(originalIso || "").slice(0, 10);
  if (originalDate === dateValue) return originalIso || invoiceDateFromInput(dateValue);
  const timePart = String(originalIso || "").includes("T")
    ? String(originalIso).slice(10)
    : "T12:00:00.000Z";
  return `${dateValue}${timePart}`;
}

function selectedMenuStatsRange() {
  const dateFrom = els.menuStatsDateFromInput.value;
  const dateTo = els.menuStatsDateToInput.value;
  return {
    minDate: dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom,
    maxDate: dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo
  };
}

// وقت محلي (زي المعروض بالفواتير) من تاريخ ISO مخزّن، بصيغة YYYY-MM-DDTHH:MM
function localDateTimeKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// حد أدنى/أقصى قد يكون تاريخ فقط (YYYY-MM-DD، مقارنة يوم كامل زي المعتاد) أو تاريخ+وقت (YYYY-MM-DDTHH:MM، مقارنة بالوقت المحلي دقيقة بدقيقة)
function timestampWithinBound(timestamp, bound, isUpperBound) {
  if (!bound) return true;
  const compareValue = bound.length > 10 ? localDateTimeKey(timestamp) : timestamp.slice(0, 10);
  return isUpperBound ? compareValue <= bound : compareValue >= bound;
}

function invoiceMatchesDateRange(invoice, range) {
  const invoiceDate = String(invoice.createdAt || "");
  return timestampWithinBound(invoiceDate, range.minDate, false) && timestampWithinBound(invoiceDate, range.maxDate, true);
}

function menuItemProfitStats(itemId, range = { minDate: "", maxDate: "" }) {
  return state.invoices.reduce((stats, invoice) => {
    if (invoice.type !== "sale" || invoiceIsCancelled(invoice)) return stats;
    if (!invoiceMatchesDateRange(invoice, range)) return stats;

    (invoice.items || []).forEach((item) => {
      if (item.id !== itemId) return;
      const qty = Number(item.qty || 0);
      const sales = invoiceLineNet(invoice, item);
      const cost = Number(item.cost || 0) * qty;
      stats.qty += qty;
      stats.sales += sales;
      stats.cost += cost;
      stats.profit += sales - cost;
    });

    return stats;
  }, { qty: 0, sales: 0, cost: 0, profit: 0 });
}

// كمية وتكلفة صنف معيّن استهلكه العمال بالفترة (بيع/خصم راتب/مجاني كلهم يُحسبون كمية استهلاك)
function menuItemWorkerConsumptionStats(itemId, range = { minDate: "", maxDate: "" }) {
  return (state.workerConsumptions || []).reduce((stats, entry) => {
    if (entry.itemId !== itemId) return stats;
    if (!dateMatchesRange(entry, range)) return stats;
    const qty = Number(entry.qty || 0);
    stats.qty += qty;
    stats.cost += Number(entry.cost || 0) * qty;
    return stats;
  }, { qty: 0, cost: 0 });
}

function menuProfitTotals(range = { minDate: "", maxDate: "" }, items = state.menu) {
  return items.reduce((totals, item) => {
    const stats = menuItemProfitStats(item.id, range);
    totals.qty += stats.qty;
    totals.sales += stats.sales;
    totals.cost += stats.cost;
    totals.profit += stats.profit;
    return totals;
  }, { qty: 0, sales: 0, cost: 0, profit: 0 });
}

function menuMatchesSearch(item, query) {
  if (!query) return true;
  const haystack = `${item.name || ""} ${item.category || ""} ${item.price || ""} ${item.cost || ""} ${item.operatingCost || ""} ${operatingCostLabels[item.operatingCostType] || ""} ${stockText(item)}`;
  return searchMatch(haystack, query);
}

function salePriceSummary(items = []) {
  const menuItems = items.filter(Boolean);
  if (!menuItems.length) return "غير مربوط";
  const prices = [...new Set(menuItems.map((item) => Number(item.price || 0)).filter(Number.isFinite))];
  if (prices.length === 1) return money(prices[0]);
  return "متعدد";
}

function customerTotals() {
  return state.customers.reduce((totals, customer) => {
    totals.debt += Math.max(Number(customer.balance || 0), 0);
    totals.credit += Math.max(-Number(customer.balance || 0), 0);
    return totals;
  }, { debt: 0, credit: 0 });
}

function reportingPeriodRange(mode, start = state.reportingStart) {
  if (!start?.localTime || mode === "all") return { minDate: "", maxDate: "" };
  if (mode === "current") return { minDate: start.localTime, maxDate: "" };
  // Report time bounds are inclusive to the minute; end history one minute earlier.
  const previous = new Date(start.localTime);
  previous.setMinutes(previous.getMinutes() - 1);
  return { minDate: "", maxDate: localDateTimeKey(previous.toISOString()) };
}

function selectedReportRange() {
  const dateFrom = els.reportDateFromInput.value;
  const dateTo = els.reportDateToInput.value;
  const timeFrom = els.reportTimeFromInput ? els.reportTimeFromInput.value : "";
  const timeTo = els.reportTimeToInput ? els.reportTimeToInput.value : "";
  const swapped = dateFrom && dateTo && dateFrom > dateTo;
  const minDate = swapped ? dateTo : dateFrom;
  const maxDate = swapped ? dateFrom : dateTo;
  const minTime = swapped ? timeTo : timeFrom;
  const maxTime = swapped ? timeFrom : timeTo;
  return {
    minDate: minDate && minTime ? `${minDate}T${minTime}` : minDate,
    maxDate: maxDate && maxTime ? `${maxDate}T${maxTime}` : maxDate
  };
}

function dateMatchesRange(entry, range) {
  const date = String(entry.createdAt || "");
  return timestampWithinBound(date, range.minDate, false) && timestampWithinBound(date, range.maxDate, true);
}

function storedPeriodMatchesRange(entry, range) {
  const minDay = String(range?.minDate || range?.from || "").slice(0, 10);
  const maxDay = String(range?.maxDate || range?.to || "").slice(0, 10);
  const from = String(entry?.periodFrom || entry?.closePeriodFrom || "").slice(0, 10);
  const to = String(entry?.periodTo || entry?.closePeriodTo || from).slice(0, 10);
  const closeId = String(range?.closeId || "");
  const entryCloseId = String(entry?.periodCloseId || entry?.closePeriodId || "");
  if (closeId && entryCloseId && closeId === entryCloseId) return true;
  return Boolean(minDay && maxDay && from && to && from === minDay && to === maxDay);
}

function ownerWithdrawalMatchesRange(withdrawal, range) {
  return dateMatchesRange(withdrawal, range) || storedPeriodMatchesRange(withdrawal, range);
}

function rangeText(range) {
  const boundText = (bound, fallback) => {
    if (!bound) return fallback;
    if (bound.length <= 10) return bound;
    const [d, t] = bound.split("T");
    return `${d} — الساعة ${t}`;
  };
  return range.minDate || range.maxDate
    ? `الفترة: ${boundText(range.minDate, "البداية")} إلى ${boundText(range.maxDate, "اليوم")}`
    : "كل الفترات";
}

function invoicePaymentTotals(invoices = []) {
  return paymentMethods.reduce((totals, method) => {
    totals[method] = invoices.reduce((sum, invoice) => {
      const payments = invoiceCashboxPayments(invoice);
      return sum + Number(payments[method] || 0);
    }, 0);
    return totals;
  }, {});
}

function purchasePaymentTotals(purchases = []) {
  return paymentMethods.reduce((totals, method) => {
    totals[method] = purchases.reduce((sum, purchase) => {
      const payments = normalizePurchasePayments(purchase);
      return sum + Number(payments[method] || 0);
    }, 0);
    return totals;
  }, {});
}

function expensePaymentTotals(expenses = []) {
  return paymentMethods.reduce((totals, method) => {
    totals[method] = expenses
      .filter((expense) => expense.method === method)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    return totals;
  }, {});
}

const expenseCategoryLabels = Object.freeze({
  operations: "تشغيل وفواتير",
  rent: "إيجار",
  workers: "عمال",
  renovation: "تجهيزات وتوسعة المشروع",
  maintenance: "صيانة",
  other: "أخرى"
});
const expenseCategoryIds = Object.freeze(Object.keys(expenseCategoryLabels));

const expensePurposeLabels = Object.freeze({
  operations: "تشغيل الكافيه",
  renovation: "تجهيزات وتوسعة المشروع"
});
const expensePurposeIds = Object.freeze(Object.keys(expensePurposeLabels));

function normalizeExpensePurpose(value) {
  return expensePurposeIds.includes(value) ? value : "operations";
}

function expensePurpose(expense = {}) {
  return normalizeExpensePurpose(expense.purpose);
}

function expensePurposeLabel(expenseOrPurpose) {
  const purpose = typeof expenseOrPurpose === "string"
    ? normalizeExpensePurpose(expenseOrPurpose)
    : expensePurpose(expenseOrPurpose || {});
  return expensePurposeLabels[purpose];
}

function inferExpenseCategory(expense = {}) {
  const savedCategory = String(expense.category || "").trim();
  if (expenseCategoryIds.includes(savedCategory)) return savedCategory;

  const text = `${expense.title || expense.name || ""} ${expense.note || ""}`
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "");
  if (/(عامل|عمال|أجرة|اجرة|راتب|رواتب)/.test(text)) return "workers";
  if (/(إيجار|ايجار|أجار|اجار)/.test(text)) return "rent";
  if (/(تجديد|ديكور|دهان|بلاط|أثاث|اثاث|تجهيز)/.test(text)) return "renovation";
  if (/(صيانة|صيانه|تصليح)/.test(text)) return "maintenance";
  if (/(كهرباء|كهربا|مياه|ماء|إنترنت|انترنت|غاز|تنظيف)/.test(text)) return "operations";
  return "other";
}

function expenseCategoryLabel(expenseOrCategory) {
  const category = typeof expenseOrCategory === "string"
    ? expenseOrCategory
    : inferExpenseCategory(expenseOrCategory || {});
  return expenseCategoryLabels[category] || expenseCategoryLabels.other;
}

function normalizeExpense(expense = {}) {
  const amount = Math.max(Number(expense.amount || 0), 0);
  return {
    id: expense.id || uid("expense"),
    type: String(expense.type || "other"),
    title: String(expense.title || expense.name || "مصروف").trim(),
    amount,
    method: paymentMethods.includes(expense.method) ? expense.method : "cash",
    note: String(expense.note || "").trim(),
    category: inferExpenseCategory(expense),
    purpose: expensePurpose(expense),
    createdAt: normalizeImportedDate(expense.createdAt || new Date().toISOString())
  };
}

function normalizeWorkerTransaction(entry = {}) {
  const type = workerTransactionTypeLabels[entry.type] ? entry.type : WORKER_ADVANCE_TYPE;
  return {
    id: entry.id || uid("worker-tx"),
    workerId: entry.workerId || "",
    workerName: String(entry.workerName || entry.title || entry.name || "عامل").trim(),
    type,
    amount: Math.max(Number(entry.amount || 0), 0),
    method: paymentMethods.includes(entry.method) ? entry.method : "cash",
    note: String(entry.note || "").trim(),
    workerDeleted: Boolean(entry.workerDeleted),
    createdAt: normalizeImportedDate(entry.createdAt || new Date().toISOString())
  };
}

function normalizeWorkerLeave(entry = {}) {
  const from = String(entry.from || entry.date || "").slice(0, 10);
  const toRaw = String(entry.to || from || "").slice(0, 10);
  const to = toRaw && toRaw >= from ? toRaw : from;
  const days = from && to ? Math.round((new Date(to) - new Date(from)) / 86400000) + 1 : 0;
  return {
    id: entry.id || uid("leave"),
    workerId: entry.workerId || "",
    workerName: String(entry.workerName || "").trim(),
    from,
    to,
    days,
    note: String(entry.note || "").trim(),
    createdAt: normalizeImportedDate(entry.createdAt || new Date().toISOString())
  };
}

// عدد أيام التقاطع بين مدى إجازة ومدى فترة (تواريخ YYYY-MM-DD؛ المقارنة النصية = زمنية)
function dateRangeOverlapDays(aFrom, aTo, bFrom, bTo) {
  if (!aFrom || !aTo || !bFrom || !bTo) return 0;
  const start = aFrom > bFrom ? aFrom : bFrom;
  const end = aTo < bTo ? aTo : bTo;
  if (start > end) return 0;
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

function workerLeavesFor(worker) {
  return (state.workerLeaves || [])
    .filter((leave) => leave.workerId === worker?.id)
    .sort((a, b) => String(b.from || "").localeCompare(String(a.from || "")));
}

// أيام الإجازة (بدون راتب) للعامل اللي بتتقاطع مع مدى معيّن — تُطرح من أيام الفترة قبل حساب الراتب
function workerLeaveDaysInRange(worker, range) {
  const from = range?.minDate || range?.from;
  const to = range?.maxDate || range?.to;
  if (!from || !to) return 0;
  return workerLeavesFor(worker).reduce((sum, leave) => sum + dateRangeOverlapDays(leave.from, leave.to, from, to), 0);
}

function normalizeWorkerConsumption(entry = {}) {
  const type = workerConsumptionTypeLabels[entry.type] ? entry.type : FREE_WORKER_CONSUMPTION_TYPE;
  const qty = Math.max(Number(entry.qty || 1), 0);
  const price = type === FREE_WORKER_CONSUMPTION_TYPE ? 0 : Math.max(Number(entry.price ?? entry.amount ?? 0), 0);
  const itemName = String(entry.itemName || entry.item || "صنف عامل").trim();
  const stockUsage = Array.isArray(entry.stockUsage)
    ? entry.stockUsage.map((line) => ({
      itemId: line.itemId || line.id || "",
      name: String(line.name || "").trim(),
      qty: Number(line.qty || 0),
      unit: normalizeUnit(line.unit || "")
    })).filter((line) => line.itemId && line.qty > 0)
    : [];
  const unitCost = Number(entry.cost || 0);

  return {
    id: entry.id || uid("worker"),
    workerId: entry.workerId || "",
    workerName: String(entry.workerName || entry.title || entry.name || "عامل").trim(),
    type,
    itemId: entry.itemId || "",
    itemName,
    qty,
    price,
    cost: unitCost,
    total: price * qty,
    costTotal: unitCost * qty,
    method: paymentMethods.includes(entry.method) ? entry.method : "cash",
    note: String(entry.note || "").trim(),
    stockUsage,
    workerDeleted: Boolean(entry.workerDeleted),
    createdAt: normalizeImportedDate(entry.createdAt || new Date().toISOString())
  };
}

function workerConsumptionTypeLabel(type) {
  return workerConsumptionTypeLabels[type] || workerConsumptionTypeLabels[FREE_WORKER_CONSUMPTION_TYPE];
}

function workerConsumptionLine(entry) {
  return {
    id: entry.itemId || entry.id,
    name: entry.itemName,
    qty: Number(entry.qty || 0),
    price: Number(entry.price || 0),
    cost: Number(entry.cost || 0),
    temporary: !entry.itemId,
    stockUsage: Array.isArray(entry.stockUsage) ? entry.stockUsage.map((line) => ({ ...line })) : []
  };
}

function workerPaymentTotals(entries = []) {
  return paymentMethods.reduce((totals, method) => {
    totals[method] = entries
      .filter((entry) => entry.type === "worker_price" && entry.method === method)
      .reduce((sum, entry) => sum + Number(entry.total || 0), 0);
    return totals;
  }, {});
}

function workerTransactionPaymentTotals(entries = []) {
  return paymentMethods.reduce((totals, method) => {
    totals[method] = entries
      .filter((entry) => !workerTransactionIsInflow(entry) && entry.method === method)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return totals;
  }, {});
}

function workerTransactionReceiptTotals(entries = []) {
  return paymentMethods.reduce((totals, method) => {
    totals[method] = entries
      .filter((entry) => workerTransactionIsInflow(entry) && entry.method === method)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return totals;
  }, {});
}

function cashEntryPaymentTotals(entries = []) {
  return paymentMethods.reduce((totals, method) => {
    totals[method] = entries
      .filter((entry) => entry.method === method)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return totals;
  }, {});
}

const SUPPLIER_PAYMENT_OUT_TYPE = "payment_out";
const SUPPLIER_DIRECT_DEBT_TYPE = "debt_increase";
const SUPPLIER_CREDIT_NOTE_TYPE = "credit_note";
const SUPPLIER_RECEIPT_IN_TYPE = "receipt_in";
const supplierTransactionTypeLabels = {
  [SUPPLIER_PAYMENT_OUT_TYPE]: "تسديد لمورد",
  [SUPPLIER_DIRECT_DEBT_TYPE]: "دين على الحساب",
  [SUPPLIER_CREDIT_NOTE_TYPE]: "رصيد عند المورد",
  [SUPPLIER_RECEIPT_IN_TYPE]: "قبض من مورد"
};

function normalizeSupplierTransaction(entry = {}) {
  const type = supplierTransactionTypeLabels[entry.type] ? entry.type : SUPPLIER_PAYMENT_OUT_TYPE;
  const supplier = String(entry.supplier || entry.name || "").trim();
  const amount = Math.max(Number(entry.amount || 0), 0);
  if (!supplier || amount <= 0) return null;
  return {
    id: entry.id || uid(type === SUPPLIER_RECEIPT_IN_TYPE ? "suprecv" : type === SUPPLIER_CREDIT_NOTE_TYPE ? "supcredit" : type === SUPPLIER_DIRECT_DEBT_TYPE ? "supdebt" : "suppay"),
    type,
    supplier,
    amount,
    method: paymentMethods.includes(entry.method) ? entry.method : "cash",
    note: String(entry.note || "").trim(),
    createdAt: normalizeImportedDate(entry.createdAt || new Date().toISOString())
  };
}

function normalizeLegacySupplierPayment(entry = {}) {
  return normalizeSupplierTransaction({
    ...entry,
    type: SUPPLIER_PAYMENT_OUT_TYPE,
    id: entry.id || uid("suppay-old")
  });
}

function supplierLedgerTransactions() {
  const legacyPayments = (state.supplierPayments || []).map(normalizeLegacySupplierPayment).filter(Boolean);
  const transactions = (state.supplierTransactions || []).map(normalizeSupplierTransaction).filter(Boolean);
  return legacyPayments.concat(transactions);
}

function supplierPaymentOutTransactions(entries = supplierLedgerTransactions()) {
  return entries.filter((entry) => entry.type === SUPPLIER_PAYMENT_OUT_TYPE);
}

function supplierCreditNoteTransactions(entries = supplierLedgerTransactions()) {
  return entries.filter((entry) => entry.type === SUPPLIER_CREDIT_NOTE_TYPE);
}

function supplierReceiptTransactions(entries = supplierLedgerTransactions()) {
  return entries.filter((entry) => entry.type === SUPPLIER_RECEIPT_IN_TYPE);
}

function supplierDirectDebtTransactions(entries = supplierLedgerTransactions()) {
  return entries.filter((entry) => entry.type === SUPPLIER_DIRECT_DEBT_TYPE);
}

function workerConsumptionTotals(entries = []) {
  return entries.reduce((totals, entry) => {
    const total = Number(entry.total || 0);
    const costTotal = Number(entry.costTotal ?? Number(entry.cost || 0) * Number(entry.qty || 0));
    totals.count += 1;
    totals.qty += Number(entry.qty || 0);
    totals.cost += costTotal;
    if (entry.type === FREE_WORKER_CONSUMPTION_TYPE) {
      totals.freeCost += costTotal;
    } else if (entry.type === SALARY_WORKER_CONSUMPTION_TYPE) {
      totals.salaryDeductions += total;
      totals.charged += total;
    } else {
      totals.workerSales += total;
      totals.charged += total;
    }
    totals.net += total - costTotal;
    return totals;
  }, { count: 0, qty: 0, cost: 0, freeCost: 0, workerSales: 0, salaryDeductions: 0, charged: 0, net: 0 });
}

function inventoryCountValue(record = {}) {
  const lines = Array.isArray(record.lines) ? record.lines : [];
  const lineNet = lines.reduce((sum, line) => sum + Number(line.value || 0), 0);
  const increase = Number(record.totalIncreaseValue ?? lines.reduce((sum, line) => sum + Math.max(Number(line.value || 0), 0), 0));
  const decrease = Number(record.totalDecreaseValue ?? lines.reduce((sum, line) => sum + Math.max(-Number(line.value || 0), 0), 0));
  const net = Number(record.netInventoryValue ?? lineNet ?? (increase - decrease));
  return {
    increase,
    decrease,
    net,
    profit: Math.max(net, 0),
    loss: Math.max(-net, 0)
  };
}

function inventoryReportTotals(records = []) {
  return records.reduce((totals, record) => {
    const value = inventoryCountValue(record);
    totals.count += 1;
    totals.increase += value.increase;
    totals.decrease += value.decrease;
    totals.net += value.net;
    totals.profit += value.profit;
    totals.loss += value.loss;
    return totals;
  }, { count: 0, increase: 0, decrease: 0, net: 0, profit: 0, loss: 0 });
}

function inventoryWasteRecords(range = {}) {
  return (state.inventoryWaste || [])
    .map((entry) => normalizeInventoryWasteRecord(entry))
    .filter(Boolean)
    .filter((entry) => dateMatchesRange(entry, range));
}

function inventoryWasteTotal(records = inventoryWasteRecords()) {
  return records.reduce((sum, entry) => sum + Number(entry.totalCost || 0), 0);
}

function reportWorkerDueTotal(range) {
  return (state.workers || [])
    .filter((worker) => worker.active !== false)
    .reduce((sum, worker) => {
      const account = workerAccountForRange(worker, range);
      return sum + Math.max(Number(account.due || 0), 0);
    }, 0);
}

function reportData(range) {
  const invoices = state.invoices.filter((invoice) => dateMatchesRange(invoice, range) && !invoiceIsCancelled(invoice));
  const saleInvoices = invoices.filter((invoice) => invoice.type === "sale");
  const paymentInvoices = invoices.filter((invoice) => invoice.type === "payment");
  const payoutInvoices = invoices.filter((invoice) => invoice.type === "payout");
  const purchases = state.purchases.filter((purchase) => dateMatchesRange(purchase, range));
  const supplierTransactions = supplierLedgerTransactions().filter((entry) => dateMatchesRange(entry, range));
  const supplierPayments = supplierPaymentOutTransactions(supplierTransactions);
  const supplierDirectDebts = supplierDirectDebtTransactions(supplierTransactions);
  const supplierCreditNotes = supplierCreditNoteTransactions(supplierTransactions);
  const supplierReceipts = supplierReceiptTransactions(supplierTransactions);
  const expenses = (state.expenses || []).filter((expense) => dateMatchesRange(expense, range));
  const ownerWithdrawals = (state.ownerWithdrawals || []).filter((withdrawal) => ownerWithdrawalMatchesRange(withdrawal, range));
  const partnerFundingTransactions = partnerFundingTransactionsForRange(range);
  const inventoryCounts = (state.inventoryCounts || []).filter((record) => dateMatchesRange(record, range));
  const inventoryWaste = inventoryWasteRecords(range);
  const workerConsumptions = (state.workerConsumptions || []).filter((entry) => dateMatchesRange(entry, range));
  const workerTransactions = (state.workerTransactions || []).filter((entry) => dateMatchesRange(entry, range));
  const workerSummary = workerConsumptionTotals(workerConsumptions);
  const workerTransactionSummary = workerTransactionTotals(workerTransactions);
  const inventorySummary = inventoryReportTotals(inventoryCounts);
  const workerDueTotal = reportWorkerDueTotal(range);
  const workerCashOut = workerTransactionSummary.advances + workerTransactionSummary.salaryPaid;
  const workerCashIn = workerTransactionSummary.paymentIn;
  const customerSummary = customerTotals();
  const salesTotal = saleInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const paidTotal = saleInvoices.reduce((sum, invoice) => sum + Number(invoice.paid || 0), 0);
  const customerOffsetTotal = saleInvoices.reduce((sum, invoice) => sum + (invoice.source === "customer_offset" ? Number(invoice.total || 0) : 0), 0);
  const paymentDiscountTotal = paymentInvoices.reduce((sum, invoice) => sum + Number(invoice.discount || 0), 0);
  const debtTotal = saleInvoices.reduce((sum, invoice) => sum + (invoice.source === "customer_offset" ? 0 : Math.max(Number(invoice.delta || 0), 0)), 0);
  const creditTotal = saleInvoices.reduce((sum, invoice) => sum + Math.max(-Number(invoice.delta || 0), 0), 0);
  const purchasesTotal = purchases.reduce((sum, purchase) => sum + purchaseAmount(purchase), 0);
  const purchaseDiscountTotal = purchases.reduce((sum, purchase) => sum + purchaseDiscount(purchase), 0);
  const purchasePaidTotal = purchases.reduce((sum, purchase) => sum + purchasePaidAmount(purchase), 0);
  const purchaseCreditUsedTotal = purchases.reduce((sum, purchase) => sum + purchaseSupplierCreditUsed(purchase), 0);
  const supplierPaymentsTotal = supplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const supplierDirectDebtsTotal = supplierDirectDebts.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const supplierCreditNotesTotal = supplierCreditNotes.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const supplierReceiptsTotal = supplierReceipts.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const operatingExpensesTotal = expenses
    .filter((expense) => expensePurpose(expense) === "operations")
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const renovationExpensesTotal = expenses
    .filter((expense) => expensePurpose(expense) === "renovation")
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const inventoryWasteTotalValue = inventoryWasteTotal(inventoryWaste);
  const ownerWithdrawalSummary = ownerWithdrawalTotals(ownerWithdrawals);
  const ownerWithdrawalsTotal = ownerWithdrawalSummary.total;
  const partnerFundingSummary = partnerFundingTotals(partnerFundingTransactions);
  const itemProfit = saleInvoices.reduce((sum, invoice) => sum + invoiceItemProfit(invoice), 0);
  const itemCost = saleInvoices.reduce((sum, invoice) => {
    return sum + (invoice.items || []).reduce((lineSum, item) => {
      return lineSum + Number(item.cost || 0) * Number(item.qty || 0);
    }, 0);
  }, 0);

  return {
    invoices,
    saleInvoices,
    paymentInvoices,
    payoutInvoices,
    purchases,
    supplierTransactions,
    supplierPayments,
    supplierDirectDebts,
    supplierCreditNotes,
    supplierReceipts,
    expenses,
    ownerWithdrawals,
    partnerFundingTransactions,
    partnerFundingSummary,
    inventoryCounts,
    inventoryWaste,
    customerSummary,
    salesTotal,
    paidTotal,
    customerOffsetTotal,
    paymentDiscountTotal,
    debtTotal,
    creditTotal,
    purchasesTotal,
    purchaseDiscountTotal,
    purchasePaidTotal,
    purchaseCreditUsedTotal,
    supplierPaymentsTotal,
    supplierDirectDebtsTotal,
    supplierCreditNotesTotal,
    supplierReceiptsTotal,
    expensesTotal,
    operatingExpensesTotal,
    renovationExpensesTotal,
    inventoryWasteTotal: inventoryWasteTotalValue,
    ownerWithdrawalsTotal,
    ownerWithdrawalSummary,
    workerConsumptions,
    workerTransactions,
    workerSummary,
    workerTransactionSummary,
    workerDueTotal,
    workerCashIn,
    inventorySummary,
    workerCashOut,
    itemProfit,
    itemCost,
    profitWithWorkers: itemProfit + workerSummary.net - paymentDiscountTotal,
    profitWithWorkersAndPayroll: itemProfit + workerSummary.net - paymentDiscountTotal - workerCashOut - expensesTotal,
    // فرق الجرد للمعلومة فقط؛ لا يغيّر الربح. التالف المسجل يبقى خسارة فعلية.
    profitWithInventory: itemProfit + workerSummary.net - paymentDiscountTotal - expensesTotal - inventoryWasteTotalValue,
    profitWithWorkersPayrollAndInventory: itemProfit + workerSummary.net - paymentDiscountTotal - workerCashOut - expensesTotal - inventoryWasteTotalValue,
    operatingProfitWithWorkersPayrollAndInventory: itemProfit + workerSummary.net - paymentDiscountTotal - workerCashOut - operatingExpensesTotal - inventoryWasteTotalValue,
    netAfterPurchases: salesTotal - purchasesTotal,
    invoicePayments: invoicePaymentTotals(invoices),
    salePayments: invoicePaymentTotals(saleInvoices),
    paymentPayments: invoicePaymentTotals(paymentInvoices),
    purchasePayments: purchasePaymentTotals(purchases),
    supplierPaymentPayments: cashEntryPaymentTotals(supplierPayments),
    supplierReceiptPayments: cashEntryPaymentTotals(supplierReceipts),
    expensePayments: expensePaymentTotals(expenses),
    ownerWithdrawalPayments: cashEntryPaymentTotals(ownerWithdrawals.filter((entry) => ownerWithdrawalDirection(entry) === "out")),
    ownerWithdrawalReturnPayments: cashEntryPaymentTotals(ownerWithdrawals.filter((entry) => ownerWithdrawalDirection(entry) === "in")),
    profitWithdrawalPayments: cashEntryPaymentTotals(ownerWithdrawals.filter((entry) => ownerWithdrawalKind(entry) === OWNER_WITHDRAWAL_PROFIT)),
    personalWithdrawalPayments: cashEntryPaymentTotals(ownerWithdrawals.filter((entry) => ownerWithdrawalKind(entry) === OWNER_WITHDRAWAL_PERSONAL)),
    partnerFundingInPayments: partnerFundingPaymentTotals(partnerFundingTransactions, "in"),
    partnerFundingOutPayments: partnerFundingPaymentTotals(partnerFundingTransactions, "out"),
    workerPayments: workerPaymentTotals(workerConsumptions),
    workerTransactionPayments: workerTransactionPaymentTotals(workerTransactions),
    workerTransactionInPayments: workerTransactionReceiptTotals(workerTransactions)
  };
}

// ═══ نظام الشركاء ═══ معزول تماماً: بيقرأ الربح والسحوبات الموجودة، وما بيغيّر ولا حساب مالي.
function normalizePartner(p = {}) {
  return {
    id: p.id || uid("partner"),
    name: String(p.name || "").trim() || "شريك",
    sharePercent: Math.min(Math.max(Number(p.sharePercent || 0), 0), 100),
    workerId: typeof p.workerId === "string" ? p.workerId : "",
    createdAt: normalizeImportedDate(p.createdAt || new Date().toISOString())
  };
}

function getPartner(id) {
  return (state.partners || []).find((p) => p.id === id) || null;
}

const OWNER_WITHDRAWAL_PROFIT = "profit_withdrawal";
const OWNER_WITHDRAWAL_PERSONAL = "personal_withdrawal";
const OWNER_WITHDRAWAL_PERSONAL_RETURN = "personal_withdrawal_return";
const ownerWithdrawalKinds = [OWNER_WITHDRAWAL_PROFIT, OWNER_WITHDRAWAL_PERSONAL, OWNER_WITHDRAWAL_PERSONAL_RETURN];

function ownerWithdrawalKind(entry = {}) {
  return ownerWithdrawalKinds.includes(entry.kind) ? entry.kind : OWNER_WITHDRAWAL_PROFIT;
}

function normalizeOwnerWithdrawal(entry = {}) {
  const amount = Number(entry.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const partnerId = String(entry.partnerId || "").trim();
  const partner = typeof state !== "undefined" && state && Array.isArray(state.partners) ? getPartner(partnerId) : null;
  return {
    ...entry,
    id: String(entry.id || uid("withdraw")),
    kind: ownerWithdrawalKind(entry),
    partnerId,
    partnerName: String(entry.partnerName || partner?.name || "").trim(),
    amount,
    method: paymentMethods.includes(entry.method) ? entry.method : "cash",
    note: String(entry.note || "").trim(),
    createdAt: normalizeImportedDate(entry.createdAt || new Date().toISOString())
  };
}

function ownerWithdrawalTypeLabel(kind) {
  if (kind === OWNER_WITHDRAWAL_PERSONAL_RETURN) return "إرجاع سحب شخصي";
  return kind === OWNER_WITHDRAWAL_PERSONAL ? "سحب شخصي" : "سحب أرباح";
}

function ownerWithdrawalDirection(entry) {
  return ownerWithdrawalKind(entry) === OWNER_WITHDRAWAL_PERSONAL_RETURN ? "in" : "out";
}

function ownerWithdrawalTotals(entries = state.ownerWithdrawals || []) {
  return entries.reduce((totals, rawEntry) => {
    const entry = normalizeOwnerWithdrawal(rawEntry);
    if (!entry) return totals;
    if (entry.kind === OWNER_WITHDRAWAL_PERSONAL_RETURN) totals.personalReturned += entry.amount;
    else if (entry.kind === OWNER_WITHDRAWAL_PERSONAL) totals.personalGross += entry.amount;
    else totals.profit += entry.amount;
    totals.personal = totals.personalGross - totals.personalReturned;
    totals.total = totals.profit + totals.personal;
    return totals;
  }, { profit: 0, personalGross: 0, personalReturned: 0, personal: 0, total: 0 });
}

function ownerWithdrawalLedgerValidation(entries = state.ownerWithdrawals || [], partnerId = "") {
  const rows = entries.filter((entry) => !partnerId || entry.partnerId === partnerId)
    .slice().sort((a, b) => {
      const dayDiff = String(a.createdAt || "").slice(0, 10).localeCompare(String(b.createdAt || "").slice(0, 10));
      if (dayDiff) return dayDiff;
      const aReturn = ownerWithdrawalKind(a) === OWNER_WITHDRAWAL_PERSONAL_RETURN ? 1 : 0;
      const bReturn = ownerWithdrawalKind(b) === OWNER_WITHDRAWAL_PERSONAL_RETURN ? 1 : 0;
      return aReturn - bReturn || new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  let personalBalance = 0;
  for (const rawEntry of rows) {
    const entry = normalizeOwnerWithdrawal(rawEntry);
    if (!entry) continue;
    if (entry.kind === OWNER_WITHDRAWAL_PERSONAL) personalBalance += entry.amount;
    if (entry.kind === OWNER_WITHDRAWAL_PERSONAL_RETURN) personalBalance -= entry.amount;
    if (personalBalance < -0.001) return { valid: false, shortage: Math.abs(personalBalance), entry };
  }
  return { valid: true, shortage: 0 };
}

function ownerPersonalWithdrawalAvailableAt(entries = state.ownerWithdrawals || [], partnerId = "", createdAt = "", excludeId = "") {
  const until = String(createdAt || "").slice(0, 10);
  const relevant = entries
    .filter((entry) => entry.partnerId === partnerId)
    .filter((entry) => !excludeId || entry.id !== excludeId)
    .filter((entry) => !until || String(entry.createdAt || "").slice(0, 10) <= until);
  const totals = ownerWithdrawalTotals(relevant);
  return Math.max(Number(totals.personal || 0), 0);
}

function buildPersonalWithdrawalReturnSplit({ partner, editingEntry = null, amount, method, note, createdAt }) {
  const returnId = editingEntry?.id || uid("withdraw");
  const available = ownerPersonalWithdrawalAvailableAt(state.ownerWithdrawals || [], partner.id, createdAt, editingEntry?.id || "");
  const returnedAmount = Math.min(Math.max(Number(amount || 0), 0), available);
  const excessFunding = Math.max(Number(amount || 0) - returnedAmount, 0);
  const linkedFunding = (state.partnerFundingTransactions || []).find((entry) => entry.sourcePersonalReturnId === returnId) || null;
  const returnEntry = returnedAmount > 0.001 ? normalizeOwnerWithdrawal({
    id: returnId,
    kind: OWNER_WITHDRAWAL_PERSONAL_RETURN,
    partnerId: partner.id,
    partnerName: partner.name,
    amount: returnedAmount,
    method,
    note,
    createdAt
  }) : null;
  const fundingEntry = excessFunding > 0.001 ? normalizePartnerFundingTransaction({
    id: linkedFunding?.id,
    partnerId: partner.id,
    partnerName: partner.name,
    type: PARTNER_FUNDING_REFUNDABLE,
    amount: excessFunding,
    method,
    note: note ? `زيادة عن إرجاع سحب شخصي · ${note}` : "زيادة عن إرجاع سحب شخصي",
    sourcePersonalReturnId: returnId,
    createdAt
  }) : null;
  return { returnId, available, returnedAmount, excessFunding, linkedFunding, returnEntry, fundingEntry };
}

function reconcileGeneratedPersonalReturnFunding(targetState) {
  if (!targetState || targetState.personalReturnRepairVersion >= 1) return 0;
  const withdrawals = Array.isArray(targetState.ownerWithdrawals) ? targetState.ownerWithdrawals : [];
  const fundingRows = Array.isArray(targetState.partnerFundingTransactions) ? targetState.partnerFundingTransactions : [];
  let repaired = 0;
  fundingRows.forEach((funding) => {
    const generated = Boolean(funding.sourcePersonalReturnId) || String(funding.note || "").startsWith("زيادة عن إرجاع سحب شخصي");
    if (!generated || funding.type !== PARTNER_FUNDING_REFUNDABLE) return;
    const day = String(funding.createdAt || "").slice(0, 10);
    const partnerRows = withdrawals.filter((entry) => entry.partnerId === funding.partnerId && (!day || String(entry.createdAt || "").slice(0, 10) <= day));
    const totals = ownerWithdrawalTotals(partnerRows);
    const remainingPersonal = Math.max(Number(totals.personal || 0), 0);
    const transfer = Math.min(remainingPersonal, Number(funding.amount || 0));
    if (transfer <= 0.001) return;
    const returnId = funding.sourcePersonalReturnId || uid("withdraw");
    const existingReturn = withdrawals.find((entry) => entry.id === returnId && ownerWithdrawalKind(entry) === OWNER_WITHDRAWAL_PERSONAL_RETURN);
    if (existingReturn) {
      existingReturn.amount = Number(existingReturn.amount || 0) + transfer;
    } else {
      withdrawals.push(normalizeOwnerWithdrawal({
        id: returnId,
        kind: OWNER_WITHDRAWAL_PERSONAL_RETURN,
        partnerId: funding.partnerId,
        partnerName: funding.partnerName,
        amount: transfer,
        method: funding.method,
        note: "تصحيح تلقائي لإرجاع سحب شخصي",
        createdAt: funding.createdAt
      }));
    }
    funding.amount = Number(funding.amount || 0) - transfer;
    repaired += 1;
  });
  targetState.partnerFundingTransactions = fundingRows.filter((entry) => Number(entry.amount || 0) > 0.001);
  targetState.ownerWithdrawals = withdrawals;
  targetState.personalReturnRepairVersion = 1;
  return repaired;
}

const PARTNER_FUNDING_REFUNDABLE = "refundable_deposit";
const PARTNER_FUNDING_CAPITAL = "capital_contribution";
const PARTNER_FUNDING_REFUND = "funding_refund";
const partnerFundingTypes = [PARTNER_FUNDING_REFUNDABLE, PARTNER_FUNDING_CAPITAL, PARTNER_FUNDING_REFUND];

function normalizePartnerFundingTransaction(entry = {}) {
  const type = partnerFundingTypes.includes(entry.type) ? entry.type : PARTNER_FUNDING_REFUNDABLE;
  const amount = Number(entry.amount || 0);
  const partnerId = String(entry.partnerId || "").trim();
  if (!partnerId || !Number.isFinite(amount) || amount <= 0) return null;
  const partner = typeof state !== "undefined" && state && Array.isArray(state.partners) ? getPartner(partnerId) : null;
  return {
    id: String(entry.id || uid("partner-funding")),
    partnerId,
    partnerName: String(entry.partnerName || partner?.name || "شريك").trim() || "شريك",
    type,
    amount,
    method: paymentMethods.includes(entry.method) ? entry.method : "cash",
    note: String(entry.note || "").trim(),
    sourcePersonalReturnId: String(entry.sourcePersonalReturnId || "").trim(),
    createdAt: normalizeImportedDate(entry.createdAt || new Date().toISOString())
  };
}

function partnerFundingTypeLabel(type) {
  if (type === PARTNER_FUNDING_CAPITAL) return "زيادة رأس مال";
  if (type === PARTNER_FUNDING_REFUND) return "رد تمويل";
  return "تمويل مسترد";
}

function partnerFundingDirection(entry) {
  return entry?.type === PARTNER_FUNDING_REFUND ? "out" : "in";
}

function partnerFundingTransactionsFor(partnerId, options = {}) {
  const until = String(options.until || "");
  const excludeId = String(options.excludeId || "");
  return (state.partnerFundingTransactions || [])
    .filter((entry) => !partnerId || entry.partnerId === partnerId)
    .filter((entry) => !excludeId || entry.id !== excludeId)
    .filter((entry) => !until || String(entry.createdAt || "") <= until)
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function partnerFundingTransactionsForRange(range) {
  return (state.partnerFundingTransactions || []).filter((entry) => dateMatchesRange(entry, range));
}

function partnerFundingTotals(entries = state.partnerFundingTransactions || []) {
  return entries.reduce((totals, entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.type === PARTNER_FUNDING_CAPITAL) totals.capital += amount;
    else if (entry.type === PARTNER_FUNDING_REFUND) totals.refunded += amount;
    else totals.refundableDeposited += amount;
    totals.outstandingRefundable = Math.max(totals.refundableDeposited - totals.refunded, 0);
    totals.physicalCashEffect = totals.refundableDeposited + totals.capital - totals.refunded;
    return totals;
  }, { refundableDeposited: 0, refunded: 0, outstandingRefundable: 0, capital: 0, physicalCashEffect: 0 });
}

function partnerFundingBalance(partnerId, options = {}) {
  const totals = partnerFundingTotals(partnerFundingTransactionsFor(partnerId, options));
  const opening = Math.max(Number(state.partnerOpeningFunding?.[partnerId] || 0), 0);
  totals.refundableDeposited += opening;
  totals.outstandingRefundable += opening;
  totals.physicalCashEffect += opening;
  return totals;
}

function partnerFundingPaymentTotals(entries = [], direction = "in") {
  const totals = { cash: 0, bank: 0, wallet: 0 };
  entries.forEach((entry) => {
    if (partnerFundingDirection(entry) !== direction) return;
    const method = paymentMethods.includes(entry.method) ? entry.method : "cash";
    totals[method] += Number(entry.amount || 0);
  });
  return totals;
}

function partnerFundingLedgerValidation(entries = state.partnerFundingTransactions || [], partnerId = "") {
  const rows = entries
    .filter((entry) => !partnerId || entry.partnerId === partnerId)
    .slice()
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  let refundable = 0;
  for (const entry of rows) {
    if (entry.type === PARTNER_FUNDING_REFUNDABLE) refundable += Number(entry.amount || 0);
    else if (entry.type === PARTNER_FUNDING_REFUND) refundable -= Number(entry.amount || 0);
    if (refundable < -0.001) return { valid: false, entry, shortage: Math.abs(refundable) };
  }
  return { valid: true, shortage: 0 };
}

function partnerShareTotalPercent() {
  return (state.partners || []).reduce((sum, p) => sum + Number(p.sharePercent || 0), 0);
}

// مجموع سحوبات شريك معيّن ضمن مدى (من ownerWithdrawals المنسوبة إله عبر partnerId)
function partnerWithdrawnInRange(partnerId, range) {
  const stdRange = { minDate: range?.minDate || range?.from, maxDate: range?.maxDate || range?.to };
  return ownerWithdrawalTotals((state.ownerWithdrawals || [])
    .filter((w) => w.partnerId === partnerId && ownerWithdrawalMatchesRange(w, stdRange))).total;
}

function partnerWithdrawalBreakdown(partnerId, range) {
  const stdRange = { minDate: range?.minDate || range?.from, maxDate: range?.maxDate || range?.to };
  return ownerWithdrawalTotals((state.ownerWithdrawals || [])
    .filter((entry) => entry.partnerId === partnerId && ownerWithdrawalMatchesRange(entry, stdRange)));
}

function rangeBeforeStart(range = {}) {
  const start = String(range.minDate || range.from || "").trim();
  if (!start) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const date = new Date(`${start}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() - 1);
    return { maxDate: date.toISOString().slice(0, 10) };
  }
  const timestamp = new Date(start).getTime();
  return Number.isFinite(timestamp) ? { maxDate: new Date(timestamp - 1).toISOString() } : null;
}

// السحب الشخصي الزائد والسلف تبقى على حساب الشريك حتى تغطيها أرباح لاحقة.
// نحسب العجز السابق من حركة التشغيل فقط؛ لا نعيد إخراج أي مبلغ من الصندوق.
function partnerCarryInDebts(range, basis = "cash") {
  const priorRange = rangeBeforeStart(range);
  const debts = new Map();
  if (!priorRange) return debts;

  const data = reportData(priorRange);
  const stdRange = { minDate: priorRange.minDate, maxDate: priorRange.maxDate };
  const raw = (state.partners || []).map((partner) => {
    const withdrawalBreakdown = partnerWithdrawalBreakdown(partner.id, stdRange);
    let advances = 0;
    let products = 0;
    if (partner.workerId) {
      const worker = getWorker(partner.workerId);
      if (worker) {
        const account = workerAccountForRange(worker, stdRange);
        advances = Number(account.advances || 0);
        products = Number(account.drinkStats.salaryDeductions || 0);
      }
    }
    return { partner, withdrawn: withdrawalBreakdown.total, advances, products };
  });

  const totalOwnerWithdrawn = ownerWithdrawalTotals((state.ownerWithdrawals || [])
    .filter((entry) => ownerWithdrawalMatchesRange(entry, stdRange))).total;
  const totalAdvances = raw.reduce((sum, row) => sum + row.advances, 0);
  const totalProducts = raw.reduce((sum, row) => sum + row.products, 0);
  let base;
  if (basis === "profit") {
    base = Number(data.profitWithWorkersPayrollAndInventory || 0) + totalAdvances + totalProducts;
  } else {
    const cashbox = cashboxBreakdown(data);
    const fundingNet = Number(partnerFundingTotals(data.partnerFundingTransactions || []).physicalCashEffect || 0);
    const distributableCash = Number(cashbox.cashNet || 0) - fundingNet;
    base = distributableCash + totalOwnerWithdrawn + totalAdvances + totalProducts;
  }

  raw.forEach((row) => {
    const share = base * Number(row.partner.sharePercent || 0) / 100;
    const deductions = row.withdrawn + row.advances + row.products;
    debts.set(row.partner.id, Math.max(deductions - share, 0));
  });
  return debts;
}

// توزيع الأرباح على الشركاء لمدى.
// الأساس: إمّا "الربح" (بيشمل ديون ما انقبضت) أو "الكاش الفعلي الموجود" (اللي بالصندوق فقط).
// السلف (سلفة على كرت العامل المربوط) = سحب نقدي فعلي للشريك، مش تكلفة على المحل — فبنرجّعها للأساس
// ونحسبها من نصيبه، عشان ما يصير ازدواج (السلفة أصلاً نقّصت الكاش والربح).
function cafeHandoverData(range) {
  const meeting = partnerMeetingData(range);
  const data = meeting.data;
  const wages = [], equipment = [], operations = [], review = [];
  data.expenses.forEach((entry) => {
    const category = inferExpenseCategory(entry);
    if (category === "workers") wages.push(entry);
    else if (expensePurpose(entry) === "renovation") equipment.push(entry);
    else operations.push(entry);
    if (category === "renovation" && expensePurpose(entry) !== "renovation") review.push(entry);
  });
  const partnerWorkerIds = new Set((state.partners || []).map((partner) => partner.workerId).filter(Boolean));
  const salaries = data.workerTransactions.filter((entry) => entry.type === WORKER_SALARY_PAYMENT_TYPE);
  const nonPartnerSalaries = salaries.filter((entry) => !partnerWorkerIds.has(entry.workerId));
  const advances = data.workerTransactions.filter((entry) => entry.type === WORKER_ADVANCE_TYPE && !partnerWorkerIds.has(entry.workerId));
  const receipts = data.workerTransactions.filter((entry) => entry.type === WORKER_PAYMENT_IN_TYPE && !partnerWorkerIds.has(entry.workerId));
  const sum = (entries) => entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const expenseBreakdown = expenseCategoryIds
    .map((category) => ({
      category,
      label: expenseCategoryLabel(category),
      amount: sum(operations.filter((entry) => inferExpenseCategory(entry) === category))
    }))
    .filter((entry) => entry.amount > 0);
  const partnersTakenTotal = meeting.partners.reduce((total, entry) => total + Number(entry.cashTaken || 0), 0)
    + Number(meeting.unassignedWithdrawals || 0);
  const equipmentTotal = sum(equipment);
  const operatingTotal = sum(operations);
  const workersPaidTotal = sum(wages) + sum(nonPartnerSalaries) + sum(advances);
  const netSummaryTotal = Number(data.salesTotal || 0) - Number(data.purchasesTotal || 0)
    - operatingTotal - equipmentTotal - workersPaidTotal - partnersTakenTotal;
  return {
    meeting, data, wages, equipment, operations, review, salaries, nonPartnerSalaries, advances, receipts, expenseBreakdown,
    equipmentTotal, wagesTotal: sum(wages) + sum(salaries),
    operatingTotal, advancesTotal: sum(advances), receiptsTotal: sum(receipts),
    workersPaidTotal, partnersTakenTotal, netSummaryTotal,
    supplierPositions: supplierBalances(),
    customerPositions: (state.customers || []).filter((entry) => Math.abs(Number(entry.balance || 0)) > 0.001),
    workers: (state.workers || []).map((worker) => ({ worker, account: workerMonthlyAccount(worker), isPartner: partnerWorkerIds.has(worker.id) })),
    stock: purchaseInventoryItems(),
    invoices: (state.invoices || []).filter((entry) => dateMatchesRange(entry, range)),
    cashEntries: buildCashLedgerEntries(range),
    manualStock: (state.manualPurchaseInventoryItems || []).filter((entry) => dateMatchesRange(entry, range)),
    openOrders: Object.entries(state.openOrders || {}).filter(([, order]) => (order.items || []).length)
  };
}

function partnerMeetingData(range) {
  const data = reportData(range);
  const distribution = partnerDistribution(range);
  const shareRows = new Map(distribution.rows.map((row) => [row.partner.id, row]));
  const partners = (state.partners || []).map((partner) => {
    const fundingEntries = data.partnerFundingTransactions.filter((entry) => entry.partnerId === partner.id);
    const funding = partnerFundingTotals(fundingEntries);
    const draws = partnerWithdrawalBreakdown(partner.id, range);
    const workerEntries = partner.workerId ? data.workerTransactions.filter((entry) => entry.workerId === partner.workerId) : [];
    const worker = workerTransactionTotals(workerEntries);
    const products = partner.workerId ? workerConsumptionTotals(data.workerConsumptions.filter((entry) => entry.workerId === partner.workerId)).salaryDeductions : 0;
    return {
      partner, funding, fundingEntries, workerEntries,
      share: shareRows.get(partner.id),
      currentFunding: partnerFundingBalance(partner.id),
      profitWithdrawals: draws.profit, personalWithdrawals: draws.personal,
      advances: worker.advances, products,
      workerReceipts: worker.paymentIn, salaryPaid: worker.salaryPaid,
      paidIn: funding.refundableDeposited + funding.capital + worker.paymentIn,
      cashTaken: draws.total + worker.advances + worker.salaryPaid + funding.refunded,
      shareDeductions: draws.total + worker.advances + products
    };
  });
  const supplierPositions = supplierBalances();
  const partnerAdvances = partners.reduce((sum, row) => sum + row.advances, 0);
  const partnerProducts = partners.reduce((sum, row) => sum + row.products, 0);
  const knownPartners = new Set(partners.map((row) => row.partner.id));
  return {
    data, partners, distribution, cash: cashboxBreakdown(data), onHand: cashOnHand(),
    supplierDebt: supplierPositions.reduce((sum, row) => sum + row.debt, 0),
    supplierCredit: supplierPositions.reduce((sum, row) => sum + row.credit, 0),
    purchaseDebt: data.purchases.reduce((sum, entry) => sum + purchaseSupplierDebt(entry), 0),
    purchaseOverpayment: data.purchases.reduce((sum, entry) => sum + purchaseSupplierOverpayment(entry), 0),
    workerOperatingOut: data.workerCashOut - partnerAdvances,
    operatingProfit: data.operatingProfitWithWorkersPayrollAndInventory + partnerAdvances - partnerProducts,
    unassignedWithdrawals: ownerWithdrawalTotals(data.ownerWithdrawals.filter((entry) => !knownPartners.has(entry.partnerId))).total,
    unassignedFunding: data.partnerFundingTransactions.filter((entry) => !knownPartners.has(entry.partnerId)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  };
}

function partnerDistribution(range, forcedBasis, forcedSource) {
  const data = reportData(range);
  const profit = Number(data.profitWithWorkersPayrollAndInventory || 0);
  const cashbox = cashboxBreakdown(data);
  const stdRange = { minDate: range?.minDate || range?.from, maxDate: range?.maxDate || range?.to };
  const basis = forcedBasis === "cash" || forcedBasis === "profit"
    ? forcedBasis
    : state.partnerDistributionBasis === "cash" ? "cash" : "profit";
  const source = forcedSource === "onHand" || forcedSource === "period"
    ? forcedSource
    : state.partnerDistributionSource === "onHand" ? "onHand" : "period";

  const totalOwnerWithdrawn = ownerWithdrawalTotals((state.ownerWithdrawals || [])
    .filter((w) => ownerWithdrawalMatchesRange(w, stdRange))).total;

  // مكوّنات كل شريك الخام
  const raw = (state.partners || []).map((partner) => {
    const sharePercent = Number(partner.sharePercent || 0);
    const withdrawalBreakdown = partnerWithdrawalBreakdown(partner.id, range);
    const withdrawnCash = withdrawalBreakdown.total;
    let advances = 0;       // سلف نقدية على كرت العامل
    let products = 0;       // منتجات "خصم من الراتب" (محايدة على الربح، مش نقد)
    if (partner.workerId) {
      const worker = getWorker(partner.workerId);
      if (worker) {
        const acc = workerAccountForRange(worker, stdRange);
        advances = Number(acc.advances || 0);
        products = Number(acc.drinkStats.salaryDeductions || 0);
      }
    }
    return { partner, sharePercent, withdrawnCash, profitWithdrawals: withdrawalBreakdown.profit, personalWithdrawals: withdrawalBreakdown.personal, advances, products };
  });

  const totalPartnerAdvances = raw.reduce((sum, r) => sum + r.advances, 0);
  const totalPartnerProducts = raw.reduce((sum, r) => sum + r.products, 0);
  const carryInDebts = partnerCarryInDebts(range, basis);
  const periodCashNet = Number(cashbox.cashNet || 0);
  const moneyOnHand = typeof cashOnHand === "function" ? Number(cashOnHand().total.current || 0) : periodCashNet;
  const periodFunding = partnerFundingTotals(data.partnerFundingTransactions || []);
  const allFunding = partnerFundingTotals(state.partnerFundingTransactions || []);
  const protectedFunding = Math.max(Number(allFunding.outstandingRefundable || 0), 0) + Math.max(Number(allFunding.capital || 0), 0);
  const protectedOnHand = Math.min(Math.max(moneyOnHand, 0), protectedFunding);
  const periodFundingNet = Number(periodFunding.physicalCashEffect || 0);
  const distributablePeriodCash = periodCashNet - periodFundingNet;
  const distributableOnHandCash = Math.max(moneyOnHand - protectedOnHand, 0);
  const cashNet = basis === "cash" && source === "onHand" ? distributableOnHandCash : distributablePeriodCash;
  const cashBeforeDraws = cashNet + totalOwnerWithdrawn + totalPartnerAdvances; // كاش الفترة قبل السحوبات
  const base = basis === "cash"
    ? cashBeforeDraws + totalPartnerProducts
    : profit + totalPartnerAdvances + totalPartnerProducts;

  const rows = raw.map((r) => {
    const shareAmount = base * r.sharePercent / 100;
    // اللي أخده الشريك = سحب حصة + سلف + منتجات (كلها قيمة أخدها، بتنخصم من نصيبه)
    const withdrawn = r.withdrawnCash + r.advances + r.products;
    const carryInDebt = Number(carryInDebts.get(r.partner.id) || 0);
    const totalShareDeductions = withdrawn + carryInDebt;
    const remaining = shareAmount - totalShareDeductions;
    return {
      partner: r.partner,
      sharePercent: r.sharePercent,
      shareAmount,
      withdrawnCash: r.withdrawnCash,
      profitWithdrawals: r.profitWithdrawals,
      personalWithdrawals: r.personalWithdrawals,
      advances: r.advances,
      withdrawnProducts: r.products,
      withdrawn,
      carryInDebt,
      totalShareDeductions,
      remaining
    };
  });

  const cashToDistribute = basis === "cash" ? Math.max(cashNet, 0) : 0;
  const positiveRemainingTotal = rows.reduce((sum, r) => sum + Math.max(Number(r.remaining || 0), 0), 0);
  const boxPayoutRatio = basis === "cash" && positiveRemainingTotal > 0
    ? Math.min(cashToDistribute / positiveRemainingTotal, 1)
    : 1;
  rows.forEach((row) => {
    const due = Math.max(Number(row.remaining || 0), 0);
    row.boxPayout = basis === "cash" ? due * boxPayoutRatio : due;
    row.outsideDue = basis === "cash" ? Math.max(due - row.boxPayout, 0) : 0;
    row.overdrawn = Math.max(-Number(row.remaining || 0), 0);
  });

  const assignedWithdrawn = rows.reduce((sum, r) => sum + r.withdrawnCash, 0);
  const totalRemaining = rows.reduce((sum, r) => sum + r.remaining, 0);
  const totalBoxPayout = rows.reduce((sum, r) => sum + Number(r.boxPayout || 0), 0);
  const totalOutsideDue = rows.reduce((sum, r) => sum + Number(r.outsideDue || 0), 0);
  const totalOverdrawn = rows.reduce((sum, r) => sum + Number(r.overdrawn || 0), 0);
  return {
    basis,
    source,
    base,
    profit,
    cashNet,
    periodCashNet,
    moneyOnHand,
    physicalMoneyOnHand: moneyOnHand,
    protectedFunding,
    protectedOnHand,
    periodFundingNet,
    distributablePeriodCash,
    distributableOnHandCash,
    distributableNow: cashNet,
    cashBeforeDraws,
    totalPartnerAdvances,
    totalPartnerProducts,
    totalProfitWithdrawals: rows.reduce((sum, row) => sum + Number(row.profitWithdrawals || 0), 0),
    totalPersonalWithdrawals: rows.reduce((sum, row) => sum + Number(row.personalWithdrawals || 0), 0),
    totalCarryInDebt: rows.reduce((sum, row) => sum + Number(row.carryInDebt || 0), 0),
    totalRemaining,
    totalBoxPayout,
    totalOutsideDue,
    totalOverdrawn,
    debtTotal: Number(data.debtTotal || 0),
    rows,
    totalSharePercent: partnerShareTotalPercent(),
    assignedWithdrawn,
    unassignedWithdrawn: totalOwnerWithdrawn - assignedWithdrawn,
    totalWithdrawn: totalOwnerWithdrawn
  };
}

// صافي الصندوق لكل طريقة دفع (كاش/بنك/محفظة) من مخرجات reportData — مصدر موحّد تستخدمه شاشة التقارير والطباعة الاحترافية معاً
function cashboxBreakdown(data) {
  const payoutPayments = invoicePaymentTotals(data.payoutInvoices);
  const sumMethods = (obj) => paymentMethods.reduce((sum, method) => sum + Number((obj || {})[method] || 0), 0);

  const boxIn = {};
  const boxOut = {};
  const boxNet = {};
  paymentMethods.forEach((method) => {
    boxIn[method] = Number(data.salePayments[method] || 0)
      + Number(data.paymentPayments[method] || 0)
      + Number(data.workerPayments[method] || 0)
      + Number(data.workerTransactionInPayments?.[method] || 0)
      + Number(data.supplierReceiptPayments?.[method] || 0)
      + Number(data.partnerFundingInPayments?.[method] || 0);
    boxIn[method] += Number(data.ownerWithdrawalReturnPayments?.[method] || 0);
    boxOut[method] = Number(data.purchasePayments[method] || 0)
      + Number(data.supplierPaymentPayments[method] || 0)
      + Number(data.expensePayments[method] || 0)
      + Number(data.workerTransactionPayments[method] || 0)
      + Number(payoutPayments[method] || 0)
      + Number(data.ownerWithdrawalPayments[method] || 0)
      + Number(data.partnerFundingOutPayments?.[method] || 0);
    boxNet[method] = boxIn[method] - boxOut[method];
  });

  const paymentsReceived = sumMethods(data.paymentPayments);
  const supplierReceiptsReceived = sumMethods(data.supplierReceiptPayments);
  const workerTransactionInReceived = sumMethods(data.workerTransactionInPayments);
  const payoutsPaid = sumMethods(payoutPayments);
  const workerDrinksPaid = sumMethods(data.workerPayments);
  const cashIn = paymentMethods.reduce((sum, method) => sum + boxIn[method], 0);
  const cashOut = paymentMethods.reduce((sum, method) => sum + boxOut[method], 0);
  const cashInParts = [
    { label: "مقبوض البيع", amount: sumMethods(data.salePayments) },
    { label: "تسديد ديون", amount: paymentsReceived },
    { label: "مشروبات عمال", amount: workerDrinksPaid },
    { label: "دفعات من العمال", amount: workerTransactionInReceived },
    { label: "قبض من موردين", amount: supplierReceiptsReceived },
    { label: "تمويل شركاء", amount: sumMethods(data.partnerFundingInPayments) },
    { label: "إرجاع سحب شخصي", amount: sumMethods(data.ownerWithdrawalReturnPayments) }
  ];
  const cashOutParts = [
    { label: "مشتريات مدفوعة", amount: sumMethods(data.purchasePayments) },
    { label: "تسديد موردين", amount: sumMethods(data.supplierPaymentPayments) },
    { label: "مصروفات عامة", amount: sumMethods(data.expensePayments) },
    { label: "سلف عمال", amount: data.workerTransactionSummary.advances },
    { label: "قبضات عمال مدفوعة", amount: data.workerTransactionSummary.salaryPaid },
    { label: "دفعات لعملاء", amount: payoutsPaid },
    { label: "سحب أرباح", amount: sumMethods(data.profitWithdrawalPayments) },
    { label: "سحب شخصي لشريك", amount: sumMethods(data.personalWithdrawalPayments) },
    { label: "رد تمويل شريك", amount: sumMethods(data.partnerFundingOutPayments) }
  ];

  return {
    boxIn, boxOut, boxNet,
    cashIn, cashOut, cashNet: cashIn - cashOut,
    payoutPayments, paymentsReceived, payoutsPaid, workerDrinksPaid, workerTransactionInReceived, supplierReceiptsReceived,
    cashInParts, cashOutParts
  };
}

function reportItemRows(range) {
  return state.menu
    .map((item) => ({
      item,
      stats: menuItemProfitStats(item.id, range),
      workerStats: menuItemWorkerConsumptionStats(item.id, range)
    }))
    .filter((row) => row.stats.qty || row.stats.sales || row.stats.profit || row.workerStats.qty)
    .sort((a, b) => b.stats.profit - a.stats.profit);
}

function reportCustomerRows() {
  return state.customers
    .filter((customer) => Math.abs(Number(customer.balance || 0)) > 0.001)
    .sort((a, b) => Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0)))
    .slice(0, 30);
}

function normalizeCashTransfer(entry = {}) {
  const fromMethod = paymentMethods.includes(entry.fromMethod) ? entry.fromMethod : "cash";
  const toMethod = paymentMethods.includes(entry.toMethod) ? entry.toMethod : "bank";
  return {
    id: entry.id || uid("cashtransfer"),
    fromMethod,
    toMethod: toMethod === fromMethod ? (fromMethod === "cash" ? "bank" : "cash") : toMethod,
    amount: Math.max(Number(entry.amount || 0), 0),
    note: String(entry.note || "").trim(),
    createdAt: normalizeImportedDate(entry.createdAt || new Date().toISOString())
  };
}

// ─── حساب المورّد بالدين ─────────────────────────────────────
// المدفوع الآن لفاتورة مشتريات (افتراضيًا الكل — فالمشتريات القديمة مدفوعة كاملة).
function normalizePurchasePayments(purchase = {}) {
  const amount = Math.max(purchaseAmount(purchase), 0);
  const rawPayments = purchase.payments && typeof purchase.payments === "object" ? purchase.payments : null;
  const hasExplicitPayments = rawPayments && paymentMethods.some((method) => rawPayments[method] !== undefined && rawPayments[method] !== null && rawPayments[method] !== "");
  // نحفظ المدفوع الفعلي كاملاً؛ أي زيادة عن الفاتورة تصبح رصيداً عند المورد.
  if (hasExplicitPayments) return normalizedPaymentMap(rawPayments);

  const method = paymentMethods.includes(purchase.method) ? purchase.method : "cash";
  const paid = purchase.paidAmount === undefined || purchase.paidAmount === null
    ? amount
    : Math.max(Number(purchase.paidAmount || 0), 0);
  const payments = { cash: 0, bank: 0, wallet: 0 };
  payments[method] = paid;
  return payments;
}

function purchasePaidAmount(purchase) {
  return paymentTotal(normalizePurchasePayments(purchase));
}

// المبلغ المدفوع فوق قيمة الفاتورة يصبح رصيداً للعميل عند المورد.
function purchaseSupplierOverpayment(purchase = {}) {
  return Math.max(purchasePaidAmount(purchase) - purchaseAmount(purchase), 0);
}

function purchasePaymentCategory(purchase = {}) {
  const payments = normalizePurchasePayments(purchase);
  const paidMethods = paymentMethods.filter((method) => Number(payments[method] || 0) > 0.001);
  const hasCredit = purchaseSupplierCreditUsed(purchase) > 0.001;
  if (paidMethods.length && hasCredit) return "paid-credit";
  if (!paidMethods.length) return purchaseSupplierCreditUsed(purchase) > 0.001 ? "credit" : "none";
  if (paidMethods.length > 1) return "mixed";
  return paidMethods[0];
}

function purchasePaymentText(purchase = {}) {
  const payments = normalizePurchasePayments(purchase);
  const paidMethods = paymentMethods.filter((method) => Number(payments[method] || 0) > 0.001);
  if (!paidMethods.length) {
    const creditUsed = purchaseSupplierCreditUsed(purchase);
    return creditUsed > 0.001 ? `رصيد مورد ${money(creditUsed)}` : "بدون دفع";
  }
  const paidText = paidMethods
    .map((method) => `${paymentLabels[method] || method}: ${money(payments[method])}`)
    .join("، ");
  const overpayment = purchaseSupplierOverpayment(purchase);
  const creditUsed = purchaseSupplierCreditUsed(purchase);
  if (overpayment > 0.001) return `${paidText}، رصيد جديد عند المورد: ${money(overpayment)}`;
  return creditUsed > 0.001 ? `${paidText}، رصيد مورد مستخدم: ${money(creditUsed)}` : paidText;
}

// رصيد المورد المستخدم على فاتورة شراء: لا يحرّك الصندوق، لكنه يقلل دين الفاتورة.
function purchaseSupplierCreditUsed(purchase = {}) {
  const remainingAfterPaid = Math.max(purchaseAmount(purchase) - purchasePaidAmount(purchase), 0);
  return Math.min(Math.max(Number(purchase.supplierCreditUsed || 0), 0), remainingAfterPaid);
}

// المتبقّي دينًا للمورّد من فاتورة واحدة.
function purchaseSupplierDebt(purchase) {
  return Math.max(purchaseAmount(purchase) - purchasePaidAmount(purchase) - purchaseSupplierCreditUsed(purchase), 0);
}

// أرصدة الموردين: لكل مورد كم باقي عليك (دين) بعد خصم تسديداتك.
function supplierBalances() {
  const map = new Map();
  const ensure = (name) => {
    const supplier = String(name || "").trim();
    if (!supplier) return null;
    const entry = map.get(supplier) || {
      supplier,
      owed: 0,
      purchasesDebt: 0,
      directDebts: 0,
      paidOut: 0,
      creditNotes: 0,
      receiptsIn: 0,
      creditUsed: 0,
      purchaseOverpayments: 0,
      lastAt: ""
    };
    map.set(supplier, entry);
    return entry;
  };
  const touch = (entry, date) => {
    if (!entry || !date) return;
    if (!entry.lastAt || new Date(date || 0) > new Date(entry.lastAt || 0)) entry.lastAt = date;
  };
  (state.supplierOpeningBalances || []).forEach((opening) => {
    const entry = ensure(opening.supplier);
    if (!entry) return;
    const amount = Number(opening.owed || 0);
    entry.owed += amount;
    if (amount >= 0) entry.directDebts += amount;
    else entry.creditNotes += Math.abs(amount);
    touch(entry, opening.createdAt || state.workspaceStartedAt);
  });
  (state.purchases || []).forEach((purchase) => {
    const entry = ensure(purchase.supplier);
    if (!entry) return;
    const purchaseBalance = purchaseAmount(purchase) - purchasePaidAmount(purchase);
    entry.owed += purchaseBalance;
    entry.purchasesDebt += Math.max(purchaseBalance, 0);
    entry.purchaseOverpayments = Number(entry.purchaseOverpayments || 0) + Math.max(-purchaseBalance, 0);
    entry.creditUsed += purchaseSupplierCreditUsed(purchase);
    touch(entry, purchase.createdAt);
  });
  supplierLedgerTransactions().forEach((transaction) => {
    const entry = ensure(transaction.supplier);
    if (!entry) return;
    const amount = Number(transaction.amount || 0);
    if (transaction.type === SUPPLIER_PAYMENT_OUT_TYPE) {
      entry.owed -= amount;
      entry.paidOut += amount;
    } else if (transaction.type === SUPPLIER_DIRECT_DEBT_TYPE) {
      entry.owed += amount;
      entry.directDebts += amount;
    } else if (transaction.type === SUPPLIER_CREDIT_NOTE_TYPE) {
      entry.owed -= amount;
      entry.creditNotes += amount;
    } else if (transaction.type === SUPPLIER_RECEIPT_IN_TYPE) {
      entry.owed += amount;
      entry.receiptsIn += amount;
    }
    touch(entry, transaction.createdAt);
  });
  return Array.from(map.values())
    .map((entry) => {
      const owed = Math.round(entry.owed * 100) / 100;
      return {
        ...entry,
        owed,
        debt: Math.max(owed, 0),
        credit: Math.max(-owed, 0)
      };
    })
    .filter((entry) => Math.abs(entry.owed) > 0.001)
    .sort((a, b) => b.owed - a.owed);
}

function supplierBalanceForName(supplier) {
  const name = String(supplier || "").trim();
  if (!name) return null;
  return supplierBalances().find((entry) => entry.supplier === name) || {
    supplier: name,
    owed: 0,
    debt: 0,
    credit: 0,
    purchasesDebt: 0,
    directDebts: 0,
    paidOut: 0,
    creditNotes: 0,
    receiptsIn: 0,
    creditUsed: 0,
    purchaseOverpayments: 0,
    lastAt: ""
  };
}

// النقد الحالي مقسوم حسب الطريقة (كاش / بنك / محفظة)
// = رأس المال الافتتاحي + كل اللي دخل - كل اللي طلع (من بداية البرنامج)
function cashOnHand() {
  const opening = normalizeOpeningCash(state.openingCash);
  const methods = {
    cash: { opening: opening.cash, inflow: 0, outflow: 0, adjustments: 0, transferIn: 0, transferOut: 0 },
    bank: { opening: opening.bank, inflow: 0, outflow: 0, adjustments: 0, transferIn: 0, transferOut: 0 },
    wallet: { opening: opening.wallet, inflow: 0, outflow: 0, adjustments: 0, transferIn: 0, transferOut: 0 }
  };
  const add = (method, field, amount) => {
    if (methods[method]) methods[method][field] += Number(amount || 0);
  };

  // داخل: مقبوض البيع + تسديد ديون
  state.invoices.forEach((inv) => {
    if (invoiceIsCancelled(inv)) return;
    if (inv.type === "sale" || inv.type === "payment") {
      const p = invoiceCashboxPayments(inv);
      add("cash", "inflow", p.cash);
      add("bank", "inflow", p.bank);
      add("wallet", "inflow", p.wallet);
    }
  });

  (state.workerConsumptions || []).forEach((entry) => {
    if (entry.type !== "worker_price") return;
    add(entry.method || "cash", "inflow", entry.total);
  });

  // طالع: دفعات رجعناها لعملاء
  state.invoices.forEach((inv) => {
    if (invoiceIsCancelled(inv)) return;
    if (inv.type === "payout") {
      const p = invoiceCashboxPayments(inv);
      add("cash", "outflow", p.cash);
      add("bank", "outflow", p.bank);
      add("wallet", "outflow", p.wallet);
    }
  });

  // طالع: مشتريات (المدفوع فقط — الباقي دين للمورّد) + تسديدات الموردين + سلف/قبضات + مصروفات
  (state.purchases || []).forEach((p) => {
    const payments = normalizePurchasePayments(p);
    paymentMethods.forEach((method) => add(method, "outflow", payments[method]));
  });
  supplierPaymentOutTransactions().forEach((s) => add(s.method || "cash", "outflow", s.amount));
  supplierReceiptTransactions().forEach((s) => add(s.method || "cash", "inflow", s.amount));
  (state.workerTransactions || []).forEach((t) => {
    add(t.method || "cash", workerTransactionIsInflow(t) ? "inflow" : "outflow", t.amount);
  });
  (state.expenses || []).forEach((e) => add(e.method || "cash", "outflow", e.amount));

  // طالع: سحوبات صاحب المحل (حصته)
  (state.ownerWithdrawals || []).forEach((w) => add(w.method || "cash", ownerWithdrawalDirection(w) === "in" ? "inflow" : "outflow", w.amount));

  // تمويل الشركاء يغيّر الفلوس الفعلية فقط، ولا يدخل في المبيعات أو الربح.
  (state.partnerFundingTransactions || []).forEach((entry) => {
    add(entry.method || "cash", partnerFundingDirection(entry) === "in" ? "inflow" : "outflow", entry.amount);
  });

  // تسويات الجرد
  (state.cashAdjustments || []).forEach((a) => add(a.method || "cash", "adjustments", a.diff));

  // تحويلات داخلية بين كاش/بنك/محفظة: لا تزيد ولا تنقص مجموع الصندوق.
  (state.cashTransfers || []).map(normalizeCashTransfer).forEach((transfer) => {
    add(transfer.fromMethod, "transferOut", transfer.amount);
    add(transfer.toMethod, "transferIn", transfer.amount);
  });

  const total = { opening: 0, inflow: 0, outflow: 0, adjustments: 0, transferIn: 0, transferOut: 0, current: 0 };
  Object.values(methods).forEach((m) => {
    m.current = m.opening + m.inflow - m.outflow + m.adjustments + m.transferIn - m.transferOut;
    total.opening += m.opening;
    total.inflow += m.inflow;
    total.outflow += m.outflow;
    total.adjustments += m.adjustments;
    total.transferIn += m.transferIn;
    total.transferOut += m.transferOut;
    total.current += m.current;
  });

  return { methods, total };
}

// إجمالي المبيعات مجمّع حسب طريقة الدفع لفترة معيّنة — يُستخدم كصف واحد مختصر بدل تفصيل كل فاتورة
function salesCashSummary(range) {
  const totals = { cash: 0, bank: 0, wallet: 0, total: 0, count: 0 };
  (state.invoices || []).forEach((invoice) => {
    if (invoiceIsCancelled(invoice)) return;
    if (invoice.type !== "sale") return;
    if (!invoiceMatchesDateRange(invoice, range)) return;
    const payments = invoiceCashboxPayments(invoice);
    paymentMethods.forEach((method) => { totals[method] += Number(payments[method] || 0); });
    totals.count += 1;
  });
  totals.total = totals.cash + totals.bank + totals.wallet;
  return totals;
}

// دفتر أستاذ موحّد: كل حركة مالية فردية بالتفصيل (داخل/طالع/تحويل داخلي) ضمن فترة معيّنة — مصدر واحد لكل شيكل تحرّك
function buildCashLedgerEntries(range) {
  const entries = [];
  const push = (date, direction, method, amount, category, description) => {
    const amt = Number(amount || 0);
    if (amt <= 0.001) return;
    entries.push({ date, direction, method, amount: amt, category, description });
  };

  // ملاحظة: فواتير البيع ("sale") مش مفصّلة هون سطر لكل فاتورة — مجمّعة بصف واحد فوق القائمة (salesCashSummary)
  // لأنها بتكون كتيرة عدد، وتفاصيلها الكاملة أصلاً بصفحة الفواتير.
  (state.invoices || []).forEach((invoice) => {
    if (invoiceIsCancelled(invoice)) return;
    if (!invoiceMatchesDateRange(invoice, range)) return;
    if (invoice.type === "payment") {
      const payments = invoiceCashboxPayments(invoice);
      paymentMethods.forEach((method) => push(invoice.createdAt, "in", method, payments[method], "تسديد دين", `${invoice.customerName || "عميل"}${invoice.note ? ` — ${invoice.note}` : ""}`));
    } else if (invoice.type === "payout") {
      const payments = invoiceCashboxPayments(invoice);
      paymentMethods.forEach((method) => push(invoice.createdAt, "out", method, payments[method], "دفع رصيد لعميل", invoice.customerName || "عميل"));
    }
  });

  (state.workerConsumptions || []).forEach((entry) => {
    if (entry.type !== "worker_price") return;
    if (!dateMatchesRange(entry, range)) return;
    push(entry.createdAt, "in", entry.method, entry.total, "مشروبات عمال", `${entry.workerName || "عامل"} — ${entry.itemName || ""}`);
  });

  (state.purchases || []).forEach((purchase) => {
    if (!dateMatchesRange(purchase, range)) return;
    const payments = normalizePurchasePayments(purchase);
    paymentMethods.forEach((method) => {
      push(purchase.createdAt, "out", method, payments[method], "مشتريات", `${purchase.number || "فاتورة مشتريات"}${purchase.supplier ? ` — ${purchase.supplier}` : ""}`);
    });
  });

  supplierLedgerTransactions().forEach((transaction) => {
    if (!dateMatchesRange(transaction, range)) return;
    if (transaction.type === SUPPLIER_PAYMENT_OUT_TYPE) {
      push(transaction.createdAt, "out", transaction.method, transaction.amount, "تسديد مورّد", `${transaction.supplier || "مورّد"}${transaction.note ? ` — ${transaction.note}` : ""}`);
    } else if (transaction.type === SUPPLIER_RECEIPT_IN_TYPE) {
      push(transaction.createdAt, "in", transaction.method, transaction.amount, "قبض من مورّد", `${transaction.supplier || "مورّد"}${transaction.note ? ` — ${transaction.note}` : ""}`);
    }
  });

  (state.expenses || []).forEach((expense) => {
    if (!dateMatchesRange(expense, range)) return;
    push(expense.createdAt, "out", expense.method, expense.amount, "مصروف عام", expense.title || "مصروف");
  });

  (state.workerTransactions || []).forEach((t) => {
    if (!dateMatchesRange(t, range)) return;
    if (workerTransactionIsInflow(t)) {
      const category = t.type === WORKER_CAFE_FUNDING_TYPE ? "تمويل من عامل" : "دفعة من عامل";
      push(t.createdAt, "in", t.method, t.amount, category, `${t.workerName || "عامل"}${t.note ? ` — ${t.note}` : ""}`);
      return;
    }
    if (t.type === WORKER_CAFE_FUNDING_REFUND_TYPE) {
      push(t.createdAt, "out", t.method, t.amount, "إرجاع تمويل عامل", `${t.workerName || "عامل"}${t.note ? ` — ${t.note}` : ""}`);
      return;
    }
    const isSalary = t.type === WORKER_SALARY_PAYMENT_TYPE;
    push(t.createdAt, "out", t.method, t.amount, isSalary ? "قبضة/راتب عامل" : "سلفة عامل", t.workerName || "عامل");
  });

  (state.ownerWithdrawals || []).forEach((w) => {
    if (!ownerWithdrawalMatchesRange(w, range)) return;
    const kind = ownerWithdrawalKind(w);
    push(w.createdAt, ownerWithdrawalDirection(w), w.method, w.amount, ownerWithdrawalTypeLabel(kind), `${w.partnerName || "شريك غير محدد"}${w.note ? ` — ${w.note}` : ""}`);
  });

  (state.partnerFundingTransactions || []).forEach((entry) => {
    if (!dateMatchesRange(entry, range)) return;
    const isIn = partnerFundingDirection(entry) === "in";
    push(
      entry.createdAt,
      isIn ? "in" : "out",
      entry.method,
      entry.amount,
      partnerFundingTypeLabel(entry.type),
      `${entry.partnerName || "شريك"}${entry.note ? ` — ${entry.note}` : ""}`
    );
  });

  (state.cashAdjustments || []).forEach((adjustment) => {
    if (!dateMatchesRange(adjustment, range)) return;
    const diff = Number(adjustment.diff || 0);
    if (Math.abs(diff) <= 0.001) return;
    push(adjustment.createdAt, diff > 0 ? "in" : "out", adjustment.method, Math.abs(diff), "تسوية جرد الصندوق", diff > 0 ? "زيادة عند العدّ الفعلي" : "نقص عند العدّ الفعلي");
  });

  (state.cashTransfers || []).map(normalizeCashTransfer).forEach((transfer) => {
    if (!dateMatchesRange(transfer, range)) return;
    if (transfer.amount <= 0.001) return;
    entries.push({
      date: transfer.createdAt,
      direction: "transfer",
      fromMethod: transfer.fromMethod,
      toMethod: transfer.toMethod,
      amount: transfer.amount,
      category: "تحويل داخلي",
      description: transfer.note || `من ${cashMethodLabel(transfer.fromMethod)} إلى ${cashMethodLabel(transfer.toMethod)}`
    });
  });

  return entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

// صافي حركة الصندوق اليوم مقسوم حسب الطريقة
function todayCashBox() {
  const todayKey = todayDateInputValue();
  const isToday = (iso) => String(iso || "").slice(0, 10) === todayKey;
  const methods = {
    cash: { in: 0, out: 0, transferIn: 0, transferOut: 0, saleIn: 0, debtIn: 0, workerIn: 0 },
    bank: { in: 0, out: 0, transferIn: 0, transferOut: 0, saleIn: 0, debtIn: 0, workerIn: 0 },
    wallet: { in: 0, out: 0, transferIn: 0, transferOut: 0, saleIn: 0, debtIn: 0, workerIn: 0 }
  };
  const add = (m, field, amount) => { if (methods[m]) methods[m][field] += Number(amount || 0); };

  state.invoices.forEach((inv) => {
    if (!isToday(inv.createdAt)) return;
    if (invoiceIsCancelled(inv)) return;
    const p = invoiceCashboxPayments(inv);
    if (inv.type === "sale" || inv.type === "payment") {
      const sourceField = inv.type === "sale" ? "saleIn" : "debtIn";
      add("cash", "in", p.cash); add("cash", sourceField, p.cash);
      add("bank", "in", p.bank); add("bank", sourceField, p.bank);
      add("wallet", "in", p.wallet); add("wallet", sourceField, p.wallet);
    } else if (inv.type === "payout") {
      add("cash", "out", p.cash); add("bank", "out", p.bank); add("wallet", "out", p.wallet);
    }
  });
  (state.workerConsumptions || []).forEach((entry) => {
    if (!isToday(entry.createdAt) || entry.type !== "worker_price") return;
    add(entry.method || "cash", "in", entry.total);
    add(entry.method || "cash", "workerIn", entry.total);
  });
  (state.purchases || []).forEach((p) => {
    if (!isToday(p.createdAt)) return;
    const payments = normalizePurchasePayments(p);
    paymentMethods.forEach((method) => add(method, "out", payments[method]));
  });
  supplierPaymentOutTransactions().forEach((s) => { if (isToday(s.createdAt)) add(s.method || "cash", "out", s.amount); });
  supplierReceiptTransactions().forEach((s) => { if (isToday(s.createdAt)) add(s.method || "cash", "in", s.amount); });
  (state.workerTransactions || []).forEach((t) => {
    if (!isToday(t.createdAt)) return;
    add(t.method || "cash", workerTransactionIsInflow(t) ? "in" : "out", t.amount);
  });
  (state.expenses || []).forEach((e) => { if (isToday(e.createdAt)) add(e.method || "cash", "out", e.amount); });
  (state.ownerWithdrawals || []).forEach((w) => { if (isToday(w.createdAt)) add(w.method || "cash", ownerWithdrawalDirection(w) === "in" ? "in" : "out", w.amount); });
  (state.partnerFundingTransactions || []).forEach((entry) => {
    if (!isToday(entry.createdAt)) return;
    add(entry.method || "cash", partnerFundingDirection(entry) === "in" ? "in" : "out", entry.amount);
  });
  (state.cashTransfers || []).map(normalizeCashTransfer).forEach((transfer) => {
    if (!isToday(transfer.createdAt)) return;
    add(transfer.fromMethod, "transferOut", transfer.amount);
    add(transfer.toMethod, "transferIn", transfer.amount);
  });

  const total = { in: 0, out: 0, net: 0, saleIn: 0, debtIn: 0, workerIn: 0 };
  Object.values(methods).forEach((m) => {
    m.net = m.in - m.out + m.transferIn - m.transferOut;
    total.in += m.in;
    total.out += m.out;
    total.net += m.net;
    total.saleIn += m.saleIn;
    total.debtIn += m.debtIn;
    total.workerIn += m.workerIn;
  });
  return { methods, total };
}

function normalizeMenuItems(items = []) {
  return items.map((item) => {
    const next = { ...item };
    if (next.stockQty !== undefined && next.stockQty !== null && next.stockQty !== "") {
      next.stockQty = Number(next.stockQty || 0);
    }
    if (next.finishedStockQty !== undefined && next.finishedStockQty !== null && next.finishedStockQty !== "") {
      next.finishedStockQty = Number(next.finishedStockQty || 0);
    }
    next.cost = Math.max(Number(next.cost || 0), 0);
    next.manualLastUnitCost = Math.max(Number(next.manualLastUnitCost || 0), 0);
    next.operatingCost = Math.max(Number(next.operatingCost || 0), 0);
    next.operatingCostType = operatingCostTypes.includes(next.operatingCostType) ? next.operatingCostType : "other";
    next.stockUnit = normalizeUnit(next.stockUnit || next.unit || "");
    next.components = normalizeMenuComponents(next.components || [], next.id);
    next.options = normalizeMenuOptions(next.options || []);
    next.favorite = !!next.favorite;
    next.saleVisible = next.saleVisible !== false;
    return next;
  });
}

function menuItemIsSaleVisible(item) {
  return Boolean(item) && item.saleVisible !== false;
}

function normalizeMenuOptions(options = []) {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt) => ({
      id: opt.id || uid("opt"),
      label: String(opt.label || opt.name || "").trim(),
      price: Math.max(Number(opt.price || 0), 0),
      componentMode: opt.componentMode === "custom" ? "custom" : "inherit",
      includeOperatingCost: opt.includeOperatingCost !== false,
      components: normalizeMenuComponents(opt.components || [])
    }))
    .filter((opt) => opt.label && opt.price > 0);
}

function normalizeUnit(unit = "") {
  return String(unit || "").trim();
}

function normalizeMenuComponents(components = [], ownerId = "") {
  if (!ENABLE_STOCK_COMPONENTS) return [];
  return components.map((component) => ({
    id: component.id || uid("component"),
    itemId: component.itemId || component.menuItemId || "",
    purchaseItemName: String(component.purchaseItemName || component.sourceName || component.name || "").trim(),
    qty: Number(component.qty || 0),
    unit: normalizeUnit(component.unit || "")
  })).filter((component) => {
    return component.itemId && component.itemId !== ownerId && Number(component.qty || 0) > 0;
  });
}

function isStockTracked(item) {
  return item && item.stockQty !== undefined && item.stockQty !== null && item.stockQty !== "";
}

function quantityText(value) {
  const number = Number(value || 0);
  return (number % 1 ? _qtyFormatterFraction : _qtyFormatterWhole).format(number);
}

function itemUnit(item) {
  return normalizeUnit(item?.stockUnit || item?.unit || "");
}

function quantityWithUnit(value, unit = "") {
  const cleanUnit = normalizeUnit(unit);
  return cleanUnit ? `${quantityText(value)} ${cleanUnit}` : quantityText(value);
}

function stockText(item) {
  const stock = menuItemDisplayStock(item);
  return stock.tracked ? stock.text : "غير متتبع";
}

function menuItemDisplayStock(item) {
  const components = ENABLE_STOCK_COMPONENTS ? menuItemComponents(item) : [];
  if (components.length) {
    if (item.finishedStockQty !== undefined && item.finishedStockQty !== null && item.finishedStockQty !== "") {
      const finishedQty = Number(item.finishedStockQty || 0);
      return {
        tracked: true,
        qty: finishedQty,
        unit: itemUnit(item) || "وحدة",
        text: `${quantityWithUnit(finishedQty, itemUnit(item) || "وحدة")} من الجرد`,
        isLow: finishedQty <= 0,
        source: "finished"
      };
    }
    const possibleUnits = components.map((component) => {
      const stockItem = inventoryItemById(component.itemId);
      const requiredQty = Number(component.qty || 0);
      const availableQty = stockItem ? Number(stockItem.stockQty || 0) : 0;
      return requiredQty > 0 ? availableQty / requiredQty : 0;
    });
    const stockQty = Math.max(Math.floor(Math.min(...possibleUnits)), 0);
    return {
      tracked: true,
      qty: stockQty,
      unit: "وحدة",
      text: `${quantityWithUnit(stockQty, "وحدة")} من الجرد`,
      isLow: stockQty <= 0,
      source: "inventory"
    };
  }

  if (!isStockTracked(item)) {
    return { tracked: false, qty: 0, unit: "", text: "غير متتبع", isLow: false, source: "none" };
  }

  const stockQty = Number(item.stockQty || 0);
  return {
    tracked: true,
    qty: stockQty,
    unit: itemUnit(item),
    text: quantityWithUnit(stockQty, itemUnit(item)),
    isLow: stockQty <= 0,
    source: "direct"
  };
}

function findMenuItem(itemId) {
  return state.menu.find((item) => item.id === itemId) || null;
}

function findMenuItemByName(name) {
  const cleanedName = String(name || "").trim().toLowerCase();
  if (!cleanedName) return null;
  return state.menu.find((item) => item.name.trim().toLowerCase() === cleanedName) || null;
}

function adjustMenuStock(itemId, qtyDelta) {
  const item = findMenuItem(itemId);
  if (!item || !Number.isFinite(Number(qtyDelta))) return null;
  item.stockQty = Math.max((isStockTracked(item) ? Number(item.stockQty || 0) : 0) + Number(qtyDelta), 0);
  item.updatedAt = new Date().toISOString();
  return item;
}

function menuItemComponents(item) {
  return normalizeMenuComponents(item?.components || [], item?.id || "");
}

function stockItemRecipeUnitCost(item) {
  const lastCost = Number(item?.lastPurchaseUnitCost || 0);
  if (Number.isFinite(lastCost) && lastCost > 0) return lastCost;
  const averageCost = Number(item?.averageUnitCost || 0);
  if (Number.isFinite(averageCost) && averageCost > 0) return averageCost;
  return Math.max(Number(item?.cost || 0), 0);
}

function menuItemBaseCost(item) {
  if (!ENABLE_STOCK_COMPONENTS) return Number(item?.cost || 0);
  const components = menuItemComponents(item);
  if (!components.length) return Number(item?.cost || 0);
  return components.reduce((sum, component) => {
    const stockItem = inventoryItemById(component.itemId);
    return sum + Number(component.qty || 0) * stockItemRecipeUnitCost(stockItem);
  }, 0);
}

function menuItemOperatingCost(item) {
  return Math.max(Number(item?.operatingCost || 0), 0);
}

function menuItemRecipeCost(item) {
  return menuItemBaseCost(item) + menuItemOperatingCost(item);
}

function operatingCostText(item) {
  const amount = menuItemOperatingCost(item);
  if (amount <= 0) return "";
  const label = operatingCostLabels[item?.operatingCostType] || operatingCostLabels.other;
  return `${label}: ${money(amount)}`;
}

function stockUsageFromMenuItem(item) {
  if (!ENABLE_STOCK_COMPONENTS) {
    return isStockTracked(item) ? [{ itemId: item.id, name: item.name, qty: 1, unit: itemUnit(item) }] : [];
  }
  const components = menuItemComponents(item);
  const usage = components.length
    ? components.map((component) => {
      const stockItem = inventoryItemById(component.itemId);
      return {
        itemId: component.itemId,
        name: stockItem?.name || component.purchaseItemName || "",
        qty: Number(component.qty || 0),
        unit: component.unit || itemUnit(stockItem)
      };
    })
    : isStockTracked(item) ? [{ itemId: item.id, name: item.name, qty: 1, unit: itemUnit(item) }] : [];

  return usage.filter((line) => line.itemId && Number(line.qty || 0) > 0);
}

function stockUsageFromMenuOption(item, option) {
  if (!option || option.componentMode !== "custom") return stockUsageFromMenuItem(item);
  return mergeStockUsage(normalizeMenuComponents(option.components || [], item?.id || "").map((component) => ({
    itemId: component.itemId,
    name: component.purchaseItemName || inventoryItemById(component.itemId)?.name || "مكون مخزون",
    qty: component.qty,
    unit: component.unit || itemUnit(inventoryItemById(component.itemId))
  })));
}

function menuOptionRecipeCost(item, option) {
  if (!option) return menuItemRecipeCost(item);
  const operatingCost = option.includeOperatingCost === false ? 0 : menuItemOperatingCost(item);
  if (option.componentMode !== "custom") {
    return Math.max(menuItemRecipeCost(item) - menuItemOperatingCost(item), 0) + operatingCost;
  }
  const componentsCost = normalizeMenuComponents(option.components || [], item?.id || "").reduce((sum, component) => {
    return sum + stockItemRecipeUnitCost(inventoryItemById(component.itemId)) * Number(component.qty || 0);
  }, 0);
  return componentsCost + operatingCost;
}

function mergeStockUsage(usage = []) {
  const merged = new Map();
  usage.forEach((line) => {
    const itemId = line.itemId || line.id;
    const qty = Number(line.qty || 0);
    if (!itemId || qty <= 0) return;
    const stockItem = inventoryItemById(itemId);
    const existing = merged.get(itemId) || { itemId, name: line.name || stockItem?.name || "", qty: 0, unit: normalizeUnit(line.unit || itemUnit(stockItem)) };
    existing.qty += qty;
    if (!existing.unit) existing.unit = normalizeUnit(line.unit || itemUnit(stockItem));
    merged.set(itemId, existing);
  });
  return Array.from(merged.values());
}

function stockUsageForSoldLine(line) {
  if (!ENABLE_STOCK_COMPONENTS) {
    return mergeStockUsage(stockUsageFromMenuItem(findMenuItem(line.id)));
  }
  if (Array.isArray(line.stockUsage) && line.stockUsage.length) {
    return mergeStockUsage(line.stockUsage);
  }
  return mergeStockUsage(stockUsageFromMenuItem(findMenuItem(line.id)));
}

function applySoldStockUsage(items = [], direction = -1) {
  const results = [];
  items.forEach((line) => {
    const lineQty = Number(line.qty || 0);
    if (lineQty <= 0) return;
    const soldMenuItem = findMenuItem(line.id);
    if (soldMenuItem && menuItemComponents(soldMenuItem).length && soldMenuItem.finishedStockQty !== undefined) {
      const availableQty = Math.max(Number(soldMenuItem.finishedStockQty || 0), 0);
      const appliedQty = direction < 0 ? Math.min(lineQty, availableQty) : lineQty;
      soldMenuItem.finishedStockQty = Math.max(availableQty + (direction * appliedQty), 0);
      soldMenuItem.updatedAt = new Date().toISOString();
      results.push({
        kind: "finished",
        itemId: soldMenuItem.id,
        name: soldMenuItem.name,
        unit: itemUnit(soldMenuItem),
        requestedQty: lineQty,
        appliedQty,
        uncoveredQty: direction < 0 ? Math.max(lineQty - appliedQty, 0) : 0,
        delta: direction * appliedQty,
        applied: appliedQty > 0
      });
    }
    stockUsageForSoldLine(line).forEach((usage) => {
      const usedQty = lineQty * Number(usage.qty || 0);
      let adjusted = null;
      let stockItem = null;
      if (isPurchaseInventoryId(usage.itemId)) {
        stockItem = inventoryItemById(usage.itemId);
        if (!stockItem && typeof purchaseInventoryItemFromUsage === "function") {
          stockItem = purchaseInventoryItemFromUsage(usage);
        }
      } else {
        stockItem = findMenuItem(usage.itemId);
      }
      const availableQty = Math.max(Number(stockItem?.stockQty || 0), 0);
      const appliedQty = direction < 0 ? Math.min(usedQty, availableQty) : usedQty;
      const delta = direction * appliedQty;
      if (stockItem) adjusted = isPurchaseInventoryId(stockItem.id)
        ? adjustPurchaseInventoryStock(stockItem.id, delta)
        : adjustMenuStock(stockItem.id, delta);
      results.push({
        ...usage,
        itemId: adjusted?.id || usage.itemId,
        name: adjusted?.name || usage.name,
        unit: usage.unit || itemUnit(adjusted),
        qty: usedQty,
        requestedQty: usedQty,
        appliedQty,
        uncoveredQty: direction < 0 ? Math.max(usedQty - appliedQty, 0) : 0,
        delta,
        applied: Boolean(adjusted) && appliedQty > 0
      });
    });
  });
  return results;
}

function reduceStockForSoldItems(items = []) {
  const results = [];
  (items || []).forEach((line) => {
    const lineResults = applySoldStockUsage([line], -1);
    mergeSoldStockAppliedUsage(line, lineResults);
    results.push(...lineResults);
  });
  return results;
}

function restoreStockForSoldItems(items = []) {
  const results = [];
  (items || []).forEach((line) => {
    const appliedUsage = soldStockAppliedUsage(line);
    if (appliedUsage.length) {
      results.push(...restoreSoldStockAppliedUsage(line, 1));
    } else {
      results.push(...applySoldStockUsage([line], 1));
    }
  });
  return results;
}

function soldStockAppliedUsage(line) {
  return Array.isArray(line?.stockAppliedUsage)
    ? line.stockAppliedUsage.filter((usage) => Number(usage?.appliedQty || 0) > 0 || Number(usage?.uncoveredQty || 0) > 0)
    : [];
}

function mergeSoldStockAppliedUsage(line, results = []) {
  if (!line) return;
  const merged = new Map(soldStockAppliedUsage(line).map((usage) => [`${usage.kind || "stock"}:${usage.itemId}`, { ...usage }]));
  results.forEach((result) => {
    const key = `${result.kind || "stock"}:${result.itemId}`;
    const current = merged.get(key) || { ...result, requestedQty: 0, appliedQty: 0, uncoveredQty: 0 };
    current.requestedQty = Number(current.requestedQty || 0) + Number(result.requestedQty || result.qty || 0);
    current.appliedQty = Number(current.appliedQty || 0) + Number(result.appliedQty || 0);
    current.uncoveredQty = Number(current.uncoveredQty || 0) + Number(result.uncoveredQty || 0);
    merged.set(key, current);
  });
  line.stockAppliedUsage = [...merged.values()];
}

function restoreSoldStockAppliedUsage(line, ratio = 1) {
  const safeRatio = Math.min(Math.max(Number(ratio || 0), 0), 1);
  const remaining = [];
  const results = [];
  soldStockAppliedUsage(line).forEach((usage) => {
    const restoreQty = Number(usage.appliedQty || 0) * safeRatio;
    let adjusted = null;
    if (restoreQty > 0) {
      if (usage.kind === "finished") {
        adjusted = findMenuItem(usage.itemId);
        if (adjusted) {
          adjusted.finishedStockQty = Math.max(Number(adjusted.finishedStockQty || 0), 0) + restoreQty;
          adjusted.updatedAt = new Date().toISOString();
        }
      } else if (isPurchaseInventoryId(usage.itemId)) {
        adjusted = adjustPurchaseInventoryStock(usage.itemId, restoreQty);
      } else {
        adjusted = adjustMenuStock(usage.itemId, restoreQty);
      }
    }
    results.push({ ...usage, qty: restoreQty, delta: restoreQty, applied: Boolean(adjusted) });
    const rest = {
      ...usage,
      requestedQty: Number(usage.requestedQty || 0) * (1 - safeRatio),
      appliedQty: Number(usage.appliedQty || 0) * (1 - safeRatio),
      uncoveredQty: Number(usage.uncoveredQty || 0) * (1 - safeRatio)
    };
    if (rest.appliedQty > 0.000001 || rest.uncoveredQty > 0.000001) remaining.push(rest);
  });
  if (remaining.length) line.stockAppliedUsage = remaining;
  else delete line.stockAppliedUsage;
  return results;
}

function soldLineQty(line) {
  const qty = Number(line?.qty || 0);
  return Number.isFinite(qty) ? Math.max(qty, 0) : 0;
}

function soldStockReservationQty(line) {
  const qty = Number(line?.stockReservedQty ?? line?.stockAppliedQty ?? 0);
  return Number.isFinite(qty) ? Math.max(qty, 0) : 0;
}

function setSoldStockReservationQty(line, qty) {
  if (!line) return;
  const nextQty = Math.max(Number(qty || 0), 0);
  if (nextQty > 0) line.stockReservedQty = nextQty;
  else delete line.stockReservedQty;
  if (Object.prototype.hasOwnProperty.call(line, "stockAppliedQty")) delete line.stockAppliedQty;
}

function stockAdjustmentLine(line, qty) {
  return {
    ...line,
    qty,
    stockUsage: Array.isArray(line?.stockUsage)
      ? line.stockUsage.map((usage) => ({ ...usage }))
      : line?.stockUsage,
    stockAppliedUsage: []
  };
}

function reserveSoldLineStock(line, qtyDelta = 1) {
  const qty = Math.max(Number(qtyDelta || 0), 0);
  if (!line || qty <= 0 || !stockUsageForSoldLine(line).length) return [];
  const adjustmentLine = stockAdjustmentLine(line, qty);
  const results = reduceStockForSoldItems([adjustmentLine]);
  mergeSoldStockAppliedUsage(line, results);
  setSoldStockReservationQty(line, soldStockReservationQty(line) + qty);
  return results;
}

function releaseSoldLineReservedStock(line, qtyDelta = Infinity) {
  if (!line) return [];
  const currentReserved = soldStockReservationQty(line);
  const requestedQty = Number.isFinite(Number(qtyDelta))
    ? Math.max(Number(qtyDelta || 0), 0)
    : currentReserved;
  const qty = Math.min(currentReserved, requestedQty);
  if (qty <= 0) return [];
  const results = soldStockAppliedUsage(line).length
    ? restoreSoldStockAppliedUsage(line, qty / currentReserved)
    : applySoldStockUsage([stockAdjustmentLine(line, qty)], 1);
  setSoldStockReservationQty(line, currentReserved - qty);
  return results;
}

function ensureSoldLineStockReserved(line) {
  if (!line) return [];
  const qty = soldLineQty(line);
  const reserved = soldStockReservationQty(line);
  if (reserved < qty) return reserveSoldLineStock(line, qty - reserved);
  if (reserved > qty) return releaseSoldLineReservedStock(line, reserved - qty);
  return [];
}

function ensureSoldItemsStockReserved(items = []) {
  const results = [];
  (items || []).forEach((line) => {
    results.push(...ensureSoldLineStockReserved(line));
  });
  return results;
}

function releaseSoldItemsReservedStock(items = []) {
  const results = [];
  (items || []).forEach((line) => {
    results.push(...releaseSoldLineReservedStock(line));
  });
  return results;
}

function stockUsageAppliedText(results = []) {
  return results
    .filter((line) => line.applied && Number(line.qty || 0) > 0)
    .map((line) => `${line.name || "مخزون"} ${quantityWithUnit(Number(line.qty || 0), line.unit || "")}`)
    .join("، ");
}

function getOrderPayment(order) {
  const payments = order.payments || {};
  const methods = ["cash", "bank", "wallet"];
  const activeMethod = methods.find((method) => Number(payments[method] || 0) > 0);
  const method = order.paymentMethod || activeMethod || getLastPaymentMethod();
  return {
    method,
    amount: paymentTotal(payments) || Number(payments[method] || 0)
  };
}

function invoiceStatus(delta, type = "sale") {
  if (type === "payment") return "payment";
  if (type === "payout") return "payout";
  if (delta > 0.001) return "debt";
  if (delta < -0.001) return "credit";
  return "paid";
}

function statusText(status) {
  return {
    paid: "مدفوعة",
    debt: "دين",
    credit: "مدفوعة + رصيد",
    payment: "دفعة حساب",
    payout: "دفع للعميل",
    cancelled: "ملغاة",
    temporary: "صنف مؤقت"
  }[status] || status;
}

function formatDate(iso) {
  return _dateFormatter.format(new Date(iso));
}

function formatDateOnly(iso) {
  return _dateOnlyFormatter.format(new Date(iso));
}

function formatTimeOnly(iso) {
  return _timeOnlyFormatter.format(new Date(iso));
}

function balanceText(balance) {
  if (balance > 0.001) return `عليه ${money(balance)}`;
  if (balance < -0.001) return `له رصيد ${money(Math.abs(balance))}`;
  return "حسابه صافي";
}

function balanceClass(balance) {
  if (balance > 0.001) return "debt";
  if (balance < -0.001) return "credit";
  return "clear";
}

function showToast(message) {
  const undoable = typeof isUndoArmed === "function" && isUndoArmed();
  els.toast.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = message;
  els.toast.appendChild(text);
  let duration = 2400;
  if (undoable) {
    undoArmedAt = 0; // استهلاك التسليح حتى لا يظهر الزر على رسالة لاحقة
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "toast-undo-button";
    undoBtn.textContent = "↩ تراجع";
    undoBtn.addEventListener("click", () => {
      els.toast.classList.remove("is-visible");
      performUndo();
    });
    els.toast.appendChild(undoBtn);
    duration = 6000;
  }
  els.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), duration);
}
