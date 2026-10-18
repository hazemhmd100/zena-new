// ═══ دفتر المقهى ═══ 12-init.js — ربط الأحداث وتشغيل التطبيق
// (مقسوم من app.js — الأسطر 5519-5929)

function wireEvents() {
  let interactionSaveTimer = null;
  const syncVisibleDrafts = () => {
    if (state?.view === "pos" && typeof syncOrderFields === "function") syncOrderFields();
  };
  const saveAfterInteraction = () => {
    clearTimeout(interactionSaveTimer);
    interactionSaveTimer = setTimeout(() => {
      try {
        syncVisibleDrafts();
        rememberUiLocation();
        saveUiState();
        saveState({ backup: false });
      } catch (error) {}
    }, 250);
  };
  const saveUiNow = () => {
    try {
      syncVisibleDrafts();
      rememberUiLocation();
      saveUiState();
      saveState({ immediate: true, backup: false });
    } catch (error) {}
  };

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      switchView(tab.dataset.view);
    });
  });

  // الشاشة الرئيسية: أزرار وبطاقات الانتقال السريع
  const dashboardContent = document.getElementById("dashboardContent");
  if (dashboardContent) {
    dashboardContent.addEventListener("click", (event) => {
      const goButton = event.target.closest("[data-go-view]");
      if (goButton) switchView(goButton.dataset.goView);
    });
  }

  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest("button, [role='button'], .customer-card, .ledger-row, .settings-row, .purchase-line-card, .invoice-card, .cashbox-action-card");
    if (!target || target.matches("button:disabled, [aria-disabled='true']")) return;
    target.classList.add("is-pressed");
    window.setTimeout(() => target.classList.remove("is-pressed"), 220);
  });

  els.tablesGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-table]");
    if (button) selectTable(button.dataset.table);
  });

  const tableSearchInput = document.getElementById("tableSearchInput");
  if (tableSearchInput) tableSearchInput.addEventListener("input", renderTables);

  els.newOrderButton.addEventListener("click", () => {
    startNewOrderForTable(state.selectedTable);
    render();
  });

  els.addTableButton.addEventListener("click", addTable);
  if (els.tableMergeButton) els.tableMergeButton.addEventListener("click", openTableMergePicker);
  els.deleteTableButton.addEventListener("click", deleteSelectedTable);

  const syncTableNameInput = (notify = false, revert = false) => {
    const saved = setTableLabel(state.selectedTable, els.tableNameInput.value, { notify });
    els.tableNameInput.classList.toggle("is-invalid", !saved);
    els.tableNameInput.setAttribute("aria-invalid", saved ? "false" : "true");
    if (saved) {
      renderTables();
      saveState();
      return;
    }
    if (revert) {
      els.tableNameInput.value = getTableLabel(state.selectedTable);
      els.tableNameInput.classList.remove("is-invalid");
      els.tableNameInput.setAttribute("aria-invalid", "false");
    }
  };
  els.tableNameInput.addEventListener("input", () => syncTableNameInput(false, false));
  els.tableNameInput.addEventListener("change", () => syncTableNameInput(true, true));
  els.tableNameInput.addEventListener("blur", () => syncTableNameInput(true, true));

  els.customerSelect.addEventListener("change", () => {
    const order = getOpenOrder();
    const customer = getCustomer(els.customerSelect.value);
    if (!customer) {
      order.customerId = null;
      order.customerName = "";
      order.customerPhone = "";
      els.customerNameInput.value = "";
      els.customerPhoneInput.value = "";
    } else {
      order.customerId = customer.id;
      order.customerName = customer.name;
      order.customerPhone = customer.phone || "";
      selectedCustomerId = customer.id;
    }
    render();
  });

  els.customerSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggest-customer]");
    if (button) chooseSuggestedCustomer(button.dataset.suggestCustomer);
  });

  els.saveCustomerButton.addEventListener("click", () => {
    const customer = upsertCustomer(els.customerNameInput.value, { phone: els.customerPhoneInput.value.trim() });
    if (!customer) {
      showToast("اكتب اسم العميل أولاً.");
      return;
    }
    const order = getOpenOrder();
    order.customerId = customer.id;
    order.customerName = customer.name;
    order.customerPhone = customer.phone || "";
    selectedCustomerId = customer.id;
  showToast("تم حفظ العميل في الطلب.");
    render();
  });
  if (els.posCustomerAccountCard) {
    els.posCustomerAccountCard.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pos-customer-action]");
      if (!button) return;
      if (button.dataset.posCustomerAction === "settle") {
        settlePosCustomerAccount(button.dataset.posCustomer);
      } else {
        openPosCustomerAccount(button.dataset.posCustomer);
      }
    });
  }

  window.addEventListener("beforeunload", saveUiNow);
  window.addEventListener("pagehide", saveUiNow);
  window.addEventListener("blur", saveUiNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveUiNow();
  });
  document.addEventListener("input", saveAfterInteraction);
  document.addEventListener("change", saveAfterInteraction);
  document.addEventListener("click", (event) => {
    if (event.target.closest("button, [role='button'], .customer-card, .table-button, .menu-item, .ledger-row, .settings-row")) {
      saveAfterInteraction();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") saveAfterInteraction();
  });
  // لو المتصفح رجّع هالتبويب من ذاكرته (bfcache) بدل ما يفتحه من جديد — البيانات
  // بالذاكرة ممكن تكون قديمة (من قبل ما يتسكر التبويب)، فلازم تحديث كامل يضمن
  // قراءة آخر بيانات محفوظة، وإلا لو المستخدم عدّل شي بهالتبويب رح يمسح التعديلات الأحدث.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (els.customerReminderModal && !els.customerReminderModal.hidden) {
      closeBulkDebtReminders();
      return;
    }
    if (els.customerEditModal && !els.customerEditModal.hidden) {
      closeCustomerEditCard();
    }
  });

  els.menuCategories.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    selectedCategory = button.dataset.category;
    renderMenu();
    rememberUiLocation();
    saveUiState();
    saveState({ backup: false });
  });

  if (els.quickMenuItems) {
    els.quickMenuItems.addEventListener("click", (event) => {
      const button = event.target.closest("[data-quick-menu-item]");
      if (!button) return;
      addQuickSaleItem(button.dataset.quickMenuItem, button);
    });

    els.quickMenuItems.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const button = event.target.closest("[data-quick-menu-item]");
      if (!button) return;
      event.preventDefault();
      addQuickSaleItem(button.dataset.quickMenuItem, button);
    });
  }

  els.menuGrid.addEventListener("click", (event) => {
    const comboCard = event.target.closest("[data-combo-id]");
    if (comboCard) {
      addComboToOrder(comboCard.dataset.comboId);
      return;
    }

    const sizePickerButton = event.target.closest("[data-menu-size-picker]");
    if (sizePickerButton) {
      event.stopPropagation();
      const item = sizePickerButton.closest("[data-menu-item]");
      addMenuItemFromGrid(sizePickerButton.dataset.menuSizePicker, undefined, item, true);
      return;
    }

    const optionButton = event.target.closest("[data-menu-option]");
    if (optionButton) {
      event.stopPropagation();
      addMenuItemFromGrid(optionButton.dataset.menuItem, optionButton.dataset.menuOption || null);
      return;
    }

    const button = event.target.closest("[data-menu-item]");
    if (button) addMenuItemFromGrid(button.dataset.menuItem, undefined, button);
  });

  els.menuGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("[data-menu-item]");
    if (!item || event.target.closest("[data-menu-option]")) return;
    event.preventDefault();
    if (event.target.closest("[data-menu-size-picker]")) {
      addMenuItemFromGrid(item.dataset.menuItem, undefined, item, true);
      return;
    }
    addMenuItemFromGrid(item.dataset.menuItem, undefined, item);
  });

  els.orderItems.addEventListener("click", (event) => {
    const button = event.target.closest("[data-line-action]");
    if (button) updateLine(button.dataset.item, button.dataset.lineAction);
  });

  els.clearOrderButton.addEventListener("click", () => {
    const order = getOpenOrder();
    releaseSoldItemsReservedStock(order.items);
    order.items = [];
    order.discount = 0;
    order.payments = { cash: 0, bank: 0, wallet: 0 };
    order.changeReturned = 0;
    order.note = "";
    render();
  });

  const previewOrderChange = () => {
    syncOrderFields();
    renderStats();
    renderTables();
    renderOrderTotals();
    saveState();
  };

  els.customerNameInput.addEventListener("input", () => {
    syncCustomerFromNameInput();
    renderCustomerSuggestions();
    previewOrderChange();
  });

  els.customerNameInput.addEventListener("focus", renderCustomerSuggestions);

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#customerNameInput") && !event.target.closest("#customerSuggestions")) {
      els.customerSuggestions.classList.remove("is-visible");
    }
  });

  [els.customerPhoneInput, els.discountInput, els.paymentAmountInput, els.changeReturnedInput, els.noteInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", previewOrderChange);
  });
  els.paymentMethodInput.addEventListener("change", previewOrderChange);
  els.settlementMethodInput.addEventListener("change", () => {
    setLastPaymentMethod(els.settlementMethodInput.value);
    saveState();
  });
  els.purchaseMethodInput.addEventListener("change", () => {
    setLastPaymentMethod(els.purchaseMethodInput.value);
    saveState();
  });

  els.menuSearchInput.addEventListener("input", renderMenu);
  els.menuSearchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const firstItem = els.menuGrid.querySelector("[data-menu-item]");
    if (!firstItem) return;
    event.preventDefault();
    addMenuItemFromGrid(firstItem.dataset.menuItem, undefined, firstItem);
  });
  document.addEventListener("keydown", (event) => {
    if (state.view !== "pos" || event.defaultPrevented) return;
    const active = event.target;
    const tag = active?.tagName || "";
    const isEditing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if (event.key === "/" && !isEditing) {
      event.preventDefault();
      focusMenuSearchSoon(true);
    } else if (event.key === "Escape" && active === els.menuSearchInput && els.menuSearchInput.value) {
      event.preventDefault();
      els.menuSearchInput.value = "";
      renderMenu();
    }
  });
  els.customItemForm.addEventListener("submit", addCustomItem);
  els.closeInvoiceButton.addEventListener("click", closeInvoice);
  els.quickPayFullButton.addEventListener("click", quickPayFillFull);
  const splitBillButton = document.getElementById("splitBillButton");
  if (splitBillButton) splitBillButton.addEventListener("click", openSplitBill);
  els.printButton.addEventListener("click", printLastInvoice);
  els.customerAddForm.addEventListener("submit", addCustomerFromCustomersPage);
  const renderCustomersFresh = () => { customerViewLimit = CUSTOMER_VIEW_STEP; renderCustomers(); };
  els.customerSearchInput.addEventListener("input", renderCustomersFresh);
  els.customerStatusFilter.addEventListener("change", renderCustomersFresh);
  els.customerStatementButton.addEventListener("click", printCustomerStatement);
  if (els.customerExcelExportButton) els.customerExcelExportButton.addEventListener("click", () => {
    if (requireManagerPermission("customer.export", "تصدير العملاء")) exportCustomersExcel();
  });
  if (els.customerDebtPrintButton) els.customerDebtPrintButton.addEventListener("click", () => {
    if (requireManagerPermission("customer.debtPrint", "طباعة قائمة الديون")) printCustomerDebtList();
  });
  if (els.customerBulkReminderButton) els.customerBulkReminderButton.addEventListener("click", () => {
    if (requireManagerPermission("customer.bulkReminder", "رسائل الديون الجماعية")) openBulkDebtReminders();
  });
  if (els.customerExcelImportInput) els.customerExcelImportInput.addEventListener("change", (event) => {
    if (!requireManagerPermission("customer.import", "استيراد العملاء")) {
      event.target.value = "";
      return;
    }
    importCustomersExcel(event.target.files[0]);
  });
  const customerWhatsappButton = document.getElementById("customerWhatsappButton");
  if (customerWhatsappButton) customerWhatsappButton.addEventListener("click", () => whatsappReminder(selectedCustomerId));
  if (els.customerEditForm) els.customerEditForm.addEventListener("submit", saveCustomerEditCard);
  if (els.customerMergeToggleButton) els.customerMergeToggleButton.addEventListener("click", () => {
    if (requireManagerPermission("customer.merge", "دمج العملاء")) toggleCustomerMergeBox();
  });
  if (els.customerMergeApplyButton) els.customerMergeApplyButton.addEventListener("click", () => {
    if (requireManagerPermission("customer.merge", "دمج العملاء")) mergeEditingCustomer();
  });
  if (els.customerEditBackdrop) els.customerEditBackdrop.addEventListener("click", closeCustomerEditCard);
  if (els.customerEditCloseButton) els.customerEditCloseButton.addEventListener("click", closeCustomerEditCard);
  if (els.customerEditCancelButton) els.customerEditCancelButton.addEventListener("click", closeCustomerEditCard);
  if (els.customerReminderBackdrop) els.customerReminderBackdrop.addEventListener("click", closeBulkDebtReminders);
  if (els.customerReminderCloseButton) els.customerReminderCloseButton.addEventListener("click", closeBulkDebtReminders);
  if (els.customerReminderCancelButton) els.customerReminderCancelButton.addEventListener("click", closeBulkDebtReminders);
  if (els.customerReminderCopyButton) els.customerReminderCopyButton.addEventListener("click", copyBulkDebtReminders);
  if (els.customerReminderList) {
    els.customerReminderList.addEventListener("click", (event) => {
      const copyButton = event.target.closest("[data-copy-reminder]");
      if (copyButton) copyCustomerDebtReminder(copyButton.dataset.copyReminder);
    });
  }
  els.customersList.addEventListener("click", (event) => {
    const moreCustomersButton = event.target.closest("[data-show-more-customers]");
    if (moreCustomersButton) {
      customerViewLimit += CUSTOMER_VIEW_STEP;
      renderCustomers();
      return;
    }

    const waButton = event.target.closest("[data-whatsapp-customer]");
    if (waButton) {
      whatsappReminder(waButton.dataset.whatsappCustomer);
      return;
    }

    const settleButton = event.target.closest("[data-settle-customer]");
    if (settleButton) {
      startCustomerSettlement(settleButton.dataset.settleCustomer);
      return;
    }

    const editButton = event.target.closest("[data-edit-customer]");
    if (editButton) {
      editCustomer(editButton.dataset.editCustomer);
      return;
    }

    const deleteButton = event.target.closest("[data-remove-customer]");
    if (deleteButton) {
      if (!requireManagerPermission("customer.delete", "حذف العميل")) return;
      deleteCustomer(deleteButton.dataset.removeCustomer);
      return;
    }

    const button = event.target.closest("[data-customer-card]");
    if (!button) return;
    selectedCustomerId = button.dataset.customerCard;
    render();
  });
  els.settlementForm.addEventListener("submit", recordSettlement);
  if (els.settlementFillBalanceButton) els.settlementFillBalanceButton.addEventListener("click", fillSettlementBalance);
  els.cpAddButton.addEventListener("click", () => {
    if (!requireManagerPermission("customer.price", "تعديل الأسعار الخاصة")) return;
    const itemId = els.cpItemSelect.value;
    const price = Number(els.cpPriceInput.value);
    if (!selectedCustomerId) { showToast("اختر عميل أولاً."); return; }
    if (!itemId) { showToast("اختر صنف."); return; }
    if (isNaN(price) || price < 0) { showToast("اكتب سعر صحيح."); return; }
    setCustomerItemPrice(selectedCustomerId, itemId, price);
    els.cpPriceInput.value = "";
    els.cpItemSelect.value = "";
    showToast("تم حفظ السعر الخاص.");
    saveState();
    renderCustomerPrices();
    renderMenu();
  });

  if (els.cpTransferButton) {
    els.cpTransferButton.addEventListener("click", transferSelectedCustomerPrices);
  }

  els.customerPricesList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cp-remove]");
    if (!btn || !selectedCustomerId) return;
    if (!requireManagerPermission("customer.price", "تعديل الأسعار الخاصة")) return;
    removeCustomerItemPrice(selectedCustomerId, btn.dataset.cpRemove);
    showToast("تم حذف السعر الخاص.");
    saveState();
    renderCustomerPrices();
    renderMenu();
  });

  if (els.customerKpis) els.customerKpis.addEventListener("click", (event) => {
    const redeemButton = event.target.closest("[data-redeem-loyalty]");
    if (redeemButton) redeemLoyalty(redeemButton.dataset.redeemLoyalty);
  });

  els.ledgerList.addEventListener("click", (event) => {
    const moreLedgerButton = event.target.closest("[data-show-more-customer-ledger]");
    if (moreLedgerButton) {
      customerLedgerViewLimit += CUSTOMER_LEDGER_STEP;
      renderCustomerDetail();
      return;
    }

    const editButton = event.target.closest("[data-edit-customer-ledger]");
    if (editButton) {
      if (!requireManagerPermission("invoice.edit", "تعديل الفاتورة")) return;
      state.view = "invoices";
      render();
      startEditInvoice(editButton.dataset.editCustomerLedger);
      return;
    }

    const transferButton = event.target.closest("[data-transfer-customer-ledger]");
    if (transferButton) {
      if (!requireManagerPermission("invoice.edit", "نقل الفاتورة")) return;
      state.view = "invoices";
      render();
      startTransferInvoice(transferButton.dataset.transferCustomerLedger);
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-customer-ledger]");
    if (cancelButton) {
      if (!requireManagerPermission("invoice.cancel", "إلغاء الفاتورة")) return;
      cancelInvoice(cancelButton.dataset.cancelCustomerLedger);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-customer-ledger]");
    if (deleteButton) {
      if (!requireManagerPermission("invoice.delete", "حذف الفاتورة")) return;
      deleteInvoice(deleteButton.dataset.deleteCustomerLedger);
    }
  });

  els.settlementModePayment.addEventListener("click", () => {
    settlementDebtMode = false;
    settlementOffsetMode = false;
    applySettlementMode(getCustomer(selectedCustomerId));
  });
  els.settlementModeDebt.addEventListener("click", () => {
    if (!requireManagerPermission("customer.manualDebt", "إضافة دين يدوي")) return;
    settlementDebtMode = true;
    settlementOffsetMode = false;
    applySettlementMode(getCustomer(selectedCustomerId));
  });
  els.settlementModeOffset.addEventListener("click", () => {
    if (!requireManagerPermission("customer.manualDebt", "تسجيل مقاصة للعميل")) return;
    settlementDebtMode = false;
    settlementOffsetMode = true;
    applySettlementMode(getCustomer(selectedCustomerId));
  });
  const refreshSettlementLossHint = () => updateSettlementLossHint(getCustomer(selectedCustomerId));
  els.settlementAmountInput.addEventListener("input", refreshSettlementLossHint);
  els.settlementDiscountInput.addEventListener("input", refreshSettlementLossHint);
  // شارة "مسح الفلاتر" تظهر بس لما يكون في فلتر شغال، وأزرار الفترة السريعة تتظلل حسب التواريخ الحالية
  const refreshInvoiceFilterChips = () => {
    if (!els.invoiceQuickRanges) return;
    const from = els.invoiceDateFromInput.value;
    const to = els.invoiceDateToInput.value;
    const today = todayDateInputValue();
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
    const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
    const activeRange =
      (from === today && to === today) ? "today"
      : (from === yesterday && to === yesterday) ? "yesterday"
      : (from === weekStart && to === today) ? "week"
      : (from === monthStartInputValue() && to === today) ? "month"
      : (!from && !to) ? "all"
      : "";
    els.invoiceQuickRanges.querySelectorAll("[data-invoice-quick-range]").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.invoiceQuickRange === activeRange);
    });
    if (els.invoiceRecordQuickFilters) {
      els.invoiceRecordQuickFilters.querySelectorAll("[data-invoice-record-filter]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.invoiceRecordFilter === els.invoiceStatusFilter.value);
      });
    }
    if (els.invoiceClearFiltersButton) {
      const hasFilter = Boolean(els.invoiceSearchInput.value.trim() || els.invoiceStatusFilter.value !== "all" || from || to);
      els.invoiceClearFiltersButton.hidden = !hasFilter;
    }
  };
  const renderInvoicesFresh = () => { invoiceViewLimit = INVOICE_VIEW_STEP; renderInvoices(); refreshInvoiceFilterChips(); };
  els.invoiceSearchInput.addEventListener("input", renderInvoicesFresh);
  els.invoiceStatusFilter.addEventListener("change", renderInvoicesFresh);
  els.invoiceDateFromInput.addEventListener("change", renderInvoicesFresh);
  els.invoiceDateToInput.addEventListener("change", renderInvoicesFresh);
  els.invoiceDateSortInput.addEventListener("change", renderInvoicesFresh);
  if (els.invoiceQuickRanges) {
    els.invoiceQuickRanges.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-invoice-quick-range]");
      if (!chip) return;
      const range = chip.dataset.invoiceQuickRange;
      const today = todayDateInputValue();
      if (range === "today") {
        els.invoiceDateFromInput.value = today;
        els.invoiceDateToInput.value = today;
      } else if (range === "yesterday") {
        const d = new Date(); d.setDate(d.getDate() - 1);
        const y = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        els.invoiceDateFromInput.value = y;
        els.invoiceDateToInput.value = y;
      } else if (range === "week") {
        const d = new Date(); d.setDate(d.getDate() - 6);
        els.invoiceDateFromInput.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        els.invoiceDateToInput.value = today;
      } else if (range === "month") {
        els.invoiceDateFromInput.value = monthStartInputValue();
        els.invoiceDateToInput.value = today;
      } else {
        els.invoiceDateFromInput.value = "";
        els.invoiceDateToInput.value = "";
      }
      renderInvoicesFresh();
    });
  }
  if (els.invoiceRecordQuickFilters) {
    els.invoiceRecordQuickFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-invoice-record-filter]");
      if (!button) return;
      els.invoiceStatusFilter.value = button.dataset.invoiceRecordFilter || "all";
      renderInvoicesFresh();
    });
  }
  if (els.invoiceClearFiltersButton) {
    els.invoiceClearFiltersButton.addEventListener("click", () => {
      els.invoiceSearchInput.value = "";
      els.invoiceStatusFilter.value = "all";
      els.invoiceDateFromInput.value = "";
      els.invoiceDateToInput.value = "";
      renderInvoicesFresh();
    });
  }
  els.invoiceEditForm.addEventListener("submit", saveEditedInvoice);
  els.invoiceEditCancelButton.addEventListener("click", cancelInvoiceEdit);
  if (els.invoiceTransferCustomerInput) els.invoiceTransferCustomerInput.addEventListener("change", applyInvoiceTransferCustomer);
  if (els.invoiceTransferApplyButton) els.invoiceTransferApplyButton.addEventListener("click", applyInvoiceTransferCustomer);
  els.invoiceEditCustomerInput.addEventListener("input", clearInvoiceTransferCustomerSelection);
  els.invoiceEditAddMenuItemButton.addEventListener("click", addInvoiceEditMenuItem);
  els.invoiceEditAddCustomButton.addEventListener("click", addInvoiceEditCustomItem);
  els.invoiceEditItemsList.addEventListener("input", (event) => {
    if (event.target.closest("[data-invoice-edit-name], [data-invoice-edit-qty], [data-invoice-edit-price]")) {
      updateInvoiceEditItemTotals(Boolean(event.target.closest("[data-invoice-edit-qty], [data-invoice-edit-price]")));
    }
  });
  els.invoiceEditItemsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-invoice-edit-item]");
    if (button) removeInvoiceEditItem(button.dataset.removeInvoiceEditItem);
  });
  const refreshReportsFully = () => { cashLedgerViewLimit = CASH_LEDGER_STEP; renderReports(); renderTopItemsAndPeakHours(); };
  els.reportDateFromInput.addEventListener("change", refreshReportsFully);
  document.querySelector("#reportingStartButton")?.addEventListener("click", startReportingPeriod);
  document.querySelector("#reportingStartNowButton")?.addEventListener("click", () => {
    document.querySelector("#reportingStartDateInput").value = localDateTimeKey(new Date().toISOString());
  });
  document.querySelector("#reportingStartCancelButton")?.addEventListener("click", () => updateReportingStart(null));
  document.querySelector("#reportingHistoryButton")?.addEventListener("click", () => applyReportingPeriod("history"));
  const reportQuickRanges = document.getElementById("reportQuickRanges");
  if (reportQuickRanges) reportQuickRanges.addEventListener("click", (event) => {
    const button = event.target.closest("[data-report-quick-range]");
    if (!button) return;
    const quickRange = button.dataset.reportQuickRange;
    if (quickRange === "current") { applyReportingPeriod("current"); return; }
    if (quickRange === "all") { applyReportingPeriod("all"); return; }
    if (quickRange === "custom") {
      const details = document.getElementById("reportAdvancedFilters");
      if (details) details.open = true;
      els.reportDateFromInput?.focus();
      return;
    }
    const today = todayDateInputValue();
    els.reportDateFromInput.value = quickRange === "month" ? monthStartInputValue() : today;
    els.reportDateToInput.value = today;
    if (els.reportTimeFromInput) els.reportTimeFromInput.value = "";
    if (els.reportTimeToInput) els.reportTimeToInput.value = "";
    refreshReportsFully();
  });
  els.reportDateToInput.addEventListener("change", refreshReportsFully);
  if (els.reportTimeFromInput) els.reportTimeFromInput.addEventListener("change", refreshReportsFully);
  if (els.reportTimeToInput) els.reportTimeToInput.addEventListener("change", refreshReportsFully);
  if (els.reportClearTimeButton) els.reportClearTimeButton.addEventListener("click", () => {
    els.reportTimeFromInput.value = "";
    els.reportTimeToInput.value = "";
    refreshReportsFully();
  });
  els.dayReportButton.addEventListener("click", printDayReport);
  document.querySelector("#printPartnerMeetingButton")?.addEventListener("click", printPartnerMeeting);
  document.querySelector("#handoverAllButton")?.addEventListener("click", () => applyReportingPeriod("all"));
  document.querySelector("#printHandoverButton")?.addEventListener("click", printCafeHandover);
  document.querySelector("#saveHandoverButton")?.addEventListener("click", saveCafeHandover);
  const reportSectionTabs = document.getElementById("reportSectionTabs");
  if (reportSectionTabs) reportSectionTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-report-section-tab]");
    if (button) setReportSection(button.dataset.reportSectionTab, { scroll: true });
  });
  document.querySelectorAll("[data-report-special]").forEach((button) => {
    button.addEventListener("click", () => {
      const special = button.dataset.reportSpecial;
      if (special === "partners") setReportSection("partners", { scroll: true });
      if (special === "handover") setReportSection("handover", { scroll: true });
    });
  });
  const reportSoldItemsJumpButton = document.getElementById("reportSoldItemsJumpButton");
  if (reportSoldItemsJumpButton) reportSoldItemsJumpButton.addEventListener("click", () => {
    setReportSection("sales");
    document.getElementById("reportSoldItemsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  if (els.cashLedgerList) els.cashLedgerList.addEventListener("click", (event) => {
    const moreButton = event.target.closest("[data-show-more-cash-ledger]");
    if (moreButton) {
      cashLedgerViewLimit += CASH_LEDGER_STEP;
      renderCashLedger(selectedReportRange());
      return;
    }
    const goButton = event.target.closest("[data-go-view]");
    if (goButton) switchView(goButton.dataset.goView);
  });
  if (els.partnerAddForm) els.partnerAddForm.addEventListener("submit", addPartner);
  if (els.partnersList) {
    els.partnersList.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-partner]");
      if (removeButton) deletePartner(removeButton.dataset.removePartner);
    });
    els.partnersList.addEventListener("change", (event) => {
      const shareInput = event.target.closest("[data-partner-share]");
      if (shareInput) { updatePartnerShare(shareInput.dataset.partnerShare, shareInput.value); return; }
      const workerSelect = event.target.closest("[data-partner-worker]");
      if (workerSelect) updatePartnerWorker(workerSelect.dataset.partnerWorker, workerSelect.value);
    });
  }
  if (els.partnerFundingForm) els.partnerFundingForm.addEventListener("submit", recordPartnerFunding);
  if (els.partnerFundingCancelButton) els.partnerFundingCancelButton.addEventListener("click", () => {
    resetPartnerFundingForm({ partnerId: els.partnerFundingPartnerInput?.value });
    renderPartnerFundingWorkspace();
  });
  if (els.partnerFundingPartnerInput) els.partnerFundingPartnerInput.addEventListener("change", () => {
    if (editingPartnerFundingId) resetPartnerFundingForm({ partnerId: els.partnerFundingPartnerInput.value });
    renderPartnerFundingWorkspace();
  });
  if (els.partnerFundingLedger) els.partnerFundingLedger.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-partner-funding]");
    if (editButton) { startEditPartnerFunding(editButton.dataset.editPartnerFunding); return; }
    const deleteButton = event.target.closest("[data-delete-partner-funding]");
    if (deleteButton) deletePartnerFunding(deleteButton.dataset.deletePartnerFunding);
  });
  if (els.partnerWithdrawalForm) els.partnerWithdrawalForm.addEventListener("submit", recordPartnerWithdrawal);
  if (els.partnerWithdrawalCancelButton) els.partnerWithdrawalCancelButton.addEventListener("click", () => {
    resetPartnerWithdrawalForm({ partnerId: els.partnerWithdrawalPartnerInput?.value });
    renderPartnerWithdrawalWorkspace(selectedReportRange());
  });
  if (els.partnerWithdrawalPartnerInput) els.partnerWithdrawalPartnerInput.addEventListener("change", () => {
    if (editingPartnerWithdrawalId) resetPartnerWithdrawalForm({ partnerId: els.partnerWithdrawalPartnerInput.value });
    renderPartnerWithdrawalWorkspace(selectedReportRange());
  });
  if (els.partnerWithdrawalLedger) els.partnerWithdrawalLedger.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-partner-withdrawal]");
    if (editButton) { startEditPartnerWithdrawal(editButton.dataset.editPartnerWithdrawal); return; }
    const deleteButton = event.target.closest("[data-delete-partner-withdrawal]");
    if (deleteButton) deletePartnerWithdrawal(deleteButton.dataset.deletePartnerWithdrawal);
  });
  if (els.partnersDistribution) {
    els.partnersDistribution.addEventListener("click", (event) => {
      const sourceBtn = event.target.closest("[data-partner-source]");
      if (sourceBtn) { setPartnerDistributionSource(sourceBtn.dataset.partnerSource); return; }
      const basisBtn = event.target.closest("[data-partner-basis]");
      if (basisBtn) setPartnerDistributionBasis(basisBtn.dataset.partnerBasis);
    });
  }
  els.backupNowButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.export", "تصدير النسخة الاحتياطية")) exportData();
  });
  els.backupLaterButton.addEventListener("click", snoozeBackupReminder);
  els.lowStockThresholdInput.addEventListener("change", () => {
    state.lowStockThreshold = Math.max(0, Number(els.lowStockThresholdInput.value || 0));
    saveState();
    renderLowStock();
  });
  els.expenseForm.addEventListener("submit", recordExpense);
  if (els.expenseCancelEditButton) {
    els.expenseCancelEditButton.addEventListener("click", resetWorkerConsumptionForm);
  }
  if (els.consumptionTypeToggle) {
    els.consumptionTypeToggle.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-consumption-type]");
      if (btn) setConsumptionMode(btn.dataset.consumptionType);
    });
  }
  if (els.expenseNoItemToggle) els.expenseNoItemToggle.addEventListener("change", renderConsumptionTypeState);
  els.workerItemInput.addEventListener("change", fillWorkerItemCost);
  els.expenseMethodInput.addEventListener("change", () => {
    setLastPaymentMethod(els.expenseMethodInput.value);
    saveState();
  });
  els.workerTransactionForm.addEventListener("submit", recordWorkerTransaction);
  if (els.workerTransactionCancelEditButton) {
    els.workerTransactionCancelEditButton.addEventListener("click", resetWorkerTransactionForm);
  }
  if (els.workerLeaveForm) els.workerLeaveForm.addEventListener("submit", recordWorkerLeave);
  els.workerTransactionTypeInput.addEventListener("change", () => {
    state.lastWorkerTransactionType = workerTransactionTypeLabels[els.workerTransactionTypeInput.value]
      ? els.workerTransactionTypeInput.value
      : WORKER_ADVANCE_TYPE;
    saveState();
    renderWorkerTransactionTypeState(workerMonthlyAccount(getWorker(selectedWorkerId)));
  });
  els.workerTransactionMethodInput.addEventListener("change", () => {
    setLastPaymentMethod(els.workerTransactionMethodInput.value);
    saveState();
  });
  els.workerAddForm.addEventListener("submit", addWorkerFromWorkersPage);
  els.workerSearchInput.addEventListener("input", renderExpenses);
  els.workerStatusFilter.addEventListener("change", renderExpenses);
  if (els.workerLedgerFilterInput) {
    els.workerLedgerFilterInput.addEventListener("change", () => {
      workerLedgerViewLimit = WORKER_LEDGER_STEP;
      renderWorkerDetail();
    });
  }
  document.querySelectorAll("[data-worker-section-tab]").forEach((button) => {
    button.addEventListener("click", () => setWorkerSection(button.dataset.workerSectionTab));
  });
  if (els.workerOwnPeriodInput) els.workerOwnPeriodInput.addEventListener("change", () => setWorkerOwnPeriod(els.workerOwnPeriodInput.value));
  if (els.workerOwnPeriodResetButton) els.workerOwnPeriodResetButton.addEventListener("click", resetWorkerOwnPeriod);
  if (els.workerEndDateInput) els.workerEndDateInput.addEventListener("change", () => setWorkerEndDate(els.workerEndDateInput.value));
  if (els.workerEndDateClearButton) els.workerEndDateClearButton.addEventListener("click", clearWorkerEndDate);
  if (els.workerPartnerActions) {
    els.workerPartnerActions.addEventListener("click", (event) => {
      const button = event.target.closest("[data-worker-partner-action]");
      if (!button) return;
      if (button.dataset.workerPartnerAction === "open") openWorkerPartner(selectedWorkerId);
      else markWorkerAsPartner(selectedWorkerId);
    });
  }
  if (els.workerPartnerAccountEmpty) {
    els.workerPartnerAccountEmpty.addEventListener("click", (event) => {
      if (event.target.closest('[data-worker-partner-action="mark"]')) markWorkerAsPartner(selectedWorkerId);
    });
  }
  if (els.workerPartnerFundingForm) els.workerPartnerFundingForm.addEventListener("submit", recordWorkerPartnerFunding);
  if (els.workerPartnerWithdrawalForm) els.workerPartnerWithdrawalForm.addEventListener("submit", recordWorkerPartnerWithdrawal);
  if (els.workerPartnerFundingCancelButton) els.workerPartnerFundingCancelButton.addEventListener("click", resetWorkerPartnerFundingForm);
  if (els.workerPartnerWithdrawalCancelButton) els.workerPartnerWithdrawalCancelButton.addEventListener("click", resetWorkerPartnerWithdrawalForm);
  [els.workerPartnerLedgerTypeFilter, els.workerPartnerLedgerDateFromInput, els.workerPartnerLedgerDateToInput].forEach((input) => {
    if (input) input.addEventListener("change", () => renderWorkerPartnerAccount(getWorker(selectedWorkerId)));
  });
  if (els.workerPartnerLedgerClearButton) {
    els.workerPartnerLedgerClearButton.addEventListener("click", () => {
      if (els.workerPartnerLedgerDateFromInput) els.workerPartnerLedgerDateFromInput.value = "";
      if (els.workerPartnerLedgerDateToInput) els.workerPartnerLedgerDateToInput.value = "";
      renderWorkerPartnerAccount(getWorker(selectedWorkerId));
    });
  }
  if (els.workerPartnerAccountLedger) {
    els.workerPartnerAccountLedger.addEventListener("click", (event) => {
      const editFundingButton = event.target.closest("[data-edit-worker-partner-funding]");
      if (editFundingButton) { startEditWorkerPartnerFunding(editFundingButton.dataset.editWorkerPartnerFunding); return; }
      const editWithdrawalButton = event.target.closest("[data-edit-worker-partner-withdrawal]");
      if (editWithdrawalButton) { startEditWorkerPartnerWithdrawal(editWithdrawalButton.dataset.editWorkerPartnerWithdrawal); return; }
      const fundingButton = event.target.closest("[data-delete-partner-funding]");
      if (fundingButton) { deletePartnerFunding(fundingButton.dataset.deletePartnerFunding); return; }
      const withdrawalButton = event.target.closest("[data-delete-partner-withdrawal]");
      if (withdrawalButton) deletePartnerWithdrawal(withdrawalButton.dataset.deletePartnerWithdrawal);
    });
  }
  if (els.workerRaiseForm) els.workerRaiseForm.addEventListener("submit", raiseWorkerSalary);
  els.workersList.addEventListener("click", (event) => {
    const markPartnerButton = event.target.closest("[data-mark-worker-partner]");
    if (markPartnerButton) {
      markWorkerAsPartner(markPartnerButton.dataset.markWorkerPartner);
      return;
    }

    const openPartnerButton = event.target.closest("[data-open-worker-partner]");
    if (openPartnerButton) {
      openWorkerPartner(openPartnerButton.dataset.openWorkerPartner);
      return;
    }

    const deleteButton = event.target.closest("[data-remove-worker]");
    if (deleteButton) {
      deleteWorker(deleteButton.dataset.removeWorker);
      return;
    }

    const button = event.target.closest("[data-worker-card]");
    if (!button) return;
    resetWorkerTransactionForm();
    resetWorkerConsumptionForm();
    selectedWorkerId = button.dataset.workerCard;
    render();
  });
  els.workerLedgerList.addEventListener("click", (event) => {
    const moreWorkerLedgerButton = event.target.closest("[data-show-more-worker-ledger]");
    if (moreWorkerLedgerButton) {
      workerLedgerViewLimit += WORKER_LEDGER_STEP;
      renderWorkerDetail();
      return;
    }

    const editExpenseButton = event.target.closest("[data-edit-expense]");
    if (editExpenseButton) {
      startEditWorkerConsumption(editExpenseButton.dataset.editExpense);
      return;
    }

    const expenseButton = event.target.closest("[data-remove-expense]");
    if (expenseButton) {
      deleteExpense(expenseButton.dataset.removeExpense);
      return;
    }

    const editTransactionButton = event.target.closest("[data-edit-worker-transaction]");
    if (editTransactionButton) {
      startEditWorkerTransaction(editTransactionButton.dataset.editWorkerTransaction);
      return;
    }

    const transactionButton = event.target.closest("[data-remove-worker-transaction]");
    if (transactionButton) { deleteWorkerTransaction(transactionButton.dataset.removeWorkerTransaction); return; }

    const leaveButton = event.target.closest("[data-remove-worker-leave]");
    if (leaveButton) deleteWorkerLeave(leaveButton.dataset.removeWorkerLeave);
  });
  els.invoiceTableBody.addEventListener("click", (event) => {
    const moreButton = event.target.closest("[data-show-more-invoices]");
    if (moreButton) {
      invoiceViewLimit += INVOICE_VIEW_STEP;
      renderInvoices();
      return;
    }

    const customerLink = event.target.closest("[data-open-invoice-customer]");
    if (customerLink) {
      selectedCustomerId = customerLink.dataset.openInvoiceCustomer;
      switchView("customers");
      return;
    }

    const editButton = event.target.closest("[data-edit-invoice]");
    if (editButton) {
      if (!requireManagerPermission("invoice.edit", "تعديل الفاتورة")) return;
      startEditInvoice(editButton.dataset.editInvoice);
      return;
    }

    const transferButton = event.target.closest("[data-transfer-invoice]");
    if (transferButton) {
      if (!requireManagerPermission("invoice.edit", "نقل الفاتورة")) return;
      startTransferInvoice(transferButton.dataset.transferInvoice);
      return;
    }

    const printButton = event.target.closest("[data-print-invoice]");
    if (printButton) {
      printInvoiceById(printButton.dataset.printInvoice);
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-invoice]");
    if (cancelButton) {
      if (!requireManagerPermission("invoice.cancel", "إلغاء الفاتورة")) return;
      cancelInvoice(cancelButton.dataset.cancelInvoice);
      return;
    }

    const button = event.target.closest("[data-delete-invoice]");
    if (!button) return;
    if (!requireManagerPermission("invoice.delete", "حذف الفاتورة")) return;
    deleteInvoice(button.dataset.deleteInvoice);
  });
  els.invoiceExcelExportButton.addEventListener("click", () => {
    if (requireManagerPermission("invoice.export", "تصدير الفواتير")) exportInvoicesExcel();
  });
  els.invoiceExcelImportInput.addEventListener("change", (event) => {
    if (!requireManagerPermission("invoice.import", "استيراد الفواتير")) {
      event.target.value = "";
      return;
    }
    importInvoicesExcel(event.target.files[0]);
  });
  els.menuExcelExportButton.addEventListener("click", exportMenuExcel);
  els.menuExcelImportInput.addEventListener("change", (event) => importMenuExcel(event.target.files[0]));

  // Period Close
  els.closePeriodFrom.addEventListener("change", onClosePeriodDateChange);
  els.closePeriodTo.addEventListener("change", onClosePeriodDateChange);
  els.closePeriodCalcButton.addEventListener("click", calcPeriodClose);
  if (els.closeSummary) {
    els.closeSummary.addEventListener("click", (event) => {
      const sourceBtn = event.target.closest("[data-close-cash-source]");
      if (sourceBtn) setPeriodCloseCashSource(sourceBtn.dataset.closeCashSource);
    });
  }
  els.closePayAllButton.addEventListener("click", closePayAll);
  if (els.confirmYesButton) els.confirmYesButton.addEventListener("click", () => resolveAppConfirm(true));
  if (els.confirmCancelButton) els.confirmCancelButton.addEventListener("click", () => resolveAppConfirm(false));
  if (els.confirmBackdrop) els.confirmBackdrop.addEventListener("click", () => resolveAppConfirm(false));
  if (els.mobileMoreButton) els.mobileMoreButton.addEventListener("click", openMoreSheet);
  if (els.mobileMoreBackdrop) els.mobileMoreBackdrop.addEventListener("click", closeMoreSheet);
  if (els.mobileMoreClose) els.mobileMoreClose.addEventListener("click", closeMoreSheet);
  if (els.mobileMoreSheet) els.mobileMoreSheet.addEventListener("click", (event) => {
    if (event.target.closest("[data-view]")) closeMoreSheet();
  });
  if (els.themeToggleButton) els.themeToggleButton.addEventListener("click", toggleAppTheme);
  if (els.roleToggleButton) els.roleToggleButton.addEventListener("click", () => {
    if (isManagerMode()) {
      setUserRole("cashier");
      return;
    }
    requestManagerAccess();
  });
  if (els.guideShareButton) els.guideShareButton.addEventListener("click", shareBackup);
  if (els.guideInternalBackupButton) els.guideInternalBackupButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.internal", "حفظ نسخة داخلية")) saveInternalBackupNow();
  });
  if (els.guideBackupButton) els.guideBackupButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.export", "تصدير النسخة الاحتياطية")) exportData();
  });
  if (els.guideImportInput) els.guideImportInput.addEventListener("change", (event) => {
    if (!requireManagerPermission("backup.import", "استيراد نسخة احتياطية")) {
      event.target.value = "";
      return;
    }
    importData(event.target.files[0]);
  });
  if (els.restoreLatestBackupButton) els.restoreLatestBackupButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.restore", "استرجاع نسخة احتياطية")) restoreLatestLocalBackup();
  });
  if (els.backupCenter) {
    els.backupCenter.addEventListener("click", (event) => {
      const downloadButton = event.target.closest("[data-download-backup-snapshot]");
      if (downloadButton) {
        if (requireManagerPermission("backup.export", "تنزيل نسخة احتياطية داخلية")) {
          downloadBackupSnapshotByKey(downloadButton.dataset.downloadBackupSnapshot);
        }
        return;
      }

      const restoreButton = event.target.closest("[data-restore-backup-snapshot]");
      if (restoreButton) {
        if (requireManagerPermission("backup.restore", "استرجاع نسخة احتياطية")) {
          restoreBackupSnapshotByKey(restoreButton.dataset.restoreBackupSnapshot);
        }
      }
    });
  }
  // النسخ التلقائي لمجلد
  const folderBackupChooseButton = document.getElementById("folderBackupChooseButton");
  if (folderBackupChooseButton) folderBackupChooseButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.export", "إعداد النسخ التلقائي للمجلد")) chooseBackupFolder();
  });
  const folderBackupNowButton = document.getElementById("folderBackupNowButton");
  if (folderBackupNowButton) folderBackupNowButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.export", "حفظ نسخة للمجلد")) writeBackupToFolder(true);
  });
  const folderBackupDisableButton = document.getElementById("folderBackupDisableButton");
  if (folderBackupDisableButton) folderBackupDisableButton.addEventListener("click", disableFolderBackup);
  if (els.businessNameSaveButton) els.businessNameSaveButton.addEventListener("click", saveBusinessName);
  if (els.businessNameInput) els.businessNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveBusinessName(); } });

  // قفل البرنامج برمز PIN
  const pinSaveButton = document.getElementById("pinSaveButton");
  if (pinSaveButton) pinSaveButton.addEventListener("click", () => {
    const a = document.getElementById("pinNewInput").value;
    const b = document.getElementById("pinConfirmInput").value;
    if (a !== b) { showToast("الرمزان غير متطابقين."); return; }
    if (setAppPin(a)) {
      document.getElementById("pinNewInput").value = "";
      document.getElementById("pinConfirmInput").value = "";
    }
  });
  const pinClearButton = document.getElementById("pinClearButton");
  if (pinClearButton) pinClearButton.addEventListener("click", () => {
    const cur = document.getElementById("pinCurrentInput");
    if (clearAppPin(cur.value)) cur.value = "";
  });

  // حجم الطباعة (A4 / حراري)
  const printSizeSelect = document.getElementById("printSizeSelect");
  if (printSizeSelect) printSizeSelect.addEventListener("change", () => {
    state.printSize = ["a4", "80mm", "58mm"].includes(printSizeSelect.value) ? printSizeSelect.value : "a4";
    saveState();
    applyPrintSize();
    showToast("تم حفظ حجم الطباعة.");
  });

  const autoBackupToggle = document.getElementById("autoBackupToggle");
  if (autoBackupToggle) autoBackupToggle.addEventListener("change", () => {
    state.autoBackup = autoBackupToggle.checked;
    saveState(true);
    renderAutoBackupSetting();
    startAutoBackupSchedule();
    if (autoBackupToggle.checked) maybeAutoDailyBackup();
    showToast(autoBackupToggle.checked ? "تم تفعيل النسخ التلقائي اليومي." : "تم إيقاف النسخ التلقائي.");
  });
  const autoBackupTimeInput = document.getElementById("autoBackupTimeInput");
  if (autoBackupTimeInput) autoBackupTimeInput.addEventListener("change", () => {
    state.autoBackupTime = normalizeAutoBackupTimeValue(autoBackupTimeInput.value);
    state.autoBackup = true;
    saveState(true);
    renderAutoBackupSetting();
    startAutoBackupSchedule();
    maybeAutoDailyBackup();
    showToast(state.autoBackupTime ? `تم تحديد وقت النسخة اليومية: ${state.autoBackupTime}.` : "تم إلغاء وقت النسخة اليومية.");
  });

  // إعدادات نقاط الولاء
  const loyaltyEnabledToggle = document.getElementById("loyaltyEnabledToggle");
  const loyaltyPerShekelInput = document.getElementById("loyaltyPerShekelInput");
  const loyaltyRewardPointsInput = document.getElementById("loyaltyRewardPointsInput");
  const loyaltyRewardValueInput = document.getElementById("loyaltyRewardValueInput");
  const syncLoyaltyInputs = () => {
    const l = state.loyalty || {};
    if (loyaltyEnabledToggle) loyaltyEnabledToggle.checked = l.enabled !== false;
    if (loyaltyPerShekelInput) loyaltyPerShekelInput.value = inputNumberValue(l.perShekel ?? 1);
    if (loyaltyRewardPointsInput) loyaltyRewardPointsInput.value = inputNumberValue(l.rewardPoints ?? 100);
    if (loyaltyRewardValueInput) loyaltyRewardValueInput.value = inputNumberValue(l.rewardValue ?? 10);
  };
  syncLoyaltyInputs();
  const saveLoyalty = () => {
    state.loyalty = {
      enabled: loyaltyEnabledToggle ? loyaltyEnabledToggle.checked : true,
      perShekel: Math.max(Number(loyaltyPerShekelInput && loyaltyPerShekelInput.value) || 1, 0.0001),
      rewardPoints: Math.max(Math.round(Number(loyaltyRewardPointsInput && loyaltyRewardPointsInput.value) || 100), 1),
      rewardValue: Math.max(Number(loyaltyRewardValueInput && loyaltyRewardValueInput.value) || 10, 0)
    };
    saveState();
    if (state.view === "customers") render();
    showToast("تم حفظ إعدادات النقاط.");
  };
  [loyaltyEnabledToggle, loyaltyPerShekelInput, loyaltyRewardPointsInput, loyaltyRewardValueInput].forEach((el) => {
    if (el) el.addEventListener("change", saveLoyalty);
  });
  els.closeApproveButton.addEventListener("click", approvePeriodClose);
  if (els.closeWithdrawButton) els.closeWithdrawButton.addEventListener("click", recordCloseWithdrawal);
  if (els.closeWithdrawList) {
    els.closeWithdrawList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-withdrawal]");
      if (button) removeOwnerWithdrawal(button.dataset.removeWithdrawal);
    });
  }
  els.closeHistoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-period-close]");
    if (button) { removePeriodClose(button.dataset.removePeriodClose); return; }
    const head = event.target.closest("[data-toggle-close]");
    if (head) toggleCloseDetail(head.dataset.toggleClose);
  });
  els.closeGoInventoryButton.addEventListener("click", () => {
    state.view = "inventory";
    render();
  });

  els.exportButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.export", "تصدير النسخة الاحتياطية")) exportData();
  });
  if (els.internalBackupButton) els.internalBackupButton.addEventListener("click", () => {
    if (requireManagerPermission("backup.internal", "حفظ نسخة داخلية")) saveInternalBackupNow();
  });
  els.importInput.addEventListener("change", (event) => {
    if (!requireManagerPermission("backup.import", "استيراد نسخة احتياطية")) {
      event.target.value = "";
      return;
    }
    importData(event.target.files[0]);
  });
  els.purchaseForm.addEventListener("submit", addPurchase);
  els.purchaseSectionTabs?.forEach((button) => {
    button.addEventListener("click", () => setPurchaseSection(button.dataset.purchaseSectionTab));
  });
  els.generalExpenseForm.addEventListener("submit", recordGeneralExpense);
  if (els.generalExpenseCategoryInput) els.generalExpenseCategoryInput.addEventListener("change", syncGeneralExpensePurposeToCategory);
  [els.generalExpenseCategoryFilter, els.generalExpensePurposeFilter, els.generalExpenseMethodFilter].forEach((input) => {
    if (input) input.addEventListener("change", renderGeneralExpenses);
  });
  if (els.generalExpenseClearFiltersButton) els.generalExpenseClearFiltersButton.addEventListener("click", clearGeneralExpenseFilters);
  els.generalExpenseMethodInput.addEventListener("change", () => {
    setLastPaymentMethod(els.generalExpenseMethodInput.value);
    saveState();
  });
  if (els.generalExpenseCancelEditButton) {
    els.generalExpenseCancelEditButton.addEventListener("click", resetGeneralExpenseForm);
  }
  els.purchaseMenuItemInput.addEventListener("change", syncPurchaseMenuItem);
  els.purchaseItemInput.addEventListener("input", autofillPurchaseUnitsFromHistory);
  els.purchaseItemInput.addEventListener("change", autofillPurchaseUnitsFromHistory);
  els.purchaseQtyInput.addEventListener("input", () => {
    if (els.purchaseUnitPriceInput.value !== "") syncPurchaseAmountFromUnitPrice();
    else syncPurchaseUnitPriceFromAmount();
  });
  els.purchaseUnitInput.addEventListener("input", renderPurchaseUnitCost);
  els.purchaseStockQtyInput.addEventListener("input", renderPurchaseUnitCost);
  els.purchaseStockUnitInput.addEventListener("input", renderPurchaseUnitCost);
  els.purchaseUnitPriceInput.addEventListener("input", syncPurchaseAmountFromUnitPrice);
  els.purchaseAmountInput.addEventListener("input", syncPurchaseUnitPriceFromAmount);
  [els.purchaseDiscountInput, els.purchaseSupplierCreditUsedInput, els.purchaseCashPaidInput, els.purchaseBankPaidInput, els.purchaseWalletPaidInput]
    .filter(Boolean)
    .forEach((input) => input.addEventListener("input", renderPurchaseDraft));
  els.savePurchaseInvoiceButton.addEventListener("click", savePurchaseInvoice);
  els.clearPurchaseInvoiceButton.addEventListener("click", clearPurchaseDraft);
  els.purchaseEditCancelButton.addEventListener("click", cancelPurchaseEdit);
  els.purchaseDraftList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-purchase-draft]");
    if (editButton) {
      editPurchaseDraftLine(editButton.dataset.editPurchaseDraft);
      return;
    }
    const button = event.target.closest("[data-remove-purchase-draft]");
    if (button) removePurchaseDraftLine(button.dataset.removePurchaseDraft);
  });
  const renderAllPurchaseSections = () => {
    renderPurchases();
    if (typeof renderSupplierDebts === "function") renderSupplierDebts();
  };
  els.purchaseSearchInput.addEventListener("input", renderAllPurchaseSections);
  ["purchaseDateFromInput", "purchaseDateToInput", "purchaseDateSortInput", "purchaseRecordFilterInput", "purchaseExpensePurposeFilterInput"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderAllPurchaseSections);
  });
  els.purchasesList.addEventListener("click", (event) => {
    const openSupplierButton = event.target.closest("[data-open-supplier]");
    if (openSupplierButton) {
      selectedSupplierName = openSupplierButton.dataset.openSupplier || "";
      const nameInput = document.getElementById("supplierPayNameInput");
      if (nameInput) nameInput.value = selectedSupplierName;
      setPurchaseSection("suppliers", { scroll: true });
      renderSupplierDebts();
      document.getElementById("supplierDebtTotalBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const editButton = event.target.closest("[data-edit-purchase]");
    if (editButton) {
      startEditPurchase(editButton.dataset.editPurchase);
      return;
    }

    const button = event.target.closest("[data-remove-purchase]");
    if (button) removePurchase(button.dataset.removePurchase);
  });
  els.generalExpensesList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-general-expense]");
    if (editButton) {
      startEditGeneralExpense(editButton.dataset.editGeneralExpense);
      return;
    }
    const button = event.target.closest("[data-remove-general-expense]");
    if (button) removeGeneralExpense(button.dataset.removeGeneralExpense);
  });
  els.generalExpensesList.addEventListener("change", (event) => {
    const categoryInput = event.target.closest("[data-quick-expense-category]");
    if (categoryInput) quickSetGeneralExpenseCategory(categoryInput.dataset.expenseId, categoryInput.value);
  });

  // حسابات الموردين: تسديد، رصيد، قبض + تعبئة النموذج بالنقر
  const supplierPayForm = document.getElementById("supplierPayForm");
  if (supplierPayForm) supplierPayForm.addEventListener("submit", paySupplier);
  const supplierTransactionTypeInput = document.getElementById("supplierTransactionTypeInput");
  const supplierPayMethodInput = document.getElementById("supplierPayMethodInput");
  const syncSupplierMethodState = () => {
    if (!supplierTransactionTypeInput || !supplierPayMethodInput) return;
    supplierPayMethodInput.disabled = supplierTransactionTypeInput.value === "credit_note" || supplierTransactionTypeInput.value === "debt_increase";
  };
  if (supplierTransactionTypeInput) supplierTransactionTypeInput.addEventListener("change", syncSupplierMethodState);
  syncSupplierMethodState();
  const supplierTransactionCancelEditButton = document.getElementById("supplierTransactionCancelEditButton");
  if (supplierTransactionCancelEditButton) supplierTransactionCancelEditButton.addEventListener("click", resetSupplierTransactionForm);
  const supplierDebtList = document.getElementById("supplierDebtList");
  if (supplierDebtList) supplierDebtList.addEventListener("click", (event) => {
    const openSupplierButton = event.target.closest("[data-open-supplier]");
    if (openSupplierButton) {
      selectedSupplierName = openSupplierButton.dataset.openSupplier || "";
      renderSupplierDebts();
      return;
    }
    const backSupplierButton = event.target.closest("[data-back-suppliers]");
    if (backSupplierButton) {
      selectedSupplierName = "";
      renderSupplierDebts();
      return;
    }
    const editPurchaseButton = event.target.closest("[data-edit-purchase]");
    if (editPurchaseButton) {
      startEditPurchase(editPurchaseButton.dataset.editPurchase);
      return;
    }
    const removePurchaseButton = event.target.closest("[data-remove-purchase]");
    if (removePurchaseButton) {
      removePurchase(removePurchaseButton.dataset.removePurchase);
      return;
    }
    const editTransactionButton = event.target.closest("[data-edit-supplier-transaction]");
    if (editTransactionButton) {
      startEditSupplierTransaction(editTransactionButton.dataset.supplierTransactionSource, editTransactionButton.dataset.editSupplierTransaction);
      return;
    }
    const removeTransactionButton = event.target.closest("[data-remove-supplier-transaction]");
    if (removeTransactionButton) {
      removeSupplierTransaction(removeTransactionButton.dataset.supplierTransactionSource, removeTransactionButton.dataset.removeSupplierTransaction);
      return;
    }
    const payButton = event.target.closest("[data-supplier-action]");
    if (!payButton) return;
    const nameInput = document.getElementById("supplierPayNameInput");
    if (nameInput) { nameInput.value = payButton.dataset.supplierName || ""; nameInput.focus(); }
    if (supplierTransactionTypeInput) {
      supplierTransactionTypeInput.value = payButton.dataset.supplierAction || "payment_out";
      syncSupplierMethodState();
    }
    const amountInput = document.getElementById("supplierPayAmountInput");
    if (amountInput) {
      amountInput.value = payButton.dataset.supplierAmount || "";
      amountInput.focus();
      if (amountInput.value) amountInput.select();
    }
  });
  els.inventoryPaneTabs?.forEach((button) => {
    button.addEventListener("click", () => setInventoryPane(button.dataset.inventoryPaneTab));
  });
  els.inventorySearchInput.addEventListener("input", renderInventory);
  els.inventoryScopeInput.addEventListener("change", renderInventory);
  if (els.inventoryStatusInput) els.inventoryStatusInput.addEventListener("change", renderInventory);
  if (els.inventoryAvailabilityInput) els.inventoryAvailabilityInput.addEventListener("change", renderInventory);
  if (els.inventoryStockSortInput) els.inventoryStockSortInput.addEventListener("change", renderInventory);
  if (els.inventoryManualForm) els.inventoryManualForm.addEventListener("submit", addManualPurchaseInventoryItem);
  if (els.inventoryWasteForm) els.inventoryWasteForm.addEventListener("submit", addInventoryWaste);
  els.inventoryFillButton.addEventListener("click", fillInventoryFromSystem);
  els.inventorySaveButton.addEventListener("click", saveInventoryCount);
  if (els.inventoryPrintReportButton) els.inventoryPrintReportButton.addEventListener("click", printInventoryReport);
  const refreshInventoryHistoryFresh = () => { inventoryHistoryViewLimit = INVENTORY_HISTORY_STEP; renderInventoryHistory(); };
  if (els.inventoryHistoryDateFromInput) els.inventoryHistoryDateFromInput.addEventListener("change", refreshInventoryHistoryFresh);
  if (els.inventoryHistoryDateToInput) els.inventoryHistoryDateToInput.addEventListener("change", refreshInventoryHistoryFresh);
  if (els.inventoryHistoryDateClearButton) els.inventoryHistoryDateClearButton.addEventListener("click", () => {
    els.inventoryHistoryDateFromInput.value = "";
    els.inventoryHistoryDateToInput.value = "";
    refreshInventoryHistoryFresh();
  });
  els.inventoryHistoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-inventory-count]");
    if (button) { removeInventoryCount(button.dataset.removeInventoryCount); return; }
    const moreButton = event.target.closest("[data-show-more-inventory-history]");
    if (moreButton) { inventoryHistoryViewLimit += INVENTORY_HISTORY_STEP; renderInventoryHistory(); return; }
    const toggleButton = event.target.closest("[data-toggle-inventory-lines]");
    if (toggleButton) toggleInventoryCountLines(toggleButton.dataset.toggleInventoryLines);
  });
  els.inventoryList.addEventListener("click", (event) => {
    const fillButton = event.target.closest("[data-inventory-fill-row]");
    if (fillButton) {
      fillInventoryRowFromSystem(fillButton.dataset.inventoryFillRow);
      return;
    }
    const zeroButton = event.target.closest("[data-inventory-zero-row]");
    if (zeroButton) { zeroInventoryRow(zeroButton.dataset.inventoryZeroRow); return; }
    const clearButton = event.target.closest("[data-inventory-clear-row]");
    if (clearButton) clearInventoryRow(clearButton.dataset.inventoryClearRow);
  });
  if (els.inventoryStockList) {
    els.inventoryStockList.addEventListener("click", async (event) => {
      const wasteButton = event.target.closest("[data-inventory-waste-item]");
      if (wasteButton) {
        fillInventoryWasteForm(wasteButton.dataset.inventoryWasteItem);
        return;
      }
      const editButton = event.target.closest("[data-edit-purchase-inventory]");
      if (editButton) {
        openPurchaseInventoryEditor(editButton.dataset.editPurchaseInventory);
        return;
      }
      const hideButton = event.target.closest("[data-hide-purchase-inventory]");
      if (hideButton) {
        await hidePurchaseInventoryItem(hideButton.dataset.hidePurchaseInventory);
        return;
      }
      const restoreButton = event.target.closest("[data-restore-purchase-inventory]");
      if (restoreButton) {
        restorePurchaseInventoryItem(restoreButton.dataset.restorePurchaseInventory);
        return;
      }
      const statusButton = event.target.closest("[data-purchase-inventory-status]");
      if (statusButton) setPurchaseInventoryStatus(statusButton.dataset.purchaseInventoryStatus, statusButton.dataset.purchaseInventoryNext);
    });
  }
  if (els.inventoryWasteList) {
    els.inventoryWasteList.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-inventory-waste]");
      if (removeButton) removeInventoryWaste(removeButton.dataset.removeInventoryWaste);
    });
  }
  if (els.lowStockPanel) {
    els.lowStockPanel.addEventListener("click", (event) => {
      const purchasesButton = event.target.closest("[data-go-purchases-from-inventory]");
      if (!purchasesButton) return;
      state.view = "purchases";
      render();
    });
  }
  els.inventoryList.addEventListener("input", (event) => {
    if (event.target.closest("[data-inventory-actual], [data-inventory-note]")) {
      updateInventoryCalculations();
    }
  });
  els.menuComponentAddButton.addEventListener("click", addMenuComponent);
  const menuOptionAddButton = document.getElementById("menuOptionAddButton");
  if (menuOptionAddButton) menuOptionAddButton.addEventListener("click", addMenuOption);

  // إدارة العروض / الكومبو
  const comboAddItemButton = document.getElementById("comboAddItemButton");
  if (comboAddItemButton) comboAddItemButton.addEventListener("click", addComboDraftItem);
  const comboSaveButton = document.getElementById("comboSaveButton");
  if (comboSaveButton) comboSaveButton.addEventListener("click", saveCombo);
  const comboDraftList = document.getElementById("comboDraftList");
  if (comboDraftList) comboDraftList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-combo-draft]");
    if (!btn) return;
    comboDraft = comboDraft.filter((ci) => ci.menuItemId !== btn.dataset.removeComboDraft);
    renderComboDraft();
  });
  const comboList = document.getElementById("comboList");
  if (comboList) comboList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-combo]");
    if (btn) deleteCombo(btn.dataset.removeCombo);
  });
  const menuOptionsList = document.getElementById("menuOptionsList");
  if (menuOptionsList) menuOptionsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-option]");
    if (!button) return;
    menuOptionsDraft = menuOptionsDraft.filter((opt) => opt.id !== button.dataset.removeOption);
    renderMenuOptionsEditor();
  });
  els.menuComponentsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-component]");
    if (!button) return;
    menuComponentDraft = menuComponentDraft.filter((component) => component.id !== button.dataset.removeComponent);
    renderMenuComponentsEditor();
  });
  els.menuForm.addEventListener("submit", saveMenuItem);
  els.menuOperatingCostInput.addEventListener("input", renderMenuComponentsEditor);
  els.menuOperatingCostTypeInput.addEventListener("change", renderMenuComponentsEditor);
  els.menuCancelEditButton.addEventListener("click", () => {
    setMenuFormMode();
    render();
  });
  els.menuStatsDateFromInput.addEventListener("change", renderSettingsMenu);
  els.menuStatsDateToInput.addEventListener("change", renderSettingsMenu);
  els.settingsMenuSearchInput.addEventListener("input", renderSettingsMenu);
  els.settingsMenuList.addEventListener("click", (event) => {
    const favButton = event.target.closest("[data-toggle-favorite]");
    if (favButton) { toggleMenuFavorite(favButton.dataset.toggleFavorite); return; }
    const moveUp = event.target.closest("[data-move-menu-up]");
    if (moveUp) { moveMenuItem(moveUp.dataset.moveMenuUp, "up"); return; }
    const moveDown = event.target.closest("[data-move-menu-down]");
    if (moveDown) { moveMenuItem(moveDown.dataset.moveMenuDown, "down"); return; }
    const editButton = event.target.closest("[data-edit-menu]");
    if (editButton) {
      editMenuItem(editButton.dataset.editMenu);
      return;
    }
    const removeButton = event.target.closest("[data-remove-menu]");
    if (removeButton) removeMenuItem(removeButton.dataset.removeMenu);
  });

  // سحب وإفلات لإعادة ترتيب الأصناف (بالماوس على الكمبيوتر)
  let draggedMenuId = null;
  els.settingsMenuList.addEventListener("dragstart", (event) => {
    const row = event.target.closest("[data-menu-id]");
    if (!row) return;
    draggedMenuId = row.dataset.menuId;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    row.classList.add("is-dragging");
  });
  els.settingsMenuList.addEventListener("dragend", (event) => {
    const row = event.target.closest("[data-menu-id]");
    if (row) row.classList.remove("is-dragging");
    draggedMenuId = null;
  });
  els.settingsMenuList.addEventListener("dragover", (event) => {
    if (draggedMenuId) event.preventDefault();
  });
  els.settingsMenuList.addEventListener("drop", (event) => {
    event.preventDefault();
    const row = event.target.closest("[data-menu-id]");
    if (row && draggedMenuId) dropMenuItem(draggedMenuId, row.dataset.menuId);
  });
}

