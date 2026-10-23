// ═══ دفتر المقهى ═══ 09-actions.js — التسديد، الطباعة، نسخ احتياطي، حفظ المشتريات والأصناف
// (مقسوم من app.js — الأسطر 4540-4987)

function recordSettlement(event) {
  event.preventDefault();
  const customer = getCustomer(selectedCustomerId);
  const amount = Math.max(Number(els.settlementAmountInput.value || 0), 0);
  const method = paymentMethods.includes(els.settlementMethodInput.value) ? els.settlementMethodInput.value : getLastPaymentMethod();
  const hasCredit = customer && Number(customer.balance || 0) < -0.001;
  const offsetMode = Boolean(hasCredit && settlementOffsetMode);
  const payoutMode = Boolean(hasCredit && !offsetMode);
  const debtMode = settlementDebtMode && !hasCredit;
  const discount = !payoutMode && !debtMode && !offsetMode ? Math.max(Number(els.settlementDiscountInput.value || 0), 0) : 0;
  const settlementValue = amount + discount;

  if (!customer) {
    showToast("اختر عميل أولاً.");
    return;
  }
  if (debtMode && !requireManagerPermission("customer.manualDebt", "إضافة دين يدوي")) return;
  if (offsetMode && !requireManagerPermission("customer.manualDebt", "تسجيل مقاصة للعميل")) return;
  if (payoutMode && !requireManagerPermission("customer.payout", "دفع رصيد للعميل")) return;
  if ((debtMode || payoutMode || offsetMode) && amount <= 0) {
    showToast(debtMode ? "اكتب مبلغ الدين." : payoutMode ? "اكتب مبلغ الدفع للعميل." : "اكتب مبلغ الدفعة.");
    return;
  }
  if (!debtMode && !payoutMode && settlementValue <= 0) {
    showToast("اكتب مبلغ الدفعة أو الخصم.");
    return;
  }
  if (payoutMode && amount > Math.abs(Number(customer.balance || 0)) + 0.001) {
    showToast("المبلغ أكبر من رصيد العميل.");
    return;
  }
  if (offsetMode && amount > Math.abs(Number(customer.balance || 0)) + 0.001) {
    showToast("قيمة المشاريب أكبر من رصيد العميل عند الكفي.");
    return;
  }
  if (!debtMode && !payoutMode && discount > 0 && settlementValue > Number(customer.balance || 0) + 0.001) {
    showToast("المبلغ مع الخصم أكبر من دين العميل.");
    return;
  }
  if (!guardClosedPeriod(new Date().toISOString(), debtMode ? "تسجيل دين يدوي" : offsetMode ? "مقاصة مشاريب" : payoutMode ? "دفع رصيد للعميل" : "تسديد دفعة")) return;

  customer.updatedAt = new Date().toISOString();

  if (debtMode) {
    const note = els.settlementNoteInput.value.trim();
    customer.balance += amount;
    customer.totalBilled += amount;
    const invoice = {
      id: uid("debt"),
      number: nextInvoiceNumber(),
      type: "debt",
      customerId: customer.id,
      customerName: customer.name,
      tableLabel: "-",
      items: [],
      subtotal: amount,
      discount: 0,
      total: amount,
      paid: 0,
      delta: amount,
      payments: { cash: 0, bank: 0, wallet: 0 },
      status: "debt",
      note: note || "دين مضاف يدوياً",
      createdAt: new Date().toISOString()
    };
    state.invoices.unshift(invoice);
    lastClosedInvoice = invoice;
    els.settlementAmountInput.value = "";
    els.settlementNoteInput.value = "";
    showToast(`تم تسجيل دين ${money(amount)} على ${customer.name}.`);
    render();
    return;
  }

  if (offsetMode) {
    const note = els.settlementNoteInput.value.trim() || "مشاريب خُصمت من رصيد العميل";
    customer.balance += amount;
    customer.totalBilled += amount;
    const invoice = {
      id: uid("offset"),
      number: nextInvoiceNumber(),
      type: "sale",
      source: "customer_offset",
      customerId: customer.id,
      customerName: customer.name,
      tableLabel: "-",
      items: [{ id: uid("custom-item"), name: note, qty: 1, price: amount, cost: 0, temporary: true, stockUsage: [] }],
      subtotal: amount,
      discount: 0,
      total: amount,
      paid: 0,
      delta: amount,
      payments: { cash: 0, bank: 0, wallet: 0 },
      status: "debt",
      note,
      createdAt: new Date().toISOString()
    };
    state.invoices.unshift(invoice);
    lastClosedInvoice = invoice;
    settlementOffsetMode = false;
    els.settlementAmountInput.value = "";
    els.settlementNoteInput.value = "";
    showToast(`تم خصم ${money(amount)} من رصيد ${customer.name} بدون حركة صندوق.`);
    render();
    return;
  }

  setLastPaymentMethod(method);
  if (payoutMode) {
    customer.balance += amount;
    customer.totalPaid = Math.max(0, Number(customer.totalPaid || 0) - amount);
  } else {
    customer.balance -= settlementValue;
    customer.totalPaid += amount;
  }
  const invoice = {
    id: uid(payoutMode ? "payout" : "payment"),
    number: nextInvoiceNumber(),
    type: payoutMode ? "payout" : "payment",
    customerId: customer.id,
    customerName: customer.name,
    tableLabel: "-",
    items: [],
    subtotal: 0,
    discount: payoutMode ? 0 : discount,
    total: 0,
    paid: amount,
    delta: payoutMode ? amount : -settlementValue,
    payments: { cash: method === "cash" ? amount : 0, bank: method === "bank" ? amount : 0, wallet: method === "wallet" ? amount : 0 },
    status: payoutMode ? "payout" : "payment",
    note: payoutMode ? `دفع للعميل عبر ${paymentLabels[method]}` : `تسديد عبر ${paymentLabels[method]}`,
    createdAt: new Date().toISOString()
  };
  state.invoices.unshift(invoice);
  lastClosedInvoice = invoice;
  els.settlementAmountInput.value = "";
  els.settlementDiscountInput.value = "";
  els.settlementMethodInput.value = getLastPaymentMethod();
  showToast(payoutMode ? "تم تسجيل دفع الرصيد للعميل." : discount > 0 ? `تم تسجيل الدفعة مع خصم ${money(discount)}.` : "تم تسجيل الدفعة على الحساب.");
  render();
}

function recordPosCustomerPayment(customerId, amountValue, methodValue) {
  const customer = getCustomer(customerId);
  if (!customer) {
    showToast("العميل غير موجود.");
    return;
  }

  const amount = Math.max(Number(amountValue || 0), 0);
  const method = paymentMethods.includes(methodValue) ? methodValue : getLastPaymentMethod();
  const currentDebt = Number(customer.balance || 0);
  if (currentDebt <= 0.001) {
    showToast("لا يوجد دين قديم على هذا العميل.");
    return;
  }
  if (amount <= 0) {
    showToast("اكتب مبلغ الدفعة.");
    return;
  }
  if (amount > currentDebt + 0.001) {
    showToast("مبلغ الدفعة أكبر من الدين القديم.");
    return;
  }
  if (!guardClosedPeriod(new Date().toISOString(), "تسجيل دفعة من صفحة البيع")) return;

  setLastPaymentMethod(method);
  customer.balance = Number(customer.balance || 0) - amount;
  customer.totalPaid = Number(customer.totalPaid || 0) + amount;
  customer.updatedAt = new Date().toISOString();

  const invoice = {
    id: uid("payment"),
    number: nextInvoiceNumber(),
    type: "payment",
    customerId: customer.id,
    customerName: customer.name,
    tableLabel: typeof getTableLabel === "function" ? getTableLabel() : "-",
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    paid: amount,
    delta: -amount,
    payments: {
      cash: method === "cash" ? amount : 0,
      bank: method === "bank" ? amount : 0,
      wallet: method === "wallet" ? amount : 0
    },
    status: "payment",
    note: `دفعة من صفحة البيع عبر ${paymentLabels[method] || method}`,
    createdAt: new Date().toISOString()
  };
  state.invoices.unshift(invoice);
  lastClosedInvoice = invoice;
  if (typeof auditAction === "function") auditAction("customer.payment.pos", {
    customerId: customer.id,
    customerName: customer.name,
    amount,
    method
  });
  showToast(`تم تسجيل دفعة ${money(amount)} على حساب ${customer.name}.`);
  render();
}

function printInvoice(invoice) {
  if (!invoice) {
    showToast("الفاتورة غير موجودة.");
    return;
  }

  const host = document.createElement("div");
  host.className = "print-host";
  const node = els.printTemplate.content.cloneNode(true);
  const titleEl = node.querySelector("h1");
  if (titleEl) titleEl.textContent = state.businessName || "دفتر المقهى";

  const cancelled = typeof invoiceIsCancelled === "function" && invoiceIsCancelled(invoice);
  const original = cancelled && typeof cancelledInvoiceOriginal === "function" ? cancelledInvoiceOriginal(invoice) : null;
  const customer = getCustomer(invoice.customerId);
  const total = Number(original?.total ?? invoice.total ?? 0);
  const subtotal = Number(original?.subtotal ?? invoice.subtotal ?? total);
  const discount = Number(original?.discount ?? invoice.discount ?? 0);
  const paid = Number(original?.paid ?? invoice.paid ?? 0);
  const changeReturned = Number(original?.changeReturned ?? invoice.changeReturned ?? 0);
  const received = Number(original?.received ?? invoice.received ?? (paid + changeReturned));
  const delta = Number(original?.delta ?? invoice.delta ?? (total - paid));
  const paymentText = cancelled ? "ملغاة" : invoicePaymentText(invoice);

  const metaRows = [
    ["رقم الفاتورة", invoice.number || "-"],
    ["التاريخ", formatDate(invoice.createdAt)],
    ["الطاولة", invoice.tableLabel || "-"],
    ["العميل", invoice.customerName || "زبون نقدي"],
    customer?.phone ? ["الجوال", customer.phone] : null,
    ["الدفع", paymentText]
  ].filter(Boolean);

  node.querySelector(".print-meta").innerHTML = metaRows
    .map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`)
    .join("");

  node.querySelector(".print-lines").innerHTML = invoice.items?.length
    ? invoice.items.map((item) => `
      <p>
        <span class="pl-name">${escapeHtml(item.name)} <small>×${item.qty} @ ${money(item.price)}</small></span>
        <span class="pl-amt">${money(Number(item.qty || 0) * Number(item.price || 0))}</span>
      </p>
    `).join("")
    : `<p><span class="pl-name">${escapeHtml(invoice.note || (invoice.type === "debt" ? "دين بدون أصناف" : "حركة حساب"))}</span><span class="pl-amt">${money(total || paid)}</span></p>`;

  node.querySelector(".print-total").innerHTML = `
    ${cancelled ? `<p class="print-cancelled">الفاتورة ملغاة${invoice.cancelledReason ? `: ${escapeHtml(invoice.cancelledReason)}` : ""}</p>` : ""}
    ${subtotal > 0 && Math.abs(subtotal - total) > 0.001 ? `<p><span>المجموع قبل الخصم</span><strong>${money(subtotal)}</strong></p>` : ""}
    ${discount > 0 ? `<p><span>الخصم</span><strong>${money(discount)}</strong></p>` : ""}
    <p><span>${cancelled ? "أصل الصافي" : "الصافي"}</span><strong>${money(total)}</strong></p>
    ${received > paid && changeReturned > 0 ? `<p><span>المستلم</span><strong>${money(received)}</strong></p><p><span>الراجع للعميل</span><strong>${money(changeReturned)}</strong></p>` : ""}
    <p><span>${cancelled ? "أصل المدفوع" : "المدفوع"}</span><strong>${money(paid)}</strong></p>
    ${!cancelled && delta > 0.001 ? `<p><span>المتبقي دين</span><strong>${money(delta)}</strong></p>` : ""}
    ${!cancelled && delta < -0.001 ? `<p><span>رصيد للعميل</span><strong>${money(Math.abs(delta))}</strong></p>` : ""}
    <p><span>الحالة</span><strong>${statusText(invoice.status)}</strong></p>
  `;

  host.appendChild(node);
  const invoiceWrap = host.querySelector(".print-invoice");
  if (invoiceWrap) {
    invoiceWrap.classList.toggle("is-cancelled-print", cancelled);
    const footer = document.createElement("p");
    footer.className = "print-footer";
    footer.textContent = cancelled ? "نسخة توثيقية لفاتورة ملغاة" : "شكراً لزيارتكم";
    invoiceWrap.appendChild(footer);
  }
  document.body.appendChild(host);
  window.print();
  host.remove();
}

function printLastInvoice() {
  if (!lastClosedInvoice) {
    showToast("لا توجد فاتورة مطبوعة بعد.");
    return;
  }

  printInvoice(lastClosedInvoice);
}

function printInvoiceById(invoiceId) {
  printInvoice(state.invoices.find((invoice) => invoice.id === invoiceId));
}

async function backupPayload() {
  saveState(true);
  const workspacesBundle = typeof workspaceBackupBundle === "function" ? await workspaceBackupBundle() : null;
  return JSON.stringify({
    ...state,
    workspacesBundle,
    exportedAt: new Date().toISOString(),
    backupNote: "نسخة احتياطية كاملة من دفتر المقهى"
  }, null, 2);
}

function backupFileName() {
  const name = (typeof businessName === "function" ? businessName() : "cafe-pos").replace(/[\\/:*?"<>|]/g, "").trim() || "cafe-pos";
  const now = new Date();
  const localDate = new Date(Date.now() - now.getTimezoneOffset() * 60000);
  const datePart = localDate.toISOString().slice(0, 10);
  const suffix = now.getHours() >= 12 ? "PM" : "AM";
  const hour = String(now.getHours() % 12 || 12).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${datePart}-${hour}-${minute}-${second}-${suffix}`;
  return `${name}-backup-${timestamp}.json`;
}

