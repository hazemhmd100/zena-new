// ═══ دفتر المقهى ═══ 06-inventory-menu.js — الجرد والمخزون + إكسل الأصناف + شاشة الأصناف
// (مقسوم من app.js — الأسطر 3402-3967)

const PURCHASE_INVENTORY_PREFIX = "purchase-stock::";
const PURCHASE_INVENTORY_STATUS_LABELS = {
  active: "نشط",
  clearing: "تصفية",
  stopped: "موقوف"
};

function normalizeInventoryPane(pane) {
  return pane === "count" ? "count" : "stock";
}

function syncInventoryPaneUi() {
  const pane = normalizeInventoryPane(state?.inventoryPane);
  if (state) state.inventoryPane = pane;

  const inventoryView = els.inventoryView || document.getElementById("view-inventory");
  if (inventoryView) {
    inventoryView.dataset.inventoryPane = pane;
    inventoryView.classList.toggle("inventory-pane-stock", pane === "stock");
    inventoryView.classList.toggle("inventory-pane-count", pane === "count");
  }

  els.inventoryPaneTabs?.forEach((button) => {
    const active = button.dataset.inventoryPaneTab === pane;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });

  els.inventoryPanePanels?.forEach((panel) => {
    const active = panel.dataset.inventoryPanePanel === pane;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });
}

function setInventoryPane(pane) {
  const nextPane = normalizeInventoryPane(pane);
  const changed = state.inventoryPane !== nextPane;
  state.inventoryPane = nextPane;
  syncInventoryPaneUi();
  if (changed) persistStateNow();
}

function purchaseInventoryKey(name, unit = "") {
  return `${String(name || "").trim().toLowerCase()}||${normalizeUnit(unit).toLowerCase()}`;
}

function purchaseInventoryId(key) {
  return `${PURCHASE_INVENTORY_PREFIX}${encodeURIComponent(key)}`;
}

function isPurchaseInventoryId(id) {
  return String(id || "").startsWith(PURCHASE_INVENTORY_PREFIX);
}

function purchaseInventoryAliasForKey(purchaseKey) {
  const entry = state.purchaseInventoryAliases?.[purchaseKey];
  if (!entry) return "";
  return String(typeof entry === "string" ? entry : entry.name || "").trim();
}

function purchaseInventoryDisplayName(purchaseKey, fallbackName = "") {
  return purchaseInventoryAliasForKey(purchaseKey) || String(fallbackName || "").trim();
}

function purchaseInventoryHiddenForKey(purchaseKey) {
  return Boolean(state.purchaseInventoryHiddenKeys?.[purchaseKey]);
}

function normalizePurchaseInventoryStatus(status) {
  return PURCHASE_INVENTORY_STATUS_LABELS[status] ? status : "active";
}

function purchaseInventoryStatusForKey(key) {
  const entry = state.purchaseInventoryStatuses?.[key];
  return normalizePurchaseInventoryStatus(typeof entry === "string" ? entry : entry?.status);
}

function purchaseInventoryStatusLabel(status) {
  return PURCHASE_INVENTORY_STATUS_LABELS[normalizePurchaseInventoryStatus(status)];
}

function purchaseInventoryStatusRank(status) {
  return { active: 0, clearing: 1, stopped: 2 }[normalizePurchaseInventoryStatus(status)] || 0;
}

function combinePurchaseInventoryStatus(currentStatus, nextStatus) {
  return purchaseInventoryStatusRank(nextStatus) > purchaseInventoryStatusRank(currentStatus)
    ? normalizePurchaseInventoryStatus(nextStatus)
    : normalizePurchaseInventoryStatus(currentStatus);
}

function latestInventoryDate(currentValue, nextValue) {
  const currentTime = new Date(currentValue || 0).getTime();
  const nextTime = new Date(nextValue || 0).getTime();
  if (!Number.isFinite(nextTime) || nextTime <= 0) return currentValue || "";
  if (!Number.isFinite(currentTime) || nextTime > currentTime) return nextValue || "";
  return currentValue || "";
}

function purchaseInventoryManualChip(item = {}) {
  const manualCount = Number(item.manualCount || 0);
  if (!manualCount) return "";
  const label = manualCount > 1 ? `أدخلتها يدويًا ${quantityText(manualCount)}` : "أدخلتها يدويًا";
  return `<span class="inventory-manual-chip">${escapeHtml(label)}</span>`;
}

function purchaseInventoryAliasChip(item = {}) {
  if (!item.isRenamed) return "";
  return '<span class="inventory-alias-chip">اسم معدل</span>';
}

function purchaseInventoryHiddenChip(item = {}) {
  if (!item.hidden) return "";
  return '<span class="inventory-hidden-chip">محذوف من العرض</span>';
}

function purchaseInventoryStatusBadge(item = {}) {
  if (item.inventorySource !== "purchase") return "";
  const status = normalizePurchaseInventoryStatus(item.availabilityStatus);
  return `<span class="inventory-availability-state is-${status}">${purchaseInventoryStatusLabel(status)}</span>`;
}

function purchaseInventoryItemDefaultVisible(item = {}) {
  if (item.inventorySource !== "purchase") return true;
  if (item.hidden) return false;
  const status = normalizePurchaseInventoryStatus(item.availabilityStatus);
  if (status === "active") return true;
  if (status === "clearing") return Number(item.stockQty || 0) > 0.001;
  return false;
}

function purchaseInventoryItemMatchesAvailability(item = {}, availability = "usable") {
  if (item.inventorySource !== "purchase") return availability !== "clearing" && availability !== "stopped";
  if (item.hidden) return availability === "all";
  const status = normalizePurchaseInventoryStatus(item.availabilityStatus);
  if (availability === "active") return status === "active";
  if (availability === "clearing") return status === "clearing";
  if (availability === "stopped") return status === "stopped";
  if (availability === "all") return true;
  return purchaseInventoryItemDefaultVisible(item);
}

function purchaseInventoryCanAlert(item = {}) {
  if (item.hidden) return false;
  return item.inventorySource !== "purchase" || normalizePurchaseInventoryStatus(item.availabilityStatus) === "active";
}

function setPurchaseInventoryStatus(purchaseKey, status) {
  const nextStatus = normalizePurchaseInventoryStatus(status);
  state.purchaseInventoryStatuses = state.purchaseInventoryStatuses || {};
  if (Array.isArray(state.manualPurchaseInventoryItems)) {
    state.manualPurchaseInventoryItems = state.manualPurchaseInventoryItems.map((item) => {
      if (purchaseInventoryKey(item.name, item.stockUnit) !== purchaseKey) return item;
      return { ...item, status: nextStatus, updatedAt: new Date().toISOString() };
    });
  }
  if (nextStatus === "active") {
    delete state.purchaseInventoryStatuses[purchaseKey];
  } else {
    state.purchaseInventoryStatuses[purchaseKey] = {
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };
  }
  saveState();
  showToast(`تم تحويل المادة إلى ${purchaseInventoryStatusLabel(nextStatus)}.`);
  renderInventory();
  if (typeof renderLowStock === "function") renderLowStock();
}

function purchaseInventoryStatusActions(item = {}) {
  if (item.inventorySource !== "purchase") return "";
  if (item.hidden) {
    return `
      <div class="inventory-stock-actions">
        <button class="secondary-button" type="button" data-edit-purchase-inventory="${escapeAttr(item.purchaseKey)}">تعديل الاسم</button>
        <button class="secondary-button" type="button" data-restore-purchase-inventory="${escapeAttr(item.purchaseKey)}">استرجاع</button>
      </div>
    `;
  }
  const status = normalizePurchaseInventoryStatus(item.availabilityStatus);
  const actionButton = (nextStatus, label) => `
    <button class="secondary-button" type="button" data-purchase-inventory-status="${escapeAttr(item.purchaseKey)}" data-purchase-inventory-next="${nextStatus}">${label}</button>
  `;
  const buttons = status === "active"
    ? [actionButton("clearing", "تصفية"), actionButton("stopped", "إيقاف")]
    : status === "clearing"
      ? [actionButton("active", "تنشيط"), actionButton("stopped", "إيقاف")]
      : [actionButton("active", "تنشيط"), actionButton("clearing", "تصفية")];
  buttons.push(`<button class="secondary-button" type="button" data-inventory-waste-item="${escapeAttr(item.id)}">تالف</button>`);
  buttons.push(`<button class="secondary-button" type="button" data-edit-purchase-inventory="${escapeAttr(item.purchaseKey)}">تعديل الاسم</button>`);
  buttons.push(`<button class="secondary-button inventory-delete-button" type="button" data-hide-purchase-inventory="${escapeAttr(item.purchaseKey)}">حذف</button>`);
  return `<div class="inventory-stock-actions">${buttons.join("")}</div>`;
}

function findPurchaseInventoryItemByKey(purchaseKey) {
  return purchaseInventoryItems().find((item) => item.purchaseKey === purchaseKey) || null;
}

function setPurchaseInventoryAlias(purchaseKey, nextNameValue) {
  const item = findPurchaseInventoryItemByKey(purchaseKey);
  const nextName = String(nextNameValue || "").trim();
  if (!item) { showToast("لم أجد مادة المخزون."); return false; }
  if (!nextName) { showToast("اكتب اسم المادة الجديد."); return false; }

  state.purchaseInventoryAliases = state.purchaseInventoryAliases || {};
  const originalName = String(item.originalName || item.rawName || item.name || "").trim();
  if (nextName === originalName) {
    delete state.purchaseInventoryAliases[purchaseKey];
  } else {
    state.purchaseInventoryAliases[purchaseKey] = {
      name: nextName,
      originalName,
      updatedAt: new Date().toISOString()
    };
  }

  auditAction("inventory.item.rename", { from: originalName, to: nextName, unit: item.stockUnit || "" });
  saveState(true);
  showToast(nextName === originalName ? "تم إرجاع اسم المادة الأصلي." : "تم تعديل اسم المادة في المخزون.");
  renderInventory();
  renderMenuComponentsEditor();
  if (typeof renderLowStock === "function") renderLowStock();
  return true;
}

async function hidePurchaseInventoryItem(purchaseKey) {
  const item = findPurchaseInventoryItemByKey(purchaseKey);
  if (!item) { showToast("لم أجد مادة المخزون."); return false; }
  const confirmed = await appConfirm(
    `حذف مادة المخزون "${item.name}" من العرض؟\nلن تتغير فواتير المشتريات ولا حساب المورد. تقدر تسترجعها من فلتر "كل المواد".`,
    { icon: "🗑", yesLabel: "حذف من العرض", cancelLabel: "رجوع" }
  );
  if (!confirmed) return false;

  state.purchaseInventoryHiddenKeys = state.purchaseInventoryHiddenKeys || {};
  state.purchaseInventoryHiddenKeys[purchaseKey] = {
    name: item.name,
    originalName: item.originalName || item.name,
    hiddenAt: new Date().toISOString()
  };
  auditAction("inventory.item.hide", { name: item.name, unit: item.stockUnit || "" });
  saveState(true);
  showToast("تم حذف المادة من العرض بدون تغيير حسابات المورد.");
  renderInventory();
  if (typeof renderLowStock === "function") renderLowStock();
  return true;
}

