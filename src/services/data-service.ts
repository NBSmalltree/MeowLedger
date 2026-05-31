// ============================================================
// 喵喵账本 - 数据服务层
// 自动检测运行环境：Electron IPC / Mock 数据（Web 开发模式）
// ============================================================

import type {
  Transaction, DashboardStats, RefundChain,
  MonthlySummary, Source, Direction
} from '../types/index';

// ============================================================
// 检测是否运行在 Electron 环境
// ============================================================

declare global {
  interface Window {
    meowLedger?: {
      getTransactions: (filters?: any) => Promise<Transaction[]>;
      getDashboardStats: (startDate?: string, endDate?: string) => Promise<DashboardStats>;
      getMonthlySummary: () => Promise<MonthlySummary[]>;
      getRefundChains: () => Promise<RefundChain[]>;
      getStats: () => Promise<{ total: number; wechat: number; alipay: number }>;
      importFile: (path: string) => Promise<{ success: boolean; message: string; imported: number }>;
      openFileDialog: () => Promise<string[]>;
      getImportHistory: () => Promise<any[]>;
      exportExcel: (options: any) => Promise<{ success: boolean; message: string; path?: string }>;
      runReconciliation: () => Promise<{ groupsCreated: number; matched: number; unmatched: number }>;
      updateTransaction: (id: number, updates: Partial<Transaction>) => Promise<void>;
      clearAllData: () => Promise<void>;
      deleteTransactions: (ids: number[]) => Promise<{ success: boolean; deleted: number }>;
      addTransaction: (txn: any) => Promise<{ success: boolean; id: number | null }>;
      getCategories: () => Promise<string[]>;
      addCategoryRule: (rule: any) => Promise<boolean>;
    };
  }
}

const isElectron = typeof window !== 'undefined' && !!window.meowLedger;

// ============================================================
// Electron IPC 后端
// ============================================================

const electronBackend = {
  async getTransactions(filters?: {
    source?: Source; direction?: Direction; search?: string; isRefund?: number;
    reconcileStatus?: string; startDate?: string; endDate?: string;
  }): Promise<Transaction[]> {
    return window.meowLedger!.getTransactions(filters);
  },

  async getDashboardStats(startDate?: string, endDate?: string): Promise<DashboardStats> {
    return window.meowLedger!.getDashboardStats(startDate, endDate);
  },

  async getRefundChains(): Promise<RefundChain[]> {
    return window.meowLedger!.getRefundChains();
  },

  async getMonthlySummary(): Promise<MonthlySummary[]> {
    return window.meowLedger!.getMonthlySummary();
  },

  async getStats() {
    return window.meowLedger!.getStats();
  },

  async importFile(filePath: string) {
    return window.meowLedger!.importFile(filePath);
  },

  async openFileDialog(): Promise<string[]> {
    return window.meowLedger!.openFileDialog();
  },

  async getImportHistory() {
    return window.meowLedger!.getImportHistory();
  },

  async exportExcel(options: any) {
    return window.meowLedger!.exportExcel(options);
  },

  async runReconciliation() {
    return window.meowLedger!.runReconciliation();
  },

  async updateTransaction(id: number, updates: Partial<Transaction>) {
    return window.meowLedger!.updateTransaction(id, updates);
  },

  async clearAllData() {
    return window.meowLedger!.clearAllData();
  },

  async deleteTransactions(ids: number[]) {
    return window.meowLedger!.deleteTransactions(ids);
  },

  async addTransaction(txn: any) {
    return window.meowLedger!.addTransaction(txn);
  },

  async getCategories(): Promise<string[]> {
    return window.meowLedger!.getCategories();
  },

  async addCategoryRule(rule: any) {
    return window.meowLedger!.addCategoryRule(rule);
  },
};

// ============================================================
// Mock 后端（Web 开发模式）
// ============================================================

