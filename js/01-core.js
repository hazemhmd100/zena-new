// ═══ دفتر المقهى ═══ 01-core.js — الإعدادات، الحالة، التخزين، النسخ الاحتياطي
// (مقسوم من app.js — الأسطر 1-514)

const STORAGE_KEY = "cafe-pos-ledger-v1";
const STATE_SAVED_AT_KEY = "cafe-pos-ledger-v1-saved-at";
const UI_STATE_KEY = "cafe-pos-ledger-v1-ui";
const APP_THEME_KEY = "cafe-pos-theme";
const AUTO_BACKUP_KEY = "cafe-pos-ledger-v1-auto-backup";
const BACKUP_HISTORY_KEY = "cafe-pos-ledger-v1-backup-history";
const BACKUP_DB_NAME = "cafe-pos-ledger-backups";
const BACKUP_STORE_NAME = "snapshots";
const MAX_BACKUP_HISTORY = 20;
const MAX_AUTO_BACKUP_HISTORY = 3;
const MAX_AUDIT_LOG = 500;
const DEFAULT_TABLE_COUNT = 14;
const ENABLE_LINKING = false;
const ENABLE_STOCK_COMPONENTS = true;

const defaultMenu = [
  { id: "coffee-arabic", name: "قهوة عربية", price: 8, category: "مشروبات" },
  { id: "coffee-turkish", name: "قهوة تركية", price: 10, category: "مشروبات" },
  { id: "tea", name: "شاي", price: 6, category: "مشروبات" },
  { id: "nescafe", name: "نسكافيه", price: 12, category: "مشروبات" },
  { id: "mint", name: "نعنع وليمون", price: 14, category: "بارد" },
  { id: "water", name: "ماء", price: 4, category: "بارد" },
  { id: "shisha-apple", name: "شيشة تفاحتين", price: 25, category: "شيشة" },
  { id: "shisha-mint", name: "شيشة نعنع", price: 25, category: "شيشة" },
  { id: "coal", name: "راس فحم", price: 5, category: "شيشة" },
  { id: "cake", name: "قطعة كيك", price: 16, category: "حلويات" },
  { id: "cookies", name: "بسكويت", price: 7, category: "حلويات" },
  { id: "sandwich", name: "سندويشة خفيفة", price: 18, category: "أكل" }
];

const paymentLabels = {
  cash: "كاش",
  bank: "تطبيق بنك",
  wallet: "محفظة"
};

const paymentMethods = Object.keys(paymentLabels);
const operatingCostLabels = {
  gas: "غاز",
  electricity: "كهربا",
  labor: "عمال",
  other: "أخرى"
};
const operatingCostTypes = Object.keys(operatingCostLabels);
const workerConsumptionTypeLabels = {
  free: "مجاني للعامل",
  worker_price: "سعر عامل",
  salary: "خصم من الراتب"
};
const FREE_WORKER_CONSUMPTION_TYPE = "free";
const SALARY_WORKER_CONSUMPTION_TYPE = "salary";
const workerTransactionTypeLabels = {
  advance: "سلفة",
  salary_payment: "دفع راتب للعامل",
  payment_in: "استلام مبلغ من العامل",
  cafe_funding: "تمويل من العامل للكافي",
  cafe_funding_refund: "إرجاع تمويل للعامل"
};
const WORKER_ADVANCE_TYPE = "advance";
const WORKER_SALARY_PAYMENT_TYPE = "salary_payment";
const WORKER_PAYMENT_IN_TYPE = "payment_in";
const WORKER_CAFE_FUNDING_TYPE = "cafe_funding";
const WORKER_CAFE_FUNDING_REFUND_TYPE = "cafe_funding_refund";

let stateNeedsBackupRecovery = false;
let loadedStateSavedAt = 0;
let backupWriteTimer = null;
// تتعبى فعلياً في js/12-init.js بعد تحميل كل الملفات (loadState يحتاج دوال من 02-domain)
let state = null;
let selectedCategory = "الكل";
let expandedMenuOptionsItemId = "";
let optionPickerCleanup = null;
let preferredMenuOptionByItemId = {};
let selectedCustomerId = null;
let selectedSupplierName = "";
let selectedWorkerId = null;
let selectedReportSection = "summary";
let selectedPurchaseSection = "invoice";
let lastClosedInvoice = null;
let purchaseDraftItems = [];
let editingSupplierTransactionRef = null;
let purchaseUnitAutofillState = {};
let inventoryDraft = {};
let menuComponentDraft = [];
let menuOptionsDraft = [];
let comboDraft = [];
let invoiceViewLimit = 50;
const INVOICE_VIEW_STEP = 50;
let inventoryHistoryViewLimit = 10;
const INVENTORY_HISTORY_STEP = 10;
let cashLedgerViewLimit = 30;
const CASH_LEDGER_STEP = 30;
let customerViewLimit = 40;
const CUSTOMER_VIEW_STEP = 40;
let customerLedgerViewLimit = 14;
const CUSTOMER_LEDGER_STEP = 14;
let customerLedgerRenderedFor = null;
let workerLedgerViewLimit = 16;
const WORKER_LEDGER_STEP = 16;
let workerLedgerRenderedFor = null;
let expandedInventoryCountId = null;
let invoiceEditItemsDraft = [];
let editingCustomerId = null;
let editingMenuItemId = null;
let editingInvoiceId = null;
let editingPurchaseId = null;
let editingGeneralExpenseId = null;
let editingWorkerTransactionId = null;
let editingWorkerConsumptionId = null;
let editingPartnerFundingId = null;
let editingPartnerWithdrawalId = null;
let settlementDebtMode = false;
let settlementOffsetMode = false;
let workerConsumptionMode = "worker_price"; // worker_price | salary | free
let expandedCloseId = null;
let cashboxAction = null;
const CASHIER_ALLOWED_VIEWS = new Set(["pos"]);
const MANAGER_ONLY_PERMISSIONS = new Set([
  "backup.export",
  "backup.import",
  "backup.internal",
  "backup.restore",
  "customer.bulkReminder",
  "customer.delete",
  "customer.debtPrint",
  "customer.export",
  "customer.import",
  "customer.manualDebt",
  "customer.merge",
  "customer.payout",
  "customer.price",
  "customer.settle",
  "customer.viewAccounts",
  "invoice.cancel",
  "invoice.delete",
  "invoice.edit",
  "invoice.export",
  "invoice.import"
]);
let currentUserRole = "manager";

function isManagerMode() {
  return currentUserRole === "manager";
}

function isManagerOnlyView(view) {
  return view && !CASHIER_ALLOWED_VIEWS.has(view);
}

function canAccessView(view) {
  return isManagerMode() || !isManagerOnlyView(view || "pos");
}

function canUsePermission(permission) {
  return isManagerMode() || !MANAGER_ONLY_PERMISSIONS.has(permission);
}

function canViewCustomerAccounts() {
  return canUsePermission("customer.viewAccounts");
}

function requireManagerPermission(permission, label = "هذا الإجراء") {
  if (canUsePermission(permission)) return true;
  showToast(`${label} يحتاج صلاحية مدير.`);
  if (typeof requestManagerAccess === "function") requestManagerAccess(state?.view || "pos");
  return false;
}

function ensurePermittedView() {
  if (!canAccessView(state?.view || "pos")) state.view = "pos";
}

const $ = (selector) => document.querySelector(selector);