function restorePurchaseInventoryItem(purchaseKey) {
  const item = findPurchaseInventoryItemByKey(purchaseKey);
  state.purchaseInventoryHiddenKeys = state.purchaseInventoryHiddenKeys || {};
  delete state.purchaseInventoryHiddenKeys[purchaseKey];
  auditAction("inventory.item.restore", { name: item?.name || purchaseKey });
  saveState(true);
  showToast("تم استرجاع المادة لقائمة المخزون.");
  renderInventory();
  if (typeof renderLowStock === "function") renderLowStock();
}

function closePurchaseInventoryEditor() {
  const overlay = document.getElementById("purchaseInventoryEditOverlay");
  if (overlay) overlay.remove();
  if (closePurchaseInventoryEditor.onKeydown) {
    document.removeEventListener("keydown", closePurchaseInventoryEditor.onKeydown);
    closePurchaseInventoryEditor.onKeydown = null;
  }
}

function openPurchaseInventoryEditor(purchaseKey) {
  const item = findPurchaseInventoryItemByKey(purchaseKey);
  if (!item) { showToast("لم أجد مادة المخزون."); return; }
  closePurchaseInventoryEditor();

  const menuOptions = (state.menu || [])
    .map((menuItem) => `<option value="${escapeAttr(menuItem.name)}"></option>`)
    .join("");
  const overlay = document.createElement("div");
  overlay.id = "purchaseInventoryEditOverlay";
  overlay.className = "option-picker-overlay";
  overlay.innerHTML = `
    <div class="option-picker-box inventory-edit-box" role="dialog" aria-modal="true" aria-labelledby="inventoryEditTitle">
      <div class="option-picker-head">
        <strong id="inventoryEditTitle">تعديل اسم مادة المخزون</strong>
        <button class="option-picker-close" type="button" aria-label="إغلاق" data-close-inventory-edit>×</button>
      </div>
      <p>اختار اسم قريب من اسم الصنف حتى تكون القائمة واضحة. هذا لا يغير فاتورة المشتريات نفسها.</p>
      <label class="field inventory-edit-field">
        <span>اسم المادة في المخزون</span>
        <input id="inventoryEditNameInput" type="text" value="${escapeAttr(item.name || "")}" list="inventoryMenuNameOptions" />
        <datalist id="inventoryMenuNameOptions">${menuOptions}</datalist>
      </label>
      <div class="inventory-edit-meta">
        ${item.isRenamed ? `<span>الاسم الأصلي: ${escapeHtml(item.originalName || "-")}</span>` : ""}
        <span>الوحدة: ${escapeHtml(item.stockUnit || "-")}</span>
        <span>الموجود: ${quantityWithUnit(item.stockQty || 0, item.stockUnit)}</span>
      </div>
      <div class="inventory-edit-actions">
        <button class="primary-button" type="button" data-apply-inventory-rename>حفظ الاسم</button>
        <button class="secondary-button" type="button" data-close-inventory-edit>إلغاء</button>
        <button class="secondary-button inventory-delete-button" type="button" data-hide-inventory-from-editor>${item.hidden ? "محذوف" : "حذف"}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#inventoryEditNameInput");
  input?.focus();
  input?.select();
  const apply = () => {
    if (setPurchaseInventoryAlias(item.purchaseKey, input?.value || "")) closePurchaseInventoryEditor();
  };

  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay || event.target.closest("[data-close-inventory-edit]")) {
      closePurchaseInventoryEditor();
      return;
    }
    if (event.target.closest("[data-apply-inventory-rename]")) {
      apply();
      return;
    }
    if (event.target.closest("[data-hide-inventory-from-editor]") && !item.hidden) {
      const hidden = await hidePurchaseInventoryItem(item.purchaseKey);
      if (hidden) closePurchaseInventoryEditor();
    }
  });
  closePurchaseInventoryEditor.onKeydown = (event) => {
    if (event.key === "Escape") closePurchaseInventoryEditor();
    if (event.key === "Enter" && document.activeElement === input) apply();
  };
  document.addEventListener("keydown", closePurchaseInventoryEditor.onKeydown);
}

function emptyPurchaseInventoryRow(key, name, stockUnit, purchaseUnit = "", lastPurchasedAt = "") {
  return {
    id: purchaseInventoryId(key),
    inventorySource: "purchase",
    purchaseKey: key,
    name,
    category: "مشتريات",
    stockUnit,
    purchasedQty: 0,
    purchaseQty: 0,
    purchaseInvoiceQty: 0,
    purchaseInvoiceStockQty: 0,
    purchaseUnit,
    amount: 0,
    lineCount: 0,
    manualCount: 0,
    manualQty: 0,
    manualAmount: 0,
    manualStatus: "active",
    manualNotes: [],
    manualLastAddedAt: "",
    lastPurchaseUnitCost: 0,
    lastPurchaseAmount: 0,
    lastPurchaseStockQty: 0,
    averageUnitCost: 0,
    lastPurchasedAt,
    lastStockedAt: lastPurchasedAt || ""
  };
}

function purchaseInventoryItems() {
  const rows = new Map();
  state.purchases.forEach((purchase) => {
    purchaseLines(purchase).forEach((line) => {
      const name = String(line.item || "").trim();
      const qty = purchaseLineStockQty(line);
      if (!name || qty <= 0) return;

      const unit = purchaseLineStockUnit(line);
      const key = purchaseInventoryKey(name, unit);
      const existing = rows.get(key) || emptyPurchaseInventoryRow(key, name, unit, normalizeUnit(line.unit || ""), purchase.createdAt || "");

      existing.purchasedQty += qty;
      existing.purchaseQty += Number(line.qty || 0);
      existing.purchaseInvoiceQty += Number(line.qty || 0);
      existing.purchaseInvoiceStockQty += qty;
      if (normalizeUnit(line.unit || "") && existing.purchaseUnit !== normalizeUnit(line.unit || "")) {
        existing.purchaseUnit = existing.purchaseUnit ? "متعدد" : normalizeUnit(line.unit || "");
      }
      existing.amount += Number(line.amount || 0);
      existing.lineCount += 1;
      if (!existing.lastPurchaseUnitCost || new Date(purchase.createdAt || 0) >= new Date(existing.lastPurchasedAt || 0)) {
        existing.lastPurchasedAt = purchase.createdAt || "";
        existing.lastPurchaseUnitCost = purchaseLineUnitCost(line);
        existing.lastPurchaseAmount = Number(line.amount || 0);
        existing.lastPurchaseStockQty = qty;
      }
      existing.lastStockedAt = latestInventoryDate(existing.lastStockedAt, purchase.createdAt || "");
      rows.set(key, existing);
    });
  });

  (state.manualPurchaseInventoryItems || []).forEach((rawItem) => {
    const manualItem = normalizeManualPurchaseInventoryItem(rawItem);
    if (!manualItem) return;
    const key = purchaseInventoryKey(manualItem.name, manualItem.stockUnit);
    const manualPurchaseUnit = normalizeUnit(manualItem.purchaseUnit || manualItem.stockUnit);
    const existing = rows.get(key) || emptyPurchaseInventoryRow(key, manualItem.name, manualItem.stockUnit, manualPurchaseUnit, "");

    existing.purchasedQty += Number(manualItem.stockQty || 0);
    existing.purchaseQty += Number(manualItem.stockQty || 0);
    existing.amount += Number(manualItem.stockQty || 0) * Number(manualItem.cost || 0);
    existing.manualCount += 1;
    existing.manualQty += Number(manualItem.stockQty || 0);
    existing.manualAmount += Number(manualItem.stockQty || 0) * Number(manualItem.cost || 0);
    existing.manualStatus = combinePurchaseInventoryStatus(existing.manualStatus, manualItem.status);
    existing.manualLastAddedAt = latestInventoryDate(existing.manualLastAddedAt, manualItem.createdAt || manualItem.updatedAt || "");
    existing.lastStockedAt = latestInventoryDate(existing.lastStockedAt, manualItem.createdAt || manualItem.updatedAt || "");
    if (manualItem.note) existing.manualNotes.push(manualItem.note);
    if (manualPurchaseUnit && existing.purchaseUnit !== manualPurchaseUnit) {
      existing.purchaseUnit = existing.purchaseUnit ? "متعدد" : manualPurchaseUnit;
    }
    rows.set(key, existing);
  });

  return Array.from(rows.values()).map((row) => {
    const adjustment = state.purchaseInventoryAdjustments?.[row.purchaseKey];
    const purchasedQtyAtCount = Number(adjustment?.purchasedQtyAtCount || 0);
    const actualQtyAtCount = Number(adjustment?.actualQty || 0);
    const stockQty = adjustment
      ? actualQtyAtCount + Number(row.purchasedQty || 0) - purchasedQtyAtCount
      : Number(row.purchasedQty || 0);

    const displayName = purchaseInventoryDisplayName(row.purchaseKey, row.name);
    const hidden = purchaseInventoryHiddenForKey(row.purchaseKey);
    const averageUnitCost = Number(row.purchasedQty || 0) ? Number(row.amount || 0) / Number(row.purchasedQty || 0) : 0;
    return {
      ...row,
      rawName: row.name,
      originalName: row.name,
      name: displayName,
      isRenamed: displayName !== row.name,
      hidden,
      manualOnly: Number(row.lineCount || 0) === 0 && Number(row.manualCount || 0) > 0,
      stockQty,
      availabilityStatus: purchaseInventoryStatusForKey(row.purchaseKey) !== "active"
        ? purchaseInventoryStatusForKey(row.purchaseKey)
        : normalizePurchaseInventoryStatus(row.manualStatus),
      averageUnitCost,
      cost: averageUnitCost,
      lastPurchaseUnitCost: Number(row.lastPurchaseUnitCost || 0),
      lastPurchaseAmount: Number(row.lastPurchaseAmount || 0),
      lastPurchaseStockQty: Number(row.lastPurchaseStockQty || 0)
    };
  });
}

function resetManualPurchaseInventoryForm() {
  if (!els.inventoryManualForm) return;
  els.inventoryManualForm.reset();
  if (els.inventoryManualStatusInput) els.inventoryManualStatusInput.value = "active";
  if (els.inventoryManualNameInput) els.inventoryManualNameInput.focus();
}

function addManualPurchaseInventoryItem(event) {
  if (event) event.preventDefault();
  const name = String(els.inventoryManualNameInput?.value || "").trim();
  const stockQty = Number(els.inventoryManualQtyInput?.value || 0);
  const stockUnit = normalizeUnit(els.inventoryManualUnitInput?.value || "");
  const cost = Number(els.inventoryManualCostInput?.value || 0);
  const purchaseUnit = normalizeUnit(els.inventoryManualPurchaseUnitInput?.value || "");
  const status = normalizePurchaseInventoryStatus(els.inventoryManualStatusInput?.value || "active");
  const note = String(els.inventoryManualNoteInput?.value || "").trim();

  if (!name) { showToast("اكتب اسم المادة أولاً."); return; }
  if (!Number.isFinite(stockQty) || stockQty <= 0) { showToast("اكتب كمية موجودة أكبر من صفر."); return; }
  if (!stockUnit) { showToast("اكتب وحدة المخزون، مثل كيلو أو لتر أو حبة."); return; }
  if (!Number.isFinite(cost) || cost < 0) { showToast("سعر وحدة المخزون لازم يكون صفر أو أكثر."); return; }

  const manualItem = normalizeManualPurchaseInventoryItem({
    id: uid("manual-stock"),
    name,
    stockQty,
    stockUnit,
    purchaseUnit,
    cost,
    status,
    note,
    createdAt: new Date().toISOString()
  });
  if (!manualItem) { showToast("راجع بيانات المادة قبل الإضافة."); return; }

  state.manualPurchaseInventoryItems = Array.isArray(state.manualPurchaseInventoryItems) ? state.manualPurchaseInventoryItems : [];
  state.manualPurchaseInventoryItems.unshift(manualItem);

  const purchaseKey = purchaseInventoryKey(manualItem.name, manualItem.stockUnit);
  state.manualPurchaseInventoryItems = state.manualPurchaseInventoryItems.map((item) => {
    if (purchaseInventoryKey(item.name, item.stockUnit) !== purchaseKey) return item;
    return { ...item, status, updatedAt: new Date().toISOString() };
  });
  state.purchaseInventoryStatuses = state.purchaseInventoryStatuses || {};
  if (status === "active") {
    delete state.purchaseInventoryStatuses[purchaseKey];
  } else {
    state.purchaseInventoryStatuses[purchaseKey] = { status, updatedAt: new Date().toISOString() };
  }

  saveState(true);
  resetManualPurchaseInventoryForm();
  showToast("تمت إضافة المادة للمخزون.");
  renderInventory();
  if (typeof renderLowStock === "function") renderLowStock();
}

function adjustPurchaseInventoryStock(itemId, qtyDelta) {
  if (!isPurchaseInventoryId(itemId) || !Number.isFinite(Number(qtyDelta))) return null;
  const item = inventoryItemById(itemId);
  if (!item) return null;

  const nextQty = Math.max(Number(item.stockQty || 0) + Number(qtyDelta || 0), 0);
  state.purchaseInventoryAdjustments = state.purchaseInventoryAdjustments || {};
  state.purchaseInventoryAdjustments[item.purchaseKey] = {
    actualQty: nextQty,
    purchasedQtyAtCount: Number(item.purchasedQty || 0),
    updatedAt: new Date().toISOString()
  };

  return { ...item, stockQty: nextQty };
}

function resetInventoryWasteForm(keepItemId = "") {
  if (els.inventoryWasteItemInput) els.inventoryWasteItemInput.value = keepItemId || "";
  if (els.inventoryWasteQtyInput) els.inventoryWasteQtyInput.value = "";
  if (els.inventoryWasteReasonInput) els.inventoryWasteReasonInput.value = "";
}

function renderInventoryWastePanel() {
  if (!els.inventoryWasteItemInput || !els.inventoryWasteList) return;
  const selected = els.inventoryWasteItemInput.value;
  const options = purchaseInventoryItems()
    .filter((item) => !item.hidden)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  els.inventoryWasteItemInput.innerHTML = ['<option value="">اختر مادة من المخزون</option>']
    .concat(options.length
      ? options.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)}${item.stockUnit ? ` - ${escapeHtml(item.stockUnit)}` : ""} | الموجود: ${quantityWithUnit(item.stockQty, item.stockUnit)}</option>`)
      : ['<option value="" disabled>لا يوجد مواد ظاهرة بالمخزون</option>'])
    .join("");
  els.inventoryWasteItemInput.value = options.some((item) => item.id === selected) ? selected : "";

  const rows = inventoryWasteRecords()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);
  els.inventoryWasteList.innerHTML = rows.length
    ? rows.map((entry) => `
      <article class="inventory-waste-row">
        <div>
          <strong>${escapeHtml(entry.itemName || "مادة تالفة")}</strong>
          <small>${formatDate(entry.createdAt)} | ${quantityWithUnit(entry.qty, entry.unit)} | خسارة ${money(entry.totalCost)}${entry.reason ? ` | ${escapeHtml(entry.reason)}` : ""}</small>
        </div>
        <button class="inventory-history-delete" type="button" data-remove-inventory-waste="${escapeAttr(entry.id)}" title="حذف التالف" aria-label="حذف التالف">🗑</button>
      </article>
    `).join("")
    : '<div class="empty-state">لا يوجد تالف مسجل بعد.</div>';
}