// تهيئة الحالة (كانت في أول app.js — انتقلت هنا لأن loadState يحتاج دوال من كل الملفات)
state = loadState();
const repairedPersonalReturns = reconcileGeneratedPersonalReturnFunding(state);
if (repairedPersonalReturns > 0) saveState(true);
applyAppTheme();
currentUserRole = hasAppPin() ? "cashier" : "manager";
restoreLastUiLocation();

const posMobileOrderDock = document.querySelector(".pos-mobile-order-dock");
if (posMobileOrderDock && els.totalValue) {
  const syncPosMobileOrderDock = () => {
    const amount = posMobileOrderDock.querySelector("strong");
    if (amount) amount.textContent = els.totalValue.textContent || "₪0";
  };
  new MutationObserver(syncPosMobileOrderDock).observe(els.totalValue, {
    childList: true,
    characterData: true,
    subtree: true
  });
  posMobileOrderDock.addEventListener("click", () => {
    document.querySelector("#view-pos .checkout-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  const checkoutPanel = document.querySelector("#view-pos .checkout-panel");
  if (checkoutPanel && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      posMobileOrderDock.classList.toggle("is-checkout-visible", entry.isIntersecting);
    }, { threshold: 0.08 }).observe(checkoutPanel);
  }
  syncPosMobileOrderDock();
}

compactLocalBackupHistory();
lastClosedInvoice = state.invoices[0] || null;

wireEvents();
state.view = state.view || "pos";
setLastPaymentMethod(getLastPaymentMethod());
resetPartnerFundingForm();
getOpenOrder();
render();
focusMenuSearchSoon();
renderPinSettings();
applyPrintSize();
renderPrintSizeSetting();
renderAutoBackupSetting();
showLockScreen();
recoverFromDurableBackup();
startAutoBackupSchedule();
setTimeout(() => { try { maybeAutoDailyBackup(); } catch (error) {} }, 1800);
setTimeout(() => { try { maybeDailyFolderBackup(); } catch (error) {} }, 2200);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" })
    .then((registration) => {
      registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      registration.addEventListener("updatefound", () => {
        const nextWorker = registration.installing;
        if (!nextWorker) return;

        nextWorker.addEventListener("statechange", () => {
          if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
            nextWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    })
    .catch(() => {});
}

// ─── حارس التبويب الواحد: منع فتح البرنامج بتبويبين ─────────────────────────

if (typeof BroadcastChannel !== "undefined") {
  const tabGuardChannel = new BroadcastChannel("cafe-pos-tab-guard");
  let tabGuardBlocked = false;

  function showTabGuardOverlay() {
    if (document.getElementById("tabGuardOverlay")) return;
    tabGuardBlocked = true;
    const overlay = document.createElement("div");
    overlay.id = "tabGuardOverlay";
    overlay.className = "tab-guard-overlay";
    overlay.innerHTML = `
      <div class="tab-guard-box">
        <div class="tab-guard-icon">⚠️</div>
        <h2>البرنامج مفتوح في مكان آخر</h2>
        <p>دفتر المقهى مفتوح في تبويب أو نافذة ثانية. الشغل على نسختين بنفس الوقت بيخرب البيانات — آخر نسخة بتحفظ بتمسح تعديلات الثانية.</p>
        <p><strong>أغلق هذا التبويب واشتغل على التبويب الأول.</strong></p>
        <button class="tab-guard-force" type="button">أعرف المخاطر — استخدم هذا التبويب</button>
      </div>
    `;
    overlay.querySelector(".tab-guard-force").addEventListener("click", () => {
      tabGuardBlocked = false;
      overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  tabGuardChannel.onmessage = (event) => {
    if (event.data === "hello" && !tabGuardBlocked) {
      // في تبويب جديد فتح — أعلمه إني موجود
      tabGuardChannel.postMessage("taken");
    } else if (event.data === "taken") {
      // في تبويب أقدم شغال — احجب هذا التبويب
      showTabGuardOverlay();
    }
  };

  tabGuardChannel.postMessage("hello");
}
