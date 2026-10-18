// ═══ دفتر المقهى ═══ 03-pos.js — شاشة البيع: الطاولات، الطلب، المنيو، مسودة المشتريات
// (مقسوم من app.js — الأسطر 1456-1963)

const FAVORITES_CATEGORY = "⭐ المفضلة";
const COMBOS_CATEGORY = "🎁 عروض";

function renderComboCards() {
  const combos = state.combos || [];
  if (!combos.length) return '<div class="empty-state">لا توجد عروض. أضفها من صفحة الأصناف.</div>';
  return combos.map((combo) => {
    const itemsText = (combo.items || []).map((ci) => {
      const it = (state.menu || []).find((m) => m.id === ci.menuItemId);
      return it ? `${escapeHtml(it.name)}${Number(ci.qty) > 1 ? ` ×${ci.qty}` : ""}` : "";
    }).filter(Boolean).join(" + ");
    return `
      <article class="menu-item is-combo" role="button" tabindex="0" data-combo-id="${escapeAttr(combo.id)}">
        <span class="menu-fav-star" aria-hidden="true">🎁</span>
        <strong>${escapeHtml(combo.name)}</strong>
        <span>${money(combo.price)}</span>
        <small class="menu-stock">${itemsText}</small>
      </article>`;
  }).join("");
}

function render() {
  ensurePermittedView();
  renderTabs();
  renderActiveView();
  renderBackupReminder();
  applyBusinessName();
  applyAppTheme();
  rememberUiLocation();
  saveUiState();
  saveState({ backup: false });
}

function renderPosOnly() {
  renderTables();
  renderCustomerSelect();
  renderOrder();
  renderMenu();
  rememberUiLocation();
  saveUiState();
  saveState({ backup: false });
}

function renderActiveView() {
  ensurePermittedView();
  const view = state.view || "pos";

  if (view === "dashboard") {
    renderDashboard();
  } else if (view === "pos") {
    renderStats();
    renderTodayCashStrip();
    renderTables();
    renderCustomerSelect();
    renderOrder();
    renderMenu();
  } else if (view === "invoices") {
    renderStats();
    renderTodayCashStrip();
    renderInvoices();
  } else if (view === "customers") {
    renderCustomers();
    renderCustomerDetail();
  } else if (view === "reports") {
    renderReports();
    renderTopItemsAndPeakHours();
  } else if (view === "purchases") {
    setPurchaseSection(selectedPurchaseSection, { persist: false });
    renderPurchaseItemSelect();
    renderPurchaseDraft();
    renderPurchaseUnitCost();
    renderPurchases();
    if (typeof renderSupplierDebts === "function") renderSupplierDebts();
  } else if (view === "inventory") {
    renderInventory();
    renderLowStock();
  } else if (view === "settings") {
    renderMenuComponentsEditor();
    renderSettingsMenu();
  } else if (view === "expenses") {
    renderExpenses();
  } else if (view === "close") {
    renderCloseInfo();
  } else if (view === "guide") {
    renderGuide();
  }
}

function switchView(view) {
  if (!view) return;
  if (!canAccessView(view)) {
    if (typeof requestManagerAccess === "function") requestManagerAccess(view);
    else showToast("هذه الصفحة تحتاج صلاحية مدير.");
    return;
  }
  if (state.view === view) {
    renderTabs();
    if (view === "pos") focusMenuSearchSoon();
    rememberUiLocation();
    saveUiState();
    return;
  }

  state.view = view;
  renderTabs();
  renderActiveView();
  renderBackupReminder();
  applyBusinessName();
  applyAppTheme();
  if (view === "pos") focusMenuSearchSoon();
  rememberUiLocation();
  saveUiState();
  saveState({ backup: false });
}

function renderTabs() {
  ensurePermittedView();
  if (typeof syncRoleUi === "function") syncRoleUi();
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === state.view));
  els.views.forEach((view) => view.classList.toggle("is-active", view.id === `view-${state.view || "pos"}`));
  const onInvoices = (state.view || "pos") === "invoices";
  els.statsStrip.hidden = !onInvoices;
  if (els.todayCashStrip) els.todayCashStrip.hidden = !onInvoices;
  if (typeof syncMobileMoreActive === "function") syncMobileMoreActive();
}

function renderTodayCashStrip() {
  if (!els.todayCashStrip || els.todayCashStrip.hidden) return; // لا تحسب شريطًا مخفيًا
  const box = todayCashBox();
  const cards = cashMethodMeta.map(({ key, label, icon }) => {
    const m = box.methods[key];
    const transferText = (m.transferIn || m.transferOut)
      ? ` | تحويل +${money(m.transferIn)} / -${money(m.transferOut)}`
      : "";
    return `
      <article class="today-cash-card ${m.net >= 0 ? "" : "is-negative"}">
        <span>${icon} ${label}</span>
        <strong>${money(m.in)}</strong>
        <small>صافي ${money(m.net)} | طلع ${money(m.out)}${transferText}</small>
      </article>
    `;
  }).join("");
  els.todayCashStrip.innerHTML = `
    <article class="today-cash-card is-income">
      <span>💰 دخل اليوم فعلياً</span>
      <strong>${money(box.total.in)}</strong>
      <small>بيع ${money(box.total.saleIn)} + ديون ${money(box.total.debtIn)}${box.total.workerIn > 0.001 ? ` + عمال ${money(box.total.workerIn)}` : ""}</small>
    </article>
    <article class="today-cash-card is-total ${box.total.net >= 0 ? "" : "is-negative"}">
      <span>⚖ صافي صندوق اليوم</span>
      <strong>${money(box.total.net)}</strong>
      <small>دخل ${money(box.total.in)} − طلع ${money(box.total.out)}</small>
    </article>
    ${cards}`;
}

function renderStats() {
  // عدّاد الطلبات المفتوحة ظاهر دائمًا في شاشة البيع — رخيص ويُحدَّث دومًا.
  els.openOrdersBadge.textContent = Object.values(state.openOrders).filter((order) => order.items.length).length;
  // شريط الإحصائيات يظهر في شاشة الفواتير فقط؛ لا تفلتر كل الفواتير وهو مخفي.
  if (els.statsStrip && els.statsStrip.hidden) return;
  const todayKey = todayDateInputValue();
  const todaySaleInvoices = state.invoices
    .filter((invoice) => invoice.type === "sale" && invoice.createdAt.slice(0, 10) === todayKey);
  const todaySales = todaySaleInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const todayPurchases = state.purchases
    .filter((purchase) => purchase.createdAt.slice(0, 10) === todayKey)
    .reduce((sum, purchase) => sum + purchaseAmount(purchase), 0);
  const todayGeneralExpenses = (state.expenses || [])
    .filter((expense) => expense.createdAt.slice(0, 10) === todayKey)
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const todayItemProfit = todaySaleInvoices.reduce((sum, invoice) => sum + invoiceItemProfit(invoice), 0);
  const todayWorkerSummary = workerConsumptionTotals((state.workerConsumptions || []).filter((entry) => {
    return entry.createdAt.slice(0, 10) === todayKey;
  }));
  const todayWorkerTransactionSummary = workerTransactionTotals((state.workerTransactions || []).filter((entry) => {
    return entry.createdAt.slice(0, 10) === todayKey;
  }));
  const todayNetProfit = todayItemProfit + todayWorkerSummary.net - todayWorkerTransactionSummary.advances - todayWorkerTransactionSummary.salaryPaid - todayGeneralExpenses;

  els.statTodaySales.textContent = money(todaySales);
  els.statTodayPurchases.textContent = money(todayPurchases);
  els.statItemProfit.textContent = money(todayItemProfit);
  els.statNetProfit.textContent = money(todayNetProfit);
}