function fillInventoryWasteForm(itemId) {
  const item = inventoryItemById(itemId);
  if (!item || item.inventorySource !== "purchase") { showToast("اختر مادة من مخزون المشتريات."); return; }
  if (els.inventoryWasteItemInput) els.inventoryWasteItemInput.value = item.id;
  if (els.inventoryWasteQtyInput) {
    els.inventoryWasteQtyInput.value = "";
    els.inventoryWasteQtyInput.focus();
  }
}

function addInventoryWaste(event) {
  if (event) event.preventDefault();
  const item = inventoryItemById(els.inventoryWasteItemInput?.value || "");
  const qty = Math.max(Number(els.inventoryWasteQtyInput?.value || 0), 0);
  const reason = els.inventoryWasteReasonInput?.value || "";
  if (!item || item.inventorySource !== "purchase") { showToast("اختر المادة التالفة من المخزون."); return; }
  if (qty <= 0) { showToast("اكتب كمية التالف."); return; }
  const availableQty = Number(item.stockQty || 0);
  if (availableQty <= 0.001) { showToast("هذه المادة لا يوجد منها كمية مسجلة لتسجيل تالف."); return; }
  if (qty > availableQty + 0.001) {
    showToast(`كمية التالف أكبر من الموجود. الموجود ${quantityWithUnit(availableQty, item.stockUnit)}.`);
    return;
  }
  const unitCost = stockItemRecipeUnitCost(item);
  const record = normalizeInventoryWasteRecord({
    itemId: item.id,
    purchaseKey: item.purchaseKey,
    itemName: item.name,
    qty,
    unit: item.stockUnit || "",
    unitCost,
    totalCost: qty * unitCost,
    reason,
    createdAt: new Date().toISOString()
  });
  if (!record) { showToast("راجع بيانات التالف."); return; }
  state.inventoryWaste = Array.isArray(state.inventoryWaste) ? state.inventoryWaste : [];
  state.inventoryWaste.unshift(record);
  adjustPurchaseInventoryStock(item.id, -qty);
  if (typeof auditAction === "function") auditAction("inventory.waste.add", { item: record.itemName, qty: record.qty, unit: record.unit, totalCost: record.totalCost });
  saveState(true);
  resetInventoryWasteForm(record.itemId);
  showToast(`تم تسجيل تالف ${quantityWithUnit(qty, item.stockUnit)} من ${item.name}.`);
  renderInventory();
  if (typeof renderLowStock === "function") renderLowStock();
}

async function removeInventoryWaste(id) {
  const record = inventoryWasteRecords().find((entry) => entry.id === id);
  if (!record) return;
  if (!guardClosedPeriod(record.createdAt, "حذف تالف مخزون")) return;
  const item = inventoryItemById(record.itemId) || findPurchaseInventoryItemByKey(record.purchaseKey);
  if (!item) { showToast("لم أجد مادة المخزون لإرجاع كمية التالف."); return; }
  const confirmed = await appConfirm(`حذف تالف ${record.itemName} بكمية ${quantityWithUnit(record.qty, record.unit)}؟ سيتم إرجاع الكمية للمخزون.`);
  if (!confirmed) return;
  state.inventoryWaste = (state.inventoryWaste || []).filter((entry) => entry.id !== id);
  adjustPurchaseInventoryStock(item.id, Number(record.qty || 0));
  if (typeof auditAction === "function") auditAction("inventory.waste.delete", { item: record.itemName, qty: record.qty, unit: record.unit, totalCost: record.totalCost });
  saveState(true);
  showToast("تم حذف التالف وإرجاع الكمية للمخزون.");
  renderInventory();
  if (typeof renderLowStock === "function") renderLowStock();
}

function inventoryItemById(itemId) {
  if (isPurchaseInventoryId(itemId)) {
    return purchaseInventoryItems().find((item) => item.id === itemId) || null;
  }
  return findMenuItem(itemId);
}

function purchaseInventoryItemFromUsage(usage = {}) {
  const byId = usage.itemId && isPurchaseInventoryId(usage.itemId) ? inventoryItemById(usage.itemId) : null;
  if (byId) return byId;

  const name = String(usage.name || usage.purchaseItemName || "").trim().toLowerCase();
  if (!name) return null;

  const unit = normalizeUnit(usage.unit || "").toLowerCase();
  const items = purchaseInventoryItems();
  const sameName = items.filter((item) => {
    const displayName = String(item.name || "").trim().toLowerCase();
    const originalName = String(item.originalName || "").trim().toLowerCase();
    return displayName === name || originalName === name;
  });
  if (!sameName.length) return null;
  const sameUnit = sameName.find((item) => normalizeUnit(item.stockUnit || "").toLowerCase() === unit);
  return sameUnit || (sameName.length === 1 ? sameName[0] : null);
}

function purchaseInventoryPackageInfo(item = {}) {
  if (item.inventorySource !== "purchase") return null;
  const purchaseQty = Number(item.purchaseInvoiceQty ?? item.purchaseQty ?? 0);
  const purchasedQty = Number(item.purchaseInvoiceStockQty ?? item.purchasedQty ?? 0);
  const purchaseUnit = normalizeUnit(item.purchaseUnit || "");
  const stockUnit = normalizeUnit(item.stockUnit || "");
  if (!purchaseUnit || purchaseUnit === "متعدد" || purchaseQty <= 0 || purchasedQty <= 0) return null;

  const stockPerPurchase = purchasedQty / purchaseQty;
  if (!Number.isFinite(stockPerPurchase) || stockPerPurchase <= 0) return null;

  const stockQty = Number(item.stockQty || 0);
  const consumedStockQty = Math.max(purchasedQty - stockQty, 0);
  const consumedPurchaseQty = consumedStockQty / stockPerPurchase;
  const remainingPurchaseQty = stockQty / stockPerPurchase;
  const shortageStockQty = Math.max(-stockQty, 0);
  const shortagePurchaseQty = shortageStockQty / stockPerPurchase;
  const wholeConsumedPurchaseQty = Math.floor(consumedPurchaseQty + 0.000001);

  return {
    purchaseUnit,
    stockUnit,
    stockPerPurchase,
    consumedStockQty,
    consumedPurchaseQty,
    remainingPurchaseQty,
    shortageStockQty,
    shortagePurchaseQty,
    wholeConsumedPurchaseQty
  };
}

function purchaseInventoryPackageInlineText(item = {}) {
  const info = purchaseInventoryPackageInfo(item);
  if (!info) return "";
  if (info.shortageStockQty > 0) {
    return `عجز: ${quantityWithUnit(info.shortagePurchaseQty, info.purchaseUnit)} | استخدمت: ${quantityWithUnit(info.consumedPurchaseQty, info.purchaseUnit)}`;
  }
  return `استهلكت: ${quantityWithUnit(info.consumedPurchaseQty, info.purchaseUnit)} | المتبقي يعادل: ${quantityWithUnit(info.remainingPurchaseQty, info.purchaseUnit)}`;
}

function purchaseInventoryPackageBadges(item = {}) {
  const info = purchaseInventoryPackageInfo(item);
  if (!info) return "";
  const conversionText = info.stockUnit && info.stockUnit !== info.purchaseUnit
    ? `<span>كل ${escapeHtml(info.purchaseUnit)} = ${quantityWithUnit(info.stockPerPurchase, info.stockUnit)}</span>`
    : "";
  const wholeText = info.wholeConsumedPurchaseQty > 0
    ? `<span>المكتمل: ${quantityWithUnit(info.wholeConsumedPurchaseQty, info.purchaseUnit)}</span>`
    : "";
  const shortageText = info.shortageStockQty > 0
    ? `<span class="inventory-shortage-chip">عجز: ${quantityWithUnit(info.shortageStockQty, info.stockUnit)}</span>`
    : "";

  return `
    <div class="inventory-stock-usage">
      ${conversionText}
      <span>استهلكت: ${quantityWithUnit(info.consumedPurchaseQty, info.purchaseUnit)} (${quantityWithUnit(info.consumedStockQty, info.stockUnit)})</span>
      <span>المتبقي يعادل: ${quantityWithUnit(Math.max(info.remainingPurchaseQty, 0), info.purchaseUnit)}</span>
      ${wholeText}
      ${shortageText}
    </div>
  `;
}