async function saveBackupToLocalServer(payload, fileName) {
  if (!location.protocol.startsWith("http")) return false;
  try {
    const response = await fetch("./api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, payload })
    });
    if (!response.ok) return false;
    const result = await response.json();
    return Boolean(result && result.ok);
  } catch (error) {
    return false;
  }
}

function downloadBackupFallback(payload, fileName) {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

async function exportData() {
  const payload = await backupPayload();
  const fileName = backupFileName();
  const serverSaved = await saveBackupToLocalServer(payload, fileName);
  if (serverSaved) markBackupDone();

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: "ملف نسخة احتياطية JSON",
          accept: { "application/json": [".json"] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      showToast(serverSaved ? "تم حفظ النسخة في مجلد backups وفي المكان الذي اخترته." : "تم حفظ النسخة الاحتياطية في المكان الذي اخترته.");
      markBackupDone();
      renderBackupCenter();
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.warn("save picker failed", error);
      showToast("تعذر فتح اختيار المكان، تم تنزيل النسخة بدل ذلك.");
    }
  } else {
    showToast("متصفحك لا يدعم اختيار مكان الحفظ، تم تنزيل النسخة بدل ذلك.");
  }

  downloadBackupFallback(payload, fileName);
  markBackupDone();
  renderBackupCenter();
}

async function saveInternalBackupNow() {
  auditAction("backup.internal", {
    savedInsideProgram: false,
    savedInBackupsFolder: false
  });
  const payload = await backupPayload();
  const fileName = `internal-${backupFileName()}`;
  const localSaved = saveLocalBackup(payload, { source: "manual", forceNew: true });
  let durableSaved = false;

  try {
    await writeDurableBackup(backupSnapshot(payload, { source: "manual" }));
    durableSaved = true;
  } catch (error) {
    console.warn("manual durable backup failed", error);
  }

  const serverSaved = await saveBackupToLocalServer(payload, fileName);
  const internalSaved = localSaved || durableSaved;
  if (!internalSaved && !serverSaved) {
    showToast("تعذر حفظ النسخة الداخلية. جرّب حفظ نسخة احتياطية عادية.");
    return;
  }

  markBackupDone();
  state.auditLog[0] = {
    ...state.auditLog[0],
    details: sanitizedAuditDetails({
      fileName: serverSaved ? fileName : "",
      savedInsideProgram: internalSaved,
      savedInBrowserBackup: localSaved,
      savedInStrongBackup: durableSaved,
      savedInBackupsFolder: serverSaved
    })
  };
  saveState(true);

  const finalPayload = await backupPayload();
  if (finalPayload !== payload) {
    try {
      await writeDurableBackup(backupSnapshot(finalPayload, { source: "manual" }));
    } catch (error) {
      console.warn("manual durable backup refresh failed", error);
    }
    saveLocalBackup(finalPayload, { source: "manual" });
    if (serverSaved) await saveBackupToLocalServer(finalPayload, fileName);
  }

  renderBackupCenter();
  showToast(serverSaved ? "تم حفظ نسخة داخلية كاملة وملف داخل مجلد backups." : "تم حفظ نسخة داخلية كاملة داخل البرنامج.");
}

// ─── نسخة احتياطية تلقائية يومية ────────────────────────────────
function hasAnyData() {
  return Boolean(
    (state.invoices && state.invoices.length) ||
    (state.customers && state.customers.length) ||
    (state.purchases && state.purchases.length) ||
    (state.workers && state.workers.length) ||
    (state.workerConsumptions && state.workerConsumptions.length)
  );
}

let autoBackupScheduleTimer = null;

function currentTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function autoBackupTimeValue() {
  return normalizeAutoBackupTimeValue(state.autoBackupTime);
}

function autoBackupDueNow(date = new Date()) {
  const scheduled = autoBackupTimeValue();
  return !scheduled || currentTimeInputValue(date) >= scheduled;
}

function startAutoBackupSchedule() {
  if (autoBackupScheduleTimer) clearInterval(autoBackupScheduleTimer);
  autoBackupScheduleTimer = setInterval(() => {
    try {
      maybeAutoDailyBackup();
    } catch (error) {
      console.warn("auto backup schedule failed", error);
    }
  }, 60 * 1000);
}

async function maybeAutoDailyBackup() {
  try {
    if (state.autoBackup === false) return;
    const today = todayDateInputValue();
    if (state.lastAutoBackup === today) return;
    if (!autoBackupDueNow()) { renderAutoBackupSetting(); return; }
    if (!hasAnyData()) { renderAutoBackupSetting(); return; }

    const createdAt = new Date();
    state.lastAutoBackup = today;
    state.lastAutoBackupAt = createdAt.toISOString();
    const payload = await backupPayload();
    const name = (typeof businessName === "function" ? businessName() : "cafe-pos").replace(/[\\/:*?"<>|]/g, "").trim() || "cafe-pos";
    const serverSaved = await saveBackupToLocalServer(payload, `${name}-auto-${today}.json`);
    const localSaved = saveLocalBackup(payload, { source: "daily", forceNew: true });
    let durableSaved = false;
    try {
      await writeDurableBackup(backupSnapshot(payload, { source: "daily" }));
      durableSaved = true;
    } catch (error) {
      console.warn("auto durable backup failed", error);
    }
    if (!serverSaved && !localSaved && !durableSaved) downloadBackupFallback(payload, `${name}-auto-${today}.json`);
    saveState(true);
    renderBackupCenter();
    renderAutoBackupSetting();
    showToast(serverSaved ? "تم حفظ نسخة تلقائية كاملة في مجلد backups." : "تم حفظ نسخة تلقائية داخلية كاملة.");
  } catch (error) {
    console.warn("auto backup failed", error);
  }
}

function renderAutoBackupSetting() {
  const cb = document.getElementById("autoBackupToggle");
  const status = document.getElementById("autoBackupStatus");
  const timeInput = document.getElementById("autoBackupTimeInput");
  const scheduled = autoBackupTimeValue();
  if (cb) cb.checked = state.autoBackup !== false;
  if (timeInput && document.activeElement !== timeInput) {
    timeInput.value = scheduled;
    timeInput.disabled = state.autoBackup === false;
  }
  if (status) {
    if (state.autoBackup === false) {
      status.textContent = "النسخ التلقائي متوقف.";
    } else if (state.lastAutoBackup === todayDateInputValue()) {
      const at = state.lastAutoBackupAt ? ` — ${currentTimeInputValue(new Date(state.lastAutoBackupAt))}` : "";
      status.textContent = `آخر نسخة تلقائية: اليوم${at}`;
    } else if (scheduled) {
      status.textContent = autoBackupDueNow() ? `جاهزة اليوم من الساعة ${scheduled}` : `النسخة القادمة الساعة ${scheduled}`;
    } else {
      status.textContent = state.lastAutoBackup ? `آخر نسخة تلقائية: ${state.lastAutoBackup}` : "ما تم أخذ نسخة تلقائية بعد.";
    }
  }
}

// ─── النسخ الاحتياطي التلقائي لمجلد حقيقي (File System Access) ──────
function folderBackupSupported() {
  return typeof window.showDirectoryPicker === "function";
}

async function ensureFolderPermission(handle, interactive) {
  if (!handle || typeof handle.queryPermission !== "function") return false;
  const opts = { mode: "readwrite" };
  let perm = await handle.queryPermission(opts);
  if (perm === "granted") return true;
  if (interactive && typeof handle.requestPermission === "function") {
    perm = await handle.requestPermission(opts);
    return perm === "granted";
  }
  return false;
}

async function chooseBackupFolder() {
  if (!folderBackupSupported()) {
    showToast("متصفحك ما يدعم الحفظ التلقائي لمجلد — استخدم \"حفظ نسخة\" أو إرسال واتساب.");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "cafe-pos-backup" });
    await saveBackupDirHandle(handle);
    showToast("تم اختيار مجلد النسخ التلقائي. 📁");
    await writeBackupToFolder(true);
    renderFolderBackupSetting();
  } catch (error) {
    if (error && error.name === "AbortError") return;
    console.warn("chooseBackupFolder failed", error);
    showToast("تعذّر اختيار المجلد.");
  }
}

async function disableFolderBackup() {
  await clearBackupDirHandle();
  showToast("تم إيقاف الحفظ التلقائي للمجلد.");
  renderFolderBackupSetting();
}

