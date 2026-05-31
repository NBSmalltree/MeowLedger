// ============================================================
// 喵喵账本 - 核心类型定义
// ============================================================

/** 数据来源 */
export type Source = 'wechat' | 'alipay';

/** 资金方向 */
export type Direction = 'income' | 'expense' | 'neutral';

/** 对账状态 */
export type ReconcileStatus =
  | 'matched'        // 已对平
  | 'unmatched'      // 未匹配
  | 'manual_matched' // 手动匹配
  | 'discrepancy';   // 有差异

/** 家庭成员 */
export interface Member {
  id?: number;
  name: string;
  color: string;
  created_at?: string;
}

/** 统一交易记录 */
export interface Transaction {
  id?: number;
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
  is_refund: number;        // 0 or 1
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
  is_hidden: number;        // 0 or 1
  member_id?: number;       // 家庭成员
  created_at?: string;
  updated_at?: string;
}

/** 对账组 */
export interface ReconcileGroup {
  id: string;
  original_txn_id: number;
  total_paid: number;
  total_refunded: number;
  net_amount: number;
  refund_count: number;
  status: 'open' | 'partial_refund' | 'fully_refunded' | 'closed';
  counterparty?: string;
  product_desc?: string;
  first_trade_time: string;
  last_trade_time: string;
}

/** 月度汇总 */
export interface MonthlySummary {
  month: string;
  source: string;
  txn_count: number;
  total_expense: number;
  total_income: number;
  total_refund: number;
  net_expense: number;
}

/** 分类汇总 */
export interface CategorySummary {
  category: string;
  txn_count: number;
  net_expense: number;
  refund_amount: number;
}

/** 导出选项 */
export interface ExportOptions {
  startDate: string;
  endDate: string;
  sources?: Source[];
  includeRefunds: boolean;
  netMode: boolean;
  format: 'xlsx' | 'csv';
}

/** 导入结果 */
export interface ImportResult {
  success: boolean;
  source: Source;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: string[];
}

/** 分类规则 */
export interface CategoryRule {
  id?: number;
  match_field: 'counterparty' | 'product_desc' | 'trade_type';
  match_pattern: string;
  match_type: 'exact' | 'contains' | 'regex';
  category: string;
  priority: number;
}

/** 仪表盘统计 */
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

/** 退款链路 */
export interface RefundChain {
  groupId: string;
  groupStatus: string;
  counterparty: string;
  productDesc: string;
  memberId?: number;
  memberName?: string;
  items: {
    txnId: number;
    tradeTime: string;
    direction: Direction;
    amount: number;
    status: string;
    source: Source;
    isRefund: boolean;
    memberId?: number;
  }[];
  totalPaid: number;
  totalRefunded: number;
  netAmount: number;
}