function currentStockQty(item) {
  if (item?.inventorySource !== "purchase" && menuItemComponents(item).length) {
    if (item.finishedStockQty !== undefined && item.finishedStockQty !== null && item.finishedStockQty !== "") {
      return Number(item.finishedStockQty || 0);
    }
    return Number(menuItemDisplayStock(item).qty || 0);
  }
  return isStockTracked(item) ? Number(item.stockQty || 0) : 0;
}

function inventoryDraftActualValue(itemId) {
  const raw = inventoryDraft[itemId]?.actual;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(value, 0) : null;
}

function inventoryItemState(item) {
  const systemQty = currentStockQty(item);
  const threshold = Math.max(Number(state.lowStockThreshold || 0), 0);
  const actualQty = inventoryDraftActualValue(item.id);
  const diff = actualQty === null ? 0 : actualQty - systemQty;
  return {
    systemQty,
    actualQty,
    diff,
    isCounted: actualQty !== null,
    isChanged: actualQty !== null && Math.abs(diff) > 0.001,
    isShortage: systemQty < -0.001,
    isEmpty: Math.abs(systemQty) <= 0.001,
    isLow: systemQty > 0.001 && systemQty <= threshold
  };
}

function inventoryStockStateBadge(itemState) {
  if (itemState.isShortage) return '<span class="inventory-stock-state is-shortage">عجز</span>';
  if (itemState.isEmpty) return '<span class="inventory-stock-state is-empty">فارغ</span>';
  if (itemState.isLow) return '<span class="inventory-stock-state is-low">ناقص</span>';
  return '<span class="inventory-stock-state is-ok">جيد</span>';
}

function inventoryItemMatchesStatus(item, status) {
  const itemState = inventoryItemState(item);
  if (status === "empty") return itemState.isShortage || itemState.isEmpty;
  if (status === "low") return itemState.isShortage || itemState.isLow;
  if (status === "not-counted") return !itemState.isCounted;
  if (status === "counted") return itemState.isCounted;
  if (status === "changed") return itemState.isChanged;
  return true;
}

function inventoryItemsForView() {
  const query = els.inventorySearchInput.value.trim().toLowerCase();
  const scope = els.inventoryScopeInput.value;
  const status = els.inventoryStatusInput?.value || "all";
  const availability = els.inventoryAvailabilityInput?.value || "usable";
  const purchaseItems = purchaseInventoryItems();
  const menuItems = state.menu.slice();
  const items = scope === "sales" ? menuItems : scope === "all" ? purchaseItems.concat(menuItems) : purchaseItems;

  return items
    .filter((item) => {
      const packageText = purchaseInventoryPackageInlineText(item);
      const haystack = `${item.name || ""} ${item.originalName || ""} ${item.category || ""} ${item.stockUnit || ""} ${item.purchaseUnit || ""} ${packageText} ${item.cost || ""} ${item.lastPurchaseUnitCost || ""}`;
      return searchMatch(haystack, query);
    })
    .filter((item) => purchaseInventoryItemMatchesAvailability(item, availability))
    .filter((item) => inventoryItemMatchesStatus(item, status))
    .sort((a, b) => `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`, "ar"));
}

function inventoryDifferenceText(diff, unit = "") {
  if (Math.abs(diff) <= 0.001) return "مطابق";
  return diff > 0 ? `زيادة ${quantityWithUnit(diff, unit)}` : `نقص ${quantityWithUnit(Math.abs(diff), unit)}`;
}

function purchaseInventoryAvailabilityLabel(availability = "usable") {
  return {
    usable: "المواد المستخدمة الآن",
    active: "مواد نشتريها عادي",
    clearing: "مواد للتصفية",
    stopped: "مواد موقوفة",
    all: "كل مواد الشراء"
  }[availability] || "المواد المستخدمة الآن";
}