function renderDashboard() {
  const host = document.getElementById("dashboardContent");
  if (!host) return;
  const todayKey = todayDateInputValue();
  const todaySaleInvoices = state.invoices.filter((inv) => inv.type === "sale" && inv.createdAt.slice(0, 10) === todayKey);
  const todaySales = todaySaleInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const todayPurchases = state.purchases.filter((p) => p.createdAt.slice(0, 10) === todayKey).reduce((sum, p) => sum + purchaseAmount(p), 0);
  const todayGeneralExpenses = (state.expenses || []).filter((e) => e.createdAt.slice(0, 10) === todayKey).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const todayItemProfit = todaySaleInvoices.reduce((sum, inv) => sum + invoiceItemProfit(inv), 0);
  const todayWorkerSummary = workerConsumptionTotals((state.workerConsumptions || []).filter((e) => e.createdAt.slice(0, 10) === todayKey));
  const todayWorkerTx = workerTransactionTotals((state.workerTransactions || []).filter((e) => e.createdAt.slice(0, 10) === todayKey));
  const todayNet = todayItemProfit + todayWorkerSummary.net - todayWorkerTx.advances - todayWorkerTx.salaryPaid - todayGeneralExpenses;

  const cash = cashOnHand();
  const todayCash = todayCashBox();
  const openOrders = Object.values(state.openOrders).filter((o) => o.items.length).length;
  const canSeeCustomerAccounts = typeof canViewCustomerAccounts === "function" ? canViewCustomerAccounts() : isManagerMode();
  const debtTotal = canSeeCustomerAccounts ? (state.customers || []).reduce((sum, c) => sum + Math.max(Number(c.balance || 0), 0), 0) : 0;
  const creditTotal = canSeeCustomerAccounts ? (state.customers || []).reduce((sum, c) => sum + Math.max(-Number(c.balance || 0), 0), 0) : 0;
  const low = (typeof lowStockItems === "function" ? lowStockItems() : []);
  const workersDue = (state.workers || []).reduce((sum, w) => sum + Math.max(workerMonthlyAccount(w).due, 0), 0);
  const suppliersDue = typeof supplierBalances === "function"
    ? supplierBalances().reduce((sum, supplier) => sum + Math.max(Number(supplier.debt || 0), 0), 0)
    : 0;

  const itemMap = {};
  todaySaleInvoices.forEach((inv) => (inv.items || []).forEach((it) => { itemMap[it.name] = (itemMap[it.name] || 0) + Number(it.qty || 0); }));
  const topItem = Object.keys(itemMap).sort((a, b) => itemMap[b] - itemMap[a])[0];
  const customerAlertsHtml = canSeeCustomerAccounts
    ? `
        <article class="dash-alert ${debtTotal > 0.01 ? "is-danger" : ""}" data-go-view="customers"><span>ديون العملاء</span><strong>${money(debtTotal)}</strong></article>
        <article class="dash-alert ${creditTotal > 0.01 ? "is-success" : ""}" data-go-view="customers"><span>أرصدة العملاء</span><strong>${money(creditTotal)}</strong></article>
      `
    : "";
  const customerQuickButtonHtml = canSeeCustomerAccounts
    ? '<button class="secondary-button" type="button" data-go-view="customers">العملاء</button>'
    : "";

  host.innerHTML = `
    <section class="dashboard-head">
      <div><span>الرئيسية</span><h2>وضع الكفي اليوم</h2><p>أهم الأرقام التي تحتاجها لاتخاذ قرار سريع</p></div>
      <div class="dashboard-head-date">${formatDate(new Date().toISOString())}</div>
    </section>

    <section class="dashboard-section" aria-labelledby="dashboardTodayTitle">
      <div class="dashboard-section-title"><div><span>حركة اليوم</span><h3 id="dashboardTodayTitle">من البيع إلى الصندوق</h3></div><small>الأرقام المقبوضة والمصروفة فعلياً</small></div>
      <div class="dashboard-kpis dashboard-kpis-primary">
        <article class="dash-kpi is-sales"><span>إجمالي البيع</span><strong>${money(todaySales)}</strong><small>يشمل البيع بالدين</small></article>
        <article class="dash-kpi is-income"><span>المقبوض فعلياً</span><strong>${money(todayCash.total.in)}</strong><small>بيع وتسديدات وكل دخل</small></article>
        <article class="dash-kpi is-out"><span>الخارج فعلياً</span><strong>${money(todayCash.total.out)}</strong><small>مشتريات ومصاريف ودفعات</small></article>
        <article class="dash-kpi is-cash"><span>إجمالي الفلوس معك</span><strong>${money(cash.total.current)}</strong><small>كاش وبنك ومحفظة</small></article>
      </div>
    </section>

    <section class="dashboard-section dashboard-result-section" aria-labelledby="dashboardResultTitle">
      <div class="dashboard-section-title"><div><span>نتيجة اليوم</span><h3 id="dashboardResultTitle">هل اليوم رابح؟</h3></div><small>الربح غير رصيد الصندوق</small></div>
      <div class="dashboard-result-grid">
        <article><span>ربح الأصناف</span><strong>${money(todayItemProfit)}</strong></article>
        <article><span>مصاريف تشغيل</span><strong>${money(todayGeneralExpenses)}</strong></article>
        <article><span>صافي حركة الصندوق</span><strong class="${todayCash.total.net >= 0 ? "is-pos" : "is-neg"}">${money(todayCash.total.net)}</strong></article>
        <article class="is-main"><span>صافي ربح اليوم</span><strong class="${todayNet >= 0 ? "is-pos" : "is-neg"}">${money(todayNet)}</strong></article>
      </div>
    </section>

    <section class="dashboard-section" aria-labelledby="dashboardAlertsTitle">
      <div class="dashboard-section-title"><div><span>التزامات وتنبيهات</span><h3 id="dashboardAlertsTitle">ما يحتاج متابعة؟</h3></div><small>${openOrders} طلب مفتوح</small></div>
      <div class="dashboard-alerts">
        ${customerAlertsHtml}
        <article class="dash-alert ${suppliersDue > 0.01 ? "is-warn" : ""}" data-go-view="purchases"><span>ديون الموردين</span><strong>${money(suppliersDue)}</strong></article>
        <article class="dash-alert ${workersDue > 0.01 ? "is-warn" : ""}" data-go-view="expenses"><span>مستحقات العمال</span><strong>${money(workersDue)}</strong></article>
        <article class="dash-alert ${low.length > 0 ? "is-danger" : ""}" data-go-view="inventory"><span>مواد ناقصة</span><strong>${low.length}</strong></article>
        <article class="dash-alert" data-go-view="pos"><span>طلبات مفتوحة</span><strong>${openOrders}</strong></article>
        <article class="dash-alert" data-go-view="reports"><span>الأكثر مبيعاً اليوم</span><strong>${topItem ? escapeHtml(topItem) : "لا يوجد بيع"}</strong></article>
      </div>
    </section>

    <section class="dashboard-actions" aria-label="إجراءات سريعة">
      <strong>إجراءات سريعة</strong>
      <div class="dashboard-quick">
        <button class="primary-button" type="button" data-go-view="pos">شاشة البيع</button>
        <button class="secondary-button" type="button" data-go-view="purchases">فاتورة مشتريات</button>
        <button class="secondary-button" type="button" data-go-view="invoices">الفواتير</button>
        ${customerQuickButtonHtml}
        <button class="secondary-button" type="button" data-go-view="reports">التقارير</button>
        <button class="secondary-button" type="button" data-go-view="close">إغلاق فترة</button>
      </div>
    </section>
  `;
}