const els = {
  tabs: document.querySelectorAll(".tab-button"),
  views: document.querySelectorAll(".view"),
  statsStrip: $("#statsStrip"),
  tablesGrid: $("#tablesGrid"),
  orderPanel: $(".order-panel"),
  newOrderButton: $("#newOrderButton"),
  addTableButton: $("#addTableButton"),
  tableMergeButton: $("#tableMergeButton"),
  deleteTableButton: $("#deleteTableButton"),
  orderSubtitle: $("#orderSubtitle"),
  tableNameInput: $("#tableNameInput"),
  orderStatus: $("#orderStatus"),
  customerNameInput: $("#customerNameInput"),
  customerSuggestions: $("#customerSuggestions"),
  customerPhoneInput: $("#customerPhoneInput"),
  customerSelect: $("#customerSelect"),
  saveCustomerButton: $("#saveCustomerButton"),
  posCustomerAccountCard: $("#posCustomerAccountCard"),
  menuSearchInput: $("#menuSearchInput"),
  quickMenuItems: $("#quickMenuItems"),
  customItemForm: $("#customItemForm"),
  customItemNameInput: $("#customItemNameInput"),
  customItemPriceInput: $("#customItemPriceInput"),
  menuCategories: $("#menuCategories"),
  menuGrid: $("#menuGrid"),
  orderItems: $("#orderItems"),
  clearOrderButton: $("#clearOrderButton"),
  discountInput: $("#discountInput"),
  paymentMethodInput: $("#paymentMethodInput"),
  paymentAmountInput: $("#paymentAmountInput"),
  changeReturnedInput: $("#changeReturnedInput"),
  noteInput: $("#noteInput"),
  subtotalValue: $("#subtotalValue"),
  totalValue: $("#totalValue"),
  profitWarning: $("#profitWarning"),
  balanceResult: $("#balanceResult"),
  closeInvoiceButton: $("#closeInvoiceButton"),
  printButton: $("#printButton"),
  customerAccountBox: $("#customerAccountBox"),
  statTodaySales: $("#statTodaySales"),
  statTodayPurchases: $("#statTodayPurchases"),
  statItemProfit: $("#statItemProfit"),
  statNetProfit: $("#statNetProfit"),
  openOrdersBadge: $("#openOrdersBadge"),
  customerTotalDebt: $("#customerTotalDebt"),
  customerTotalCredit: $("#customerTotalCredit"),
  customerAddForm: $("#customerAddForm"),
  customerAddNameInput: $("#customerAddNameInput"),
  customerAddPhoneInput: $("#customerAddPhoneInput"),
  customerSearchInput: $("#customerSearchInput"),
  customerStatusFilter: $("#customerStatusFilter"),
  customerExcelExportButton: $("#customerExcelExportButton"),
  customerExcelImportInput: $("#customerExcelImportInput"),
  customerDebtPrintButton: $("#customerDebtPrintButton"),
  customerBulkReminderButton: $("#customerBulkReminderButton"),
  customersList: $("#customersList"),
  customerDetailName: $("#customerDetailName"),
  customerDetailMeta: $("#customerDetailMeta"),
  customerStatementButton: $("#customerStatementButton"),
  customerKpis: $("#customerKpis"),
  customerEditModal: $("#customerEditModal"),
  customerEditBackdrop: $("#customerEditBackdrop"),
  customerEditForm: $("#customerEditForm"),
  customerEditTitle: $("#customerEditTitle"),
  customerEditMeta: $("#customerEditMeta"),
  customerEditNameInput: $("#customerEditNameInput"),
  customerEditPhoneInput: $("#customerEditPhoneInput"),
  customerMergeToggleButton: $("#customerMergeToggleButton"),
  customerMergeBox: $("#customerMergeBox"),
  customerMergeTargetInput: $("#customerMergeTargetInput"),
  customerMergeApplyButton: $("#customerMergeApplyButton"),
  customerEditCloseButton: $("#customerEditCloseButton"),
  customerEditCancelButton: $("#customerEditCancelButton"),
  customerReminderModal: $("#customerReminderModal"),
  customerReminderBackdrop: $("#customerReminderBackdrop"),
  customerReminderCloseButton: $("#customerReminderCloseButton"),
  customerReminderCancelButton: $("#customerReminderCancelButton"),
  customerReminderCopyButton: $("#customerReminderCopyButton"),
  customerReminderMeta: $("#customerReminderMeta"),
  customerReminderList: $("#customerReminderList"),
  cpItemSelect: $("#cpItemSelect"),
  cpPriceInput: $("#cpPriceInput"),
  cpAddButton: $("#cpAddButton"),
  cpTransferTargetInput: $("#cpTransferTargetInput"),
  cpTransferButton: $("#cpTransferButton"),
  customerPricesList: $("#customerPricesList"),
  settlementForm: $("#settlementForm"),
  settlementTitle: $("#settlementTitle"),
  settlementModeToggle: $("#settlementModeToggle"),
  settlementModePayment: $("#settlementModePayment"),
  settlementModeDebt: $("#settlementModeDebt"),
  settlementModeOffset: $("#settlementModeOffset"),
  settlementAmountInput: $("#settlementAmountInput"),
  settlementFillBalanceButton: $("#settlementFillBalanceButton"),
  settlementDiscountField: $("#settlementDiscountField"),
  settlementDiscountInput: $("#settlementDiscountInput"),
  settlementLossHint: $("#settlementLossHint"),
  settlementMethodInput: $("#settlementMethodInput"),
  settlementMethodField: $("#settlementMethodField"),
  settlementNoteField: $("#settlementNoteField"),
  settlementNoteInput: $("#settlementNoteInput"),
  settlementSubmitButton: $("#settlementSubmitButton"),
  ledgerList: $("#ledgerList"),
  invoiceSearchInput: $("#invoiceSearchInput"),
  invoiceQuickRanges: $("#invoiceQuickRanges"),
  invoiceRecordQuickFilters: $("#invoiceRecordQuickFilters"),
  invoiceClearFiltersButton: $("#invoiceClearFiltersButton"),
  invoiceResultLabel: $("#invoiceResultLabel"),
  invoiceStatusFilter: $("#invoiceStatusFilter"),
  invoiceDateFromInput: $("#invoiceDateFromInput"),
  invoiceDateToInput: $("#invoiceDateToInput"),
  invoiceDateSortInput: $("#invoiceDateSortInput"),
  invoiceNetTotal: $("#invoiceNetTotal"),
  invoicePaidTotal: $("#invoicePaidTotal"),
  invoicePaymentBreakdown: $("#invoicePaymentBreakdown"),
  invoiceNetCount: $("#invoiceNetCount"),
  invoiceEditForm: $("#invoiceEditForm"),
  invoiceEditTitle: $("#invoiceEditTitle"),
  invoiceEditCancelButton: $("#invoiceEditCancelButton"),
  invoiceEditCustomerInput: $("#invoiceEditCustomerInput"),
  invoiceEditPhoneInput: $("#invoiceEditPhoneInput"),
  invoiceTransferCustomerInput: $("#invoiceTransferCustomerInput"),
  invoiceTransferApplyButton: $("#invoiceTransferApplyButton"),
  invoiceEditDateInput: $("#invoiceEditDateInput"),
  invoiceEditTableInput: $("#invoiceEditTableInput"),
  invoiceEditTotalInput: $("#invoiceEditTotalInput"),
  invoiceEditPaidInput: $("#invoiceEditPaidInput"),
  invoiceEditDiscountField: $("#invoiceEditDiscountField"),
  invoiceEditDiscountInput: $("#invoiceEditDiscountInput"),
  invoiceEditMethodInput: $("#invoiceEditMethodInput"),
  invoiceEditItemsSection: $("#invoiceEditItemsSection"),
  invoiceEditSubtotalValue: $("#invoiceEditSubtotalValue"),
  invoiceEditMenuItemInput: $("#invoiceEditMenuItemInput"),
  invoiceEditAddMenuItemButton: $("#invoiceEditAddMenuItemButton"),
  invoiceEditCustomNameInput: $("#invoiceEditCustomNameInput"),
  invoiceEditCustomPriceInput: $("#invoiceEditCustomPriceInput"),
  invoiceEditAddCustomButton: $("#invoiceEditAddCustomButton"),
  invoiceEditItemsList: $("#invoiceEditItemsList"),
  invoiceEditNoteInput: $("#invoiceEditNoteInput"),
  invoiceTableBody: $("#invoiceTableBody"),
  invoiceExcelExportButton: $("#invoiceExcelExportButton"),
  invoiceExcelImportInput: $("#invoiceExcelImportInput"),
  reportDateFromInput: $("#reportDateFromInput"),
  reportDateToInput: $("#reportDateToInput"),
  reportTimeFromInput: $("#reportTimeFromInput"),
  reportTimeToInput: $("#reportTimeToInput"),
  reportClearTimeButton: $("#reportClearTimeButton"),
  reportRangeText: $("#reportRangeText"),
  reportSummaryGrid: $("#reportSummaryGrid"),
  cashOnHandBox: $("#cashOnHandBox"),
  todayCashStrip: $("#todayCashStrip"),
  reportPaymentsList: $("#reportPaymentsList"),
  cashLedgerSubtitle: $("#cashLedgerSubtitle"),
  cashLedgerTotals: $("#cashLedgerTotals"),
  cashLedgerList: $("#cashLedgerList"),
  partnerAddForm: $("#partnerAddForm"),
  partnerNameInput: $("#partnerNameInput"),
  partnerShareInput: $("#partnerShareInput"),
  partnersPanel: $("#partnersPanel"),
  partnersList: $("#partnersList"),
  partnersDistribution: $("#partnersDistribution"),
  partnerFundingForm: $("#partnerFundingForm"),
  partnerFundingPartnerInput: $("#partnerFundingPartnerInput"),
  partnerFundingTypeInputs: document.querySelectorAll('input[name="partnerFundingType"]'),
  partnerFundingDateInput: $("#partnerFundingDateInput"),
  partnerFundingAmountInput: $("#partnerFundingAmountInput"),
  partnerFundingMethodInput: $("#partnerFundingMethodInput"),
  partnerFundingNoteInput: $("#partnerFundingNoteInput"),
  partnerFundingSubmitButton: $("#partnerFundingSubmitButton"),
  partnerFundingCancelButton: $("#partnerFundingCancelButton"),
  partnerFundingSummary: $("#partnerFundingSummary"),
  partnerFundingLedger: $("#partnerFundingLedger"),
  partnerWithdrawalForm: $("#partnerWithdrawalForm"),
  partnerWithdrawalPartnerInput: $("#partnerWithdrawalPartnerInput"),
  partnerWithdrawalTypeInputs: document.querySelectorAll('input[name="partnerWithdrawalType"]'),
  partnerWithdrawalDateInput: $("#partnerWithdrawalDateInput"),
  partnerWithdrawalAmountInput: $("#partnerWithdrawalAmountInput"),
  partnerWithdrawalMethodInput: $("#partnerWithdrawalMethodInput"),
  partnerWithdrawalNoteInput: $("#partnerWithdrawalNoteInput"),
  partnerWithdrawalSubmitButton: $("#partnerWithdrawalSubmitButton"),
  partnerWithdrawalCancelButton: $("#partnerWithdrawalCancelButton"),
  partnerWithdrawalSummary: $("#partnerWithdrawalSummary"),
  partnerWithdrawalLedger: $("#partnerWithdrawalLedger"),
  reportItemsList: $("#reportItemsList"),
  reportCustomersList: $("#reportCustomersList"),
  reportInvoicesList: $("#reportInvoicesList"),
  reportPurchasesList: $("#reportPurchasesList"),
  reportSupplierPaymentsTotal: $("#reportSupplierPaymentsTotal"),
  reportSupplierPaymentsList: $("#reportSupplierPaymentsList"),
  reportGeneralExpensesList: $("#reportGeneralExpensesList"),
  reportExpenseCategorySummary: $("#reportExpenseCategorySummary"),
  reportInventoryList: $("#reportInventoryList"),
  reportExpensesList: $("#reportExpensesList"),
  reportWorkersList: $("#reportWorkersList"),
  expenseForm: $("#expenseForm"),
  expenseDateInput: $("#expenseDateInput"),
  expenseTitleInput: $("#expenseTitleInput"),
  expenseAmountInput: $("#expenseAmountInput"),
  workerItemInput: $("#workerItemInput"),
  workerItemField: $("#workerItemField"),
  workerQtyInput: $("#workerQtyInput"),
  workerQtyField: $("#workerQtyField"),
  expenseMethodInput: $("#expenseMethodInput"),
  expenseMethodField: $("#expenseMethodField"),
  expenseAmountField: $("#expenseAmountField"),
  expenseAmountLabel: $("#expenseAmountLabel"),
  expenseNoItemField: $("#expenseNoItemField"),
  expenseNoItemToggle: $("#expenseNoItemToggle"),
  expenseNoItemLabelField: $("#expenseNoItemLabelField"),
  expenseNoItemLabelInput: $("#expenseNoItemLabelInput"),
  consumptionTypeToggle: $("#consumptionTypeToggle"),
  expenseNoteInput: $("#expenseNoteInput"),
  expenseSubmitButton: $("#expenseSubmitButton"),
  expenseCancelEditButton: $("#expenseCancelEditButton"),
  generalExpenseForm: $("#generalExpenseForm"),
  generalExpenseDateInput: $("#generalExpenseDateInput"),
  generalExpenseTitleInput: $("#generalExpenseTitleInput"),
  generalExpenseCategoryInput: $("#generalExpenseCategoryInput"),
  generalExpensePurposeInputs: document.querySelectorAll('input[name="generalExpensePurpose"]'),
  generalExpenseAmountInput: $("#generalExpenseAmountInput"),
  generalExpenseMethodInput: $("#generalExpenseMethodInput"),
  generalExpenseNoteInput: $("#generalExpenseNoteInput"),
  generalExpenseSubmitButton: $("#generalExpenseSubmitButton"),
  generalExpenseCancelEditButton: $("#generalExpenseCancelEditButton"),
  generalExpenseTotalBox: $("#generalExpenseTotalBox"),
  generalExpensesList: $("#generalExpensesList"),
  generalExpenseCategoryFilter: $("#generalExpenseCategoryFilter"),
  generalExpensePurposeFilter: $("#generalExpensePurposeFilter"),
  generalExpenseMethodFilter: $("#generalExpenseMethodFilter"),
  generalExpenseClearFiltersButton: $("#generalExpenseClearFiltersButton"),
  generalExpenseResultLabel: $("#generalExpenseResultLabel"),
  workerAddForm: $("#workerAddForm"),
  workerAddNameInput: $("#workerAddNameInput"),
  workerAddPhoneInput: $("#workerAddPhoneInput"),
  workerAddSalaryInput: $("#workerAddSalaryInput"),
  workerSearchInput: $("#workerSearchInput"),
  workerStatusFilter: $("#workerStatusFilter"),
  workerTotalDue: $("#workerTotalDue"),
  workerTotalAdvance: $("#workerTotalAdvance"),
  workerTotalSalaryPaid: $("#workerTotalSalaryPaid"),
  workerTotalPaymentIn: $("#workerTotalPaymentIn"),
  workerTotalCafeFunding: $("#workerTotalCafeFunding"),
  workerTotalCharged: $("#workerTotalCharged"),
  workersList: $("#workersList"),
  workerDetailName: $("#workerDetailName"),
  workerDetailMeta: $("#workerDetailMeta"),
  workerPartnerActions: $("#workerPartnerActions"),
  workerPartnerAccountEmpty: $("#workerPartnerAccountEmpty"),
  workerPartnerAccountContent: $("#workerPartnerAccountContent"),
  workerPartnerAccountSummary: $("#workerPartnerAccountSummary"),
  workerPartnerAccountLedger: $("#workerPartnerAccountLedger"),
  workerPartnerLedgerTypeFilter: $("#workerPartnerLedgerTypeFilter"),
  workerPartnerLedgerDateFromInput: $("#workerPartnerLedgerDateFromInput"),
  workerPartnerLedgerDateToInput: $("#workerPartnerLedgerDateToInput"),
  workerPartnerLedgerClearButton: $("#workerPartnerLedgerClearButton"),
  workerPartnerLedgerFilterSummary: $("#workerPartnerLedgerFilterSummary"),
  workerPartnerPeriodSummary: $("#workerPartnerPeriodSummary"),
  workerPartnerFundingForm: $("#workerPartnerFundingForm"),
  workerPartnerFundingTypeInput: $("#workerPartnerFundingTypeInput"),
  workerPartnerFundingAmountInput: $("#workerPartnerFundingAmountInput"),
  workerPartnerFundingDateInput: $("#workerPartnerFundingDateInput"),
  workerPartnerFundingMethodInput: $("#workerPartnerFundingMethodInput"),
  workerPartnerFundingNoteInput: $("#workerPartnerFundingNoteInput"),
  workerPartnerFundingSubmitButton: $("#workerPartnerFundingSubmitButton"),
  workerPartnerFundingCancelButton: $("#workerPartnerFundingCancelButton"),
  workerPartnerWithdrawalForm: $("#workerPartnerWithdrawalForm"),
  workerPartnerWithdrawalTypeInput: $("#workerPartnerWithdrawalTypeInput"),
  workerPartnerWithdrawalAmountInput: $("#workerPartnerWithdrawalAmountInput"),
  workerPartnerWithdrawalDateInput: $("#workerPartnerWithdrawalDateInput"),
  workerPartnerWithdrawalMethodInput: $("#workerPartnerWithdrawalMethodInput"),
  workerPartnerWithdrawalNoteInput: $("#workerPartnerWithdrawalNoteInput"),
  workerPartnerWithdrawalSubmitButton: $("#workerPartnerWithdrawalSubmitButton"),
  workerPartnerWithdrawalCancelButton: $("#workerPartnerWithdrawalCancelButton"),
  workerKpis: $("#workerKpis"),
  workerPeriodRow: $("#workerPeriodRow"),
  workerOwnPeriodInput: $("#workerOwnPeriodInput"),
  workerOwnPeriodResetButton: $("#workerOwnPeriodResetButton"),
  workerEndDateInput: $("#workerEndDateInput"),
  workerEndDateClearButton: $("#workerEndDateClearButton"),
  workerRaiseForm: $("#workerRaiseForm"),
  workerRaiseSalaryInput: $("#workerRaiseSalaryInput"),
  workerRaiseDateInput: $("#workerRaiseDateInput"),
  workerSalaryHistory: $("#workerSalaryHistory"),
  workerTransactionForm: $("#workerTransactionForm"),
  workerTransactionDateInput: $("#workerTransactionDateInput"),
  workerTransactionTypeInput: $("#workerTransactionTypeInput"),
  workerTransactionAmountInput: $("#workerTransactionAmountInput"),
  workerTransactionMethodInput: $("#workerTransactionMethodInput"),
  workerTransactionNoteInput: $("#workerTransactionNoteInput"),
  workerTransactionSubmitButton: $("#workerTransactionSubmitButton"),
  workerTransactionCancelEditButton: $("#workerTransactionCancelEditButton"),
  workerLedgerList: $("#workerLedgerList"),
  workerLedgerFilterInput: $("#workerLedgerFilterInput"),
  workerLedgerResultLabel: $("#workerLedgerResultLabel"),
  workerLeaveForm: $("#workerLeaveForm"),
  workerLeaveFromInput: $("#workerLeaveFromInput"),
  workerLeaveToInput: $("#workerLeaveToInput"),
  workerLeaveNoteInput: $("#workerLeaveNoteInput"),
  exportButton: $("#exportButton"),
  importInput: $("#importInput"),
  purchaseForm: $("#purchaseForm"),
  purchaseMenuItemInput: $("#purchaseMenuItemInput"),
  purchaseItemInput: $("#purchaseItemInput"),
  purchaseSupplierInput: $("#purchaseSupplierInput"),
  purchaseDateInput: $("#purchaseDateInput"),
  purchaseQtyInput: $("#purchaseQtyInput"),
  purchaseUnitInput: $("#purchaseUnitInput"),
  purchaseStockQtyInput: $("#purchaseStockQtyInput"),
  purchaseStockUnitInput: $("#purchaseStockUnitInput"),
  purchaseUnitPriceInput: $("#purchaseUnitPriceInput"),
  purchaseAmountInput: $("#purchaseAmountInput"),
  purchaseUnitCostValue: $("#purchaseUnitCostValue"),
  purchaseMethodInput: $("#purchaseMethodInput"),
  purchasePaidInput: $("#purchasePaidInput"),
  purchaseCashPaidInput: $("#purchaseCashPaidInput"),
  purchaseBankPaidInput: $("#purchaseBankPaidInput"),
  purchaseWalletPaidInput: $("#purchaseWalletPaidInput"),
  purchaseDiscountInput: $("#purchaseDiscountInput"),
  purchaseSupplierCreditUsedInput: $("#purchaseSupplierCreditUsedInput"),
  purchaseNoteInput: $("#purchaseNoteInput"),
  purchaseDraftBox: $("#purchaseDraftBox"),
  purchaseDraftTitle: $("#purchaseDraftTitle"),
  purchaseDraftSubtitle: $("#purchaseDraftSubtitle"),
  purchaseDraftTotal: $("#purchaseDraftTotal"),
  purchaseDiscountSummary: $("#purchaseDiscountSummary"),
  purchaseDraftList: $("#purchaseDraftList"),
  savePurchaseInvoiceButton: $("#savePurchaseInvoiceButton"),
  clearPurchaseInvoiceButton: $("#clearPurchaseInvoiceButton"),
  purchaseEditCancelButton: $("#purchaseEditCancelButton"),
  purchaseSearchInput: $("#purchaseSearchInput"),
  purchaseRecordFilterInput: $("#purchaseRecordFilterInput"),
  purchaseExpensePurposeFilterInput: $("#purchaseExpensePurposeFilterInput"),
  purchaseTotalBox: $("#purchaseTotalBox"),
  purchasesList: $("#purchasesList"),
  purchaseSectionTabs: document.querySelectorAll("[data-purchase-section-tab]"),
  purchaseSectionPanels: document.querySelectorAll("[data-purchase-section-panel]"),
  inventorySearchInput: $("#inventorySearchInput"),
  inventoryView: $("#view-inventory"),
  inventoryPaneTabs: document.querySelectorAll("[data-inventory-pane-tab]"),
  inventoryPanePanels: document.querySelectorAll("[data-inventory-pane-panel]"),
  inventoryScopeInput: $("#inventoryScopeInput"),
  inventoryStatusInput: $("#inventoryStatusInput"),
  inventoryAvailabilityInput: $("#inventoryAvailabilityInput"),
  inventoryStockSortInput: $("#inventoryStockSortInput"),
  inventoryNoteInput: $("#inventoryNoteInput"),
  inventoryFillButton: $("#inventoryFillButton"),
  inventorySaveButton: $("#inventorySaveButton"),
  inventoryManualForm: $("#inventoryManualForm"),
  inventoryManualNameInput: $("#inventoryManualNameInput"),
  inventoryManualQtyInput: $("#inventoryManualQtyInput"),
  inventoryManualUnitInput: $("#inventoryManualUnitInput"),
  inventoryManualCostInput: $("#inventoryManualCostInput"),
  inventoryManualPurchaseUnitInput: $("#inventoryManualPurchaseUnitInput"),
  inventoryManualStatusInput: $("#inventoryManualStatusInput"),
  inventoryManualNoteInput: $("#inventoryManualNoteInput"),
  inventoryWasteForm: $("#inventoryWasteForm"),
  inventoryWasteItemInput: $("#inventoryWasteItemInput"),
  inventoryWasteQtyInput: $("#inventoryWasteQtyInput"),
  inventoryWasteReasonInput: $("#inventoryWasteReasonInput"),
  inventoryWasteList: $("#inventoryWasteList"),
  inventoryStockSummary: $("#inventoryStockSummary"),
  inventoryStockList: $("#inventoryStockList"),
  inventorySummary: $("#inventorySummary"),
  inventoryList: $("#inventoryList"),
  inventoryHistoryList: $("#inventoryHistoryList"),
  inventoryHistoryDateFromInput: $("#inventoryHistoryDateFromInput"),
  inventoryHistoryDateToInput: $("#inventoryHistoryDateToInput"),
  inventoryHistoryDateClearButton: $("#inventoryHistoryDateClearButton"),
  inventoryPrintReportButton: $("#inventoryPrintReportButton"),
  menuForm: $("#menuForm"),
  menuFormTitle: $("#menuFormTitle"),
  menuNameInput: $("#menuNameInput"),
  menuPriceInput: $("#menuPriceInput"),
  menuCostInput: $("#menuCostInput"),
  menuOperatingCostInput: $("#menuOperatingCostInput"),
  menuOperatingCostTypeInput: $("#menuOperatingCostTypeInput"),
  menuCategoryInput: $("#menuCategoryInput"),
  menuComponentItemInput: $("#menuComponentItemInput"),
  menuComponentQtyInput: $("#menuComponentQtyInput"),
  menuComponentAddButton: $("#menuComponentAddButton"),
  menuComponentsList: $("#menuComponentsList"),
  menuSubmitButton: $("#menuSubmitButton"),
  menuCancelEditButton: $("#menuCancelEditButton"),
  settingsMenuSearchInput: $("#settingsMenuSearchInput"),
  menuStatsDateFromInput: $("#menuStatsDateFromInput"),
  menuStatsDateToInput: $("#menuStatsDateToInput"),
  menuStatsRangeText: $("#menuStatsRangeText"),
  menuStatsSummary: $("#menuStatsSummary"),
  settingsMenuList: $("#settingsMenuList"),
  menuExcelExportButton: $("#menuExcelExportButton"),
  menuExcelImportInput: $("#menuExcelImportInput"),
  closePeriodFrom: $("#closePeriodFrom"),
  closePeriodTo: $("#closePeriodTo"),
  closePeriodDays: $("#closePeriodDays"),
  closePeriodCalcButton: $("#closePeriodCalcButton"),
  closePeriodResult: $("#closePeriodResult"),
  closeWorkerSubtitle: $("#closeWorkerSubtitle"),
  closeWorkersTable: $("#closeWorkersTable"),
  closePayAllButton: $("#closePayAllButton"),
  closeGoInventoryButton: $("#closeGoInventoryButton"),
  closeInventorySubtitle: $("#closeInventorySubtitle"),
  closeInventoryInfo: $("#closeInventoryInfo"),
  closeSummary: $("#closeSummary"),
  lastCloseBanner: $("#lastCloseBanner"),
  closeApproveButton: $("#closeApproveButton"),
  closeOverlapWarning: $("#closeOverlapWarning"),
  closeHistoryList: $("#closeHistoryList"),
  closeWithdrawAmount: $("#closeWithdrawAmount"),
  closeWithdrawMethod: $("#closeWithdrawMethod"),
  closeWithdrawPartner: $("#closeWithdrawPartner"),
  closeWithdrawButton: $("#closeWithdrawButton"),
  closeWithdrawList: $("#closeWithdrawList"),
  backupReminderBanner: $("#backupReminderBanner"),
  backupNowButton: $("#backupNowButton"),
  backupLaterButton: $("#backupLaterButton"),
  dayReportButton: $("#dayReportButton"),
  reportTopItemsList: $("#reportTopItemsList"),
  reportHoursChart: $("#reportHoursChart"),
  lowStockPanel: $("#lowStockPanel"),
  lowStockList: $("#lowStockList"),
  purchaseSuggestionsList: $("#purchaseSuggestionsList"),
  lowStockThresholdInput: $("#lowStockThresholdInput"),
  quickPayFullButton: $("#quickPayFullButton"),
  brandTitle: $("#brandTitle"),
  brandMark: $("#brandMark"),
  themeToggleButton: $("#themeToggleButton"),
  roleToggleButton: $("#roleToggleButton"),
  businessNameInput: $("#businessNameInput"),
  businessNameSaveButton: $("#businessNameSaveButton"),
  guideLive: $("#guideLive"),
  internalBackupButton: $("#internalBackupButton"),
  guideBackupButton: $("#guideBackupButton"),
  guideInternalBackupButton: $("#guideInternalBackupButton"),
  guideShareButton: $("#guideShareButton"),
  guideImportInput: $("#guideImportInput"),
  guideBackupStatus: $("#guideBackupStatus"),
  backupCenter: $("#backupCenter"),
  restoreLatestBackupButton: $("#restoreLatestBackupButton"),
  mobileMoreButton: $("#mobileMoreButton"),
  mobileMoreSheet: $("#mobileMoreSheet"),
  mobileMoreBackdrop: $("#mobileMoreBackdrop"),
  mobileMoreClose: $("#mobileMoreClose"),
  confirmModal: $("#confirmModal"),
  confirmBackdrop: $("#confirmBackdrop"),
  confirmIcon: $("#confirmIcon"),
  confirmMessage: $("#confirmMessage"),
  confirmYesButton: $("#confirmYesButton"),
  confirmCancelButton: $("#confirmCancelButton"),
  toast: $("#toast"),
  printTemplate: $("#printTemplate")
};