function mockTransactions(): Transaction[] {
  return [
    { id: 1, source: 'wechat', trade_time: '2026-05-27 22:23:16', trade_type: '商户消费', category: '公共服务-电费', counterparty: '国网浙江电力生活缴费', product_desc: '生活缴费', direction: 'expense', amount: 3.45, net_amount: 3.45, payment_method: '农业银行储蓄卡(2679)', status: '支付成功', is_refund: 0, refund_amount: 0, reconcile_status: 'matched', is_hidden: 0 },
    { id: 2, source: 'wechat', trade_time: '2026-05-27 22:16:19', trade_type: '商户消费', category: '交通-停车', counterparty: 'P云停车平台', product_desc: '久桦府停车场', direction: 'expense', amount: 95, net_amount: 95, status: '支付成功', is_refund: 0, refund_amount: 0, reconcile_status: 'matched', is_hidden: 0 },
    { id: 3, source: 'wechat', trade_time: '2026-05-13 08:53:39', trade_type: '扫二维码付款', category: '线下消费', counterparty: '白雪', product_desc: '停车费包年', direction: 'expense', amount: 1200, net_amount: 1200, status: '已转账', is_refund: 0, refund_amount: 0, reconcile_status: 'matched', is_hidden: 0 },
    { id: 4, source: 'wechat', trade_time: '2026-05-10 22:15:54', trade_type: '商户消费', category: '电商-拼多多', counterparty: '拼多多', direction: 'expense', amount: 29.51, net_amount: 29.51, status: '支付成功', is_refund: 0, refund_amount: 0, reconcile_status: 'matched', is_hidden: 0 },
    { id: 5, source: 'wechat', trade_time: '2026-05-10 21:39:28', trade_type: '商户消费', category: '电商-拼多多', counterparty: '拼多多平台商户', direction: 'expense', amount: 51.15, net_amount: 51.15, status: '支付成功', is_refund: 0, refund_amount: 0, reconcile_status: 'matched', is_hidden: 0 },
    { id: 6, source: 'wechat', trade_time: '2026-05-03 08:07:45', trade_type: '贵阳风驰-退款', category: '退款', counterparty: '贵阳风驰', direction: 'income', amount: 36.97, net_amount: 0, status: 'refund_received', is_refund: 1, refund_amount: 36.97, reconcile_status: 'matched', reconcile_group_id: 'g1', is_hidden: 0 },
    { id: 7, source: 'wechat', trade_time: '2026-05-03 07:17:05', trade_type: '商户消费', category: '交通-充电', counterparty: '贵阳风驰', product_desc: '充电桩订单', direction: 'expense', amount: 49, net_amount: 12.03, status: 'partial_refunded', is_refund: 0, refund_amount: 36.97, reconcile_status: 'discrepancy', reconcile_group_id: 'g1', is_hidden: 0 },
    { id: 8, source: 'alipay', trade_time: '2026-05-30 18:21:10', trade_type: '餐饮美食', category: '餐饮-外卖', counterparty: '淘宝闪购', product_desc: '弄堂炸鸡明海广场店外卖订单', direction: 'expense', amount: 33.91, net_amount: 33.91, status: '交易成功', is_refund: 0, refund_amount: 0, reconcile_status: 'matched', is_hidden: 0 },
    { id: 9, source: 'alipay', trade_time: '2026-05-30 04:06:20', trade_type: '投资理财', category: '理财', counterparty: '余额宝', product_desc: '余额宝-收益发放', direction: 'neutral', amount: 0.31, net_amount: 0.31, status: '交易成功', is_refund: 0, refund_amount: 0, reconcile_status: 'matched', is_hidden: 0 },
    { id: 10, source: 'alipay', trade_time: '2026-05-24 10:30:00', trade_type: '退款', category: '退款', counterparty: '逸安启', product_desc: '退款-高德车服充电订单', direction: 'neutral', amount: 39.68, net_amount: 0, status: '退款成功', is_refund: 1, refund_amount: 39.68, reconcile_status: 'unmatched', is_hidden: 0 },
    { id: 11, source: 'alipay', trade_time: '2026-05-15 12:00:00', trade_type: '爱车养车', category: '交通-充电', counterparty: '逸安启', product_desc: '高德车服充电订单', direction: 'expense', amount: 39.68, net_amount: 0, status: '交易成功', is_refund: 0, refund_amount: 39.68, reconcile_status: 'discrepancy', reconcile_group_id: 'g2', is_hidden: 0 },
  ];
}