function renderTables() {
  els.tablesGrid.innerHTML = "";
  const tableCount = getTableCount();
  if (state.selectedTable > tableCount) state.selectedTable = tableCount;
  const searchEl = document.getElementById("tableSearchInput");
  const tableQuery = searchEl ? searchEl.value.trim() : "";
  let shownCount = 0;
  for (let tableId = 1; tableId <= tableCount; tableId += 1) {
    const order = getExistingOrder(tableId);
    const math = order ? orderMath(order) : { total: 0, delta: 0 };
    const tableLabel = getTableLabel(tableId);
    const customerName = getOrderCustomerName(order);
    if (tableQuery && !searchMatch(`${tableLabel} ${customerName}`, tableQuery)) continue;
    shownCount += 1;
    const hasOrder = Boolean(order?.items.length);
    const hasDebt = Boolean(hasOrder && math.delta > 0);
    const button = document.createElement("button");
    button.className = "table-button";
    button.type = "button";
    button.dataset.table = String(tableId);
    button.classList.toggle("is-active", state.selectedTable === tableId);
    button.classList.toggle("has-order", hasOrder);
    button.classList.toggle("has-debt", hasDebt);
    button.title = hasOrder ? `${tableLabel} - مستخدمة` : `${tableLabel} - متاحة`;
    button.innerHTML = `
      <strong>${escapeHtml(tableLabel)}</strong>
      ${customerName ? `<span class="table-customer">الزبون: ${escapeHtml(customerName)}</span>` : ""}
      <span class="table-meta">${hasOrder ? `${order.items.length} أصناف | ${money(math.total)}` : "جاهزة"}</span>
      <span class="table-state ${hasDebt ? "has-debt" : hasOrder ? "is-occupied" : "is-free"}">${hasOrder ? "مستخدمة" : "متاحة"}</span>
    `;
    els.tablesGrid.appendChild(button);
  }
  if (tableQuery && shownCount === 0) {
    els.tablesGrid.innerHTML = `<div class="empty-state">ما في طاولة باسم "${escapeHtml(tableQuery)}". جرّب اسم تاني أو فرّغ البحث.</div>`;
  }
}

function renderCustomerSelect() {
  const order = getOpenOrder();
  const options = ['<option value="">بدون عميل محفوظ</option>']
    .concat(state.customers.map((customer) => {
      const phone = customer.phone ? ` - ${escapeHtml(customer.phone)}` : "";
      return `<option value="${customer.id}">${escapeHtml(customer.name)}${phone}</option>`;
    }));
  els.customerSelect.innerHTML = options.join("");
  els.customerSelect.value = order.customerId || "";
}

function renderCustomerSuggestions() {
  const query = els.customerNameInput.value.trim().toLowerCase();
  if (!query) {
    els.customerSuggestions.classList.remove("is-visible");
    els.customerSuggestions.innerHTML = "";
    return;
  }

  const matches = [];
  for (let i = 0; i < state.customers.length && matches.length < 6; i++) {
    const customer = state.customers[i];
    if (searchMatch(`${customer.name} ${customer.phone || ""}`, query)) matches.push(customer);
  }

  if (!matches.length) {
    els.customerSuggestions.classList.remove("is-visible");
    els.customerSuggestions.innerHTML = "";
    return;
  }

  els.customerSuggestions.innerHTML = matches.map((customer) => `
    <button type="button" data-suggest-customer="${customer.id}">
      <strong>${escapeHtml(customer.name)}</strong>
      ${customer.phone ? `<small>${escapeHtml(customer.phone)}</small>` : ""}
    </button>
  `).join("");
  els.customerSuggestions.classList.add("is-visible");
}

function chooseSuggestedCustomer(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return;

  const order = getOpenOrder();
  order.customerId = customer.id;
  order.customerName = customer.name;
  order.customerPhone = customer.phone || "";
  selectedCustomerId = customer.id;
  els.customerSuggestions.classList.remove("is-visible");
  render();
}

function posCustomerLastMovementDate(customerId) {
  return (state.invoices || [])
    .filter((invoice) => invoice.customerId === customerId)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0]?.createdAt || "";
}

function posCustomerDebtAgeText(customer) {
  if (!customer || Number(customer.balance || 0) <= 0.01 || typeof customerDebtAgeDays !== "function") return "";
  const days = customerDebtAgeDays(customer);
  if (days === null) return "";
  if (days === 0) return "الدين من اليوم";
  if (days === 1) return "الدين من أمس";
  return `الدين من ${days} يوم`;
}

function posCustomerPrivateAccountState(customer) {
  const balance = Number(customer?.balance || 0);
  if (balance > 0.01) {
    return {
      className: "has-old-debt",
      label: "عليه دين قديم",
      note: posCustomerDebtAgeText(customer) || "يوجد دين سابق على هذا العميل"
    };
  }
  if (balance < -0.01) {
    return {
      className: "has-credit",
      label: "له رصيد سابق",
      note: "المبلغ مخفي في وضع الكاشير"
    };
  }
  return {
    className: "is-clear",
    label: "لا يوجد دين قديم",
    note: "الحساب السابق مسدد"
  };
}

function signedMoney(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) <= 0.001) return money(0);
  return `${amount > 0 ? "+" : "-"}${money(Math.abs(amount))}`;
}

function projectedBalanceTone(balance) {
  if (balance > 0.01) return "is-projected-debt";
  if (balance < -0.01) return "is-projected-credit";
  return "is-projected-clear";
}

function renderCustomerAccountProjection(order, customer, math) {
  if (!els.customerAccountBox) return;

  const delta = Number(math?.delta || 0);
  if (customer && typeof canViewCustomerAccounts === "function" && !canViewCustomerAccounts()) {
    const privateState = posCustomerPrivateAccountState(customer);
    els.customerAccountBox.className = `customer-account is-private ${privateState.className}`;
    els.customerAccountBox.innerHTML = `
      <div class="customer-account-title">
        <span>حساب العميل</span>
        <strong>${privateState.label}</strong>
      </div>
      <div class="customer-account-note">${escapeHtml(privateState.note)} · تأثير الفاتورة الحالية: ${signedMoney(delta)}</div>
    `;
    return;
  }
  if (!customer) {
    const typedName = String(order?.customerName || "").trim();
    els.customerAccountBox.className = `customer-account ${typedName ? "is-new-customer" : ""}`;
    els.customerAccountBox.innerHTML = typedName
      ? `
        <div class="customer-account-title">
          <span>عميل جديد</span>
          <strong>${escapeHtml(typedName)}</strong>
        </div>
        <div class="customer-account-note">تأثير الفاتورة: ${signedMoney(delta)}</div>
      `
      : "<span>حساب العميل</span><strong>لا يوجد عميل محدد</strong>";
    return;
  }

  const currentBalance = Number(customer.balance || 0);
  const projectedBalance = currentBalance + delta;
  const impactClass = delta > 0.01 ? "is-debt-impact" : delta < -0.01 ? "is-credit-impact" : "is-neutral-impact";
  els.customerAccountBox.className = `customer-account ${projectedBalanceTone(projectedBalance)} ${impactClass}`;
  els.customerAccountBox.innerHTML = `
    <div class="customer-account-title">
      <span>حساب ${escapeHtml(customer.name)}</span>
      <strong>${balanceText(projectedBalance)}</strong>
    </div>
    <div class="customer-account-grid">
      <span><em>حاليًا</em><b>${balanceText(currentBalance)}</b></span>
      <span><em>الفاتورة</em><b>${signedMoney(delta)}</b></span>
      <span><em>بعد الإغلاق</em><b>${balanceText(projectedBalance)}</b></span>
    </div>
  `;
}