let _confirmResolver = null;

function appConfirm(message, options = {}) {
  return new Promise((resolve) => {
    if (!els.confirmModal) { resolve(window.confirm(message)); return; }
    _confirmResolver = resolve;
    els.confirmMessage.textContent = message;
    els.confirmIcon.textContent = options.icon || "⚠️";
    els.confirmYesButton.textContent = options.yesLabel || "تأكيد";
    els.confirmCancelButton.textContent = options.cancelLabel || "إلغاء";
    els.confirmYesButton.classList.toggle("is-danger", options.danger !== false);
    els.confirmModal.hidden = false;
  });
}

function resolveAppConfirm(value) {
  if (els.confirmModal) els.confirmModal.hidden = true;
  const resolver = _confirmResolver;
  _confirmResolver = null;
  if (value === true) armUndoSnapshot();
  if (resolver) resolver(value);
}

// ─── التراجع عن آخر عملية مؤكَّدة (حذف وغيره) ─────────────────
let undoSnapshotJson = null;
let undoArmedAt = 0;

function armUndoSnapshot() {
  try {
    undoSnapshotJson = JSON.stringify(state);
    undoArmedAt = Date.now();
  } catch (error) {
    undoSnapshotJson = null;
    undoArmedAt = 0;
  }
}

function isUndoArmed() {
  return !!undoSnapshotJson && (Date.now() - undoArmedAt < 1500);
}