async function writeBackupToFolder(interactive) {
  const handle = await loadBackupDirHandle();
  if (!handle) { if (interactive) showToast("اختر مجلد أولاً."); return false; }
  const ok = await ensureFolderPermission(handle, interactive);
  if (!ok) { if (interactive) showToast("لازم تسمح للبرنامج بالكتابة في المجلد."); return false; }
  try {
    const name = (typeof businessName === "function" ? businessName() : "cafe-pos").replace(/[\\/:*?"<>|]/g, "").trim() || "cafe-pos";
    const today = todayDateInputValue();
    const fileHandle = await handle.getFileHandle(`${name}-auto-${today}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(await backupPayload());
    await writable.close();
    state.lastFolderBackup = today;
    if (typeof markBackupDone === "function") markBackupDone();
    saveState(true);
    if (interactive) showToast("تم حفظ النسخة في المجلد. ✓");
    renderFolderBackupSetting();
    return true;
  } catch (error) {
    console.warn("writeBackupToFolder failed", error);
    if (interactive) showToast("تعذّر الكتابة في المجلد. تأكد إنه موجود وفيه صلاحية.");
    return false;
  }
}

async function maybeDailyFolderBackup() {
  if (!folderBackupSupported()) return;
  const handle = await loadBackupDirHandle();
  if (!handle) return;
  if (state.lastFolderBackup === todayDateInputValue()) return;
  if (!hasAnyData()) return;
  const ok = await ensureFolderPermission(handle, false);
  if (!ok) { renderFolderBackupSetting(); return; }
  await writeBackupToFolder(false);
}

async function renderFolderBackupSetting() {
  const status = document.getElementById("folderBackupStatus");
  const chooseBtn = document.getElementById("folderBackupChooseButton");
  const disableBtn = document.getElementById("folderBackupDisableButton");
  if (!status) return;
  if (!folderBackupSupported()) {
    status.textContent = "غير مدعوم بهذا المتصفح — استخدم \"حفظ نسخة\" أو واتساب.";
    if (chooseBtn) chooseBtn.disabled = true;
    if (disableBtn) disableBtn.hidden = true;
    return;
  }
  const handle = await loadBackupDirHandle();
  if (!handle) {
    status.textContent = "غير مفعّل — اختر مجلد (يفضّل مجلد Google Drive) ليُحفظ تلقائيًا كل يوم.";
    if (chooseBtn) chooseBtn.textContent = "📁 اختر مجلد النسخ التلقائي";
    if (disableBtn) disableBtn.hidden = true;
    return;
  }
  const granted = await ensureFolderPermission(handle, false);
  const folderName = handle.name || "المجلد المختار";
  if (granted) {
    status.textContent = `مفعّل على "${folderName}"${state.lastFolderBackup ? ` — آخر حفظ: ${state.lastFolderBackup}` : ""}`;
  } else {
    status.textContent = `مفعّل على "${folderName}" — اضغط "اختر مجلد" مرة لإعادة تفعيل الصلاحية.`;
  }
  if (chooseBtn) chooseBtn.textContent = "📁 تغيير المجلد / إعادة تفعيل";
  if (disableBtn) disableBtn.hidden = false;
}

async function shareBackup() {
  const payload = await backupPayload();
  const fileName = backupFileName();
  const file = new File([payload], fileName, { type: "application/json" });

  // جرّب مشاركة الملف عبر نظام الجهاز (واتساب/درايف/...)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "نسخة احتياطية — دفتر المقهى",
        text: "نسخة احتياطية من بيانات المحل"
      });
      showToast("تم فتح المشاركة — اختر واتساب أو درايف.");
      markBackupDone();
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return; // المستخدم ألغى
      console.warn("share failed", error);
    }
  }

  // الجهاز ما يدعم مشاركة الملفات → ننزّله عادي
  showToast("جهازك لا يدعم المشاركة المباشرة — تم تنزيل النسخة بدلاً من ذلك.");
  await exportData();
}

function isBackupImportCandidate(parsed) {
  return parsed && typeof parsed === "object" && (
    parsed.backupNote ||
    parsed.exportedAt ||
    Array.isArray(parsed.invoices) ||
    Array.isArray(parsed.customers) ||
    Array.isArray(parsed.menu)
  );
}

function importBackupSummaryText(nextState) {
  const health = dataHealthReport(nextState);
  const lines = [
    `فواتير: ${nextState.invoices.length}`,
    `عملاء: ${nextState.customers.length}`,
    `أصناف: ${nextState.menu.length}`,
    `عمال: ${nextState.workers.length}`,
    `إغلاقات: ${(nextState.periodCloses || []).length}`
  ];
  if (!health.ok) lines.push(`ملاحظات: ${health.issues.join("، ")}`);
  return lines.join("\n");
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    // 1) قراءة JSON — لو فشلت هون فعلاً الملف تالف أو مش JSON
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (error) {
      console.error("استيراد النسخة: فشل تحليل JSON", error);
      showToast("ملف النسخة غير صحيح — المحتوى مش JSON سليم. تأكد إنك اخترت ملف .json صادر من البرنامج (زر تصدير نسخة).");
      return;
    }

    if (!isBackupImportCandidate(parsed)) {
      showToast("ملف النسخة لا يشبه نسخة صادرة من البرنامج.");
      return;
    }

    // 2) من هون فصاعداً الملف سليم — أي خطأ لاحق هو بمعالجة البيانات، مش بالملف نفسه
    try {
      const nextState = normalizeState(parsed);
      const confirmed = await appConfirm(`استيراد النسخة سيستبدل البيانات الحالية.\n\n${importBackupSummaryText(nextState)}\n\nهل تريد المتابعة؟`);
      if (!confirmed) return;

      // نسخة أمان قبل الاستيراد: محاولة بس، فشلها ما يوقف الاستيراد (الملف المستورد سليم أصلاً)
      try {
        const beforePayload = await backupPayload();
        await saveBackupToLocalServer(beforePayload, `before-import-${backupFileName()}`);
      } catch (safetyError) {
        console.warn("استيراد النسخة: تعذّرت نسخة الأمان قبل الاستيراد، بنكمل الاستيراد على أي حال", safetyError);
      }

      if (parsed.workspacesBundle && typeof restoreWorkspaceBackupBundle === "function") {
        await restoreWorkspaceBackupBundle(parsed.workspacesBundle);
      }
      state = {
        ...nextState,
        view: "invoices",
      };
      if (parsed.workspacesBundle) {
        const activeRaw = localStorage.getItem(workspaceStateKey(workspaceRegistry.activeId));
        if (activeRaw) state = { ...normalizeState(JSON.parse(activeRaw)), view: "invoices" };
      }
      auditAction("backup.import", {
        fileName: file.name || "",
        invoices: state.invoices.length,
        customers: state.customers.length,
        menu: state.menu.length
      });
      selectedCustomerId = state.customers[0]?.id || null;
      selectedWorkerId = state.workers[0]?.id || null;
      lastClosedInvoice = state.invoices[0] || null;
      showToast("تم استيراد النسخة.");
      render();
      renderBackupCenter();
    } catch (error) {
      console.error("استيراد النسخة: فشل معالجة البيانات بعد قراءة الملف", error);
      showToast(`الملف نفسه سليم بس صار خطأ أثناء معالجته: ${error?.message || "خطأ غير معروف"}.`);
    }
  };
  reader.onerror = () => {
    console.error("استيراد النسخة: فشل قراءة الملف من الجهاز", reader.error);
    showToast("تعذّر قراءة الملف من جهازك.");
  };
  reader.readAsText(file);
}

function backupSnapshotFileName(snapshot) {
  const name = (typeof businessName === "function" ? businessName() : "cafe-pos").replace(/[\\/:*?"<>|]/g, "").trim() || "cafe-pos";
  const createdAt = new Date(snapshot?.createdAt || Date.now());
  const localDate = new Date(createdAt.getTime() - createdAt.getTimezoneOffset() * 60000);
  const datePart = localDate.toISOString().slice(0, 10);
  const hour = String(createdAt.getHours()).padStart(2, "0");
  const minute = String(createdAt.getMinutes()).padStart(2, "0");
  const second = String(createdAt.getSeconds()).padStart(2, "0");
  return `${name}-internal-${datePart}-${hour}-${minute}-${second}.json`;
}

async function downloadBackupSnapshotByKey(key) {
  const snapshot = await backupSnapshotByKey(key);
  if (!snapshot?.payload) {
    showToast("لم أجد النسخة المطلوبة للتنزيل.");
    renderBackupCenter();
    return;
  }
  downloadBackupFallback(snapshot.payload, backupSnapshotFileName(snapshot));
  markBackupDone();
  showToast("تم تنزيل النسخة الداخلية كملف.");
}

async function restoreBackupSnapshot(snapshot) {
  const nextState = snapshotState(snapshot);
  if (!snapshot || !nextState) {
    showToast("لا توجد نسخة داخلية صالحة للاسترجاع.");
    renderBackupCenter();
    return;
  }

  const confirmed = await appConfirm(
    `استرجاع هذه النسخة الداخلية سيستبدل البيانات الحالية.\n\nتاريخ النسخة: ${formatDate(snapshot.createdAt)}\n${importBackupSummaryText(nextState)}\n\nهل تريد المتابعة؟`,
    { icon: "↩", yesLabel: "استرجاع", cancelLabel: "إلغاء" }
  );
  if (!confirmed) return;

  try {
    const beforePayload = await backupPayload();
    saveLocalBackup(beforePayload, { source: "before_restore", forceNew: true });
    await saveBackupToLocalServer(beforePayload, `before-local-restore-${backupFileName()}`);
  } catch (error) {
    console.warn("before restore backup failed", error);
  }

  state = {
    ...nextState,
    view: "guide"
  };
  if (nextState.workspacesBundle && typeof restoreWorkspaceBackupBundle === "function") {
    await restoreWorkspaceBackupBundle(nextState.workspacesBundle);
    const activeRaw = localStorage.getItem(workspaceStateKey(workspaceRegistry.activeId));
    if (activeRaw) state = { ...normalizeState(JSON.parse(activeRaw)), view: "guide" };
  }
  auditAction("backup.restore", {
    restoredAt: snapshot.createdAt || "",
    invoices: state.invoices.length,
    customers: state.customers.length,
    menu: state.menu.length
  });
  selectedCustomerId = state.customers[0]?.id || null;
  selectedWorkerId = state.workers[0]?.id || null;
  lastClosedInvoice = state.invoices[0] || null;
  setLastPaymentMethod(getLastPaymentMethod());
  markBackupDone();
  saveState(true);
  showToast("تم استرجاع النسخة الداخلية.");
  render();
}

async function restoreBackupSnapshotByKey(key) {
  const snapshot = await backupSnapshotByKey(key);
  if (!snapshot?.payload) {
    showToast("لم أجد النسخة المطلوبة للاسترجاع.");
    renderBackupCenter();
    return;
  }
  await restoreBackupSnapshot(snapshot);
}

async function restoreLatestLocalBackup() {
  const snapshot = await latestBackupSnapshot();
  await restoreBackupSnapshot(snapshot);
}

function addPurchase(event) {
  event.preventDefault();
  const menuItemId = ENABLE_LINKING ? els.purchaseMenuItemInput.value || "" : "";
  const typedItem = els.purchaseItemInput.value.trim();
  const menuItem = ENABLE_LINKING ? menuItemId ? findMenuItem(menuItemId) : findMenuItemByName(typedItem) : null;
  const item = typedItem || "";
  const qty = Number(els.purchaseQtyInput.value || 0);
  const unit = normalizeUnit(els.purchaseUnitInput.value || (ENABLE_LINKING ? itemUnit(menuItem) : ""));
  const stockPerUnit = Number(els.purchaseStockQtyInput.value || 0);
  const stockQty = stockPerUnit > 0 ? qty * stockPerUnit : qty;
  const stockUnit = normalizeUnit(els.purchaseStockUnitInput.value || unit);
  const amount = Number(els.purchaseAmountInput.value || 0);
  const purchaseUnitPrice = qty > 0 ? amount / qty : Number(els.purchaseUnitPriceInput.value || 0);
  const unitCost = stockQty > 0 ? amount / stockQty : 0;

  if (!item || amount <= 0 || qty <= 0 || stockQty <= 0) {
    showToast("اكتب اسم الصنف والكمية والمبلغ وكمية المخزون.");
    return;
  }

  purchaseDraftItems.push({
    id: uid("purchase-line"),
    menuItemId: ENABLE_LINKING ? menuItem?.id || null : null,
    linkedItemName: ENABLE_LINKING ? menuItem?.name || "" : "",
    item,
    qty,
    unit,
    stockPerUnit: stockPerUnit > 0 ? stockPerUnit : 1,
    stockQty,
    stockUnit,
    purchaseUnitPrice,
    unitCost,
    amount
  });

  resetPurchaseLineInputs();
  showToast("تمت إضافة الصنف لفاتورة المشتريات.");
  render();
}

function purchaseDraftLineFromStoredLine(line) {
  const qty = Number(line.qty || 0);
  const amount = Number(line.amount || 0);
  const stockQty = purchaseLineStockQty(line) || qty;
  const stockPerUnit = purchaseLineStockPerUnit(line) || 1;
  const stockUnit = purchaseLineStockUnit(line) || normalizeUnit(line.unit || "");
  return {
    id: line.id || uid("purchase-line"),
    menuItemId: ENABLE_LINKING ? line.menuItemId || null : null,
    linkedItemName: ENABLE_LINKING ? line.linkedItemName || purchaseLinkedItemName(line) : "",
    item: line.item || "مشتريات",
    qty,
    unit: normalizeUnit(line.unit || (ENABLE_LINKING ? itemUnit(findMenuItem(line.menuItemId)) : "")),
    stockPerUnit,
    stockQty,
    stockUnit,
    purchaseUnitPrice: Number(line.purchaseUnitPrice ?? (qty > 0 ? amount / qty : 0)),
    unitCost: Number(line.unitCost ?? (stockQty ? amount / stockQty : 0)),
    amount
  };
}

function revertPurchaseStock(purchase) {
  if (!ENABLE_LINKING) return;
  purchaseLines(purchase).forEach((line) => {
    if (line.menuItemId && purchaseLineStockQty(line) > 0) {
      adjustMenuStock(line.menuItemId, -purchaseLineStockQty(line));
    }
  });
}

function applyPurchaseLinesToStock(lines) {
  if (!ENABLE_LINKING) {
    return lines.map((line) => ({
      ...line,
      menuItemId: null,
      linkedItemName: "",
      stockAfter: null
    }));
  }
  return lines.map((line) => {
    const stockQty = purchaseLineStockQty(line);
    const stockUnit = purchaseLineStockUnit(line);
    const stockItem = line.menuItemId ? adjustMenuStock(line.menuItemId, stockQty) : null;
    if (stockItem && stockUnit) {
      stockItem.stockUnit = stockUnit;
    }
    if (stockItem && purchaseLineUnitCost(line) > 0) {
      stockItem.cost = purchaseLineUnitCost(line);
    }
    return {
      ...line,
      stockAfter: stockItem ? stockItem.stockQty : null
    };
  });
}

function resetPurchaseInvoiceForm() {
  editingPurchaseId = null;
  purchaseDraftItems = [];
  els.purchaseSupplierInput.value = "";
  if (els.purchaseDateInput) els.purchaseDateInput.value = todayDateInputValue();
  els.purchaseNoteInput.value = "";
  els.purchaseMethodInput.value = getLastPaymentMethod();
  clearPurchasePaymentInputs();
  if (els.purchaseDiscountInput) els.purchaseDiscountInput.value = "";
  if (els.purchaseSupplierCreditUsedInput) els.purchaseSupplierCreditUsedInput.value = "";
  resetPurchaseLineInputs();
}

function clearPurchasePaymentInputs() {
  [els.purchasePaidInput, els.purchaseCashPaidInput, els.purchaseBankPaidInput, els.purchaseWalletPaidInput]
    .forEach((input) => {
      if (input) input.value = "";
    });
}

function purchasePaymentInputRaw(input) {
  return input ? String(input.value || "").trim() : "";
}

function purchasePaymentInputAmount(input) {
  const raw = purchasePaymentInputRaw(input);
  if (raw === "") return { touched: false, amount: 0 };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return { touched: true, error: true };
  return { touched: true, amount };
}

function purchasePaymentMethodFromMap(payments = {}, fallbackMethod = "cash") {
  return paymentMethods.find((method) => Number(payments[method] || 0) > 0.001)
    || (paymentMethods.includes(fallbackMethod) ? fallbackMethod : getLastPaymentMethod());
}

function readPurchasePaymentInputs(amount, requestedCredit, fallbackMethod = "cash") {
  const totalAmount = Math.max(Number(amount || 0), 0);
  const splitValues = {
    cash: purchasePaymentInputAmount(els.purchaseCashPaidInput),
    bank: purchasePaymentInputAmount(els.purchaseBankPaidInput),
    wallet: purchasePaymentInputAmount(els.purchaseWalletPaidInput)
  };
  const touchedSplit = Object.values(splitValues).some((entry) => entry.touched);
  if (Object.values(splitValues).some((entry) => entry.error)) {
    return { error: "راجع مبالغ الدفع: اكتب أرقام صحيحة فقط." };
  }

  if (touchedSplit) {
    const payments = {
      cash: splitValues.cash.amount,
      bank: splitValues.bank.amount,
      wallet: splitValues.wallet.amount
    };
    const paidAmount = paymentTotal(payments);
    return {
      payments,
      paidAmount,
      method: purchasePaymentMethodFromMap(payments, fallbackMethod)
    };
  }

  const paidRaw = purchasePaymentInputRaw(els.purchasePaidInput);
  const legacyPaid = paidRaw === ""
    ? Math.max(totalAmount - Math.max(Number(requestedCredit || 0), 0), 0)
    : Math.max(Number(paidRaw || 0), 0);
  const method = paymentMethods.includes(fallbackMethod) ? fallbackMethod : getLastPaymentMethod();
  const payments = { cash: 0, bank: 0, wallet: 0 };
  payments[method] = legacyPaid;
  return { payments, paidAmount: legacyPaid, method };
}

function fillPurchasePaymentInputs(payments = {}) {
  const normalized = normalizedPaymentMap(payments);
  if (els.purchaseCashPaidInput) els.purchaseCashPaidInput.value = inputNumberValue(normalized.cash);
  if (els.purchaseBankPaidInput) els.purchaseBankPaidInput.value = inputNumberValue(normalized.bank);
  if (els.purchaseWalletPaidInput) els.purchaseWalletPaidInput.value = inputNumberValue(normalized.wallet);
  if (els.purchasePaidInput) els.purchasePaidInput.value = "";
}

function supplierTransactionRef(source, id) {
  return `${source || "current"}::${id || ""}`;
}

function supplierTransactionFromRef(source, id) {
  if (!id) return null;
  if (source === "legacy") {
    const entry = (state.supplierPayments || []).find((payment) => payment.id === id);
    return entry ? normalizeLegacySupplierPayment(entry) : null;
  }
  const entry = (state.supplierTransactions || []).find((transaction) => transaction.id === id);
  return entry ? normalizeSupplierTransaction(entry) : null;
}

function supplierTransactionRows(limit = 12) {
  const current = (state.supplierTransactions || [])
    .map((entry) => normalizeSupplierTransaction(entry))
    .filter(Boolean)
    .map((entry) => ({ ...entry, source: "current" }));
  const legacy = (state.supplierPayments || [])
    .map((entry) => normalizeLegacySupplierPayment(entry))
    .filter(Boolean)
    .map((entry) => ({ ...entry, source: "legacy" }));
  return current.concat(legacy)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, limit);
}

function resetSupplierTransactionForm() {
  editingSupplierTransactionRef = null;
  const form = document.getElementById("supplierPayForm");
  const nameEl = document.getElementById("supplierPayNameInput");
  const amountEl = document.getElementById("supplierPayAmountInput");
  const methodEl = document.getElementById("supplierPayMethodInput");
  const typeEl = document.getElementById("supplierTransactionTypeInput");
  const noteEl = document.getElementById("supplierTransactionNoteInput");
  const cancelButton = document.getElementById("supplierTransactionCancelEditButton");
  const submitButton = form?.querySelector('button[type="submit"]');
  if (nameEl) nameEl.value = "";
  if (amountEl) amountEl.value = "";
  if (noteEl) noteEl.value = "";
  if (typeEl) typeEl.value = SUPPLIER_PAYMENT_OUT_TYPE;
  if (methodEl) {
    methodEl.value = getLastPaymentMethod();
    methodEl.disabled = false;
  }
  if (submitButton) submitButton.textContent = "تسجيل حركة المورد";
  if (cancelButton) cancelButton.hidden = true;
}

function startEditSupplierTransaction(source, id) {
  const transaction = supplierTransactionFromRef(source, id);
  if (!transaction) { showToast("حركة المورد غير موجودة."); return; }
  editingSupplierTransactionRef = { source, id };
  const form = document.getElementById("supplierPayForm");
  const nameEl = document.getElementById("supplierPayNameInput");
  const amountEl = document.getElementById("supplierPayAmountInput");
  const methodEl = document.getElementById("supplierPayMethodInput");
  const typeEl = document.getElementById("supplierTransactionTypeInput");
  const noteEl = document.getElementById("supplierTransactionNoteInput");
  const cancelButton = document.getElementById("supplierTransactionCancelEditButton");
  const submitButton = form?.querySelector('button[type="submit"]');
  if (nameEl) nameEl.value = transaction.supplier || "";
  if (amountEl) amountEl.value = String(Number(transaction.amount || 0));
  if (methodEl) {
    methodEl.value = paymentMethods.includes(transaction.method) ? transaction.method : getLastPaymentMethod();
    methodEl.disabled = transaction.type === SUPPLIER_CREDIT_NOTE_TYPE || transaction.type === SUPPLIER_DIRECT_DEBT_TYPE;
  }
  if (typeEl) typeEl.value = transaction.type || SUPPLIER_PAYMENT_OUT_TYPE;
  if (noteEl) noteEl.value = transaction.note || "";
  if (submitButton) submitButton.textContent = "حفظ تعديل الحركة";
  if (cancelButton) cancelButton.hidden = false;
  showToast("عدّل حركة المورد ثم احفظ.");
  nameEl?.focus();
}

async function removeSupplierTransaction(source, id) {
  const transaction = supplierTransactionFromRef(source, id);
  if (!transaction) { showToast("حركة المورد غير موجودة."); return; }
  if (!guardClosedPeriod(transaction.createdAt, "حذف حركة مورد")) return;
  const confirmed = await appConfirm(`حذف ${supplierTransactionTypeLabels[transaction.type] || "حركة مورد"} للمورّد ${transaction.supplier} بقيمة ${money(transaction.amount)}؟`);
  if (!confirmed) return;
  if (source === "legacy") {
    state.supplierPayments = (state.supplierPayments || []).filter((entry) => entry.id !== id);
  } else {
    state.supplierTransactions = (state.supplierTransactions || []).filter((entry) => entry.id !== id);
  }
  if (editingSupplierTransactionRef?.source === source && editingSupplierTransactionRef?.id === id) resetSupplierTransactionForm();
  if (typeof auditAction === "function") auditAction("supplier.transaction.delete", { supplier: transaction.supplier, amount: transaction.amount, type: transaction.type });
  saveState();
  showToast("تم حذف حركة المورد.");
  render();
}

// ─── حسابات الموردين: دين، رصيد، قبض وتسديد ─────────────────────
function sameSupplierName(a, b) {
  return String(a || "").trim() === String(b || "").trim();
}

function supplierAllNames() {
  return Array.from(new Set([
    ...(state.purchases || []).map((purchase) => String(purchase.supplier || "").trim()),
    ...supplierLedgerTransactions().map((entry) => String(entry.supplier || "").trim())
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar"));
}

function supplierAccountForName(name) {
  const supplier = String(name || "").trim();
  const account = {
    supplier,
    owed: 0,
    debt: 0,
    credit: 0,
    purchasesTotal: 0,
    purchaseDiscounts: 0,
    purchaseCount: 0,
    purchasesDebt: 0,
    directDebts: 0,
    paidAtPurchase: 0,
    paidOut: 0,
    creditNotes: 0,
    receiptsIn: 0,
    creditUsed: 0,
    purchaseOverpayments: 0,
    lastAt: ""
  };
  const touch = (date) => {
    if (!date) return;
    if (!account.lastAt || new Date(date || 0) > new Date(account.lastAt || 0)) account.lastAt = date;
  };

  (state.purchases || []).filter((purchase) => sameSupplierName(purchase.supplier, supplier)).forEach((purchase) => {
    const amount = purchaseAmount(purchase);
    const paid = purchasePaidAmount(purchase);
    const purchaseBalance = amount - paid;
    const unpaidBeforeCredit = Math.max(purchaseBalance, 0);
    const overpayment = Math.max(-purchaseBalance, 0);
    account.owed += purchaseBalance;
    account.purchasesTotal += amount;
    account.purchaseDiscounts += purchaseDiscount(purchase);
    account.purchaseCount += 1;
    account.purchasesDebt += unpaidBeforeCredit;
    account.paidAtPurchase += paid;
    account.purchaseOverpayments += overpayment;
    account.creditUsed += purchaseSupplierCreditUsed(purchase);
    touch(purchase.createdAt);
  });

  supplierLedgerTransactions().filter((entry) => sameSupplierName(entry.supplier, supplier)).forEach((transaction) => {
    const amount = Number(transaction.amount || 0);
    if (transaction.type === SUPPLIER_PAYMENT_OUT_TYPE) {
      account.owed -= amount;
      account.paidOut += amount;
    } else if (transaction.type === SUPPLIER_DIRECT_DEBT_TYPE) {
      account.owed += amount;
      account.directDebts += amount;
    } else if (transaction.type === SUPPLIER_CREDIT_NOTE_TYPE) {
      account.owed -= amount;
      account.creditNotes += amount;
    } else if (transaction.type === SUPPLIER_RECEIPT_IN_TYPE) {
      account.owed += amount;
      account.receiptsIn += amount;
    }
    touch(transaction.createdAt);
  });

  account.owed = Math.round(account.owed * 100) / 100;
  account.debt = Math.max(account.owed, 0);
  account.credit = Math.max(-account.owed, 0);
  return account;
}

function supplierAccountRows(name) {
  const supplier = String(name || "").trim();
  const purchaseRows = (state.purchases || [])
    .filter((purchase) => sameSupplierName(purchase.supplier, supplier))
    .map((purchase) => ({
      kind: "purchase",
      id: purchase.id,
      date: purchase.createdAt || "",
      title: purchase.number || "فاتورة مشتريات",
      subtotal: purchaseSubtotal(purchase),
      discount: purchaseDiscount(purchase),
      amount: purchaseAmount(purchase),
      paid: purchasePaidAmount(purchase),
      overpayment: purchaseSupplierOverpayment(purchase),
      creditUsed: purchaseSupplierCreditUsed(purchase),
      debt: purchaseSupplierDebt(purchase),
      note: purchase.note || "",
      lines: purchaseLines(purchase)
    }));
  const transactionRows = supplierTransactionRows(Number.MAX_SAFE_INTEGER)
    .filter((entry) => sameSupplierName(entry.supplier, supplier))
    .map((entry) => ({
      kind: "transaction",
      id: entry.id,
      source: entry.source,
      date: entry.createdAt || "",
      type: entry.type,
      title: supplierTransactionTypeLabels[entry.type] || "حركة مورد",
      amount: Number(entry.amount || 0),
      method: entry.method || "",
      note: entry.note || ""
    }));
  return purchaseRows.concat(transactionRows)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function supplierAccountStatus(account = {}) {
  if (Number(account.owed || 0) > 0.001) return { tone: "debt", label: "عليك للمورد", amount: money(account.debt || 0) };
  if (Number(account.owed || 0) < -0.001) return { tone: "credit", label: "إلك عند المورد", amount: money(account.credit || 0) };
  return { tone: "clear", label: "متوازن", amount: money(0) };
}

function supplierRowMatchesGlobalFilters(row, supplierName = "") {
  if (typeof purchaseGlobalFilterState !== "function") return true;
  const { query, range } = purchaseGlobalFilterState();
  if (!invoiceMatchesDateRange({ createdAt: row.date || row.createdAt || "" }, range)) return false;
  if (!query) return true;
  const linesText = (row.lines || []).map((line) => `${line.item || ""} ${line.unit || ""}`).join(" ");
  return searchMatch(`${supplierName} ${row.supplier || ""} ${row.title || ""} ${row.note || ""} ${linesText}`, query);
}

function filteredSupplierAccountRows(name) {
  const rows = supplierAccountRows(name).filter((row) => supplierRowMatchesGlobalFilters(row, name));
  if (typeof sortPurchaseFilteredRows !== "function") return rows;
  return sortPurchaseFilteredRows(rows, (row) => row.date);
}

function renderSupplierAccountDetail(name) {
  const account = supplierAccountForName(name);
  const status = supplierAccountStatus(account);
  const rows = filteredSupplierAccountRows(name);
  return `
    <section class="supplier-detail-panel is-${status.tone}">
      <header class="supplier-detail-head">
        <button class="secondary-button" type="button" data-back-suppliers>رجوع للموردين</button>
        <div>
          <span>صفحة مورد</span>
          <h3>${escapeHtml(account.supplier || "مورد")}</h3>
          <small>${status.label}${account.lastAt ? ` · آخر حركة ${formatDate(account.lastAt).slice(0, 10)}` : ""}</small>
        </div>
        <strong>${status.amount}</strong>
      </header>
      <div class="supplier-detail-stats">
        <article><span>إجمالي الفواتير</span><strong>${money(account.purchasesTotal)}</strong><small>${quantityText(account.purchaseCount)} فاتورة</small></article>
        <article><span>خصومات الفواتير</span><strong>${money(account.purchaseDiscounts)}</strong><small>الخصم المسجل على فواتير المورد</small></article>
        <article><span>باقي من الفواتير</span><strong>${money(account.purchasesDebt)}</strong><small>قبل التسديدات والرصيد</small></article>
        <article><span>دين مباشر</span><strong>${money(account.directDebts)}</strong><small>دين بدون فاتورة شراء</small></article>
        <article><span>دفعت وقت الشراء</span><strong>${money(account.paidAtPurchase)}</strong><small>كاش/بنك/محفظة داخل الفواتير</small></article>
        <article><span>رصيد من زيادة الدفع</span><strong>${money(account.purchaseOverpayments)}</strong><small>الزيادة المدفوعة فوق قيمة الفواتير</small></article>
        <article><span>تسديدات لاحقة</span><strong>${money(account.paidOut)}</strong><small>دفعات خرجت للمورد</small></article>
        <article><span>رصيد واستخدامه</span><strong>${money(account.creditNotes)} / ${money(account.creditUsed)}</strong><small>رصيد عنده / مستخدم بالفواتير</small></article>
        <article><span>قبض من المورد</span><strong>${money(account.receiptsIn)}</strong><small>دخل للصندوق</small></article>
      </div>
      <div class="supplier-detail-actions">
        ${account.debt > 0.001 ? `<button class="secondary-button" type="button" data-supplier-action="payment_out" data-supplier-name="${escapeAttr(account.supplier)}" data-supplier-amount="${escapeAttr(inputNumberValue(account.debt))}">تسديد الدين</button>` : ""}
        <button class="secondary-button" type="button" data-supplier-action="debt_increase" data-supplier-name="${escapeAttr(account.supplier)}">إضافة دين</button>
        ${account.credit > 0.001 ? `<button class="secondary-button" type="button" data-supplier-action="receipt_in" data-supplier-name="${escapeAttr(account.supplier)}" data-supplier-amount="${escapeAttr(inputNumberValue(account.credit))}">قبض الرصيد</button>` : ""}
        <button class="secondary-button" type="button" data-supplier-action="credit_note" data-supplier-name="${escapeAttr(account.supplier)}">إضافة رصيد عند المورد</button>
      </div>
      <div class="supplier-detail-ledger">
        ${rows.length ? rows.map((row) => {
          if (row.kind === "purchase") {
            const itemText = row.lines.length
              ? row.lines.map((line) => `${escapeHtml(line.item || "مشتريات")} ${quantityWithUnit(line.qty, line.unit)}`).join("، ")
              : "بدون بنود";
            return `
              <article class="purchase-line-card supplier-ledger-row ${row.debt > 0.001 ? "is-debt" : row.overpayment > 0.001 ? "is-credit" : "is-clear"}">
                <div>
                  <strong>${escapeHtml(row.title)}</strong>
                  <small>${formatDate(row.date)} · ${itemText}${row.note ? ` · ${escapeHtml(row.note)}` : ""}</small>
                  <div class="supplier-ledger-mini">
                    ${row.discount > 0.001 ? `<span>قبل الخصم ${money(row.subtotal)}</span><span>خصم ${money(row.discount)}</span>` : ""}
                    <span>الإجمالي ${money(row.amount)}</span>
                    <span>مدفوع ${money(row.paid)}</span>
                    ${row.overpayment > 0.001 ? `<span>رصيد جديد لك ${money(row.overpayment)}</span>` : ""}
                    ${row.creditUsed > 0.001 ? `<span>رصيد مستخدم ${money(row.creditUsed)}</span>` : ""}
                    <span>دين ${money(row.debt)}</span>
                  </div>
                </div>
                <span class="${row.debt > 0.001 ? "supplier-owed" : row.overpayment > 0.001 ? "supplier-credit" : "supplier-clear"}">${row.overpayment > 0.001 ? `إلك ${money(row.overpayment)}` : money(row.debt)}</span>
                <div class="supplier-row-actions">
                  <button class="secondary-button" type="button" data-edit-purchase="${escapeAttr(row.id)}">تعديل الفاتورة</button>
                  <button class="invoice-delete-button" type="button" data-remove-purchase="${escapeAttr(row.id)}">حذف</button>
                </div>
              </article>`;
          }
          const isIn = row.type === SUPPLIER_RECEIPT_IN_TYPE;
          const isNeutral = row.type === SUPPLIER_CREDIT_NOTE_TYPE;
          const isDebtIncrease = row.type === SUPPLIER_DIRECT_DEBT_TYPE;
          return `
            <article class="purchase-line-card supplier-ledger-row ${isIn ? "is-in" : isNeutral ? "is-neutral" : isDebtIncrease ? "is-debt" : "is-out"}">
              <div>
                <strong>${escapeHtml(row.title)}</strong>
                <small>${formatDate(row.date)}${row.note ? ` · ${escapeHtml(row.note)}` : ""}</small>
              </div>
              <span>${money(row.amount)}</span>
              <div class="supplier-row-actions">
                <button class="secondary-button" type="button" data-edit-supplier-transaction="${escapeAttr(row.id)}" data-supplier-transaction-source="${escapeAttr(row.source)}">تعديل</button>
                <button class="invoice-delete-button" type="button" data-remove-supplier-transaction="${escapeAttr(row.id)}" data-supplier-transaction-source="${escapeAttr(row.source)}">حذف</button>
              </div>
            </article>`;
        }).join("") : '<div class="empty-state">لا يوجد فواتير أو حركات لهذا المورد بعد.</div>'}
      </div>
    </section>`;
}

function renderSupplierDebts() {
  const totalBox = $("#supplierDebtTotalBox");
  const list = $("#supplierDebtList");
  const datalist = $("#supplierNameOptions");
  if (!list) return;
  const names = supplierAllNames();
  if (selectedSupplierName && !names.some((name) => sameSupplierName(name, selectedSupplierName))) selectedSupplierName = "";
  const filterActive = typeof purchaseGlobalFilterState === "function"
    && Boolean(purchaseGlobalFilterState().query || purchaseGlobalFilterState().range.minDate || purchaseGlobalFilterState().range.maxDate);
  const accounts = names
    .map(supplierAccountForName)
    .filter((account) => !filterActive || filteredSupplierAccountRows(account.supplier).length > 0)
    .sort((a, b) => Number(b.owed || 0) - Number(a.owed || 0) || String(a.supplier).localeCompare(String(b.supplier), "ar"));
  const totalOwed = accounts.reduce((sum, entry) => sum + Number(entry.debt || 0), 0);
  const totalCredit = accounts.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  const activeCount = accounts.length;

  if (totalBox) {
    totalBox.innerHTML = `
      <div class="purchase-total-head">
        <span class="purchase-total-label">ملخص حسابات الموردين</span>
        <small class="purchase-total-count">${quantityText(activeCount)} مورد بحركة</small>
      </div>
      <strong class="purchase-total-amount">${money(totalOwed)}</strong>
      <small>عليك ${money(totalOwed)} · إلك ${money(totalCredit)}</small>
      <div class="purchase-search-stats supplier-account-stats">
        <span>عليك للموردين: ${money(totalOwed)}</span>
        <span>إلك عند الموردين: ${money(totalCredit)}</span>
        <span>موردون بحركة: ${quantityText(activeCount)}</span>
      </div>`;
  }
  if (datalist) {
    datalist.innerHTML = names.map((n) => `<option value="${escapeAttr(n)}"></option>`).join("");
  }

  if (selectedSupplierName) {
    list.innerHTML = renderSupplierAccountDetail(selectedSupplierName);
    return;
  }

  let movementRows = supplierTransactionRows().filter((entry) => supplierRowMatchesGlobalFilters(entry, entry.supplier));
  if (typeof sortPurchaseFilteredRows === "function") movementRows = sortPurchaseFilteredRows(movementRows, (entry) => entry.createdAt);
  const balancesHtml = accounts.length
    ? accounts.map((entry) => {
      const isDebt = Number(entry.owed || 0) > 0.001;
      const isCredit = Number(entry.owed || 0) < -0.001;
      const statusText = isDebt ? "عليك للمورد" : isCredit ? "إلك عند المورد" : "متوازن";
      const amountText = money(Math.abs(Number(entry.owed || 0)));
      return `
        <article class="purchase-line-card supplier-debt-row ${isDebt ? "is-debt" : isCredit ? "is-credit" : "is-clear"}">
          <div>
            <strong>${escapeHtml(entry.supplier)}</strong>
            <small>${statusText}${entry.lastAt ? ` · آخر حركة ${formatDate(entry.lastAt).slice(0, 10)}` : ""}</small>
            <div class="supplier-ledger-mini">
              <span>دين فواتير ${money(entry.purchasesDebt || 0)}</span>
              <span>دين مباشر ${money(entry.directDebts || 0)}</span>
              <span>دفعت ${money(entry.paidOut || 0)}</span>
              <span>رصيد ${money(entry.creditNotes || 0)}</span>
              <span>استخدمت ${money(entry.creditUsed || 0)}</span>
              <span>قبضت ${money(entry.receiptsIn || 0)}</span>
            </div>
          </div>
          <span class="${isDebt ? "supplier-owed" : isCredit ? "supplier-credit" : "supplier-clear"}">${amountText}</span>
          <div class="supplier-row-actions">
            ${isDebt ? `<button class="secondary-button" type="button" data-supplier-action="payment_out" data-supplier-name="${escapeAttr(entry.supplier)}" data-supplier-amount="${escapeAttr(inputNumberValue(entry.debt || 0))}">تسديد</button>` : ""}
            <button class="secondary-button" type="button" data-supplier-action="debt_increase" data-supplier-name="${escapeAttr(entry.supplier)}">دين جديد</button>
            ${isCredit ? `<button class="secondary-button" type="button" data-supplier-action="receipt_in" data-supplier-name="${escapeAttr(entry.supplier)}" data-supplier-amount="${escapeAttr(inputNumberValue(entry.credit || 0))}">قبض</button>` : ""}
            <button class="secondary-button" type="button" data-supplier-action="credit_note" data-supplier-name="${escapeAttr(entry.supplier)}">رصيد عنده</button>
            <button class="primary-button" type="button" data-open-supplier="${escapeAttr(entry.supplier)}">فتح الحساب</button>
          </div>
        </article>`;
    }).join("")
    : '<div class="empty-state">لا يوجد حساب مفتوح للموردين. اكتب اسم المورد في فاتورة الشراء أو سجل حركة رصيد للمورد حتى يظهر هنا.</div>';
  const movementsHtml = movementRows.length
    ? `
      <div class="supplier-movement-head">
        <strong>آخر حركات الموردين</strong>
        <small>هذه الحركات تقدر تعدلها أو تحذفها. دين الفاتورة يتعدل من الفاتورة نفسها.</small>
      </div>
      ${movementRows.map((entry) => {
        const isIn = entry.type === SUPPLIER_RECEIPT_IN_TYPE;
        const isNeutral = entry.type === SUPPLIER_CREDIT_NOTE_TYPE;
        const isDebtIncrease = entry.type === SUPPLIER_DIRECT_DEBT_TYPE;
        return `
          <article class="purchase-line-card supplier-movement-row ${isIn ? "is-in" : isNeutral ? "is-neutral" : isDebtIncrease ? "is-debt" : "is-out"}">
            <div>
              <strong>${escapeHtml(entry.supplier)}</strong>
              <small>${escapeHtml(supplierTransactionTypeLabels[entry.type] || "حركة مورد")} · ${formatDate(entry.createdAt)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</small>
            </div>
            <span>${money(entry.amount)}</span>
            <div class="supplier-row-actions">
              <button class="secondary-button" type="button" data-edit-supplier-transaction="${escapeAttr(entry.id)}" data-supplier-transaction-source="${escapeAttr(entry.source)}">تعديل</button>
              <button class="invoice-delete-button" type="button" data-remove-supplier-transaction="${escapeAttr(entry.id)}" data-supplier-transaction-source="${escapeAttr(entry.source)}">حذف</button>
            </div>
          </article>`;
      }).join("")}`
    : '<div class="empty-state supplier-movement-empty">لا يوجد حركات موردين يدوية بعد.</div>';
  list.innerHTML = `${balancesHtml}${movementsHtml}`;
}

function paySupplier(event) {
  if (event) event.preventDefault();
  const nameEl = document.getElementById("supplierPayNameInput");
  const amountEl = document.getElementById("supplierPayAmountInput");
  const methodEl = document.getElementById("supplierPayMethodInput");
  const typeEl = document.getElementById("supplierTransactionTypeInput");
  const noteEl = document.getElementById("supplierTransactionNoteInput");
  const supplier = (nameEl?.value || "").trim();
  const amount = Math.max(Number(amountEl?.value || 0), 0);
  const type = supplierTransactionTypeLabels[typeEl?.value] ? typeEl.value : SUPPLIER_PAYMENT_OUT_TYPE;
  const method = paymentMethods.includes(methodEl?.value) ? methodEl.value : getLastPaymentMethod();
  const wasEditing = Boolean(editingSupplierTransactionRef);
  const editingTransaction = editingSupplierTransactionRef
    ? supplierTransactionFromRef(editingSupplierTransactionRef.source, editingSupplierTransactionRef.id)
    : null;
  if (!supplier) { showToast("اكتب اسم المورّد."); return; }
  if (amount <= 0) { showToast("اكتب مبلغ الحركة."); return; }
  if (type === SUPPLIER_RECEIPT_IN_TYPE) {
    let credit = Number(supplierBalanceForName(supplier)?.credit || 0);
    if (editingTransaction && editingTransaction.type === SUPPLIER_RECEIPT_IN_TYPE && editingTransaction.supplier === supplier) {
      credit += Number(editingTransaction.amount || 0);
    }
    if (credit <= 0.001) { showToast("ما في رصيد عند هذا المورد لتقبضه."); return; }
    if (amount > credit + 0.001) { showToast(`المبلغ أكبر من رصيدك عند المورد. المتاح ${money(credit)}.`); return; }
  }
  const actionLabel = supplierTransactionTypeLabels[type] || "حركة مورد";
  const actionDate = editingTransaction?.createdAt || new Date().toISOString();
  if (!guardClosedPeriod(actionDate, editingSupplierTransactionRef ? "تعديل حركة مورد" : actionLabel)) return;
  const transaction = normalizeSupplierTransaction({
    id: editingTransaction?.id || undefined,
    supplier,
    amount,
    method,
    type,
    note: noteEl?.value || "",
    createdAt: editingTransaction?.createdAt || new Date().toISOString()
  });
  if (!transaction) { showToast("راجع بيانات حركة المورد."); return; }
  state.supplierTransactions = Array.isArray(state.supplierTransactions) ? state.supplierTransactions : [];
  if (editingSupplierTransactionRef) {
    if (editingSupplierTransactionRef.source === "legacy") {
      state.supplierPayments = (state.supplierPayments || []).filter((entry) => entry.id !== editingSupplierTransactionRef.id);
      if (transaction.type === SUPPLIER_PAYMENT_OUT_TYPE) {
        state.supplierPayments.unshift({
          id: transaction.id,
          supplier: transaction.supplier,
          amount: transaction.amount,
          method: transaction.method,
          note: transaction.note,
          createdAt: transaction.createdAt
        });
      } else {
        state.supplierTransactions.unshift(transaction);
      }
    } else {
      state.supplierTransactions = state.supplierTransactions.map((entry) => entry.id === editingSupplierTransactionRef.id ? transaction : entry);
    }
  } else {
    state.supplierTransactions.unshift(transaction);
  }
  if (type === SUPPLIER_PAYMENT_OUT_TYPE || type === SUPPLIER_RECEIPT_IN_TYPE) setLastPaymentMethod(method);
  resetSupplierTransactionForm();
  if (typeof auditAction === "function") auditAction(wasEditing ? "supplier.transaction.edit" : "supplier.transaction", { supplier, amount, method, type });
  saveState();
  showToast(`${wasEditing ? "تم تعديل" : "تم تسجيل"} ${actionLabel} بقيمة ${money(amount)} للمورّد ${supplier}.`);
  render();
}

function savePurchaseInvoice() {
  if (!purchaseDraftItems.length) {
    showToast("أضف صنف واحد على الأقل لفاتورة المشتريات.");
    return;
  }

  const editingPurchase = editingPurchaseId ? state.purchases.find((purchase) => purchase.id === editingPurchaseId) : null;
  if (editingPurchaseId && !editingPurchase) {
    resetPurchaseInvoiceForm();
    showToast("فاتورة المشتريات غير موجودة.");
    render();
    return;
  }
  const selectedPurchaseDate = els.purchaseDateInput?.value || todayDateInputValue();
  const targetPurchaseDate = editingPurchase
    ? editedInvoiceDateFromInput(selectedPurchaseDate, editingPurchase.createdAt)
    : invoiceDateFromInput(selectedPurchaseDate);
  if (!guardClosedPeriod(targetPurchaseDate, editingPurchase ? "حفظ تعديل فاتورة المشتريات" : "تسجيل فاتورة مشتريات")) return;

  const fallbackMethod = paymentMethods.includes(els.purchaseMethodInput.value) ? els.purchaseMethodInput.value : getLastPaymentMethod();
  const supplier = els.purchaseSupplierInput.value.trim();
  const note = els.purchaseNoteInput.value.trim();

  const subtotal = purchaseDraftTotal();
  const discountRaw = purchaseDraftDiscountRaw();
  if (!Number.isFinite(discountRaw)) {
    showToast("راجع الخصم: اكتب رقم صحيح فقط.");
    els.purchaseDiscountInput?.focus();
    return;
  }
  if (discountRaw > subtotal + 0.001) {
    showToast("الخصم أكبر من إجمالي فاتورة المشتريات.");
    els.purchaseDiscountInput?.focus();
    return;
  }
  const discount = Math.min(discountRaw, subtotal);
  const amount = Math.max(subtotal - discount, 0);
  const creditRaw = els.purchaseSupplierCreditUsedInput ? els.purchaseSupplierCreditUsedInput.value.trim() : "";
  const requestedCredit = Math.min(Math.max(Number(creditRaw || 0), 0), amount);
  const paymentResult = readPurchasePaymentInputs(amount, requestedCredit, fallbackMethod);
  if (paymentResult.error) {
    showToast(paymentResult.error);
    return;
  }
  const payments = paymentResult.payments;
  const method = paymentResult.method;
  let paidAmount = paymentResult.paidAmount;
  const supplierOverpayment = Math.max(paidAmount - amount, 0);
  let supplierCreditUsed = Math.min(requestedCredit, Math.max(amount - paidAmount, 0));
  const supplierDebt = Math.max(amount - paidAmount - supplierCreditUsed, 0);
  setLastPaymentMethod(method);
  if (supplierDebt > 0.001 && !supplier) {
    showToast("اكتب اسم المورد لأن على الفاتورة ديناً باقياً.");
    els.purchaseSupplierInput.focus();
    return;
  }
  if (supplierOverpayment > 0.001 && !supplier) {
    showToast("اكتب اسم المورد حتى نحفظ المبلغ الزائد رصيداً لك عنده.");
    els.purchaseSupplierInput.focus();
    return;
  }
  if (supplierCreditUsed > 0.001 && !supplier) {
    showToast("اكتب اسم المورد حتى تستخدم رصيده.");
    return;
  }
  if (supplierCreditUsed > 0.001) {
    const currentSupplierBalance = supplierBalanceForName(supplier);
    let availableCredit = Number(currentSupplierBalance?.credit || 0);
    if (editingPurchase && String(editingPurchase.supplier || "").trim() === supplier) {
      const oldUnpaidBeforeCredit = Math.max(purchaseAmount(editingPurchase) - purchasePaidAmount(editingPurchase), 0);
      availableCredit = Math.max(-(Number(currentSupplierBalance?.owed || 0) - oldUnpaidBeforeCredit), 0);
    }
    if (supplierCreditUsed > availableCredit + 0.001) {
      showToast(`الرصيد المستخدم أكبر من رصيدك عند المورد. المتاح ${money(availableCredit)}.`);
      return;
    }
  }

  if (editingPurchase) revertPurchaseStock(editingPurchase);
  const items = applyPurchaseLinesToStock(purchaseDraftItems);
  const invoice = editingPurchase || {
    id: uid("purchase"),
    number: nextPurchaseNumber()
  };

  Object.assign(invoice, {
    type: "purchase-invoice",
    supplier,
    items,
    qty: items.reduce((sum, line) => sum + Number(line.qty || 0), 0),
    stockQty: items.reduce((sum, line) => sum + purchaseLineStockQty(line), 0),
    subtotal,
    discount,
    amount,
    paidAmount,
    payments,
    supplierCreditUsed,
    method,
    note,
    createdAt: targetPurchaseDate,
    updatedAt: new Date().toISOString()
  });

  if (!editingPurchase) state.purchases.unshift(invoice);
  state.purchases.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  resetPurchaseInvoiceForm();
  if (editingPurchase) {
    auditAction("purchase.edit", {
      number: invoice.number,
      subtotal,
      discount,
      amount,
      supplier,
      itemCount: items.length,
      supplierOverpayment
    });
    showToast(supplierOverpayment > 0.001
      ? `تم حفظ الفاتورة، والزيادة ${money(supplierOverpayment)} أصبحت رصيداً لك عند ${supplier}.`
      : `تم حفظ تعديل فاتورة المشتريات ${invoice.number} وتحديث مخزون الجرد.`);
  } else {
    auditAction("purchase.create", {
      number: invoice.number,
      subtotal,
      discount,
      amount,
      supplier,
      itemCount: items.length,
      supplierOverpayment
    });
    showToast(supplierOverpayment > 0.001
      ? `تم تسجيل الفاتورة، والزيادة ${money(supplierOverpayment)} أصبحت رصيداً لك عند ${supplier}.`
      : `تم تسجيل فاتورة المشتريات ${invoice.number} وإضافتها لمخزون الجرد.`);
  }
  render();
}

async function startEditPurchase(purchaseId) {
  const purchase = state.purchases.find((entry) => entry.id === purchaseId);
  if (!purchase) return;
  if (!guardClosedPeriod(purchase.createdAt, "تعديل فاتورة المشتريات")) return;
  if (purchaseDraftItems.length && editingPurchaseId !== purchaseId) {
    const confirmed = await appConfirm("استبدال فاتورة المشتريات الحالية ببيانات الفاتورة المختارة للتعديل؟");
    if (!confirmed) return;
  }

  editingPurchaseId = purchase.id;
  purchaseDraftItems = purchaseLines(purchase).map(purchaseDraftLineFromStoredLine);
  els.purchaseSupplierInput.value = purchase.supplier || "";
  if (els.purchaseDateInput) els.purchaseDateInput.value = invoiceDateInputValue(purchase);
  els.purchaseMethodInput.value = paymentMethods.includes(purchase.method) ? purchase.method : getLastPaymentMethod();
  els.purchaseNoteInput.value = purchase.note || "";
  fillPurchasePaymentInputs(normalizePurchasePayments(purchase));
  if (els.purchaseDiscountInput) {
    const discount = purchaseDiscount(purchase);
    els.purchaseDiscountInput.value = discount > 0.001 ? inputNumberValue(discount) : "";
  }
  if (els.purchaseSupplierCreditUsedInput) {
    const creditUsed = purchaseSupplierCreditUsed(purchase);
    els.purchaseSupplierCreditUsedInput.value = creditUsed > 0.001 ? inputNumberValue(creditUsed) : "";
  }
  resetPurchaseLineInputs();
  setPurchaseSection("invoice", { scroll: true });
  render();
  els.purchaseDraftBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function removePurchase(id) {
  const purchase = state.purchases.find((entry) => entry.id === id);
  if (!purchase) return;
  if (!guardClosedPeriod(purchase.createdAt, "حذف فاتورة المشتريات")) return;
  const confirmed = await appConfirm(`حذف فاتورة المشتريات ${purchase.number || ""} بقيمة ${money(purchaseAmount(purchase))}؟`);
  if (!confirmed) return;
  revertPurchaseStock(purchase);
  state.purchases = state.purchases.filter((purchase) => purchase.id !== id);
  auditAction("purchase.delete", {
    number: purchase.number || "",
    amount: purchaseAmount(purchase),
    supplier: purchase.supplier || ""
  });
  if (editingPurchaseId === id) resetPurchaseInvoiceForm();
  showToast("تم حذف فاتورة المشتريات.");
  render();
}

function resetGeneralExpenseForm() {
  editingGeneralExpenseId = null;
  const todayValue = typeof todayDateInputValue === "function"
    ? todayDateInputValue()
    : new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (els.generalExpenseForm) els.generalExpenseForm.reset();
  if (els.generalExpenseTitleInput) els.generalExpenseTitleInput.value = "";
  if (els.generalExpenseAmountInput) els.generalExpenseAmountInput.value = "";
  if (els.generalExpenseNoteInput) els.generalExpenseNoteInput.value = "";
  if (els.generalExpenseDateInput) els.generalExpenseDateInput.value = todayValue;
  if (els.generalExpenseCategoryInput) els.generalExpenseCategoryInput.value = "operations";
  setGeneralExpensePurpose("operations");
  if (els.generalExpenseMethodInput) els.generalExpenseMethodInput.value = getLastPaymentMethod();
  if (els.generalExpenseSubmitButton) els.generalExpenseSubmitButton.textContent = "تسجيل المصروف";
  if (els.generalExpenseCancelEditButton) els.generalExpenseCancelEditButton.hidden = true;
}

function selectedGeneralExpensePurpose() {
  const selected = Array.from(els.generalExpensePurposeInputs || []).find((input) => input.checked);
  return normalizeExpensePurpose(selected?.value);
}

function setGeneralExpensePurpose(purpose) {
  const normalized = normalizeExpensePurpose(purpose);
  Array.from(els.generalExpensePurposeInputs || []).forEach((input) => {
    input.checked = input.value === normalized;
  });
}

function startEditGeneralExpense(expenseId) {
  const expense = (state.expenses || []).find((entry) => entry.id === expenseId);
  if (!expense) {
    showToast("لم أجد المصروف المطلوب.");
    return;
  }
  if (!guardClosedPeriod(expense.createdAt, "تعديل مصروف ضمن فترة مغلقة")) return;

  editingGeneralExpenseId = expense.id;
  setPurchaseSection("expenses", { scroll: true });
  els.generalExpenseDateInput.value = invoiceDateInputValue(expense);
  els.generalExpenseTitleInput.value = expense.title || "";
  if (els.generalExpenseCategoryInput) els.generalExpenseCategoryInput.value = inferExpenseCategory(expense);
  setGeneralExpensePurpose(expensePurpose(expense));
  els.generalExpenseAmountInput.value = Number(expense.amount || 0) || "";
  els.generalExpenseMethodInput.value = paymentMethods.includes(expense.method) ? expense.method : getLastPaymentMethod();
  els.generalExpenseNoteInput.value = expense.note || "";
  if (els.generalExpenseSubmitButton) els.generalExpenseSubmitButton.textContent = "حفظ تعديل المصروف";
  if (els.generalExpenseCancelEditButton) els.generalExpenseCancelEditButton.hidden = false;
  els.generalExpenseForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  els.generalExpenseTitleInput.focus();
  showToast("عدل بيانات المصروف ثم اضغط حفظ تعديل المصروف.");
}

function recordGeneralExpense(event) {
  if (event) event.preventDefault();
  const title = els.generalExpenseTitleInput.value.trim();
  const amount = Math.max(Number(els.generalExpenseAmountInput.value || 0), 0);
  const method = paymentMethods.includes(els.generalExpenseMethodInput.value)
    ? els.generalExpenseMethodInput.value
    : getLastPaymentMethod();
  const category = expenseCategoryIds.includes(els.generalExpenseCategoryInput?.value)
    ? els.generalExpenseCategoryInput.value
    : "operations";
  const purpose = selectedGeneralExpensePurpose();
  const createdAt = invoiceDateFromInput(els.generalExpenseDateInput.value);
  const editingExpense = editingGeneralExpenseId
    ? (state.expenses || []).find((entry) => entry.id === editingGeneralExpenseId)
    : null;

  if (!title) {
    showToast("اكتب اسم المصروف.");
    els.generalExpenseTitleInput.focus();
    return;
  }
  if (amount <= 0) {
    showToast("اكتب مبلغ المصروف.");
    els.generalExpenseAmountInput.focus();
    return;
  }
  if (editingGeneralExpenseId && !editingExpense) {
    resetGeneralExpenseForm();
    showToast("المصروف الذي كنت تعدله غير موجود.");
    return;
  }
  if (editingExpense && !guardClosedPeriod(editingExpense.createdAt, "تعديل مصروف ضمن فترة مغلقة")) return;
  if (!guardClosedPeriod(createdAt, editingExpense ? "نقل مصروف إلى فترة مغلقة" : "تسجيل مصروف ضمن فترة مغلقة")) return;

  const expense = normalizeExpense({
    id: editingExpense ? editingExpense.id : uid("expense"),
    type: editingExpense?.type || "general",
    title,
    amount,
    method,
    category,
    purpose,
    note: els.generalExpenseNoteInput.value.trim(),
    createdAt
  });

  state.expenses = state.expenses || [];
  if (editingExpense) {
    state.expenses = state.expenses.map((entry) => entry.id === expense.id ? expense : entry);
    auditAction("expense.edit", {
      id: expense.id,
      before: {
        title: editingExpense.title,
        amount: editingExpense.amount,
        method: editingExpense.method,
        category: inferExpenseCategory(editingExpense),
        purpose: expensePurpose(editingExpense),
        note: editingExpense.note,
        createdAt: editingExpense.createdAt
      },
      after: {
        title: expense.title,
        amount: expense.amount,
        method: expense.method,
        category: expense.category,
        purpose: expense.purpose,
        note: expense.note,
        createdAt: expense.createdAt
      }
    });
  } else {
    state.expenses.unshift(expense);
    auditAction("expense.create", {
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      method: expense.method,
      category: expense.category,
      purpose: expense.purpose,
      createdAt: expense.createdAt
    });
  }
  setLastPaymentMethod(method);
  resetGeneralExpenseForm();
  showToast(editingExpense
    ? `تم تعديل مصروف ${expense.title}: ${money(expense.amount)}.`
    : `تم تسجيل مصروف ${expense.title}: ${money(expense.amount)}.`);
  render();
}

function quickSetGeneralExpenseCategory(expenseId, category) {
  const expense = (state.expenses || []).find((entry) => entry.id === expenseId);
  if (!expense || !expenseCategoryIds.includes(category)) return;
  if (!guardClosedPeriod(expense.createdAt, "تغيير تصنيف مصروف ضمن فترة مغلقة")) return;
  const previousCategory = inferExpenseCategory(expense);
  const previousPurpose = expensePurpose(expense);
  const purpose = category === "renovation" ? "renovation" : "operations";
  if (previousCategory === category && previousPurpose === purpose) {
    showToast(`المصروف مصنّف ${expenseCategoryLabel(category)} بالفعل.`);
    return;
  }
  expense.category = category;
  expense.purpose = purpose;
  auditAction("expense.quick_category_edit", {
    id: expense.id,
    title: expense.title,
    before: { category: previousCategory, purpose: previousPurpose },
    after: { category, purpose }
  });
  saveState();
  showToast(`تم تغيير ${expense.title || "المصروف"} إلى ${expenseCategoryLabel(category)}.`);
  render();
}

async function removeGeneralExpense(expenseId) {
  const expense = (state.expenses || []).find((entry) => entry.id === expenseId);
  if (!expense) return;
  if (!guardClosedPeriod(expense.createdAt, "حذف مصروف ضمن فترة مغلقة")) return;
  const confirmed = await appConfirm(`حذف مصروف "${expense.title}" بقيمة ${money(expense.amount)}؟`);
  if (!confirmed) return;

  state.expenses = (state.expenses || []).filter((entry) => entry.id !== expenseId);
  if (editingGeneralExpenseId === expenseId) resetGeneralExpenseForm();
  auditAction("expense.delete", {
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    method: expense.method,
    createdAt: expense.createdAt
  });
  showToast("تم حذف المصروف العام.");
  render();
}

function setMenuFormMode(item = null) {
  editingMenuItemId = item?.id || null;
  els.menuFormTitle.textContent = item ? "تعديل صنف" : "إضافة صنف";
  els.menuSubmitButton.textContent = item ? "حفظ التعديل" : "إضافة الصنف";
  els.menuCancelEditButton.hidden = !item;
  if (els.menuComponentSearchInput) els.menuComponentSearchInput.value = "";

  if (!item) {
    menuComponentDraft = [];
    menuOptionsDraft = [];
    els.menuForm.reset();
    els.menuOperatingCostTypeInput.value = "other";
    renderMenuComponentsEditor();
    renderMenuOptionsEditor();
    return;
  }

  menuComponentDraft = normalizeMenuComponents(item.components || [], item.id);
  menuOptionsDraft = normalizeMenuOptions(item.options || []);
  els.menuNameInput.value = item.name || "";
  els.menuPriceInput.value = inputNumberValue(item.price);
  els.menuCostInput.value = inputNumberValue(item.cost);
  if (els.menuManualLastUnitCostInput) els.menuManualLastUnitCostInput.value = inputNumberValue(item.manualLastUnitCost);
  els.menuOperatingCostInput.value = inputNumberValue(item.operatingCost);
  els.menuOperatingCostTypeInput.value = operatingCostTypes.includes(item.operatingCostType) ? item.operatingCostType : "other";
  els.menuCategoryInput.value = item.category || "";
  renderMenuComponentsEditor();
  renderMenuOptionsEditor();
  els.menuNameInput.focus();
}

function editMenuItem(itemId) {
  const item = findMenuItem(itemId);
  if (!item) return;
  setMenuFormMode(item);
  render();
}

function saveMenuItem(event) {
  event.preventDefault();
  const name = els.menuNameInput.value.trim();
  const price = Number(els.menuPriceInput.value || 0);
  const costInput = els.menuCostInput.value.trim();
  const cost = costInput === "" ? 0 : Number(costInput);
  const manualLastUnitCostInput = els.menuManualLastUnitCostInput?.value.trim() || "";
  const manualLastUnitCost = manualLastUnitCostInput === "" ? 0 : Number(manualLastUnitCostInput);
  const operatingCostInput = els.menuOperatingCostInput.value.trim();
  const operatingCost = operatingCostInput === "" ? 0 : Number(operatingCostInput);
  const operatingCostType = operatingCostTypes.includes(els.menuOperatingCostTypeInput.value)
    ? els.menuOperatingCostTypeInput.value
    : "other";
  const category = els.menuCategoryInput.value.trim();
  const components = normalizeMenuComponents(menuComponentDraft, editingMenuItemId || "");
  const options = normalizeMenuOptions(menuOptionsDraft);
  if (!name || !category || price <= 0 || cost < 0 || manualLastUnitCost < 0 || operatingCost < 0 || (!components.length && costInput === "" && operatingCostInput === "")) {
    showToast("أكمل بيانات الصنف أو أضف مكونات من المخزون.");
    return;
  }

  if (editingMenuItemId) {
    const item = findMenuItem(editingMenuItemId);
    if (!item) {
      showToast("الصنف غير موجود.");
      setMenuFormMode();
      render();
      return;
    }

    Object.assign(item, { name, price, cost, manualLastUnitCost, operatingCost, operatingCostType, category, components, options });
    setMenuFormMode();
    showToast("تم حفظ تعديل الصنف.");
    render();
    return;
  }

  state.menu.push({ id: uid("item"), name, price, cost, manualLastUnitCost, operatingCost, operatingCostType, category, components, options });
  setMenuFormMode();
  showToast("تمت إضافة الصنف.");
  render();
}

async function removeMenuItem(itemId) {
  const usedInOpenOrder = Object.values(state.openOrders).some((order) => order.items.some((item) => item.id === itemId));
  if (usedInOpenOrder) {
    showToast("الصنف موجود في طلب مفتوح، احذفه من الطلب أولاً.");
    return;
  }
  const usedAsComponent = state.menu.some((item) => item.id !== itemId && menuItemComponents(item).some((component) => component.itemId === itemId));
  if (usedAsComponent) {
    showToast("الصنف مستخدم كمكون في صنف آخر. احذفه من المكونات أولاً.");
    return;
  }
  const item = findMenuItem(itemId);
  const confirmed = await appConfirm(`حذف صنف "${item ? item.name : ""}" من المنيو؟`);
  if (!confirmed) return;
  state.menu = state.menu.filter((item) => item.id !== itemId);
  if (editingMenuItemId === itemId) setMenuFormMode();
  showToast("تم حذف الصنف.");
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