function openPosCustomerAccount(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) {
    showToast("العميل غير موجود.");
    return;
  }
  if (!requireManagerPermission("customer.viewAccounts", "فتح حساب العميل")) return;

  selectedCustomerId = customer.id;
  if (state.view !== "customers") switchView("customers");
  if (state.view === "customers") {
    renderCustomers();
    renderCustomerDetail();
  }
}

function settlePosCustomerAccount(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) {
    showToast("العميل غير موجود.");
    return;
  }
  if (!requireManagerPermission("customer.settle", "تسديد حساب العميل")) return;
  if (Math.abs(Number(customer.balance || 0)) <= 0.01) {
    showToast("حساب العميل مسدد.");
    return;
  }

  if (state.view !== "customers") switchView("customers");
  if (state.view !== "customers") return;
  startCustomerSettlement(customer.id);
}

function renderPosCustomerAccountCard(order = getOpenOrder(), customer = getCustomer(order.customerId)) {
  if (!els.posCustomerAccountCard) return;

  const typedName = String(order.customerName || "").trim();
  const matchedCustomer = customer || findCustomerByName(typedName);
  if (!matchedCustomer) {
    if (!typedName) {
      els.posCustomerAccountCard.hidden = true;
      els.posCustomerAccountCard.innerHTML = "";
      return;
    }
    els.posCustomerAccountCard.hidden = false;
    els.posCustomerAccountCard.className = "pos-customer-account-card is-new";
    els.posCustomerAccountCard.innerHTML = `
      <div class="pos-customer-account-main">
        <div class="pos-customer-account-info">
          <strong>${escapeHtml(typedName)}</strong>
          <small>عميل جديد في هذا الطلب</small>
        </div>
        <div class="pos-customer-account-side">
          <span class="pos-customer-account-status">جديد</span>
        </div>
      </div>
      <small class="pos-customer-account-note">سيتم حفظ الاسم مع الفاتورة إذا بقي على الطلب.</small>
    `;
    return;
  }

  if (typeof canViewCustomerAccounts === "function" && !canViewCustomerAccounts()) {
    const privateState = posCustomerPrivateAccountState(matchedCustomer);
    els.posCustomerAccountCard.hidden = false;
    els.posCustomerAccountCard.className = `pos-customer-account-card is-private ${privateState.className}`;
    els.posCustomerAccountCard.innerHTML = `
      <div class="pos-customer-account-main">
        <div class="pos-customer-account-info">
          <strong>${escapeHtml(matchedCustomer.name)}</strong>
          <small>${matchedCustomer.phone ? `جوال ${escapeHtml(matchedCustomer.phone)} · ` : ""}${escapeHtml(privateState.note)}</small>
        </div>
        <div class="pos-customer-account-side">
          <span class="pos-customer-account-status">${privateState.label}</span>
          <small class="pos-customer-private-note">المبلغ للمدير فقط</small>
        </div>
      </div>
    `;
    return;
  }

  const balance = Number(matchedCustomer.balance || 0);
  const tone = balance > 0.01 ? "is-debt" : balance < -0.01 ? "is-credit" : "is-clear";
  const lastMovement = posCustomerLastMovementDate(matchedCustomer.id);
  const debtAge = posCustomerDebtAgeText(matchedCustomer);
  const settleLabel = balance > 0.01 ? "تسديد" : balance < -0.01 ? "دفع رصيد" : "";
  const meta = [
    matchedCustomer.phone ? `جوال ${escapeHtml(matchedCustomer.phone)}` : "بدون رقم",
    lastMovement ? `آخر حركة ${formatDate(lastMovement)}` : "لا توجد حركات",
    debtAge ? escapeHtml(debtAge) : ""
  ].filter(Boolean).join(" | ");

  els.posCustomerAccountCard.hidden = false;
  els.posCustomerAccountCard.className = `pos-customer-account-card ${tone}`;
  els.posCustomerAccountCard.innerHTML = `
    <div class="pos-customer-account-main">
      <div class="pos-customer-account-info">
        <strong>${escapeHtml(matchedCustomer.name)}</strong>
        <small>${meta}</small>
      </div>
      <div class="pos-customer-account-side">
        <span class="pos-customer-account-status">${balanceText(balance)}</span>
        <div class="pos-customer-account-actions">
          <button class="secondary-button" type="button" data-pos-customer-action="open" data-pos-customer="${escapeAttr(matchedCustomer.id)}">فتح الحساب</button>
          ${settleLabel ? `<button class="primary-button" type="button" data-pos-customer-action="settle" data-pos-customer="${escapeAttr(matchedCustomer.id)}">${settleLabel}</button>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderOrder() {
  const order = getOpenOrder();
  const customer = getCustomer(order.customerId);
  const tableLabel = getTableLabel();
  const payment = getOrderPayment(order);
  const hasOrder = Boolean(order.items.length);

  els.orderSubtitle.textContent = `رقم الطاولة ${state.selectedTable}`;
  els.tableNameInput.value = tableLabel;
  const checkoutOrderTitle = document.getElementById("checkoutOrderTitle");
  if (checkoutOrderTitle) {
    checkoutOrderTitle.textContent = hasOrder
      ? `طلب ${tableLabel} · ${order.items.length} أصناف`
      : `طلب ${tableLabel}`;
  }
  document.querySelector("#view-pos .checkout-panel")?.classList.toggle("has-order", hasOrder);
  if (els.orderPanel) els.orderPanel.classList.toggle("is-occupied", hasOrder);
  els.orderStatus.classList.toggle("is-occupied", hasOrder);
  els.orderStatus.classList.toggle("is-empty", !hasOrder);
  els.orderStatus.textContent = hasOrder ? `${order.items.length} أصناف` : "فارغ";
  els.customerNameInput.value = order.customerName || customer?.name || "";
  els.customerPhoneInput.value = order.customerPhone || customer?.phone || "";

  // شارة قسم العميل المطوي
  const customerHint = document.getElementById("customerCollapseHint");
  if (customerHint) {
    const name = order.customerName || customer?.name || "";
    customerHint.textContent = name || "بدون عميل";
    customerHint.classList.toggle("has-customer", Boolean(name));
  }
  els.discountInput.value = inputNumberValue(order.discount);
  els.paymentMethodInput.value = payment.method;
  els.paymentAmountInput.value = inputNumberValue(payment.amount);
  if (els.changeReturnedInput) els.changeReturnedInput.value = inputNumberValue(order.changeReturned);
  els.noteInput.value = order.note || "";

  renderOrderTotals(order);

  if (!order.items.length) {
    els.orderItems.innerHTML = '<div class="empty-state">اضغط على صنف من القائمة لإضافته للطلب.</div>';
    return;
  }

  els.orderItems.innerHTML = order.items.map((item) => `
    <article class="order-item">
      <div class="line-title">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${money(item.price)} × ${item.qty} = ${money(item.price * item.qty)}</span>
      </div>
      <div class="qty-controls" aria-label="تعديل كمية ${escapeHtml(item.name)}">
        <button type="button" data-line-action="inc" data-item="${item.id}" aria-label="زيادة">+</button>
        <output>${item.qty}</output>
        <button type="button" data-line-action="dec" data-item="${item.id}" aria-label="تنقيص">-</button>
        <button class="remove-line" type="button" data-line-action="remove" data-item="${item.id}" aria-label="حذف">×</button>
      </div>
    </article>
  `).join("");
}

function renderOrderTotals(order = getOpenOrder()) {
  const math = orderMath(order);
  const customer = getCustomer(order.customerId);

  els.subtotalValue.textContent = money(math.subtotal);
  els.totalValue.textContent = money(math.total);
  const isLosingSale = order.items.length && math.profit < -0.001;
  els.profitWarning.hidden = !isLosingSale;
  if (isLosingSale) {
    els.profitWarning.innerHTML = `<span>بيع مخسر</span><strong>الخسارة ${money(Math.abs(math.profit))}</strong>`;
  }

  const needsCustomerForCredit = math.delta < -0.001 && !customer && !order.customerName?.trim();
  const resultLabel = math.delta > 0
    ? "المتبقي دين"
    : math.delta < 0
      ? needsCustomerForCredit ? "زيادة كرصيد - سجل اسم العميل" : "زيادة كرصيد"
      : math.changeReturned > 0 ? "مدفوع كامل بعد الراجع" : "مدفوع كامل";
  els.balanceResult.className = "balance-result";
  els.balanceResult.classList.add(
    needsCustomerForCredit ? "is-credit-warning" : math.delta > 0 ? "is-debt" : math.delta < 0 ? "is-credit" : "is-paid"
  );
  const changeNote = math.changeReturned > 0 ? `<small class="balance-change-note">الراجع ${money(math.changeReturned)}</small>` : "";
  els.balanceResult.innerHTML = `<span>${resultLabel}${changeNote}</span><strong>${money(Math.abs(math.delta))}</strong>`;

  renderCustomerAccountProjection(order, customer, math);
  renderPosCustomerAccountCard(order, customer);
}

function menuLineBaseItemId(lineId = "") {
  return String(lineId || "").split("__")[0];
}

function quickSaleScoresByItemId() {
  const scores = new Map();
  const addScore = (line, weight = 1) => {
    if (!line) return;
    const baseId = menuLineBaseItemId(line.menuItemId || line.baseItemId || line.itemId || line.id);
    const qty = Math.max(1, Number(line.qty || line.quantity || 1));
    if (!baseId) return;
    scores.set(baseId, (scores.get(baseId) || 0) + qty * weight);
  };

  const invoices = Array.isArray(state.invoices) ? state.invoices.slice(0, 300) : [];
  invoices.forEach((invoice, index) => {
    if (!invoice || invoice.type !== "sale") return;
    const recencyWeight = index < 80 ? 2 : 1;
    (invoice.items || []).forEach((line) => addScore(line, recencyWeight));
  });

  Object.values(state.openOrders || {}).forEach((order) => {
    (order?.items || []).forEach((line) => addScore(line, 3));
  });

  return scores;
}

function getQuickSaleItems(limit = 6) {
  if (!Array.isArray(state.menu) || !state.menu.length) return [];
  const scores = quickSaleScoresByItemId();
  return state.menu
    .map((item, index) => ({ item, index, score: scores.get(item.id) || 0 }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, limit)
    .map((entry) => entry.item);
}

function renderQuickMenuItems() {
  if (!els.quickMenuItems) return;
  const items = getQuickSaleItems();
  if (!items.length) {
    els.quickMenuItems.hidden = true;
    els.quickMenuItems.innerHTML = "";
    return;
  }

  const activeOrderCustomerId = getOpenOrder()?.customerId || null;
  els.quickMenuItems.hidden = false;
  els.quickMenuItems.innerHTML = `
    <div class="quick-menu-title">الأسرع</div>
    <div class="quick-menu-list">
      ${items.map((item) => {
        const options = Array.isArray(item.options) ? item.options : [];
        const customPrice = getCustomerItemPrice(activeOrderCustomerId, item.id);
        const preferredOptionId = options.length && typeof getPreferredMenuOptionId === "function"
          ? getPreferredMenuOptionId(item)
          : undefined;
        const preferredOption = preferredOptionId
          ? options.find((option) => option.id === preferredOptionId)
          : null;
        const price = preferredOption
          ? Number(preferredOption.price)
          : (customPrice !== null ? customPrice : Number(item.price));
        const meta = preferredOption ? preferredOption.label : options.length ? "حجم" : item.category;
        return `
          <button class="quick-menu-button ${options.length ? "has-options" : ""}" type="button" data-quick-menu-item="${escapeAttr(item.id)}">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${money(price)}</span>
            ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function addQuickSaleItem(itemId, sourceEl) {
  const item = state.menu.find((menuItem) => menuItem.id === itemId);
  if (!item) return;
  addMenuItemFromGrid(item.id, undefined, sourceEl);
}

function focusMenuSearchSoon(force = false) {
  if (!els.menuSearchInput || typeof setTimeout !== "function") return;
  setTimeout(() => {
    if (!els.menuSearchInput || state.view !== "pos") return;
    const active = document.activeElement;
    const tag = active?.tagName || "";
    const isEditing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) && active !== els.menuSearchInput;
    if (!force && isEditing) return;
    els.menuSearchInput.focus();
    if (force && typeof els.menuSearchInput.select === "function") els.menuSearchInput.select();
  }, 0);
}

function renderMenu() {
  if (typeof closeItemOptionPicker === "function") closeItemOptionPicker();
  const hasFavorites = state.menu.some((item) => item.favorite);
  const hasCombos = (state.combos || []).length > 0;
  const categories = [...(hasCombos ? [COMBOS_CATEGORY] : []), ...(hasFavorites ? [FAVORITES_CATEGORY] : []), "الكل", ...new Set(state.menu.map((item) => item.category))];
  if (!categories.includes(selectedCategory)) selectedCategory = "الكل";

  renderQuickMenuItems();

  els.menuCategories.innerHTML = categories.map((category) => `
    <button class="category-button ${category === selectedCategory ? "is-active" : ""}" type="button" data-category="${escapeAttr(category)}">${escapeHtml(category)}</button>
  `).join("");

  if (selectedCategory === COMBOS_CATEGORY) {
    els.menuGrid.innerHTML = renderComboCards();
    return;
  }

  const query = els.menuSearchInput.value.trim().toLowerCase();
  const items = state.menu.filter((item) => {
    const matchesCategory = selectedCategory === FAVORITES_CATEGORY
      ? item.favorite
      : (selectedCategory === "الكل" || item.category === selectedCategory);
    const matchesSearch = searchMatch(`${item.name} ${item.category}`, query);
    return matchesCategory && matchesSearch;
  });

  const activeOrderCustomerId = getOpenOrder()?.customerId || null;
  els.menuGrid.innerHTML = items.length
    ? items.map((item) => {
      const stock = menuItemDisplayStock(item);
      const customPrice = getCustomerItemPrice(activeOrderCustomerId, item.id);
      const hasCustom = customPrice !== null;
      const options = Array.isArray(item.options) ? item.options : [];
      const preferredOptionId = options.length && typeof getPreferredMenuOptionId === "function"
        ? getPreferredMenuOptionId(item)
        : undefined;
      const hasPreferredOption = preferredOptionId !== undefined;
      const preferredOption = preferredOptionId
        ? options.find((option) => option.id === preferredOptionId)
        : null;
      const optionBadgeText = hasPreferredOption
        ? (preferredOption ? preferredOption.label : "عادي")
        : "اختيار";
      return `
        <article class="menu-item ${hasCustom ? "has-custom-price" : ""} ${options.length ? "has-options" : ""} ${hasPreferredOption ? "has-preferred-option" : ""}" role="button" tabindex="0" data-menu-item="${escapeAttr(item.id)}" ${options.length ? 'aria-haspopup="menu" aria-expanded="false"' : ""}>
          ${item.favorite ? '<span class="menu-fav-star" aria-hidden="true">⭐</span>' : ""}
          <strong>${escapeHtml(item.name)}</strong>
          ${hasCustom
            ? `<span class="custom-price-tag">${money(customPrice)}</span><small class="original-price">${money(item.price)}</small>`
            : `<span>${money(item.price)}</span>`
          }
          ${stock.tracked ? `<small class="menu-stock ${stock.isLow ? "is-low" : ""}">المخزون: ${escapeHtml(stock.text)}</small>` : ""}
          ${options.length ? `<small class="menu-options-hint" data-menu-size-picker="${escapeAttr(item.id)}">${escapeHtml(optionBadgeText)}</small>` : ""}
        </article>
      `;
    }).join("")
    : '<div class="empty-state">لا توجد أصناف مطابقة.</div>';
}

function renderPurchaseItemSelect() {
  if (!ENABLE_LINKING) {
    els.purchaseMenuItemInput.value = "";
    return;
  }
  const selected = els.purchaseMenuItemInput.value;
  els.purchaseMenuItemInput.innerHTML = ['<option value="">بدون ربط بصنف</option>']
    .concat(state.menu.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} - ${escapeHtml(item.category)}</option>`))
    .join("");
  els.purchaseMenuItemInput.value = state.menu.some((item) => item.id === selected) ? selected : "";
}

function purchaseComponentOptions(ownerId = "") {
  if (!ENABLE_STOCK_COMPONENTS) return [];
  return purchaseInventoryItems()
    .filter((item) => purchaseInventoryItemDefaultVisible(item))
    .map((item) => ({
    itemId: item.id,
    purchaseItemName: item.name,
    linkedItemName: item.name,
    unit: item.stockUnit || "",
    disabled: false,
    value: JSON.stringify({ itemId: item.id, purchaseItemName: item.name, unit: item.stockUnit || "" }),
    label: `${item.name}${item.stockUnit ? ` - ${item.stockUnit}` : ""} | المتوفر: ${quantityWithUnit(item.stockQty, item.stockUnit)} | آخر سعر: ${money(stockItemRecipeUnitCost(item))}`
  })).sort((a, b) => {
    return a.label.localeCompare(b.label, "ar");
  });
}

function parsePurchaseComponentOption(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed.itemId) return null;
    return {
      itemId: parsed.itemId,
      purchaseItemName: String(parsed.purchaseItemName || "").trim(),
      unit: normalizeUnit(parsed.unit || "")
    };
  } catch (error) {
    return null;
  }
}

function renderMenuComponentSelect() {
  const selected = els.menuComponentItemInput.value;
  const ownerId = editingMenuItemId || "";
  const options = purchaseComponentOptions(ownerId);
  els.menuComponentItemInput.innerHTML = ['<option value="">اختر من المخزون</option>']
    .concat(options.length
      ? options.map((option) => `<option value="${escapeAttr(option.value)}"${option.disabled ? " disabled" : ""}>${escapeHtml(option.label)}</option>`)
      : ['<option value="" disabled>لا يوجد مخزون مشتريات بعد</option>'])
    .join("");
  els.menuComponentItemInput.value = options.some((option) => option.value === selected) ? selected : "";
}

function renderMenuComponentsEditor() {
  if (!ENABLE_STOCK_COMPONENTS) {
    menuComponentDraft = [];
    els.menuComponentsList.innerHTML = "";
    return;
  }
  renderMenuComponentSelect();
  menuComponentDraft = normalizeMenuComponents(menuComponentDraft, editingMenuItemId || "");
  const operatingCost = Math.max(Number(els.menuOperatingCostInput?.value || 0), 0);
  const operatingCostType = operatingCostTypes.includes(els.menuOperatingCostTypeInput?.value)
    ? els.menuOperatingCostTypeInput.value
    : "other";
  const operatingLine = operatingCost > 0 ? `
        <article class="menu-component-line menu-operating-line">
          <div>
            <strong>تكلفة تشغيل للوحدة</strong>
            <small>${escapeHtml(operatingCostLabels[operatingCostType] || operatingCostLabels.other)} محملة على كل عملية بيع</small>
          </div>
          <span>${money(operatingCost)}</span>
        </article>
      ` : "";
  const componentLines = menuComponentDraft.length
    ? menuComponentDraft.map((component) => {
      const item = inventoryItemById(component.itemId);
      const unit = component.unit || itemUnit(item);
      const componentName = item?.name || component.purchaseItemName || "مكون غير موجود";
      const unitCost = stockItemRecipeUnitCost(item);
      return `
        <article class="menu-component-line">
          <div>
            <strong>${escapeHtml(componentName)}</strong>
            <small>${item ? `من المخزون: ${escapeHtml(item.name)} | ` : ""}كمية الاستهلاك لكل بيع: ${quantityWithUnit(component.qty, unit)} | آخر سعر للوحدة: ${item ? money(unitCost) : "-"}</small>
          </div>
          <span>${item ? money(unitCost * Number(component.qty || 0)) : "-"}</span>
          <button type="button" data-remove-component="${component.id}">حذف</button>
        </article>
      `;
    }).join("")
    : "";
  els.menuComponentsList.innerHTML = componentLines || operatingLine
    ? `${componentLines}${operatingLine}`
    : '<div class="empty-state">لا توجد مكونات. الصنف سيستخدم سعر الشراء المكتوب وتكلفة التشغيل فقط حتى تضيف مواد من المخزون.</div>';
}

function addMenuComponent() {
  if (!ENABLE_STOCK_COMPONENTS) {
    showToast("مكونات الصنف غير مفعلة.");
    return;
  }
  const option = parsePurchaseComponentOption(els.menuComponentItemInput.value);
  const itemId = option?.itemId || "";
  const qty = Number(els.menuComponentQtyInput.value || 0);
  if (!itemId || qty <= 0) {
    showToast("اختر صنف من المخزون واكتب كمية الاستهلاك لكل بيع.");
    return;
  }
  if (itemId === editingMenuItemId) {
    showToast("لا يمكن ربط الصنف بنفسه كمكون.");
    return;
  }

  const purchaseItemName = option.purchaseItemName || inventoryItemById(itemId)?.name || "";
  const unit = option.unit || itemUnit(inventoryItemById(itemId));
  const existing = menuComponentDraft.find((component) => {
    return component.itemId === itemId
      && String(component.purchaseItemName || "").trim() === purchaseItemName
      && normalizeUnit(component.unit || "") === normalizeUnit(unit);
  });
  if (existing) existing.qty += qty;
  else menuComponentDraft.push({ id: uid("component"), itemId, purchaseItemName, qty, unit });

  els.menuComponentItemInput.value = "";
  els.menuComponentQtyInput.value = "";
  renderMenuComponentsEditor();
}

// محرّر خيارات الصنف (أحجام / إضافات بسعر لكل واحد)
function renderMenuOptionsEditor() {
  const listEl = document.getElementById("menuOptionsList");
  if (!listEl) return;
  menuOptionsDraft = normalizeMenuOptions(menuOptionsDraft);
  listEl.innerHTML = menuOptionsDraft.length
    ? menuOptionsDraft.map((opt) => `
        <article class="menu-component-line">
          <div><strong>${escapeHtml(opt.label)}</strong></div>
          <span>${money(opt.price)}</span>
          <button type="button" data-remove-option="${opt.id}">حذف</button>
        </article>`).join("")
    : '<div class="empty-state">لا توجد خيارات. أضف أحجام (صغير/وسط/كبير) أو إضافات بسعر كل واحد.</div>';
}

function addMenuOption() {
  const labelEl = document.getElementById("menuOptionLabelInput");
  const priceEl = document.getElementById("menuOptionPriceInput");
  const label = (labelEl?.value || "").trim();
  const price = Number(priceEl?.value || 0);
  if (!label || price <= 0) { showToast("اكتب اسم الخيار وسعره."); return; }
  menuOptionsDraft.push({ id: uid("opt"), label, price });
  if (labelEl) labelEl.value = "";
  if (priceEl) priceEl.value = "";
  renderMenuOptionsEditor();
}

function syncPurchaseMenuItem() {
  if (!ENABLE_LINKING) return;
  const item = findMenuItem(els.purchaseMenuItemInput.value);
  if (!item) return;
  if (!els.purchaseItemInput.value.trim()) {
    els.purchaseItemInput.value = item.name;
  }
  if (!els.purchaseUnitInput.value.trim() && itemUnit(item)) {
    els.purchaseUnitInput.value = itemUnit(item);
  }
  autofillPurchaseUnitsFromHistory();
  renderPurchaseUnitCost();
}

function normalizedPurchaseItemName(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function latestPurchaseLineByName(name = "") {
  const target = normalizedPurchaseItemName(name);
  if (!target) return null;

  const purchases = (state.purchases || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  for (const purchase of purchases) {
    const line = purchaseLines(purchase).find((entry) => normalizedPurchaseItemName(entry.item) === target);
    if (line) return line;
  }

  return purchaseDraftItems
    .slice()
    .reverse()
    .find((entry) => normalizedPurchaseItemName(entry.item) === target) || null;
}

function shouldApplyPurchaseUnitAutofill(input, previousValue = "") {
  const current = String(input?.value || "").trim();
  return !current || (!!previousValue && current === String(previousValue || "").trim());
}

function autofillPurchaseUnitsFromHistory() {
  const name = els.purchaseItemInput.value.trim();
  const line = latestPurchaseLineByName(name);
  if (!line) return;

  const nextUnit = normalizeUnit(line.unit || "");
  const nextStockPerUnit = inputNumberValue(purchaseLineStockPerUnit(line) || 1);
  const nextStockUnit = normalizeUnit(purchaseLineStockUnit(line) || nextUnit);
  const previous = purchaseUnitAutofillState || {};
  let changed = false;

  if (nextUnit && shouldApplyPurchaseUnitAutofill(els.purchaseUnitInput, previous.unit)) {
    els.purchaseUnitInput.value = nextUnit;
    changed = true;
  }
  if (nextStockPerUnit && shouldApplyPurchaseUnitAutofill(els.purchaseStockQtyInput, previous.stockPerUnit)) {
    els.purchaseStockQtyInput.value = nextStockPerUnit;
    changed = true;
  }
  if (nextStockUnit && shouldApplyPurchaseUnitAutofill(els.purchaseStockUnitInput, previous.stockUnit)) {
    els.purchaseStockUnitInput.value = nextStockUnit;
    changed = true;
  }

  purchaseUnitAutofillState = {
    itemName: name,
    unit: nextUnit,
    stockPerUnit: nextStockPerUnit,
    stockUnit: nextStockUnit
  };

  if (changed) renderPurchaseUnitCost();
}

function currentPurchaseUnitCost() {
  const purchaseQty = Number(els.purchaseQtyInput.value || 0);
  const stockPerUnit = Number(els.purchaseStockQtyInput.value || 0);
  const stockQty = stockPerUnit > 0 ? purchaseQty * stockPerUnit : purchaseQty;
  const amount = Number(els.purchaseAmountInput.value || 0);
  return stockQty > 0 && amount > 0 ? amount / stockQty : 0;
}

function syncPurchaseAmountFromUnitPrice() {
  const qty = Number(els.purchaseQtyInput.value || 0);
  const unitPrice = Number(els.purchaseUnitPriceInput.value || 0);
  if (qty > 0 && unitPrice >= 0 && els.purchaseUnitPriceInput.value !== "") {
    els.purchaseAmountInput.value = inputNumberValue(Math.round(qty * unitPrice * 100) / 100);
  }
  renderPurchaseUnitCost();
}

function syncPurchaseUnitPriceFromAmount() {
  const qty = Number(els.purchaseQtyInput.value || 0);
  const amount = Number(els.purchaseAmountInput.value || 0);
  els.purchaseUnitPriceInput.value = qty > 0 && amount >= 0 && els.purchaseAmountInput.value !== ""
    ? inputNumberValue(Math.round((amount / qty) * 10000) / 10000)
    : "";
  renderPurchaseUnitCost();
}

function renderPurchaseUnitCost() {
  const unit = normalizeUnit(els.purchaseStockUnitInput.value || els.purchaseUnitInput.value);
  els.purchaseUnitCostValue.textContent = `${money(currentPurchaseUnitCost())}${unit ? ` / ${unit}` : ""}`;
}

function renderPurchaseSettlement() {
  const net = purchaseDraftNetTotal();
  const requestedCredit = Math.min(Math.max(Number(els.purchaseSupplierCreditUsedInput?.value || 0), 0), net);
  const payment = readPurchasePaymentInputs(net, requestedCredit, els.purchaseMethodInput?.value || "cash");
  const paid = payment.error ? 0 : Number(payment.paidAmount || 0);
  const debt = Math.max(net - paid - requestedCredit, 0);
  const credit = Math.max(paid + requestedCredit - net, 0);
  const netEl = document.getElementById("purchaseFinalNet");
  const paidEl = document.getElementById("purchaseFinalPaid");
  const balanceEl = document.getElementById("purchaseFinalBalance");
  const labelEl = document.getElementById("purchaseFinalBalanceLabel");
  const boxEl = document.getElementById("purchaseFinalBalanceBox");
  if (netEl) netEl.textContent = money(net);
  if (paidEl) paidEl.textContent = payment.error ? "راجع الدفع" : money(paid);
  if (balanceEl) balanceEl.textContent = money(debt > 0.001 ? debt : credit);
  if (labelEl) labelEl.textContent = debt > 0.001 ? "دين للمورد" : credit > 0.001 ? "رصيد لك عند المورد" : "الفاتورة مسددة";
  if (boxEl) {
    boxEl.classList.toggle("is-debt", debt > 0.001);
    boxEl.classList.toggle("is-credit", credit > 0.001);
    boxEl.classList.toggle("is-clear", debt <= 0.001 && credit <= 0.001);
  }
}

function purchaseDraftTotal() {
  return purchaseDraftItems.reduce((sum, line) => sum + Number(line.amount || 0), 0);
}

function purchaseDraftDiscountRaw() {
  const raw = els.purchaseDiscountInput ? String(els.purchaseDiscountInput.value || "").trim() : "";
  if (raw === "") return 0;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return NaN;
  return Math.max(amount, 0);
}

function purchaseDraftDiscountAmount() {
  const raw = purchaseDraftDiscountRaw();
  if (!Number.isFinite(raw)) return NaN;
  return Math.min(raw, purchaseDraftTotal());
}

function purchaseDraftNetTotal() {
  const discount = purchaseDraftDiscountAmount();
  return Math.max(purchaseDraftTotal() - (Number.isFinite(discount) ? discount : 0), 0);
}

function purchaseLineStockQty(line = {}) {
  const qty = Number(line.qty || 0);
  const stockPerUnit = purchaseLineStockPerUnit(line);
  const value = Number(line.stockQty ?? line.inventoryQty ?? line.outputQty ?? (stockPerUnit > 0 && qty > 0 ? qty * stockPerUnit : qty));
  return value > 0 ? value : 0;
}

function purchaseLineStockPerUnit(line = {}) {
  const value = Number(line.stockPerUnit ?? line.stockUnitsPerPurchase ?? line.unitsPerPurchase ?? 0);
  if (value > 0) return value;
  const qty = Number(line.qty || 0);
  const stockQty = Number(line.stockQty ?? line.inventoryQty ?? line.outputQty ?? 0);
  return qty > 0 && stockQty > 0 ? stockQty / qty : 0;
}

function purchaseLineStockUnit(line = {}) {
  return normalizeUnit(line.stockUnit || line.inventoryUnit || line.outputUnit || line.unit || "");
}

function purchaseLineUnitCost(line = {}) {
  const stockQty = purchaseLineStockQty(line);
  return Number(line.unitCost ?? line.stockUnitCost ?? (stockQty ? Number(line.amount || 0) / stockQty : 0));
}

function purchaseLineStockText(line = {}) {
  return quantityWithUnit(purchaseLineStockQty(line), purchaseLineStockUnit(line));
}

function purchaseLineStockPerUnitText(line = {}) {
  const stockPerUnit = purchaseLineStockPerUnit(line);
  if (stockPerUnit <= 0) return "";
  const purchaseUnit = normalizeUnit(line.unit || "");
  const stockText = quantityWithUnit(stockPerUnit, purchaseLineStockUnit(line));
  return purchaseUnit ? `كل ${purchaseUnit}: ${stockText}` : `لكل وحدة شراء: ${stockText}`;
}

function renderPurchaseDraft() {
  const subtotal = purchaseDraftTotal();
  const discountRaw = purchaseDraftDiscountRaw();
  const discountInvalid = !Number.isFinite(discountRaw) || discountRaw > subtotal + 0.001;
  const discount = discountInvalid ? 0 : Math.min(discountRaw, subtotal);
  const total = Math.max(subtotal - discount, 0);
  const editingPurchase = editingPurchaseId ? state.purchases.find((purchase) => purchase.id === editingPurchaseId) : null;
  if (editingPurchaseId && !editingPurchase) editingPurchaseId = null;
  const isEditing = Boolean(editingPurchase);

  els.purchaseDraftBox.classList.toggle("is-editing", isEditing);
  els.purchaseDraftTitle.textContent = isEditing ? `تعديل ${editingPurchase.number || "فاتورة مشتريات"}` : "فاتورة المشتريات الحالية";
  els.purchaseDraftSubtitle.textContent = isEditing ? "عدّل البنود ثم احفظ التعديل لتحديث مخزون الجرد" : "أضف الأصناف ثم سجل الفاتورة";
  els.purchaseDraftTotal.textContent = money(total);
  if (els.purchaseDiscountSummary) {
    els.purchaseDiscountSummary.hidden = !(subtotal > 0.001 || discountRaw > 0.001 || discountInvalid);
    els.purchaseDiscountSummary.textContent = discountInvalid
      ? "الخصم أكبر من إجمالي الفاتورة"
      : discount > 0.001
        ? `قبل الخصم ${money(subtotal)} | الخصم ${money(discount)}`
        : `قبل الخصم ${money(subtotal)}`;
    els.purchaseDiscountSummary.classList.toggle("is-invalid", discountInvalid);
  }
  els.savePurchaseInvoiceButton.disabled = !purchaseDraftItems.length || discountInvalid;
  els.clearPurchaseInvoiceButton.disabled = !purchaseDraftItems.length;
  els.savePurchaseInvoiceButton.textContent = isEditing ? "حفظ تعديل فاتورة المشتريات" : "تسجيل فاتورة المشتريات";
  els.clearPurchaseInvoiceButton.textContent = isEditing ? "تفريغ بنود التعديل" : "تفريغ الفاتورة";
  els.purchaseEditCancelButton.hidden = !isEditing;

  els.purchaseDraftList.innerHTML = purchaseDraftItems.length
    ? purchaseDraftItems.map((line) => `
        <article class="purchase-draft-line">
          <div class="purchase-draft-line-main">
            <strong>${escapeHtml(line.item)}</strong>
            <small>${ENABLE_LINKING && purchaseLinkedItemText(line) ? `${purchaseLinkedItemText(line)} | ` : ""}الشراء: ${quantityWithUnit(line.qty, line.unit)} | سعر الحبة/العبوة: ${money(Number(line.purchaseUnitPrice ?? (Number(line.qty || 0) > 0 ? Number(line.amount || 0) / Number(line.qty || 0) : 0)))} | ${purchaseLineStockPerUnitText(line)} | يدخل المخزون: ${purchaseLineStockText(line)} | حق وحدة المخزون: ${money(purchaseLineUnitCost(line))}</small>
          </div>
          <span class="purchase-draft-line-amount">${money(line.amount)}</span>
          <div class="purchase-draft-line-actions">
            <button class="purchase-draft-edit" type="button" data-edit-purchase-draft="${line.id}">تعديل</button>
            <button type="button" data-remove-purchase-draft="${line.id}">حذف</button>
          </div>
        </article>
    `).join("")
    : '<div class="empty-state">لا توجد أصناف في الفاتورة الحالية.</div>';
  if (els.purchaseDateInput && !els.purchaseDateInput.value) els.purchaseDateInput.value = todayDateInputValue();
  renderPurchaseSettlement();
}

function removePurchaseDraftLine(lineId) {
  purchaseDraftItems = purchaseDraftItems.filter((line) => line.id !== lineId);
  render();
}

function editPurchaseDraftLine(lineId) {
  const line = purchaseDraftItems.find((entry) => entry.id === lineId);
  if (!line) return;

  purchaseUnitAutofillState = {};
  els.purchaseItemInput.value = line.item || "";
  if (ENABLE_LINKING) els.purchaseMenuItemInput.value = line.menuItemId || "";
  els.purchaseQtyInput.value = inputNumberValue(line.qty);
  els.purchaseUnitInput.value = line.unit || "";
  els.purchaseStockQtyInput.value = inputNumberValue(line.stockPerUnit);
  els.purchaseStockUnitInput.value = line.stockUnit || "";
  els.purchaseUnitPriceInput.value = inputNumberValue(Number(line.purchaseUnitPrice ?? (Number(line.qty || 0) > 0 ? Number(line.amount || 0) / Number(line.qty || 0) : 0)));
  els.purchaseAmountInput.value = inputNumberValue(line.amount);

  purchaseDraftItems = purchaseDraftItems.filter((entry) => entry.id !== lineId);
  showToast("عدّل الأرقام ثم اضغط إضافة لإرجاع الصنف للفاتورة.");
  render();
  renderPurchaseUnitCost();
  els.purchaseQtyInput.focus();
  els.purchaseQtyInput.select();
}

function clearPurchaseDraft() {
  purchaseDraftItems = [];
  if (els.purchaseDiscountInput) els.purchaseDiscountInput.value = "";
  showToast(editingPurchaseId ? "تم تفريغ بنود التعديل." : "تم تفريغ فاتورة المشتريات الحالية.");
  render();
}

function resetPurchaseLineInputs() {
  purchaseUnitAutofillState = {};
  els.purchaseMenuItemInput.value = "";
  els.purchaseItemInput.value = "";
  els.purchaseQtyInput.value = "";
  els.purchaseUnitInput.value = "";
  els.purchaseStockQtyInput.value = "";
  els.purchaseStockUnitInput.value = "";
  els.purchaseUnitPriceInput.value = "";
  els.purchaseAmountInput.value = "";
  renderPurchaseUnitCost();
}

function cancelPurchaseEdit() {
  editingPurchaseId = null;
  purchaseDraftItems = [];
  els.purchaseSupplierInput.value = "";
  els.purchaseNoteInput.value = "";
  els.purchaseMethodInput.value = getLastPaymentMethod();
  if (els.purchaseDiscountInput) els.purchaseDiscountInput.value = "";
  if (typeof clearPurchasePaymentInputs === "function") clearPurchasePaymentInputs();
  resetPurchaseLineInputs();
  showToast("تم إلغاء تعديل فاتورة المشتريات.");
  render();
}