function performUndo() {
  if (!undoSnapshotJson) return;
  try {
    const restored = normalizeState(JSON.parse(undoSnapshotJson));
    undoSnapshotJson = null;
    undoArmedAt = 0;
    state = restored;
    saveState();
    if (typeof render === "function") render();
    showToast("تم التراجع. ↩️");
  } catch (error) {
    showToast("تعذّر التراجع.");
  }
}

// ─── بحث ذكي: يتجاهل الهمزات والتشكيل ويطابق أي كلمة بأي مكان ──
function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "") // التشكيل
    .replace(/ـ/g, "")                 // التطويل (ـ)
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function searchMatch(haystack, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const h = normalizeSearchText(haystack);
  return q.split(" ").every((word) => word.length === 0 || h.includes(word));
}

function savedThemePreference() {
  try {
    const theme = localStorage.getItem(APP_THEME_KEY);
    return theme === "dark" || theme === "light" ? theme : "";
  } catch (error) {
    return "";
  }
}

function defaultState() {
  return {
    selectedTable: 1,
    lastSelectedCustomerId: "",
    lastSelectedWorkerId: "",
    lastSelectedCategory: "الكل",
    tableCount: DEFAULT_TABLE_COUNT,
    tableNames: {},
    theme: "light",
    inventoryPane: "stock",
    lastPaymentMethod: "cash",
    lastWorkerTransactionType: WORKER_ADVANCE_TYPE,
    lastWorkerConsumptionMode: "worker_price",
    menu: normalizeMenuItems(defaultMenu),
    customers: [],
    workers: [],
    openOrders: {},
    invoices: [],
    purchases: [],
    manualPurchaseInventoryItems: [],
    inventoryWaste: [],
    expenses: [],
    workerConsumptions: [],
    workerTransactions: [],
    workerLeaves: [],
    inventoryCounts: [],
    purchaseInventoryAdjustments: {},
    purchaseInventoryStatuses: {},
    purchaseInventoryAliases: {},
    purchaseInventoryHiddenKeys: {},
    customerPrices: [],
    periodCloses: [],
    reportingStart: null,
    lowStockThreshold: 5,
    openingCash: { cash: 0, bank: 0, wallet: 0 },
    cashAdjustments: [],
    cashTransfers: [],
    ownerWithdrawals: [],
    partners: [],
    partnerFundingTransactions: [],
    partnerDistributionBasis: "cash",
    partnerDistributionSource: "period",
    periodCloseCashSource: "period",
    auditLog: [],
    businessName: "دفتر المقهى",
    appPin: "",
    printSize: "a4",
    autoBackup: true,
    autoBackupTime: "",
    lastAutoBackup: "",
    lastAutoBackupAt: "",
    lastFolderBackup: "",
    supplierPayments: [],
    supplierTransactions: [],
    loyalty: { enabled: true, perShekel: 1, rewardPoints: 100, rewardValue: 10 },
    combos: []
  };
}