const mockBackend = {
  async getTransactions(filters?: any): Promise<Transaction[]> {
    let data = mockTransactions();
    if (filters?.source) data = data.filter(t => t.source === filters.source);
    if (filters?.direction) data = data.filter(t => t.direction === filters.direction);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      data = data.filter(t => (t.counterparty || '').toLowerCase().includes(s) || (t.product_desc || '').toLowerCase().includes(s));
    }
    if (filters?.isRefund !== undefined) data = data.filter(t => t.is_refund === filters.isRefund);
    if (filters?.reconcileStatus) data = data.filter(t => t.reconcile_status === filters.reconcileStatus);
    return data.sort((a, b) => b.trade_time.localeCompare(a.trade_time));
  },

  async getDashboardStats(startDate?: string, endDate?: string): Promise<DashboardStats> {
    const txns = mockTransactions().filter(t => !t.is_hidden && t.direction !== 'neutral');
    const totalExpense = txns.filter(t => t.direction === 'expense').reduce((s, t) => s + t.amount, 0);
    const totalRefund = txns.filter(t => t.is_refund).reduce((s, t) => s + t.amount, 0);
    const catMap = new Map<string, any>();
    for (const t of txns) {
      const cat = t.category || '未分类';
      if (!catMap.has(cat)) catMap.set(cat, { category: cat, txn_count: 0, net_expense: 0, refund_amount: 0 });
      const c = catMap.get(cat)!;
      c.txn_count++;
      if (t.direction === 'expense') c.net_expense += t.net_amount ?? t.amount;
      if (t.is_refund) c.refund_amount += t.amount;
    }
    return {
      totalExpense, totalIncome: 0, totalRefund, netExpense: totalExpense - totalRefund,
      txnCount: txns.length, unmatchedCount: 1, discrepancyCount: 2,
      wechatExpense: txns.filter(t => t.source === 'wechat' && t.direction === 'expense').reduce((s, t) => s + t.amount, 0),
      alipayExpense: txns.filter(t => t.source === 'alipay' && t.direction === 'expense').reduce((s, t) => s + t.amount, 0),
      dailyTrend: [
        { date: '2026-05-03', expense: 49, refund: 36.97, net: 12.03 },
        { date: '2026-05-10', expense: 80.66, refund: 0, net: 80.66 },
        { date: '2026-05-13', expense: 1200, refund: 0, net: 1200 },
        { date: '2026-05-15', expense: 39.68, refund: 0, net: 39.68 },
        { date: '2026-05-27', expense: 98.45, refund: 0, net: 98.45 },
        { date: '2026-05-30', expense: 33.91, refund: 0, net: 33.91 },
      ],
      topCategories: Array.from(catMap.values()).sort((a, b) => b.net_expense - a.net_expense),
    };
  },

  async getRefundChains(): Promise<RefundChain[]> {
    return [
      { groupId: 'g1', groupStatus: 'partial_refund', counterparty: '贵阳风驰', productDesc: '充电桩订单',
        items: [
          { txnId: 7, tradeTime: '2026-05-03 07:17:05', direction: 'expense', amount: 49, status: 'partial_refunded', source: 'wechat', isRefund: false },
          { txnId: 6, tradeTime: '2026-05-03 08:07:45', direction: 'income', amount: 36.97, status: 'refund_received', source: 'wechat', isRefund: true },
        ], totalPaid: 49, totalRefunded: 36.97, netAmount: 12.03 },
      { groupId: 'g2', groupStatus: 'fully_refunded', counterparty: '逸安启', productDesc: '高德车服充电订单',
        items: [
          { txnId: 11, tradeTime: '2026-05-15 12:00:00', direction: 'expense', amount: 39.68, status: '交易成功', source: 'alipay', isRefund: false },
          { txnId: 10, tradeTime: '2026-05-24 10:30:00', direction: 'income', amount: 39.68, status: '退款成功', source: 'alipay', isRefund: true },
        ], totalPaid: 39.68, totalRefunded: 39.68, netAmount: 0 },
    ];
  },

  async getMonthlySummary(): Promise<MonthlySummary[]> {
    return [
      { month: '2026-05', source: 'wechat', txn_count: 22, total_expense: 1670.93, total_income: 0, total_refund: 36.97, net_expense: 1633.96 },
      { month: '2026-05', source: 'alipay', txn_count: 85, total_expense: 1907.84, total_income: 2.50, total_refund: 39.68, net_expense: 1868.16 },
    ];
  },

  async getStats() { return { total: 11, wechat: 7, alipay: 4 }; },
  async getImportHistory() { return []; },
  async importFile() { return { success: false, message: 'Web 模式不支持导入', imported: 0 }; },
  async openFileDialog() { return []; },
  async exportExcel() { return { success: false, message: 'Web 模式不支持导出' }; },
  async runReconciliation() { return { groupsCreated: 0, matched: 0, unmatched: 0 }; },
  async updateTransaction() {},
  async clearAllData() {},
  async deleteTransactions() { return { success: true, deleted: 0 }; },
  async addTransaction() { return { success: true, id: 999 }; },
  async getCategories() { return ['公共服务-电费', '交通-停车', '交通-充电', '电商-拼多多', '电商-淘宝', '餐饮-外卖', '餐饮', '线下消费', '转账', '理财', '退款', '其他']; },
  async addCategoryRule() { return true; },
};

// ============================================================
// 导出统一接口
// ============================================================

export const dataService = isElectron ? electronBackend : mockBackend;