function purchaseInventoryLastDateValue(item = {}) {
  const value = new Date(item.lastStockedAt || item.lastPurchasedAt || item.manualLastAddedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function purchaseInventoryStockValue(item = {}) {
  return Number(item.stockQty || 0) * Number(item.cost || 0);
}

function purchaseInventoryStockState(item = {}) {
  const qty = Number(item.stockQty || 0);
  const threshold = Number(state.lowStockThreshold || 0);
  return {
    isShortage: qty < -0.001,
    isEmpty: Math.abs(qty) <= 0.001,
    isLow: qty > 0.001 && qty <= threshold
  };
}

function purchaseInventorySeverityRank(item = {}) {
  const itemState = purchaseInventoryStockState(item);
  const status = normalizePurchaseInventoryStatus(item.availabilityStatus);
  if (itemState.isShortage) return 0;
  if (itemState.isEmpty) return 0;
  if (itemState.isLow) return 1;
  if (status === "clearing") return 2;
  if (status === "stopped") return 3;
  return 4;
}

function purchaseInventoryNameCompare(a = {}, b = {}) {
  return String(a.name || "").localeCompare(String(b.name || ""), "ar");
}

function comparePurchaseInventoryStock(a = {}, b = {}, sortMode = "risk") {
  if (sortMode === "value") {
    return purchaseInventoryStockValue(b) - purchaseInventoryStockValue(a) || purchaseInventoryNameCompare(a, b);
  }
  if (sortMode === "qty") {
    return Number(a.stockQty || 0) - Number(b.stockQty || 0) || purchaseInventoryNameCompare(a, b);
  }
  if (sortMode === "latest") {
    return purchaseInventoryLastDateValue(b) - purchaseInventoryLastDateValue(a) || purchaseInventoryNameCompare(a, b);
  }
  if (sortMode === "name") {
    return purchaseInventoryNameCompare(a, b);
  }
  return purchaseInventorySeverityRank(a) - purchaseInventorySeverityRank(b)
    || Number(a.stockQty || 0) - Number(b.stockQty || 0)
    || purchaseInventoryNameCompare(a, b);
}

function latestPurchaseInventoryItem(items = []) {
  return items
    .filter((item) => item.lastStockedAt || item.lastPurchasedAt || item.manualLastAddedAt)
    .sort((a, b) => purchaseInventoryLastDateValue(b) - purchaseInventoryLastDateValue(a))[0] || null;
}

function purchaseInventoryHealthText({ itemsCount, shortageCount, emptyCount, lowCount, clearingCount, stoppedCount }) {
  if (!itemsCount) {
    return { tone: "clear", title: "لا يوجد مواد", text: "أضف مادة موجودة عندك أو سجل فاتورة مشتريات حتى يبدأ المخزون بالظهور هنا." };
  }
  if (shortageCount) {
    return { tone: "danger", title: "في مواد عليها عجز", text: "هذه المواد استُخدمت أكثر من المسجل بالمخزون. الشراء القادم يغطي العجز تلقائياً." };
  }
  if (emptyCount) {
    return { tone: "danger", title: "في مواد خلصت", text: "ابدأ بالمواد التي صارت كميتها صفر لأنها قد توقف التحضير أو البيع." };
  }
  if (lowCount) {
    return { tone: "warn", title: "في مواد قليلة", text: "راجع المواد القليلة قبل بداية الوردية أو قبل الطلبية القادمة." };
  }
  if (clearingCount || stoppedCount) {
    return { tone: "muted", title: "في مواد لا تريد شراءها الآن", text: "مواد التصفية والموقوفة تظهر هنا، لكنها لا تدخل في اقتراحات الشراء." };
  }
  return { tone: "good", title: "المخزون مطمئن", text: "لا يوجد مواد خلصت أو صارت قليلة ضمن العرض الحالي." };
}

function renderInventoryStockPanel() {
  const availability = els.inventoryAvailabilityInput?.value || "usable";
  const query = els.inventorySearchInput?.value.trim() || "";
  const sortMode = els.inventoryStockSortInput?.value || "risk";
  const sortLabel = els.inventoryStockSortInput?.selectedOptions?.[0]?.textContent || "المواد التي تحتاج انتباه أولاً";
  const availabilityLabel = purchaseInventoryAvailabilityLabel(availability);
  const items = purchaseInventoryItems()
    .filter((item) => {
      const packageText = purchaseInventoryPackageInlineText(item);
      const haystack = `${item.name || ""} ${item.category || ""} ${item.stockUnit || ""} ${item.purchaseUnit || ""} ${packageText} ${item.cost || ""} ${item.lastPurchaseUnitCost || ""}`;
      return searchMatch(haystack, query);
    })
    .filter((item) => purchaseInventoryItemMatchesAvailability(item, availability))
    .sort((a, b) => comparePurchaseInventoryStock(a, b, sortMode));
  const totalValue = items.reduce((sum, item) => sum + purchaseInventoryStockValue(item), 0);
  const totalLines = items.reduce((sum, item) => sum + Number(item.lineCount || 0) + Number(item.manualCount || 0), 0);
  const activeCount = items.filter((item) => normalizePurchaseInventoryStatus(item.availabilityStatus) === "active").length;
  const shortageCount = items.filter((item) => purchaseInventoryStockState(item).isShortage).length;
  const emptyCount = items.filter((item) => purchaseInventoryStockState(item).isEmpty).length;
  const lowCount = items.filter((item) => purchaseInventoryStockState(item).isLow).length;
  const clearingCount = items.filter((item) => normalizePurchaseInventoryStatus(item.availabilityStatus) === "clearing").length;
  const stoppedCount = items.filter((item) => normalizePurchaseInventoryStatus(item.availabilityStatus) === "stopped").length;
  const latestItem = latestPurchaseInventoryItem(items);
  const latestDate = latestItem?.lastStockedAt || latestItem?.lastPurchasedAt || latestItem?.manualLastAddedAt;
  const health = purchaseInventoryHealthText({ itemsCount: items.length, shortageCount, emptyCount, lowCount, clearingCount, stoppedCount });
  renderInventoryWastePanel();

  els.inventoryStockSummary.innerHTML = `
    <article class="inventory-stock-summary-main">
      <div>
        <span>قيمة المخزون الظاهر</span>
        <strong>${money(totalValue)}</strong>
        <small>${availabilityLabel} - ${quantityText(items.length)} مادة</small>
      </div>
      <div class="inventory-stock-health is-${health.tone}">
        <b>${health.title}</b>
        <small>${health.text}</small>
      </div>
    </article>
    <article class="inventory-kpi-alert"><span>تحتاج انتباه</span><strong>${quantityText(shortageCount + emptyCount + lowCount)}</strong><small>عجز ${quantityText(shortageCount)} | فارغ ${quantityText(emptyCount)} | قليل ${quantityText(lowCount)}</small></article>
    <article><span>مواد نشطة</span><strong>${quantityText(activeCount)}</strong><small>تدخل في اقتراحات الشراء</small></article>
    <article><span>تصفية أو موقوف</span><strong>${quantityText(clearingCount + stoppedCount)}</strong><small>لا تدخل في اقتراحات الشراء</small></article>
  `;

  els.inventoryStockList.innerHTML = items.length
    ? `
      <div class="inventory-stock-list-head">
        <div>
          <span>مواد المخزون الظاهرة الآن</span>
          <strong>${quantityText(items.length)}</strong>
        </div>
        <small>مرتبة حسب: ${escapeHtml(sortLabel)}</small>
      </div>
      ${items.map((item) => {
      const value = purchaseInventoryStockValue(item);
      const packageInline = purchaseInventoryPackageInlineText(item);
      const packageBadges = purchaseInventoryPackageBadges(item);
      const availabilityStatus = normalizePurchaseInventoryStatus(item.availabilityStatus);
      const itemState = purchaseInventoryStockState(item);
      const stockStateClass = itemState.isShortage ? "is-shortage" : itemState.isEmpty ? "is-empty" : itemState.isLow ? "is-low" : "is-ok";
      const lastEntryText = item.lastStockedAt || item.lastPurchasedAt || item.manualLastAddedAt;
      const lastPurchaseText = lastEntryText ? formatDate(lastEntryText).slice(0, 10) : "-";
      const unitText = item.stockUnit ? ` / ${escapeHtml(item.stockUnit)}` : "";
      const lastUnitCostText = Number(item.lastPurchaseUnitCost || 0) > 0 ? `${money(item.lastPurchaseUnitCost)}${unitText}` : "-";
      const averageUnitCostText = `${money((item.averageUnitCost ?? item.cost) || 0)}${unitText}`;
      const nameMetaText = [
        item.stockUnit ? `وحدة المخزون: ${item.stockUnit}` : "",
        item.purchaseUnit ? `وحدة الشراء: ${item.purchaseUnit}` : ""
      ].filter(Boolean).join(" | ");
      return `
        <article class="inventory-stock-row is-${availabilityStatus} ${stockStateClass} ${item.hidden ? "is-hidden" : ""}">
          <div class="inventory-stock-row-head">
            <div class="inventory-stock-title">
              <span class="inventory-stock-name-label">اسم المادة</span>
              <strong><bdi>${escapeHtml(item.name || "مادة بدون اسم")}</bdi></strong>
              ${nameMetaText ? `<small class="inventory-stock-name-help">${escapeHtml(nameMetaText)}</small>` : ""}
              <div class="inventory-stock-badges">
                ${purchaseInventoryHiddenChip(item)}
                ${purchaseInventoryAliasChip(item)}
                ${purchaseInventoryStatusBadge(item)}
                ${inventoryStockStateBadge(itemState)}
                ${purchaseInventoryManualChip(item)}
              </div>
            </div>
            ${purchaseInventoryStatusActions(item)}
          </div>
          <div class="inventory-stock-metrics">
            <span><small>الكمية الموجودة</small><strong>${quantityWithUnit(item.stockQty, item.stockUnit)}</strong></span>
            <span><small>قيمة الكمية الموجودة</small><strong>${money(value)}</strong></span>
            <span class="inventory-last-price"><small>آخر سعر شراء</small><strong>${lastUnitCostText}</strong></span>
          </div>
          <details class="inventory-row-details">
            <summary>عرض تفاصيل المادة</summary>
            <div class="inventory-stock-row-meta">
              <span>متوسط التكلفة: ${averageUnitCostText}</span>
              <span>آخر إدخال / شراء: ${lastPurchaseText}</span>
              <span>شراء/إدخال: ${quantityText(Number(item.lineCount || 0) + Number(item.manualCount || 0))}</span>
              <span>إجمالي الكمية المسجلة: ${quantityWithUnit(item.purchasedQty || 0, item.stockUnit)}</span>
              ${item.isRenamed ? `<span>الاسم الأصلي: ${escapeHtml(item.originalName || "")}</span>` : ""}
              ${Number(item.manualQty || 0) ? `<span>مدخل يدويًا: ${quantityWithUnit(item.manualQty || 0, item.stockUnit)}</span>` : ""}
              ${item.manualNotes?.length ? `<span>ملاحظة: ${escapeHtml(item.manualNotes[0])}</span>` : ""}
              ${packageInline ? `<span>${escapeHtml(packageInline)}</span>` : ""}
            </div>
            ${packageBadges}
          </details>
        </article>
      `;
    }).join("")}
    `
    : `<div class="empty-state">${query ? "لا توجد مواد مطابقة للبحث." : "لا يوجد مخزون مشتريات بعد. أضف مادة موجودة عندك أو سجل فاتورة مشتريات حتى يظهر هنا."}</div>`;
}

function renderInventory() {
  syncInventoryPaneUi();
  document.querySelectorAll("[data-inventory-scope-quick]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.inventoryScopeQuick === els.inventoryScopeInput.value);
  });
  renderInventoryStockPanel();
  const items = inventoryItemsForView();
  els.inventoryList.innerHTML = items.length
    ? items.map((item) => {
      const draft = inventoryDraft[item.id] || {};
      const systemQty = currentStockQty(item);
      const itemState = inventoryItemState(item);
      const unit = itemUnit(item);
      const packageInline = item.inventorySource === "purchase" ? purchaseInventoryPackageInlineText(item) : "";
      const metaParts = item.inventorySource === "purchase"
        ? [
          item.category,
          item.isRenamed ? `الاسم الأصلي ${item.originalName || ""}` : "",
          `مسجل بالمخزون ${quantityWithUnit(item.purchasedQty || 0, item.stockUnit)}`,
          `النظام ${stockText(item)}`,
          `سعر وحدة المخزون ${money(item.cost || 0)}${unit ? ` / ${unit}` : ""}`,
          ...(Number(item.manualQty || 0) ? [`مدخل يدويًا ${quantityWithUnit(item.manualQty || 0, item.stockUnit)}`] : []),
          ...(packageInline ? [packageInline] : [])
        ]
        : [
          item.category,
          `النظام ${stockText(item)}`,
          `سعر وحدة المخزون ${item.cost === undefined ? "غير محدد" : money(item.cost)}`
        ];
      const rowClasses = [
        "inventory-row",
        itemState.isShortage ? "is-stock-shortage" : itemState.isEmpty ? "is-stock-empty" : itemState.isLow ? "is-stock-low" : "",
        itemState.isCounted ? "is-counted" : "",
        itemState.isChanged ? "has-difference" : "",
        itemState.isChanged ? (itemState.diff > 0 ? "is-difference-plus" : "is-difference-minus") : ""
      ].filter(Boolean).join(" ");
      return `
        <article class="${rowClasses}" data-inventory-row="${escapeAttr(item.id)}">
          <div class="inventory-row-main">
            <div class="inventory-item-cell">
              <div class="inventory-item-title">
                <strong>${escapeHtml(item.name)}</strong>
                <div class="inventory-row-badges">
                  ${purchaseInventoryStatusBadge(item)}
                  ${purchaseInventoryHiddenChip(item)}
                  ${purchaseInventoryAliasChip(item)}
                  ${item.inventorySource !== "purchase" && !isStockTracked(item) && !menuItemComponents(item).length ? '<span class="inventory-new-count-chip">جرد أول مرة</span>' : ""}
                  ${item.inventorySource !== "purchase" && menuItemComponents(item).length ? `<span class="inventory-components-count-chip">${item.finishedStockQty !== undefined ? "جرد فعلي مستقل" : "محسوب من المكونات"}</span>` : ""}
                  ${inventoryStockStateBadge(itemState)}
                  ${purchaseInventoryManualChip(item)}
                  <span class="inventory-status" data-inventory-diff="${escapeAttr(item.id)}">-</span>
                </div>
              </div>
              <div class="inventory-row-meta">${metaParts.filter(Boolean).map((part) => `<span>${escapeHtml(part || "-")}</span>`).join("")}</div>
              ${item.inventorySource === "purchase" ? purchaseInventoryPackageBadges(item) : ""}
            </div>
            <div class="inventory-count-cell inventory-system-field">
              <span>النظام</span>
              <output>${quantityWithUnit(systemQty, unit)}</output>
            </div>
            <label class="inventory-actual-cell">
              <span>الفعلي</span>
              <input type="number" min="0" step="any" inputmode="decimal" data-inventory-actual="${escapeAttr(item.id)}" value="${escapeAttr(draft.actual || "")}" placeholder="${quantityText(systemQty)}" aria-label="الكمية الفعلية: ${escapeAttr(item.name)}" />
            </label>
            <label class="inventory-diff-cell">
              <span>فرق القيمة</span>
              <output data-inventory-value="${escapeAttr(item.id)}">-</output>
            </label>
          </div>
          <div class="inventory-row-footer">
            <div class="inventory-row-tools">
              <button class="secondary-button" type="button" data-inventory-fill-row="${escapeAttr(item.id)}">مطابق</button>
              <button class="secondary-button" type="button" data-inventory-zero-row="${escapeAttr(item.id)}">صفر</button>
              <button class="secondary-button" type="button" data-inventory-clear-row="${escapeAttr(item.id)}">مسح</button>
            </div>
            <label class="inventory-reason-field">
              <span>سبب الفرق</span>
              <input type="text" data-inventory-note="${escapeAttr(item.id)}" value="${escapeAttr(draft.note || "")}" placeholder="كسر، ضياع، استخدام داخلي..." />
            </label>
          </div>
        </article>
      `;
    }).join("")
    : '<div class="empty-state">لا توجد عناصر مطابقة للجرد.</div>';

  renderInventoryHistory();
  updateInventoryCalculations();
}

function updateInventoryCalculations() {
  const rows = Array.from(els.inventoryList.querySelectorAll("[data-inventory-row]"));
  let counted = 0;
  let changed = 0;
  let lowCount = 0;
  let emptyCount = 0;
  let systemValue = 0;
  let countedActualValue = 0;
  let positiveValue = 0;
  let negativeValue = 0;
  const threshold = Math.max(Number(state.lowStockThreshold || 0), 0);

  rows.forEach((row) => {
    const item = inventoryItemById(row.dataset.inventoryRow);
    if (!item) return;

    const actualInput = row.querySelector("[data-inventory-actual]");
    const noteInput = row.querySelector("[data-inventory-note]");
    const status = row.querySelector("[data-inventory-diff]");
    const valueOutput = row.querySelector("[data-inventory-value]");
    inventoryDraft[item.id] = {
      actual: actualInput.value,
      note: noteInput.value
    };

    const systemQty = currentStockQty(item);
    const unitCost = Number(item.cost || 0);
    systemValue += systemQty * unitCost;
    if (systemQty <= 0.001) emptyCount += 1;
    else if (systemQty <= threshold) lowCount += 1;

    row.classList.toggle("is-stock-shortage", systemQty < -0.001);
    row.classList.toggle("is-stock-empty", systemQty >= -0.001 && systemQty <= 0.001);
    row.classList.toggle("is-stock-low", systemQty > 0.001 && systemQty <= threshold);
    row.classList.remove("is-counted", "has-difference", "is-difference-plus", "is-difference-minus");
    valueOutput.className = "";

    if (actualInput.value === "") {
      status.textContent = "-";
      status.className = "inventory-status";
      valueOutput.textContent = "-";
      return;
    }

    const actual = Math.max(Number(actualInput.value || 0), 0);
    const diff = actual - systemQty;
    const diffValue = diff * unitCost;
    counted += 1;
    if (Math.abs(diff) > 0.001) changed += 1;
    if (diffValue > 0) positiveValue += diffValue;
    if (diffValue < 0) negativeValue += Math.abs(diffValue);
    countedActualValue += actual * unitCost;

    status.textContent = inventoryDifferenceText(diff, itemUnit(item));
    status.className = `inventory-status ${diff > 0.001 ? "is-plus" : diff < -0.001 ? "is-minus" : "is-clear"}`;
    valueOutput.textContent = money(diffValue);
    valueOutput.className = diffValue > 0.001 ? "is-plus" : diffValue < -0.001 ? "is-minus" : "is-clear";
    row.classList.add("is-counted");
    if (Math.abs(diff) > 0.001) {
      row.classList.add("has-difference", diff > 0 ? "is-difference-plus" : "is-difference-minus");
    }
  });

  const netValue = positiveValue - negativeValue;
  const netClass = netValue > 0.001 ? "is-plus" : netValue < -0.001 ? "is-minus" : "";
  const netLabel = netValue > 0.001 ? "زيادة بالجرد (للمعرفة)" : netValue < -0.001 ? "نقص بالجرد (للمعرفة)" : "فرق الجرد";
  const countedPercent = rows.length ? Math.round((counted / rows.length) * 100) : 0;
  const attentionCount = emptyCount + lowCount;
  const remainingCount = Math.max(rows.length - counted, 0);
  const statusText = !rows.length
    ? "لا توجد عناصر ظاهرة ضمن الفلاتر الحالية."
    : counted === 0
      ? "ابدأ بإدخال الكمية الفعلية لأول مادة؛ الاعتماد يبقى مقفلاً حتى يبدأ العد."
      : remainingCount > 0
        ? `تم عدّ ${quantityText(counted)} وباقي ${quantityText(remainingCount)} ضمن الفلتر الحالي.`
        : changed
          ? `كل الظاهر معدود، و${quantityText(changed)} عنصر يحتاج مراجعة سبب الفرق.`
          : "كل العناصر الظاهرة معدودة ومطابقة.";
  const statusClass = changed ? "is-minus" : counted && remainingCount === 0 ? "is-plus" : "is-clear";
  if (els.inventorySaveButton) {
    els.inventorySaveButton.disabled = counted === 0;
    els.inventorySaveButton.title = counted === 0 ? "اكتب كمية فعلية لعنصر واحد على الأقل" : "";
  }

  els.inventorySummary.innerHTML = `
    <article class="inventory-decision-card is-system">
      <span>قيمة النظام للظاهر</span>
      <strong>${money(systemValue)}</strong>
      <small>${quantityText(rows.length)} عنصر ضمن الفلتر</small>
    </article>
    <article class="inventory-decision-card is-progress">
      <span>تقدم العد</span>
      <strong>${quantityText(counted)} / ${quantityText(rows.length)}</strong>
      <div class="inventory-progress-track"><i style="width:${countedPercent}%"></i></div>
      <small>${countedPercent}% مكتمل من العناصر الظاهرة</small>
    </article>
    <article class="inventory-decision-card ${attentionCount ? "is-minus" : "is-clear"}">
      <span>بحاجة انتباه</span>
      <strong>${quantityText(attentionCount)}</strong>
      <small>فارغ ${quantityText(emptyCount)} | على الحد ${quantityText(lowCount)}</small>
    </article>
    <article class="inventory-decision-card ${changed ? "is-minus" : "is-clear"}">
      <span>فروقات العد</span>
      <strong>${quantityText(changed)}</strong>
      <small>زيادة ${money(positiveValue)} | نقص ${money(negativeValue)}</small>
    </article>
    <article class="inventory-decision-card ${netClass}">
      <span>${netLabel}</span>
      <strong>${money(Math.abs(netValue))}</strong>
      <small>النظام ${money(systemValue)} | المعدود ${money(countedActualValue)}</small>
    </article>
    <div class="inventory-summary-status ${statusClass}">${statusText}</div>
  `;
}

function setInventoryRowActual(itemId, actualQty) {
  const item = inventoryItemById(itemId);
  if (!item) return;
  const nextQty = Math.max(Number(actualQty || 0), 0);
  inventoryDraft[item.id] = {
    ...(inventoryDraft[item.id] || {}),
    actual: Number.isFinite(nextQty) ? String(nextQty) : "0"
  };
  renderInventory();
}

function fillInventoryRowFromSystem(itemId) {
  const item = inventoryItemById(itemId);
  if (!item) return;
  setInventoryRowActual(item.id, currentStockQty(item));
}

function zeroInventoryRow(itemId) {
  setInventoryRowActual(itemId, 0);
}

function clearInventoryRow(itemId) {
  const item = inventoryItemById(itemId);
  if (!item) return;
  inventoryDraft[item.id] = {
    ...(inventoryDraft[item.id] || {}),
    actual: ""
  };
  renderInventory();
}

function fillInventoryFromSystem() {
  inventoryItemsForView().forEach((item) => {
    inventoryDraft[item.id] = {
      ...(inventoryDraft[item.id] || {}),
      actual: String(currentStockQty(item))
    };
  });
  renderInventory();
}

async function saveInventoryCount() {
  const rows = Array.from(els.inventoryList.querySelectorAll("[data-inventory-row]"));
  const lines = rows.map((row) => {
    const item = inventoryItemById(row.dataset.inventoryRow);
    const actualInput = row.querySelector("[data-inventory-actual]");
    const noteInput = row.querySelector("[data-inventory-note]");
    if (!item || actualInput.value === "") return null;

    const systemQty = currentStockQty(item);
    const actualQty = Math.max(Number(actualInput.value || 0), 0);
    const difference = actualQty - systemQty;
    return {
      source: item.inventorySource || "menu",
      menuItemId: item.inventorySource === "purchase" ? null : item.id,
      purchaseKey: item.inventorySource === "purchase" ? item.purchaseKey : "",
      purchasedQtyAtCount: item.inventorySource === "purchase" ? Number(item.purchasedQty || 0) : 0,
      item: item.name,
      category: item.category,
      systemQty,
      actualQty,
      difference,
      unit: itemUnit(item),
      unitCost: Number(item.cost || 0),
      value: difference * Number(item.cost || 0),
      note: noteInput.value.trim()
    };
  }).filter(Boolean);

  if (!lines.length) {
    showToast("اكتب الكمية الفعلية لعنصر واحد على الأقل.");
    return;
  }

  const changedLines = lines.filter((line) => Math.abs(line.difference) > 0.001);
  const totalIncreaseValue = lines.reduce((sum, line) => sum + Math.max(Number(line.value || 0), 0), 0);
  const totalDecreaseValue = lines.reduce((sum, line) => sum + Math.max(-Number(line.value || 0), 0), 0);
  const netInventoryValue = totalIncreaseValue - totalDecreaseValue;
  const netInventoryText = netInventoryValue > 0.001
    ? `زيادة بالجرد للمعلومة: ${money(netInventoryValue)}`
    : netInventoryValue < -0.001
      ? `نقص بالجرد للمعلومة: ${money(Math.abs(netInventoryValue))}`
      : "فرق الجرد: ₪0";
  const confirmed = await appConfirm(`اعتماد الجرد؟ سيتم تعديل مخزون ${lines.length} عنصر${changedLines.length ? `، منها ${changedLines.length} فيها فرق` : ""}.\n${netInventoryText}`, { icon: "📊", danger: false });
  if (!confirmed) return;

  lines.forEach((line) => {
    if (line.source === "purchase") {
      state.purchaseInventoryAdjustments = state.purchaseInventoryAdjustments || {};
      state.purchaseInventoryAdjustments[line.purchaseKey] = {
        actualQty: line.actualQty,
        purchasedQtyAtCount: line.purchasedQtyAtCount,
        updatedAt: new Date().toISOString()
      };
      return;
    }

    const item = findMenuItem(line.menuItemId);
    if (item) {
      if (menuItemComponents(item).length) item.finishedStockQty = line.actualQty;
      else item.stockQty = line.actualQty;
      item.updatedAt = new Date().toISOString();
    }
  });

  const record = {
    id: uid("inventory"),
    number: `INVCOUNT-${String((state.inventoryCounts?.length || 0) + 1).padStart(4, "0")}`,
    note: els.inventoryNoteInput.value.trim(),
    lines,
    changed: changedLines.length,
    totalIncreaseValue,
    totalDecreaseValue,
    createdAt: new Date().toISOString()
  };
  record.netInventoryValue = netInventoryValue;
  record.inventoryProfitValue = Math.max(record.netInventoryValue, 0);
  record.inventoryLossValue = Math.max(-record.netInventoryValue, 0);

  state.inventoryCounts = state.inventoryCounts || [];
  state.inventoryCounts.unshift(record);
  inventoryDraft = {};
  els.inventoryNoteInput.value = "";
  showToast(`تم اعتماد الجرد ${record.number}.`);
  render();
}

function renderInventoryHistory() {
  const dFrom = els.inventoryHistoryDateFromInput ? els.inventoryHistoryDateFromInput.value : "";
  const dTo = els.inventoryHistoryDateToInput ? els.inventoryHistoryDateToInput.value : "";
  const range = {
    minDate: (dFrom && dTo && dFrom > dTo) ? dTo : dFrom,
    maxDate: (dFrom && dTo && dFrom > dTo) ? dFrom : dTo
  };
  const allRecords = (state.inventoryCounts || []).filter((record) => dateMatchesRange(record, range));
  if (inventoryHistoryViewLimit < INVENTORY_HISTORY_STEP) inventoryHistoryViewLimit = INVENTORY_HISTORY_STEP;
  const records = allRecords.slice(0, inventoryHistoryViewLimit);
  const remaining = allRecords.length - records.length;
  const moreRow = remaining > 0
    ? `<button class="secondary-button inventory-history-more" type="button" data-show-more-inventory-history>⬇ عرض ${Math.min(remaining, INVENTORY_HISTORY_STEP)} سجل جرد أكثر (متبقّي ${remaining})</button>`
    : "";

  els.inventoryHistoryList.innerHTML = records.length
    ? records.map((record) => {
      const netValue = Number(record.netInventoryValue ?? (Number(record.totalIncreaseValue || 0) - Number(record.totalDecreaseValue || 0)));
      const netLabel = netValue > 0.001 ? "زيادة بالجرد (للمعرفة)" : netValue < -0.001 ? "نقص بالجرد (للمعرفة)" : "فرق الجرد";
      const netClass = netValue > 0.001 ? "is-plus" : netValue < -0.001 ? "is-minus" : "is-clear";
      const changedLines = (record.lines || []).filter((line) => Math.abs(Number(line.difference || 0)) > 0.001);
      const isExpanded = expandedInventoryCountId === record.id;
      const visibleLines = isExpanded ? changedLines : changedLines.slice(0, 6);
      const hiddenCount = changedLines.length - visibleLines.length;
      return `
      <article class="inventory-history-row">
        <header>
          <div>
            <strong>${escapeHtml(record.number || "جرد")}</strong>
            <small>${formatDate(record.createdAt)}${record.note ? ` | ${escapeHtml(record.note)}` : ""}</small>
          </div>
          <div class="inventory-history-actions">
            <span>${quantityText(record.changed || 0)} فروقات</span>
            <button class="inventory-history-delete" type="button" data-remove-inventory-count="${record.id}" title="حذف السجل" aria-label="حذف السجل">🗑</button>
          </div>
        </header>
        <div class="inventory-history-lines">
          ${visibleLines.map((line) => `
            <span>${escapeHtml(line.item)}: ${inventoryDifferenceText(Number(line.difference || 0), line.unit)}</span>
          `).join("") || "<span>لا توجد فروقات</span>"}
          ${hiddenCount > 0 ? `<button class="inventory-history-toggle-lines" type="button" data-toggle-inventory-lines="${record.id}">+ ${quantityText(hiddenCount)} فروقات أكثر</button>` : ""}
          ${isExpanded && changedLines.length > 6 ? `<button class="inventory-history-toggle-lines" type="button" data-toggle-inventory-lines="${record.id}">إخفاء</button>` : ""}
        </div>
        <small>قيمة الزيادة الكلية: ${money(record.totalIncreaseValue || 0)} | قيمة النقص الكلية: ${money(record.totalDecreaseValue || 0)} | <strong class="${netClass}">${netLabel}: ${money(Math.abs(netValue))}</strong></small>
      </article>
    `;
    }).join("") + moreRow
    : `<div class="empty-state">${(state.inventoryCounts || []).length ? "لا يوجد جرد ضمن هالفترة." : "لا يوجد سجل جرد بعد."}</div>`;
}

function toggleInventoryCountLines(id) {
  expandedInventoryCountId = expandedInventoryCountId === id ? null : id;
  renderInventoryHistory();
}

// طباعة تقرير جرد كامل: كل الأصناف بالمخزون (مشتريات + بيع) بقيمتها، بالإضافة لآخر جرد فعلي إن وجد
function printInventoryReport() {
  const purchaseItems = purchaseInventoryItems();
  const menuItems = state.menu.filter((item) => isStockTracked(item));
  const allItems = purchaseItems.concat(menuItems)
    .sort((a, b) => `${a.category || ""} ${a.name}`.localeCompare(`${b.category || ""} ${b.name}`, "ar"));

  const totalValue = allItems.reduce((sum, item) => sum + Number(currentStockQty(item) || 0) * Number(item.cost || 0), 0);
  const lowThreshold = Number(state.lowStockThreshold || 0);
  const lowStockCount = allItems.filter((item) => Number(currentStockQty(item) || 0) <= lowThreshold).length;

  const itemRowsHtml = allItems.length
    ? allItems.map((item) => {
      const qty = currentStockQty(item);
      const value = qty * Number(item.cost || 0);
      return `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.category || "-")}</td>
          <td>${quantityWithUnit(qty, itemUnit(item))}</td>
          <td>${money(item.cost || 0)}</td>
          <td>${money(value)}</td>
        </tr>`;
    }).join("")
    : `<tr><td colspan="5">لا توجد أصناف بالمخزون</td></tr>`;

  const lastCount = (state.inventoryCounts || [])[0] || null;
  const lastCountChangedLines = lastCount ? (lastCount.lines || []).filter((line) => Math.abs(Number(line.difference || 0)) > 0.001) : [];
  const lastCountSection = lastCount ? `
    <section class="pro-report-section">
      <h2>📋 آخر جرد فعلي — ${formatDate(lastCount.createdAt)}${lastCount.note ? ` | ${escapeHtml(lastCount.note)}` : ""}</h2>
      <table class="statement-table">
        <thead><tr><th>الصنف</th><th>الفرق</th><th>القيمة</th></tr></thead>
        <tbody>
          ${lastCountChangedLines.length
            ? lastCountChangedLines.map((line) => `
              <tr>
                <td>${escapeHtml(line.item)}</td>
                <td>${inventoryDifferenceText(Number(line.difference || 0), line.unit)}</td>
                <td>${money(line.value || 0)}</td>
              </tr>`).join("")
            : `<tr><td colspan="3">لا توجد فروقات</td></tr>`}
        </tbody>
      </table>
    </section>
  ` : "";

  const host = document.createElement("div");
  host.className = "print-host";
  host.innerHTML = `
    <div class="print-invoice">
      <header class="pro-report-header">
        <h1>${escapeHtml(businessName())}</h1>
        <p class="pro-report-subtitle">📦 تقرير الجرد الكامل</p>
        <p class="pro-report-period">تاريخ الطباعة: ${formatDate(new Date().toISOString())}</p>
      </header>

      <section class="pro-report-section">
        <h2>📊 نظرة سريعة</h2>
        <table class="statement-table">
          <tr><th>عدد الأصناف</th><td>${quantityText(allItems.length)}</td></tr>
          <tr><th>قيمة المخزون الإجمالية</th><td>${money(totalValue)}</td></tr>
          <tr><th>أصناف تحت حد التنبيه</th><td>${quantityText(lowStockCount)}</td></tr>
        </table>
      </section>

      <section class="pro-report-section">
        <h2>📦 كل الأصناف والكميات</h2>
        <table class="statement-table">
          <thead><tr><th>الصنف</th><th>الفئة</th><th>الكمية بالنظام</th><th>سعر وحدة المخزون</th><th>القيمة</th></tr></thead>
          <tbody>${itemRowsHtml}</tbody>
        </table>
        <p class="pro-report-total">قيمة المخزون الإجمالية: <strong>${money(totalValue)}</strong></p>
      </section>

      ${lastCountSection}

      <footer class="pro-report-footer">
        <div class="pro-report-signature">
          <span>توقيع المسؤول عن الجرد: ______________________</span>
          <span>التاريخ: ______________________</span>
        </div>
      </footer>
    </div>
  `;
  document.body.appendChild(host);
  window.print();
  host.remove();
}

async function removeInventoryCount(id) {
  const record = (state.inventoryCounts || []).find((entry) => entry.id === id);
  if (!record) return;
  const confirmed = await appConfirm(`حذف سجل الجرد ${record.number || ""}؟ (لن يتغير المخزون الحالي)`);
  if (!confirmed) return;
  state.inventoryCounts = state.inventoryCounts.filter((entry) => entry.id !== id);
  saveState();
  showToast("تم حذف سجل الجرد.");
  renderInventoryHistory();
}

function downloadExcelBlob(html, filename) {
  const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function exportMenuExcel() {
  if (!state.menu.length) { showToast("لا يوجد أصناف للتصدير."); return; }

  const rows = state.menu.map((item) => `
    <tr>
      ${excelCell(JSON.stringify({ id: item.id, name: item.name, price: item.price, cost: item.cost, operatingCost: item.operatingCost || 0, operatingCostType: item.operatingCostType || "other", category: item.category }), 'data-field="menu-payload" style="display:none;mso-hide:all"')}
      ${excelCell(item.name)}
      ${excelCell(item.category || "")}
      ${excelCell(Number(item.price || 0))}
      ${excelCell(Number(item.cost || 0))}
      ${excelCell(Number(item.operatingCost || 0))}
      ${excelCell(operatingCostLabels[item.operatingCostType] || operatingCostLabels.other)}
      ${excelCell(menuItemRecipeCost(item))}
    </tr>
  `).join("");

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
          <th data-field="menu-payload" style="display:none;mso-hide:all">بيانات</th>
          <th>اسم الصنف</th>
          <th>التصنيف</th>
          <th>سعر البيع</th>
          <th>سعر الشراء</th>
          <th>تشغيل للوحدة</th>
          <th>نوع التشغيل</th>
          <th>التكلفة المعتمدة</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;

  downloadExcelBlob(html, `cafe-pos-menu-${new Date().toISOString().slice(0, 10)}.xls`);
  showToast(`تم تصدير ${state.menu.length} صنف Excel.`);
}

function importMenuExcel(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const doc = new DOMParser().parseFromString(String(reader.result || ""), "text/html");
      const payloadCells = Array.from(doc.querySelectorAll('td[data-field="menu-payload"]'));

      if (!payloadCells.length) {
        showToast("ملف Excel غير صحيح أو ليس من تصدير الأصناف.");
        return;
      }

      let added = 0;
      let updated = 0;

      payloadCells.forEach((cell) => {
        let data;
        try { data = JSON.parse(cell.textContent.trim()); } catch { return; }
        if (!data || !data.name) return;

        const name = String(data.name).trim();
        const price = Math.max(Number(data.price || 0), 0);
        const cost = Math.max(Number(data.cost || 0), 0);
        const operatingCost = Math.max(Number(data.operatingCost || 0), 0);
        const operatingCostType = operatingCostTypes.includes(data.operatingCostType) ? data.operatingCostType : "other";
        const category = String(data.category || "").trim();

        // ابحث بالـ id أولاً ثم بالاسم
        let existing = data.id ? state.menu.find((m) => m.id === data.id) : null;
        if (!existing) existing = state.menu.find((m) => m.name.trim() === name);

        if (existing) {
          existing.name = name;
          existing.price = price;
          existing.cost = cost;
          existing.operatingCost = operatingCost;
          existing.operatingCostType = operatingCostType;
          if (category) existing.category = category;
          existing.updatedAt = new Date().toISOString();
          updated += 1;
        } else {
          state.menu.push({
            id: data.id || uid("menu"),
            name,
            price,
            cost,
            operatingCost,
            operatingCostType,
            category: category || "عام",
            components: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          added += 1;
        }
      });

      auditAction("menu.import", { added, updated, fileName: file.name || "" });
      showToast(`تم استيراد ${added} صنف جديد${updated ? ` وتحديث ${updated}` : ""}.`);
      saveState();
      render();
    } catch (error) {
      console.warn("Could not import menu Excel", error);
      showToast("حدث خطأ أثناء قراءة الملف.");
    } finally {
      els.menuExcelImportInput.value = "";
    }
  };
  reader.readAsText(file);
}

function renderSettingsMenu() {
  const range = selectedMenuStatsRange();
  const query = els.settingsMenuSearchInput.value.trim().toLowerCase();
  const items = state.menu.filter((item) => menuMatchesSearch(item, query));
  const totals = menuProfitTotals(range, items);
  els.menuStatsRangeText.textContent = range.minDate || range.maxDate
    ? `الفترة: ${range.minDate || "البداية"} - ${range.maxDate || "اليوم"}`
    : "كل الفترات";

  els.menuStatsSummary.innerHTML = `
    <article>
      <span>${query ? "الأصناف المطابقة" : "عدد الأصناف"}</span>
      <strong>${quantityText(items.length)}</strong>
    </article>
    <article>
      <span>سعر البيع</span>
      <strong>${escapeHtml(salePriceSummary(items))}</strong>
    </article>
    <article>
      <span>إجمالي الكمية المباعة</span>
      <strong>${quantityText(totals.qty)}</strong>
    </article>
    <article>
      <span>إجمالي مبيعات الأصناف</span>
      <strong>${money(totals.sales)}</strong>
    </article>
    <article>
      <span>إجمالي ربح الأصناف</span>
      <strong>${money(totals.profit)}</strong>
    </article>
  `;

  els.settingsMenuList.innerHTML = items.length ? items.map((item) => {
    const profitStats = menuItemProfitStats(item.id, range);
    const components = menuItemComponents(item);
    const costLabel = components.length ? "تكلفة المكونات" : "شراء";
    const baseCostValue = menuItemBaseCost(item);
    const totalCostValue = menuItemRecipeCost(item);
    const operatingText = operatingCostText(item);
    const stock = menuItemDisplayStock(item);
    const lastPurchase = menuItemLastPurchaseInfo(item);
    return `
      <article class="settings-row ${editingMenuItemId === item.id ? "is-editing" : ""} ${menuItemIsSaleVisible(item) ? "" : "is-sale-hidden"}" data-menu-id="${item.id}" draggable="true">
        <div>
          <strong><span class="settings-drag-handle" title="اسحب لإعادة الترتيب" aria-hidden="true">⠿</span> ${escapeHtml(item.name)} ${menuItemIsSaleVisible(item) ? "" : '<span class="settings-sale-hidden-badge">مخفي من البيع</span>'}</strong>
          <small>${escapeHtml(item.category)} | بيع: ${money(item.price)} | ${costLabel}: ${item.cost === undefined && !components.length ? "غير محدد" : money(baseCostValue)}${operatingText ? ` | تشغيل ${escapeHtml(operatingText)}` : ""} | التكلفة المعتمدة: ${money(totalCostValue)} | المخزون: ${escapeHtml(stock.text)}</small>
          <div class="settings-last-purchase ${lastPurchase ? "" : "is-empty"}">
            <span>آخر سعر شراء للوحدة</span>
            <strong>${lastPurchase ? `${money(lastPurchase.unitCost)}${lastPurchase.unit ? ` / ${escapeHtml(lastPurchase.unit)}` : ""}` : "غير مسجل"}</strong>
            <small>${lastPurchase?.source === "manual" ? "مدخل يدويًا" : lastPurchase?.createdAt ? formatDate(lastPurchase.createdAt).slice(0, 10) : "اربط الصنف عند تسجيل فاتورة الشراء"}</small>
          </div>
          ${menuComponentsSummary(item)}
          <div class="settings-profit-row">
            <span>إجمالي الكمية المباعة: ${quantityText(profitStats.qty)}</span>
            <span>مبيعات الصنف: ${money(profitStats.sales)}</span>
            <span>ربح الصنف: ${money(profitStats.profit)}</span>
          </div>
        </div>
        <div class="settings-row-actions">
          <button class="settings-fav-button ${item.favorite ? "is-fav" : ""}" type="button" data-toggle-favorite="${item.id}" title="${item.favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}" aria-label="مفضلة">${item.favorite ? "⭐" : "☆"}</button>
          <button class="settings-move-button" type="button" data-move-menu-up="${item.id}" title="تحريك لأعلى" aria-label="تحريك لأعلى">↑</button>
          <button class="settings-move-button" type="button" data-move-menu-down="${item.id}" title="تحريك لأسفل" aria-label="تحريك لأسفل">↓</button>
          <button class="settings-visibility-button ${menuItemIsSaleVisible(item) ? "" : "is-hidden"}" type="button" data-toggle-menu-visibility="${item.id}">${menuItemIsSaleVisible(item) ? "إخفاء من البيع" : "إظهار في البيع"}</button>
          <button class="settings-edit-button" type="button" data-edit-menu="${item.id}">تعديل</button>
          <button class="settings-delete-button" type="button" data-remove-menu="${item.id}">حذف</button>
        </div>
      </article>
    `;
  }).join("") : '<div class="empty-state">لا توجد أصناف مطابقة للبحث.</div>';
  renderCombosSettings();
}

function menuItemLastPurchaseInfo(item) {
  if (!item) return null;
  const itemName = String(item.name || "").trim().toLowerCase();
  let latest = null;
  (state.purchases || []).forEach((purchase) => {
    purchaseLines(purchase).forEach((line) => {
      const linkedById = line.menuItemId && line.menuItemId === item.id;
      const legacyName = String(line.linkedItemName || line.item || "").trim().toLowerCase();
      const linkedByName = !line.menuItemId && itemName && legacyName === itemName;
      if (!linkedById && !linkedByName) return;
      const unitCost = Number(purchaseLineUnitCost(line) || 0);
      if (unitCost <= 0) return;
      const createdAt = purchase.createdAt || "";
      if (latest && new Date(latest.createdAt || 0) > new Date(createdAt || 0)) return;
      latest = {
        unitCost,
        unit: purchaseLineStockUnit(line) || itemUnit(item),
        createdAt
      };
    });
  });
  if (latest) return latest;
  const manualUnitCost = Number(item.manualLastUnitCost || 0);
  return manualUnitCost > 0 ? {
    unitCost: manualUnitCost,
    unit: itemUnit(item),
    createdAt: item.updatedAt || item.createdAt || "",
    source: "manual"
  } : null;
}

// ─── إدارة العروض / الكومبو ─────────────────────────────────────
function renderCombosSettings() {
  const sel = document.getElementById("comboItemSelect");
  if (sel) {
    sel.innerHTML = ['<option value="">اختر صنف</option>']
      .concat((state.menu || []).map((m) => `<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)} - ${money(m.price)}</option>`))
      .join("");
  }
  renderComboDraft();
  renderComboList();
}

function renderComboDraft() {
  const host = document.getElementById("comboDraftList");
  if (!host) return;
  host.innerHTML = comboDraft.length
    ? comboDraft.map((ci) => {
      const item = (state.menu || []).find((m) => m.id === ci.menuItemId);
      return `
        <article class="combo-draft-row">
          <span>${escapeHtml(item ? item.name : "صنف محذوف")}${Number(ci.qty) > 1 ? ` ×${ci.qty}` : ""}</span>
          <button type="button" data-remove-combo-draft="${escapeAttr(ci.menuItemId)}">حذف</button>
        </article>`;
    }).join("")
    : '<div class="empty-state">أضف أصناف للعرض.</div>';
}

function addComboDraftItem() {
  const sel = document.getElementById("comboItemSelect");
  const qtyInput = document.getElementById("comboItemQtyInput");
  const itemId = sel ? sel.value : "";
  const qty = Math.max(Math.round(Number(qtyInput ? qtyInput.value : 1)) || 1, 1);
  if (!itemId) { showToast("اختر صنف للعرض."); return; }
  const existing = comboDraft.find((ci) => ci.menuItemId === itemId);
  if (existing) existing.qty += qty;
  else comboDraft.push({ menuItemId: itemId, qty });
  if (sel) sel.value = "";
  if (qtyInput) qtyInput.value = "1";
  renderComboDraft();
}

function saveCombo() {
  const nameInput = document.getElementById("comboNameInput");
  const priceInput = document.getElementById("comboPriceInput");
  const name = (nameInput ? nameInput.value : "").trim();
  const price = Math.max(Number(priceInput ? priceInput.value : 0), 0);
  if (!name) { showToast("اكتب اسم العرض."); return; }
  if (price <= 0) { showToast("اكتب سعر العرض."); return; }
  if (!comboDraft.length) { showToast("أضف صنف واحد على الأقل للعرض."); return; }
  state.combos = Array.isArray(state.combos) ? state.combos : [];
  state.combos.push({ id: uid("combo"), name, price, items: comboDraft.map((ci) => ({ menuItemId: ci.menuItemId, qty: ci.qty })) });
  comboDraft = [];
  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = "";
  if (typeof auditAction === "function") auditAction("combo.create", { name, price });
  saveState();
  render();
  showToast(`تم حفظ العرض "${name}". 🎁`);
}

async function deleteCombo(comboId) {
  const combo = (state.combos || []).find((c) => c.id === comboId);
  if (!combo) return;
  const confirmed = await appConfirm(`حذف العرض "${combo.name}"؟`);
  if (!confirmed) return;
  state.combos = (state.combos || []).filter((c) => c.id !== comboId);
  if (typeof auditAction === "function") auditAction("combo.delete", { name: combo.name });
  saveState();
  render();
  showToast("تم حذف العرض.");
}

function renderComboList() {
  const host = document.getElementById("comboList");
  if (!host) return;
  const combos = state.combos || [];
  host.innerHTML = combos.length
    ? combos.map((combo) => {
      const itemsText = (combo.items || []).map((ci) => {
        const it = (state.menu || []).find((m) => m.id === ci.menuItemId);
        return it ? `${escapeHtml(it.name)}${Number(ci.qty) > 1 ? ` ×${ci.qty}` : ""}` : "";
      }).filter(Boolean).join(" + ");
      return `
        <article class="settings-row combo-row">
          <div>
            <strong>🎁 ${escapeHtml(combo.name)} — ${money(combo.price)}</strong>
            <small>${itemsText}</small>
          </div>
          <div class="settings-row-actions">
            <button class="settings-delete-button" type="button" data-remove-combo="${escapeAttr(combo.id)}">حذف</button>
          </div>
        </article>`;
    }).join("")
    : '<div class="empty-state">لا توجد عروض بعد.</div>';
}

// تحريك صنف لأعلى/أسفل ضمن القائمة المعروضة (يحترم البحث الحالي)
function moveMenuItem(itemId, direction) {
  const query = els.settingsMenuSearchInput.value.trim().toLowerCase();
  const visible = state.menu.filter((item) => menuMatchesSearch(item, query));
  const vIdx = visible.findIndex((item) => item.id === itemId);
  if (vIdx === -1) return;
  const neighbor = direction === "up" ? visible[vIdx - 1] : visible[vIdx + 1];
  if (!neighbor) return; // أول أو آخر عنصر
  const aIdx = state.menu.findIndex((item) => item.id === itemId);
  const bIdx = state.menu.findIndex((item) => item.id === neighbor.id);
  if (aIdx === -1 || bIdx === -1) return;
  const temp = state.menu[aIdx];
  state.menu[aIdx] = state.menu[bIdx];
  state.menu[bIdx] = temp;
  saveState();
  renderSettingsMenu();
  renderMenu();
}

// تبديل حالة "مفضّل" لصنف (يظهر في تصنيف ⭐ المفضلة بشاشة البيع)
function toggleMenuFavorite(itemId) {
  const item = findMenuItem(itemId);
  if (!item) return;
  item.favorite = !item.favorite;
  saveState();
  renderSettingsMenu();
  renderMenu();
  showToast(item.favorite ? "تمت الإضافة للمفضلة ⭐" : "أُزيل من المفضلة.");
}

function toggleMenuSaleVisibility(itemId) {
  const item = findMenuItem(itemId);
  if (!item) return;
  item.saleVisible = !menuItemIsSaleVisible(item);
  item.updatedAt = new Date().toISOString();
  if (!item.saleVisible) item.favorite = false;
  auditAction("menu.visibility", { itemId: item.id, name: item.name, visible: item.saleVisible });
  saveState(true);
  renderSettingsMenu();
  renderMenu();
  showToast(item.saleVisible ? `تم إظهار ${item.name} في صفحة البيع.` : `تم إخفاء ${item.name} من صفحة البيع بدون حذفه.`);
}

// إفلات صنف مسحوب قبل صنف الهدف (السحب بالماوس على الكمبيوتر)
function dropMenuItem(draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return;
  const from = state.menu.findIndex((item) => item.id === draggedId);
  if (from === -1) return;
  const [moved] = state.menu.splice(from, 1);
  const to = state.menu.findIndex((item) => item.id === targetId);
  if (to === -1) { state.menu.splice(from, 0, moved); return; }
  state.menu.splice(to, 0, moved);
  saveState();
  renderSettingsMenu();
  renderMenu();
}

function menuComponentsSummary(item) {
  const components = menuItemComponents(item);
  const operatingTextValue = operatingCostText(item);
  if (!components.length && !operatingTextValue) return "";
  const componentChips = components.map((component) => {
    const stockItem = inventoryItemById(component.itemId);
    const sourceName = stockItem?.name || component.purchaseItemName || "مكون غير موجود";
    return `<span>${escapeHtml(sourceName)} × ${quantityWithUnit(component.qty, component.unit || itemUnit(stockItem))}</span>`;
  });
  if (operatingTextValue) componentChips.push(`<span class="menu-operating-cost">تشغيل: ${escapeHtml(operatingTextValue)}</span>`);
  return `
    <div class="menu-components-summary">
      ${componentChips.join("")}
    </div>
  `;
}