function normalizeAutoBackupTimeValue(value) {
  const text = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return "";
  const [hour, minute] = text.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return text;
}

function normalizeOpeningCash(value) {
  // ترحيل: لو كان رقم واحد قديم، نحطه كله كاش
  if (typeof value === "number") return { cash: value, bank: 0, wallet: 0 };
  const v = value && typeof value === "object" ? value : {};
  return {
    cash: Number(v.cash || 0),
    bank: Number(v.bank || 0),
    wallet: Number(v.wallet || 0)
  };
}

function normalizeManualPurchaseInventoryItem(entry = {}) {
  const cleanUnit = (value) => (typeof normalizeUnit === "function" ? normalizeUnit(value) : String(value || "").trim());
  const name = String(entry.name || entry.item || "").trim();
  const stockQty = Number(entry.stockQty ?? entry.qty ?? entry.quantity ?? 0);
  const stockUnit = cleanUnit(entry.stockUnit || entry.unit || entry.inventoryUnit || "");
  const purchaseUnit = cleanUnit(entry.purchaseUnit || "");
  const costValue = Number(entry.cost ?? entry.unitCost ?? entry.stockUnitCost ?? 0);
  const status = ["active", "clearing", "stopped"].includes(entry.status) ? entry.status : "active";
  if (!name || !stockUnit || !Number.isFinite(stockQty) || stockQty <= 0) return null;
  return {
    id: entry.id || uid("manual-stock"),
    name,
    stockQty: Math.max(stockQty, 0),
    stockUnit,
    purchaseUnit,
    cost: Number.isFinite(costValue) && costValue >= 0 ? costValue : 0,
    status,
    note: String(entry.note || "").trim(),
    createdAt: typeof entry.createdAt === "string" && entry.createdAt ? entry.createdAt : new Date().toISOString(),
    updatedAt: typeof entry.updatedAt === "string" && entry.updatedAt ? entry.updatedAt : ""
  };
}

function normalizeInventoryWasteRecord(entry = {}) {
  const cleanUnit = (value) => (typeof normalizeUnit === "function" ? normalizeUnit(value) : String(value || "").trim());
  const qty = Math.max(Number(entry.qty ?? entry.quantity ?? 0), 0);
  const unitCost = Math.max(Number(entry.unitCost ?? entry.cost ?? 0), 0);
  const totalCost = Math.max(Number(entry.totalCost ?? qty * unitCost), 0);
  const itemName = String(entry.itemName || entry.name || entry.item || "").trim();
  const purchaseKey = String(entry.purchaseKey || "").trim();
  const itemId = String(entry.itemId || "").trim();
  if ((!itemName && !purchaseKey && !itemId) || qty <= 0) return null;
  return {
    id: entry.id || uid("waste"),
    itemId,
    purchaseKey,
    itemName: itemName || purchaseKey || itemId,
    qty,
    unit: cleanUnit(entry.unit || entry.stockUnit || ""),
    unitCost,
    totalCost,
    reason: String(entry.reason || entry.note || "").trim(),
    createdAt: typeof entry.createdAt === "string" && entry.createdAt ? entry.createdAt : new Date().toISOString()
  };
}

