// ============================================================
// 喵喵账本 - 前端类型定义（与后端共享）
// ============================================================

export type Source = 'wechat' | 'alipay' | 'manual';
export type Direction = 'income' | 'expense' | 'neutral';
export type ReconcileStatus = 'matched' | 'unmatched' | 'manual_matched' | 'discrepancy';
export type ActivePage = 'dashboard' | 'ledger' | 'reconcile' | 'import' | 'export' | 'settings';

export interface Transaction {
  id: number;
  source: Source;
  source_file?: string;
  trade_time: string;
  trade_type: string;
  category?: string;
  counterparty?: string;
  counterparty_account?: string;
  product_desc?: string;
  direction: Direction;
  amount: number;
  net_amount?: number;
  payment_method?: string;
  status: string;
  is_refund: number;
  refund_amount: number;
  original_txn_id?: string;
  platform_txn_id?: string;
  merchant_txn_id?: string;
  platform_order_id?: string;
  merchant_order_id?: string;
  remark?: string;
  reconcile_status: ReconcileStatus;
  reconcile_group_id?: string;
  user_note?: string;
  is_hidden: number;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlySummary {
  month: string;
  source: string;
  txn_count: number;
  total_expense: number;
  total_income: number;
  total_refund: number;
  net_expense: number;
}

export interface CategorySummary {
  category: string;
  txn_count: number;
  net_expense: number;
  refund_amount: number;
}

export interface DashboardStats {
  totalExpense: number;
  totalIncome: number;
  totalRefund: number;
  netExpense: number;
  txnCount: number;
  unmatchedCount: number;
  discrepancyCount: number;
  wechatExpense: number;
  alipayExpense: number;
  dailyTrend: { date: string; expense: number; refund: number; net: number }[];
  topCategories: CategorySummary[];
}

export interface RefundChain {
  groupId: string;
  groupStatus: string;
  counterparty: string;
  productDesc: string;
  items: {
    txnId: number;
    tradeTime: string;
    direction: Direction;
    amount: number;
    status: string;
    source: Source;
    isRefund: boolean;
  }[];
  totalPaid: number;
  totalRefunded: number;
  netAmount: number;
}

export interface ImportResult {
  success: boolean;
  source: Source;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: string[];
}

export interface ExportOptions {
  startDate: string;
  endDate: string;
  sources?: Source[];
  includeRefunds: boolean;
  netMode: boolean;
  format: 'xlsx' | 'csv';
}