function normalizeState(parsed = {}) {
  const fallback = defaultState();
  const next = {
    ...fallback,
    ...parsed,
    reportingStart: parsed.reportingStart && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(parsed.reportingStart.localTime || "") && Number.isFinite(Date.parse(parsed.reportingStart.localTime))
      ? { localTime: parsed.reportingStart.localTime, backupFile: String(parsed.reportingStart.backupFile || ""), createdAt: String(parsed.reportingStart.createdAt || "") }
      : null,
    tableCount: Number(parsed.tableCount || DEFAULT_TABLE_COUNT),
    tableNames: parsed.tableNames || {},
    theme: savedThemePreference() || (parsed.theme === "dark" ? "dark" : "light"),
    inventoryPane: parsed.inventoryPane === "count" ? "count" : "stock",
    lastPaymentMethod: paymentMethods.includes(parsed.lastPaymentMethod) ? parsed.lastPaymentMethod : "cash",
    lastWorkerTransactionType: workerTransactionTypeLabels[parsed.lastWorkerTransactionType] ? parsed.lastWorkerTransactionType : WORKER_ADVANCE_TYPE,
    lastWorkerConsumptionMode: ["worker_price", SALARY_WORKER_CONSUMPTION_TYPE, FREE_WORKER_CONSUMPTION_TYPE].includes(parsed.lastWorkerConsumptionMode) ? parsed.lastWorkerConsumptionMode : "worker_price",
    menu: normalizeMenuItems(parsed.menu?.length ? parsed.menu : defaultMenu),
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    workers: Array.isArray(parsed.workers) ? parsed.workers.map(normalizeWorker) : [],
    openOrders: parsed.openOrders || {},
    invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
    purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
    manualPurchaseInventoryItems: Array.isArray(parsed.manualPurchaseInventoryItems)
      ? parsed.manualPurchaseInventoryItems.map(normalizeManualPurchaseInventoryItem).filter(Boolean)
      : [],
    inventoryWaste: Array.isArray(parsed.inventoryWaste)
      ? parsed.inventoryWaste.map(normalizeInventoryWasteRecord).filter(Boolean)
      : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses.map(normalizeExpense) : [],
    workerConsumptions: Array.isArray(parsed.workerConsumptions) ? parsed.workerConsumptions.map(normalizeWorkerConsumption) : [],
    workerTransactions: Array.isArray(parsed.workerTransactions) ? parsed.workerTransactions.map(normalizeWorkerTransaction) : [],
    workerLeaves: Array.isArray(parsed.workerLeaves) ? parsed.workerLeaves.map(normalizeWorkerLeave) : [],
    inventoryCounts: Array.isArray(parsed.inventoryCounts) ? parsed.inventoryCounts : [],
    purchaseInventoryAdjustments: parsed.purchaseInventoryAdjustments && typeof parsed.purchaseInventoryAdjustments === "object" ? parsed.purchaseInventoryAdjustments : {},
    purchaseInventoryStatuses: (() => {
      const raw = parsed.purchaseInventoryStatuses && typeof parsed.purchaseInventoryStatuses === "object" ? parsed.purchaseInventoryStatuses : {};
      const allowed = new Set(["active", "clearing", "stopped"]);
      return Object.entries(raw).reduce((result, [key, entry]) => {
        const status = typeof entry === "string" ? entry : entry?.status;
        if (!key || !allowed.has(status)) return result;
        result[key] = {
          status,
          updatedAt: typeof entry?.updatedAt === "string" ? entry.updatedAt : ""
        };
        return result;
      }, {});
    })(),
    purchaseInventoryAliases: parsed.purchaseInventoryAliases && typeof parsed.purchaseInventoryAliases === "object" ? parsed.purchaseInventoryAliases : {},
    purchaseInventoryHiddenKeys: parsed.purchaseInventoryHiddenKeys && typeof parsed.purchaseInventoryHiddenKeys === "object" ? parsed.purchaseInventoryHiddenKeys : {},
    customerPrices: Array.isArray(parsed.customerPrices) ? parsed.customerPrices : [],
    periodCloses: Array.isArray(parsed.periodCloses) ? parsed.periodCloses : [],
    lowStockThreshold: Number.isFinite(Number(parsed.lowStockThreshold)) ? Number(parsed.lowStockThreshold) : 5,
    openingCash: normalizeOpeningCash(parsed.openingCash),
    cashAdjustments: Array.isArray(parsed.cashAdjustments) ? parsed.cashAdjustments : [],
    cashTransfers: Array.isArray(parsed.cashTransfers) ? parsed.cashTransfers.map(normalizeCashTransfer) : [],
    ownerWithdrawals: Array.isArray(parsed.ownerWithdrawals)
      ? parsed.ownerWithdrawals.map(normalizeOwnerWithdrawal).filter(Boolean)
      : [],
    partners: Array.isArray(parsed.partners) ? parsed.partners.map(normalizePartner) : [],
    partnerFundingTransactions: Array.isArray(parsed.partnerFundingTransactions)
      ? parsed.partnerFundingTransactions.map(normalizePartnerFundingTransaction).filter(Boolean)
      : [],
    partnerDistributionBasis: parsed.partnerDistributionBasis === "profit" ? "profit" : "cash",
    partnerDistributionSource: parsed.partnerDistributionSource === "onHand" ? "onHand" : "period",
    periodCloseCashSource: parsed.periodCloseCashSource === "onHand" ? "onHand" : "period",
    auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog.slice(0, MAX_AUDIT_LOG) : [],
    businessName: (typeof parsed.businessName === "string" && parsed.businessName.trim()) ? parsed.businessName.trim() : "دفتر المقهى",
    appPin: typeof parsed.appPin === "string" ? parsed.appPin : "",
    printSize: ["a4", "80mm", "58mm"].includes(parsed.printSize) ? parsed.printSize : "a4",
    autoBackup: parsed.autoBackup !== false,
    autoBackupTime: normalizeAutoBackupTimeValue(parsed.autoBackupTime),
    lastAutoBackup: typeof parsed.lastAutoBackup === "string" ? parsed.lastAutoBackup : "",
    lastAutoBackupAt: typeof parsed.lastAutoBackupAt === "string" ? parsed.lastAutoBackupAt : "",
    lastFolderBackup: typeof parsed.lastFolderBackup === "string" ? parsed.lastFolderBackup : "",
    supplierPayments: Array.isArray(parsed.supplierPayments) ? parsed.supplierPayments : [],
    supplierTransactions: Array.isArray(parsed.supplierTransactions) && typeof normalizeSupplierTransaction === "function"
      ? parsed.supplierTransactions.map(normalizeSupplierTransaction).filter(Boolean)
      : [],
    loyalty: (() => {
      const l = parsed.loyalty && typeof parsed.loyalty === "object" ? parsed.loyalty : {};
      const pos = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
      return {
        enabled: l.enabled !== false,
        perShekel: pos(l.perShekel, 1),
        rewardPoints: pos(l.rewardPoints, 100),
        rewardValue: pos(l.rewardValue, 10)
      };
    })(),
    combos: Array.isArray(parsed.combos) ? parsed.combos.map((c) => ({
      id: c.id || uid("combo"),
      name: String(c.name || "").trim(),
      price: Math.max(Number(c.price || 0), 0),
      items: Array.isArray(c.items) ? c.items.map((ci) => ({ menuItemId: ci.menuItemId || ci.id || "", qty: Math.max(Number(ci.qty || 1), 1) })).filter((ci) => ci.menuItemId) : []
    })).filter((c) => c.name && c.price > 0 && c.items.length) : []
  };
  next.workers = reconcileWorkers(next.workers, next.workerConsumptions, next.workerTransactions, next.workerLeaves);
  next.tableCount = Math.max(1, Math.floor(Number(next.tableCount || DEFAULT_TABLE_COUNT)));
  next.selectedTable = Math.min(Math.max(Number(next.selectedTable || 1), 1), next.tableCount);
  next.lastSelectedCustomerId = typeof parsed.lastSelectedCustomerId === "string" ? parsed.lastSelectedCustomerId : "";
  next.lastSelectedWorkerId = typeof parsed.lastSelectedWorkerId === "string" ? parsed.lastSelectedWorkerId : "";
  next.lastSelectedCategory = typeof parsed.lastSelectedCategory === "string" && parsed.lastSelectedCategory ? parsed.lastSelectedCategory : "الكل";
  next.ownerWithdrawals = next.ownerWithdrawals.map((entry) => {
    if (entry.partnerName || !entry.partnerId) return entry;
    const partner = next.partners.find((item) => item.id === entry.partnerId);
    return partner ? { ...entry, partnerName: partner.name } : entry;
  });
  rebuildCustomerAccountsFromInvoices(next);
  workerConsumptionMode = next.lastWorkerConsumptionMode;
  return next;
}

function restoreLastUiLocation() {
  const savedUi = loadUiState();
  if (savedUi) {
    const savedTable = Number(savedUi.selectedTable || 0);
    if (Number.isFinite(savedTable) && savedTable > 0) {
      state.selectedTable = Math.min(Math.max(Math.floor(savedTable), 1), getTableCount());
    }
    if (savedUi.view && canAccessView(savedUi.view)) state.view = savedUi.view;
    if (typeof savedUi.lastSelectedCustomerId === "string") state.lastSelectedCustomerId = savedUi.lastSelectedCustomerId;
    if (typeof savedUi.lastSelectedWorkerId === "string") state.lastSelectedWorkerId = savedUi.lastSelectedWorkerId;
    if (typeof savedUi.lastSelectedCategory === "string" && savedUi.lastSelectedCategory) {
      state.lastSelectedCategory = savedUi.lastSelectedCategory;
    }
    if (["summary", "sales", "cash", "expenses", "partners", "details", "meeting", "handover"].includes(savedUi.reportSection)) {
      selectedReportSection = savedUi.reportSection === "details" || savedUi.reportSection === "meeting"
        ? "partners"
        : savedUi.reportSection;
    }
    if (["invoice", "expenses", "records", "suppliers"].includes(savedUi.purchaseSection)) {
      selectedPurchaseSection = savedUi.purchaseSection;
    }
  }
  selectedCustomerId = state.lastSelectedCustomerId && getCustomer(state.lastSelectedCustomerId)
    ? state.lastSelectedCustomerId
    : state.customers[0]?.id || null;
  selectedWorkerId = state.lastSelectedWorkerId && getWorker(state.lastSelectedWorkerId)
    ? state.lastSelectedWorkerId
    : state.workers[0]?.id || null;
  selectedCategory = state.lastSelectedCategory || "الكل";
}

function rememberUiLocation() {
  if (!state) return;
  state.lastSelectedCustomerId = selectedCustomerId && getCustomer(selectedCustomerId) ? selectedCustomerId : "";
  state.lastSelectedWorkerId = selectedWorkerId && getWorker(selectedWorkerId) ? selectedWorkerId : "";
  state.lastSelectedCategory = typeof selectedCategory === "string" && selectedCategory ? selectedCategory : "الكل";
}

let lastUiSerialized = "";

function uiStateSnapshot() {
  if (!state) return null;
  return {
    view: state.view || "pos",
    selectedTable: Math.min(Math.max(Number(state.selectedTable || 1), 1), getTableCount()),
    lastSelectedCustomerId: state.lastSelectedCustomerId || "",
    lastSelectedWorkerId: state.lastSelectedWorkerId || "",
    lastSelectedCategory: state.lastSelectedCategory || "الكل",
    reportSection: selectedReportSection,
    purchaseSection: selectedPurchaseSection
  };
}

function loadUiState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveUiState() {
  const snapshot = uiStateSnapshot();
  if (!snapshot) return;
  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastUiSerialized) return;
    localStorage.setItem(UI_STATE_KEY, serialized);
    lastUiSerialized = serialized;
  } catch (error) {}
}

function isLedgerCashCustomerName(name) {
  const cleaned = String(name || "").trim();
  return !cleaned || cleaned === "زبون نقدي";
}

function invoiceIsCancelled(invoice = {}) {
  return invoice.type === "cancelled" || invoice.status === "cancelled" || Boolean(invoice.cancelledAt);
}

function invoiceAccountDelta(invoice = {}) {
  if (invoiceIsCancelled(invoice)) return 0;
  const delta = Number(invoice.delta);
  if (Number.isFinite(delta)) return delta;
  if (invoice.type === "payment") return -(Number(invoice.paid || 0) + Number(invoice.discount || 0));
  if (invoice.type === "payout") return Number(invoice.paid || 0);
  if (invoice.type === "debt") return Number(invoice.total || 0);
  return Number(invoice.total || 0) - Number(invoice.paid || 0);
}

function findCustomerForInvoice(data, invoice) {
  const customers = Array.isArray(data.customers) ? data.customers : [];
  if (invoice.customerId) {
    const byId = customers.find((customer) => customer.id === invoice.customerId);
    if (byId) return byId;
  }
  const name = String(invoice.customerName || "").trim();
  return name ? customers.find((customer) => String(customer.name || "").trim() === name) || null : null;
}

function ensureInvoiceCustomer(data, invoice) {
  if (isLedgerCashCustomerName(invoice.customerName) && !invoice.customerId) return null;
  data.customers = Array.isArray(data.customers) ? data.customers : [];

  let customer = findCustomerForInvoice(data, invoice);
  if (customer) return customer;

  const name = String(invoice.customerName || "").trim();
  if (!name || isLedgerCashCustomerName(name)) return null;

  customer = {
    id: invoice.customerId || uid("customer"),
    name,
    phone: "",
    balance: 0,
    totalBilled: 0,
    totalPaid: 0,
    createdAt: invoice.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.customers.unshift(customer);
  return customer;
}

function rebuildCustomerAccountsFromInvoices(data = state) {
  if (!data || !Array.isArray(data.invoices)) return data;
  data.customers = Array.isArray(data.customers) ? data.customers : [];
  const touched = new Set();

  data.invoices.forEach((invoice) => {
    if (!invoice || typeof invoice !== "object") return;
    const customer = ensureInvoiceCustomer(data, invoice);
    if (!customer) return;

    if (!touched.has(customer.id)) {
      customer.balance = 0;
      customer.totalBilled = 0;
      customer.totalPaid = 0;
      touched.add(customer.id);
    }

    invoice.customerId = customer.id;
    invoice.customerName = customer.name;
    if (invoiceIsCancelled(invoice)) {
      customer.updatedAt = new Date().toISOString();
      return;
    }
    customer.totalBilled += Number(invoice.total || 0);
    customer.totalPaid += invoice.type === "payout" ? -Number(invoice.paid || 0) : Number(invoice.paid || 0);
    customer.balance += invoiceAccountDelta(invoice);
    customer.updatedAt = new Date().toISOString();
  });

  data.customers.forEach((customer) => {
    if (!touched.has(customer.id)) return;
    customer.totalBilled = Math.max(0, Number(customer.totalBilled || 0));
    customer.totalPaid = Math.max(0, Number(customer.totalPaid || 0));
    customer.balance = Number(customer.balance || 0);
  });

  return data;
}

function sanitizedAuditDetails(details) {
  try {
    const json = JSON.stringify(details || {});
    if (json.length <= 8000) return JSON.parse(json);
    return { truncated: true, preview: json.slice(0, 8000) };
  } catch (error) {
    return { note: "تعذر حفظ تفاصيل العملية" };
  }
}

function auditAction(action, details = {}) {
  if (!state) return;
  state.auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
  state.auditLog.unshift({
    id: typeof uid === "function" ? uid("audit") : `audit-${Date.now()}`,
    action,
    details: sanitizedAuditDetails(details),
    createdAt: new Date().toISOString()
  });
  state.auditLog = state.auditLog.slice(0, MAX_AUDIT_LOG);
}

function customerAccountExpectations(data = state) {
  const result = new Map();
  if (!data || !Array.isArray(data.invoices)) return result;

  data.invoices.forEach((invoice) => {
    if (!invoice || (isLedgerCashCustomerName(invoice.customerName) && !invoice.customerId)) return;
    if (invoiceIsCancelled(invoice)) return;
    const key = invoice.customerId || String(invoice.customerName || "").trim();
    if (!key) return;
    const row = result.get(key) || {
      name: invoice.customerName || "",
      totalBilled: 0,
      totalPaid: 0,
      balance: 0
    };
    row.totalBilled += Number(invoice.total || 0);
    row.totalPaid += invoice.type === "payout" ? -Number(invoice.paid || 0) : Number(invoice.paid || 0);
    row.balance += invoiceAccountDelta(invoice);
    result.set(key, row);
  });

  return result;
}

function dataHealthReport(data = state) {
  const issues = [];
  const invoices = Array.isArray(data?.invoices) ? data.invoices : [];
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const closes = Array.isArray(data?.periodCloses) ? data.periodCloses : [];
  const invoiceKeys = new Set();
  let duplicateInvoices = 0;
  let invalidDates = 0;

  invoices.forEach((invoice) => {
    const key = `${invoice.number || ""}__${invoice.createdAt || ""}`;
    if (invoiceKeys.has(key)) duplicateInvoices += 1;
    invoiceKeys.add(key);
    if (Number.isNaN(new Date(invoice.createdAt).getTime())) invalidDates += 1;
  });

  if (duplicateInvoices) issues.push(`فواتير مكررة: ${duplicateInvoices}`);
  if (invalidDates) issues.push(`تواريخ فواتير غير صحيحة: ${invalidDates}`);

  let overlappingCloses = 0;
  for (let i = 0; i < closes.length; i += 1) {
    for (let j = i + 1; j < closes.length; j += 1) {
      if (closes[i].from <= closes[j].to && closes[i].to >= closes[j].from) overlappingCloses += 1;
    }
  }
  if (overlappingCloses) issues.push(`إغلاقات متداخلة: ${overlappingCloses}`);

  const expectations = customerAccountExpectations(data);
  let customerMismatches = 0;
  customers.forEach((customer) => {
    const expected = expectations.get(customer.id) || expectations.get(String(customer.name || "").trim());
    if (!expected) return;
    const balanceDiff = Math.abs(Number(customer.balance || 0) - Number(expected.balance || 0));
    const billedDiff = Math.abs(Number(customer.totalBilled || 0) - Number(expected.totalBilled || 0));
    const paidDiff = Math.abs(Number(customer.totalPaid || 0) - Math.max(0, Number(expected.totalPaid || 0)));
    if (balanceDiff > 0.01 || billedDiff > 0.01 || paidDiff > 0.01) customerMismatches += 1;
  });
  if (customerMismatches) issues.push(`أرصدة عملاء تحتاج مزامنة: ${customerMismatches}`);

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      invoices: invoices.length,
      customers: customers.length,
      auditLog: Array.isArray(data?.auditLog) ? data.auditLog.length : 0,
      backups: Number(data?.lastAutoBackup ? 1 : 0)
    }
  };
}

function parseBackupSnapshot(raw) {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed?.payload ? JSON.parse(parsed.payload) : parsed;
}

function loadLocalBackupState() {
  try {
    const autoBackup = parseBackupSnapshot(localStorage.getItem(AUTO_BACKUP_KEY));
    if (autoBackup) return normalizeState(autoBackup);

    const history = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || "[]");
    const latest = Array.isArray(history) ? history.find((entry) => entry?.payload) : null;
    return latest ? normalizeState(JSON.parse(latest.payload)) : null;
  } catch (error) {
    console.warn("Could not load backup data", error);
    return null;
  }
}

function backupSnapshotKey(snapshot) {
  if (!snapshot) return "";
  return snapshot.key || snapshot.snapshotId || `${snapshot.createdAt || ""}__${String(snapshot.payload || "").length}__${Number(snapshot.recordCount || 0)}`;
}

function normalizeBackupSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.payload) return null;
  const key = backupSnapshotKey(snapshot);
  return {
    ...snapshot,
    key,
    source: snapshot.source || "auto",
    recordCount: Number(snapshot.recordCount || 0),
    payloadSize: Number(snapshot.payloadSize || String(snapshot.payload || "").length)
  };
}

function dedupeBackupSnapshots(snapshots = []) {
  const seen = new Set();
  return snapshots
    .map(normalizeBackupSnapshot)
    .filter(Boolean)
    .filter((snapshot) => {
      const key = backupSnapshotKey(snapshot);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function trimBackupHistory(snapshots = []) {
  let autoCount = 0;
  return dedupeBackupSnapshots(snapshots)
    .filter((snapshot) => {
      if ((snapshot.source || "auto") !== "auto") return true;
      autoCount += 1;
      return autoCount <= MAX_AUTO_BACKUP_HISTORY;
    })
    .slice(0, MAX_BACKUP_HISTORY);
}

function compactLocalBackupHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || "[]");
    if (!Array.isArray(history) || !history.length) return false;
    const compacted = trimBackupHistory(history);
    const before = JSON.stringify(history);
    const after = JSON.stringify(compacted);
    if (before === after) return false;
    localStorage.setItem(BACKUP_HISTORY_KEY, after);
    return true;
  } catch (error) {
    console.warn("Could not compact backup history", error);
    return false;
  }
}

function localBackupSnapshots() {
  try {
    const snapshots = [];
    const pushSnapshot = (entry) => {
      if (!entry || typeof entry !== "object" || !entry.payload) return;
      snapshots.push(entry);
    };

    pushSnapshot(JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || "null"));
    const history = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || "[]");
    if (Array.isArray(history)) history.forEach(pushSnapshot);

    return dedupeBackupSnapshots(snapshots);
  } catch (error) {
    console.warn("Could not read local backup snapshots", error);
    return [];
  }
}

function latestLocalBackupSnapshot() {
  return localBackupSnapshots()[0] || null;
}

function snapshotState(snapshot) {
  if (!snapshot?.payload) return null;
  try {
    return normalizeState(JSON.parse(snapshot.payload));
  } catch (error) {
    return null;
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    loadedStateSavedAt = Number(localStorage.getItem(STATE_SAVED_AT_KEY) || 0) || 0;
    if (!raw) {
      const backup = loadLocalBackupState();
      if (backup) return backup;
      stateNeedsBackupRecovery = true;
      return defaultState();
    }
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn("Could not load saved data", error);
    const backup = loadLocalBackupState();
    if (backup) return backup;
    stateNeedsBackupRecovery = true;
    return defaultState();
  }
}

let localBackupTimer = null;
let pendingSerialized = null;
let lastSavedSerialized = null;

let mainSaveTimer = null;
let pendingMainSaveNeedsBackup = false;

function normalizeSaveOptions(options) {
  if (options === true) return { immediate: true, backup: true };
  if (options && typeof options === "object") {
    return {
      immediate: options.immediate === true,
      backup: options.backup !== false
    };
  }
  return { immediate: false, backup: true };
}

// الحفظ مؤجَّل: الحركات السريعة تُدمج في حفظة واحدة، والنسخ الثقيلة اختيارية.
function saveState(options) {
  const normalized = normalizeSaveOptions(options);
  if (normalized.immediate) {
    const shouldBackup = normalized.backup || pendingMainSaveNeedsBackup;
    if (mainSaveTimer) { clearTimeout(mainSaveTimer); mainSaveTimer = null; }
    pendingMainSaveNeedsBackup = false;
    persistStateNow({ backup: shouldBackup });
    if (shouldBackup) flushBackups(true);
    return;
  }
  if (mainSaveTimer) {
    pendingMainSaveNeedsBackup = pendingMainSaveNeedsBackup || normalized.backup;
    return;
  }
  pendingMainSaveNeedsBackup = normalized.backup;
  mainSaveTimer = setTimeout(() => {
    const shouldBackup = pendingMainSaveNeedsBackup;
    mainSaveTimer = null;
    pendingMainSaveNeedsBackup = false;
    persistStateNow({ backup: shouldBackup });
  }, 400);
}

function persistStateNow(options = {}) {
  if (!state) return;
  const serialized = JSON.stringify(state);
  if (serialized === lastSavedSerialized) return;
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(STATE_SAVED_AT_KEY, String(Date.now()));
    lastSavedSerialized = serialized;
  } catch (error) {
    console.warn("Could not save browser storage", error);
  }
  if (options.backup === false && !pendingSerialized) return;
  pendingSerialized = serialized;
  clearTimeout(localBackupTimer);
  localBackupTimer = setTimeout(flushBackups, options.backup === false ? 2200 : 1500);
}

function flushBackups(immediate) {
  clearTimeout(localBackupTimer);
  const serialized = pendingSerialized;
  if (!serialized) return;
  pendingSerialized = null;
  try {
    saveLocalBackup(serialized);
  } catch (error) {
    console.warn("Could not save local backup", error);
  }
  if (!stateNeedsBackupRecovery || businessRecordCount(state) > 0) {
    if (immediate === true) {
      writeDurableBackup(backupSnapshot(serialized)).catch((error) => {
        console.warn("Could not save durable backup", error);
      });
    } else {
      queueDurableBackup(serialized);
    }
  }
}

function businessRecordCount(data = state) {
  const openOrderCount = Object.values(data.openOrders || {}).filter((order) => order.items?.length).length;
  return Number(data.customers?.length || 0)
    + Number(data.workers?.length || 0)
    + Number(data.invoices?.length || 0)
    + Number(data.purchases?.length || 0)
    + Number(data.workerConsumptions?.length || 0)
    + Number(data.workerTransactions?.length || 0)
    + Number(data.expenses?.length || 0)
    + Number(data.partners?.length || 0)
    + Number(data.partnerFundingTransactions?.length || 0)
    + Number(data.inventoryCounts?.length || 0)
    + Number(data.inventoryWaste?.length || 0)
    + openOrderCount;
}

function backupSnapshot(serialized, options = {}) {
  let recordCount = businessRecordCount(state);
  try {
    recordCount = businessRecordCount(normalizeState(JSON.parse(serialized)));
  } catch (error) {
    recordCount = businessRecordCount(state);
  }
  const createdAt = options.createdAt || new Date().toISOString();
  const snapshot = {
    createdAt,
    payload: serialized,
    recordCount,
    source: options.source || "auto",
    payloadSize: String(serialized || "").length
  };
  return {
    ...snapshot,
    key: backupSnapshotKey(snapshot)
  };
}

function saveLocalBackup(serialized, options = {}) {
  try {
    const snapshot = backupSnapshot(serialized, { source: options.source || "auto" });
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(snapshot));

    const history = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || "[]");
    const nextHistory = Array.isArray(history) ? history : [];
    const last = nextHistory[0];
    const lastTime = last?.createdAt ? new Date(last.createdAt).getTime() : 0;
    const now = new Date(snapshot.createdAt).getTime();
    const forceNew = Boolean(options.forceNew);
    const lastSource = last?.source || "auto";
    const canReplaceRecent = !forceNew
      && now - lastTime < 10 * 60 * 1000
      && ["auto"].includes(snapshot.source)
      && ["auto"].includes(lastSource);

    if (forceNew || !last || last.payload !== serialized) {
      if (canReplaceRecent) nextHistory[0] = snapshot;
      else nextHistory.unshift(snapshot);
    }

    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(trimBackupHistory(nextHistory)));
    return true;
  } catch (error) {
    console.warn("Could not save local backup", error);
    return false;
  }
}

function openBackupDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(BACKUP_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        database.createObjectStore(BACKUP_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── تخزين مقبض مجلد النسخ التلقائي (File System Access) في IndexedDB ──
const BACKUP_DIR_HANDLE_KEY = "backup-dir-handle";

async function saveBackupDirHandle(handle) {
  const database = await openBackupDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(BACKUP_STORE_NAME, "readwrite");
    tx.objectStore(BACKUP_STORE_NAME).put({ id: BACKUP_DIR_HANDLE_KEY, handle });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function loadBackupDirHandle() {
  try {
    const database = await openBackupDatabase();
    return await new Promise((resolve) => {
      const tx = database.transaction(BACKUP_STORE_NAME, "readonly");
      const req = tx.objectStore(BACKUP_STORE_NAME).get(BACKUP_DIR_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result ? req.result.handle : null);
      req.onerror = () => resolve(null);
    });
  } catch (error) {
    return null;
  }
}

async function clearBackupDirHandle() {
  try {
    const database = await openBackupDatabase();
    return await new Promise((resolve) => {
      const tx = database.transaction(BACKUP_STORE_NAME, "readwrite");
      tx.objectStore(BACKUP_STORE_NAME).delete(BACKUP_DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (error) {
    return false;
  }
}

async function writeDurableBackup(snapshot) {
  const database = await openBackupDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BACKUP_STORE_NAME);
    store.put({ id: "latest", ...snapshot });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function queueDurableBackup(serialized) {
  clearTimeout(backupWriteTimer);
  backupWriteTimer = setTimeout(() => {
    writeDurableBackup(backupSnapshot(serialized)).catch((error) => {
      console.warn("Could not save durable backup", error);
    });
  }, 250);
}

async function readDurableBackup() {
  const database = await openBackupDatabase();
  const snapshot = await new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE_NAME, "readonly");
    const request = transaction.objectStore(BACKUP_STORE_NAME).get("latest");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return snapshot;
}

function newerBackupSnapshot(first, second) {
  if (!first) return second || null;
  if (!second) return first;
  const firstTime = new Date(first.createdAt || 0).getTime();
  const secondTime = new Date(second.createdAt || 0).getTime();
  return secondTime > firstTime ? second : first;
}

async function latestBackupSnapshot() {
  let latest = latestLocalBackupSnapshot();
  try {
    const durable = await readDurableBackup();
    if (durable?.payload && snapshotState(durable)) {
      latest = newerBackupSnapshot(latest, durable);
    }
  } catch (error) {
    // التخزين الأقوى غير متاح بكل المتصفحات؛ نستخدم النسخ المحلية العادية.
  }
  return latest || null;
}

async function backupSnapshots() {
  const snapshots = localBackupSnapshots();
  try {
    const durable = await readDurableBackup();
    if (durable?.payload && snapshotState(durable)) snapshots.push(durable);
  } catch (error) {
    // IndexedDB may be unavailable; localStorage snapshots still work.
  }
  return dedupeBackupSnapshots(snapshots).slice(0, MAX_BACKUP_HISTORY);
}

async function backupSnapshotByKey(key) {
  const wanted = String(key || "");
  if (!wanted) return null;
  const snapshots = await backupSnapshots();
  return snapshots.find((snapshot) => backupSnapshotKey(snapshot) === wanted) || null;
}

async function recoverFromDurableBackup() {
  try {
    const snapshot = await latestBackupSnapshot();
    if (!snapshot?.payload) {
      stateNeedsBackupRecovery = false;
      return;
    }

    const recoveredState = normalizeState(JSON.parse(snapshot.payload));
    const currentCount = businessRecordCount(state);
    const recoveredCount = businessRecordCount(recoveredState);
    const snapshotTime = new Date(snapshot.createdAt || 0).getTime() || 0;
    const hasNewerBackup = loadedStateSavedAt > 0 && snapshotTime > loadedStateSavedAt && recoveredCount >= currentCount;
    const shouldRecover = stateNeedsBackupRecovery || recoveredCount > currentCount || hasNewerBackup;
    if (!shouldRecover) {
      stateNeedsBackupRecovery = false;
      return;
    }

    state = recoveredState;
    stateNeedsBackupRecovery = false;
    restoreLastUiLocation();
    lastClosedInvoice = state.invoices[0] || null;
    setLastPaymentMethod(getLastPaymentMethod());
    showToast("تم استعادة بياناتك من نسخة احتياطية تلقائياً.");
    render();
  } catch (error) {
    stateNeedsBackupRecovery = false;
    console.warn("Could not recover durable backup", error);
  }
}
