// ============================================================
// 喵喵账本 - SQLite 数据库层
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type {
  Transaction, Source, Direction, ReconcileStatus,
  MonthlySummary, CategorySummary, DashboardStats,
  ReconcileGroup, RefundChain, CategoryRule, ImportResult
} from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Schema DDL
// ============================================================

const SCHEMA_SQL = `
-- 主交易表
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source          TEXT NOT NULL CHECK(source IN ('wechat', 'alipay')),
  source_file     TEXT,
  trade_time      TEXT NOT NULL,
  trade_type      TEXT NOT NULL,
  category        TEXT,
  counterparty    TEXT,
  counterparty_account TEXT,
  product_desc    TEXT,
  direction       TEXT NOT NULL CHECK(direction IN ('income', 'expense', 'neutral')),
  amount          REAL NOT NULL,
  net_amount      REAL,
  payment_method  TEXT,
  status          TEXT NOT NULL,
  is_refund       INTEGER NOT NULL DEFAULT 0,
  refund_amount   REAL DEFAULT 0,
  original_txn_id TEXT,
  platform_txn_id TEXT,
  merchant_txn_id TEXT,
  platform_order_id TEXT,
  merchant_order_id TEXT,
  remark          TEXT,
  reconcile_status TEXT DEFAULT 'unmatched'
    CHECK(reconcile_status IN ('matched', 'unmatched', 'manual_matched', 'discrepancy')),
  reconcile_group_id TEXT,
  user_note       TEXT,
  is_hidden       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(source, platform_txn_id, trade_time)
);

CREATE INDEX IF NOT EXISTS idx_txn_trade_time ON transactions(trade_time);
CREATE INDEX IF NOT EXISTS idx_txn_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_txn_direction ON transactions(direction);
CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_reconcile ON transactions(reconcile_status);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_txn_counterparty ON transactions(counterparty);
CREATE INDEX IF NOT EXISTS idx_txn_platform_id ON transactions(platform_txn_id);
CREATE INDEX IF NOT EXISTS idx_txn_is_refund ON transactions(is_refund);
CREATE INDEX IF NOT EXISTS idx_txn_reconcile_group ON transactions(reconcile_group_id);

-- 对账组表
CREATE TABLE IF NOT EXISTS reconcile_groups (
  id              TEXT PRIMARY KEY,
  original_txn_id INTEGER NOT NULL,
  total_paid      REAL NOT NULL,
  total_refunded  REAL NOT NULL DEFAULT 0,
  net_amount      REAL NOT NULL,
  refund_count    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'partial_refund', 'fully_refunded', 'closed')),
  counterparty    TEXT,
  product_desc    TEXT,
  first_trade_time TEXT NOT NULL,
  last_trade_time  TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (original_txn_id) REFERENCES transactions(id)
);

-- 导入记录
CREATE TABLE IF NOT EXISTS import_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source          TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_hash       TEXT NOT NULL,
  record_count    INTEGER NOT NULL,
  imported_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(file_hash)
);

-- 分类规则
CREATE TABLE IF NOT EXISTS category_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  match_field     TEXT NOT NULL CHECK(match_field IN ('counterparty', 'product_desc', 'trade_type')),
  match_pattern   TEXT NOT NULL,
  match_type      TEXT NOT NULL DEFAULT 'contains' CHECK(match_type IN ('exact', 'contains', 'regex')),
  category        TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 预置分类规则
INSERT OR IGNORE INTO category_rules (match_field, match_pattern, match_type, category, priority) VALUES
  ('counterparty', '国网浙江电力', 'contains', '公共服务-电费', 10),
  ('counterparty', 'P云停车平台', 'contains', '交通-停车', 10),
  ('counterparty', 'PP停车', 'contains', '交通-停车', 10),
  ('counterparty', '拼多多', 'contains', '电商-拼多多', 10),
  ('counterparty', '拼多多平台商户', 'contains', '电商-拼多多', 11),
  ('counterparty', '淘宝', 'contains', '电商-淘宝', 10),
  ('counterparty', '京东', 'contains', '电商-京东', 10),
  ('counterparty', '得物', 'contains', '电商-得物', 10),
  ('product_desc', '充电桩', 'contains', '交通-充电', 10),
  ('product_desc', '停车费', 'contains', '交通-停车', 8),
  ('product_desc', '余额宝', 'contains', '理财', 10),
  ('counterparty', '贵阳风驰', 'contains', '交通-充电', 10),
  ('counterparty', '逸安启', 'contains', '交通-充电', 10),
  ('counterparty', '罗曼林', 'contains', '餐饮-零食', 10),
  ('counterparty', '象山鹤浦', 'contains', '餐饮', 10),
  ('trade_type', '退款', 'contains', '退款', 100),
  ('counterparty', '今日头条', 'contains', '娱乐-短视频', 10),
  ('counterparty', '海南今日头条', 'contains', '娱乐-短视频', 10),
  ('product_desc', '外卖订单', 'contains', '餐饮-外卖', 8),
  ('product_desc', '吃货卡', 'contains', '餐饮-外卖', 8),
  ('trade_type', '扫码', 'contains', '线下消费', 5),
  ('counterparty', '白雪', 'contains', '转账', 5),
  ('counterparty', '花又', 'contains', '转账', 5),
  ('counterparty', '岐支', 'contains', '公共服务', 8);
`;

// ============================================================
// Database Class
// ============================================================

export class MeowDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'meowledger.db');
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  // ============================================================
  // INSERT
  // ============================================================

  insertTransaction(txn: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): number | null {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO transactions (
        source, source_file, trade_time, trade_type, category,
        counterparty, counterparty_account, product_desc,
        direction, amount, net_amount, payment_method,
        status, is_refund, refund_amount, original_txn_id,
        platform_txn_id, merchant_txn_id, platform_order_id, merchant_order_id,
        remark, reconcile_status, reconcile_group_id
      ) VALUES (
        @source, @source_file, @trade_time, @trade_type, @category,
        @counterparty, @counterparty_account, @product_desc,
        @direction, @amount, @net_amount, @payment_method,
        @status, @is_refund, @refund_amount, @original_txn_id,
        @platform_txn_id, @merchant_txn_id, @platform_order_id, @merchant_order_id,
        @remark, @reconcile_status, @reconcile_group_id
      )
    `);

    const result = stmt.run({
      source: txn.source,
      source_file: txn.source_file || null,
      trade_time: txn.trade_time,
      trade_type: txn.trade_type,
      category: txn.category || null,
      counterparty: txn.counterparty || null,
      counterparty_account: txn.counterparty_account || null,
      product_desc: txn.product_desc || null,
      direction: txn.direction,
      amount: txn.amount,
      net_amount: txn.net_amount ?? txn.amount,
      payment_method: txn.payment_method || null,
      status: txn.status,
      is_refund: txn.is_refund,
      refund_amount: txn.refund_amount,
      original_txn_id: txn.original_txn_id || null,
      platform_txn_id: txn.platform_txn_id || null,
      merchant_txn_id: txn.merchant_txn_id || null,
      platform_order_id: txn.platform_order_id || null,
      merchant_order_id: txn.merchant_order_id || null,
      remark: txn.remark || null,
      reconcile_status: txn.reconcile_status || 'unmatched',
      reconcile_group_id: txn.reconcile_group_id || null,
    });

    return result.changes > 0 ? Number(result.lastInsertRowid) : null;
  }

  insertTransactionsBatch(txns: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]): number {
    const insert = this.db.transaction((items: typeof txns) => {
      let count = 0;
      for (const txn of items) {
        const id = this.insertTransaction(txn);
        if (id !== null) count++;
      }
      return count;
    });
    return insert(txns);
  }

  // ============================================================
  // QUERY
  // ============================================================

  getTransactions(filters?: {
    source?: Source;
    startDate?: string;
    endDate?: string;
    direction?: Direction;
    reconcileStatus?: ReconcileStatus;
    category?: string;
    search?: string;
    isRefund?: number;
    limit?: number;
    offset?: number;
  }): Transaction[] {
    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params: Record<string, any> = {};

    if (filters?.source) {
      sql += ' AND source = @source';
      params.source = filters.source;
    }
    if (filters?.startDate) {
      sql += ' AND trade_time >= @startDate';
      params.startDate = filters.startDate;
    }
    if (filters?.endDate) {
      sql += ' AND trade_time <= @endDate';
      params.endDate = filters.endDate + ' 23:59:59';
    }
    if (filters?.direction) {
      sql += ' AND direction = @direction';
      params.direction = filters.direction;
    }
    if (filters?.reconcileStatus) {
      sql += ' AND reconcile_status = @reconcileStatus';
      params.reconcileStatus = filters.reconcileStatus;
    }
    if (filters?.category) {
      sql += ' AND category = @category';
      params.category = filters.category;
    }
    if (filters?.search) {
      sql += ' AND (counterparty LIKE @search OR product_desc LIKE @search OR remark LIKE @search)';
      params.search = `%${filters.search}%`;
    }
    if (filters?.isRefund !== undefined) {
      sql += ' AND is_refund = @isRefund';
      params.isRefund = filters.isRefund;
    }

    sql += ' ORDER BY trade_time DESC';

    if (filters?.limit) {
      sql += ' LIMIT @limit';
      params.limit = filters.limit;
    }
    if (filters?.offset) {
      sql += ' OFFSET @offset';
      params.offset = filters.offset;
    }

    return this.db.prepare(sql).all(params) as Transaction[];
  }

  getTransactionById(id: number): Transaction | undefined {
    return this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
  }

  getTransactionCount(filters?: { source?: Source; startDate?: string; endDate?: string }): number {
    let sql = 'SELECT COUNT(*) as count FROM transactions WHERE 1=1';
    const params: Record<string, any> = {};
    if (filters?.source) {
      sql += ' AND source = @source';
      params.source = filters.source;
    }
    if (filters?.startDate) {
      sql += ' AND trade_time >= @startDate';
      params.startDate = filters.startDate;
    }
    if (filters?.endDate) {
      sql += ' AND trade_time <= @endDate';
      params.endDate = filters.endDate + ' 23:59:59';
    }
    const result = this.db.prepare(sql).get(params) as { count: number };
    return result.count;
  }

  // ============================================================
  // UPDATE
  // ============================================================

  updateTransaction(id: number, updates: Partial<Transaction>): void {
    const allowed = ['category', 'direction', 'net_amount', 'refund_amount', 'is_refund',
      'reconcile_status', 'reconcile_group_id', 'user_note', 'is_hidden'];
    const sets: string[] = [];
    const params: Record<string, any> = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = @${key}`);
        params[key] = value;
      }
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now', 'localtime')");
    this.db.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = @id`).run(params);
  }

  // ============================================================
  // DASHBOARD STATS
  // ============================================================

  getDashboardStats(startDate?: string, endDate?: string): DashboardStats {
    const params: Record<string, any> = {};
    let dateFilter = '';
    if (startDate) {
      dateFilter += ' AND trade_time >= @startDate';
      params.startDate = startDate;
    }
    if (endDate) {
      dateFilter += ' AND trade_time <= @endDate';
      params.endDate = endDate + ' 23:59:59';
    }

    // 基础统计
    const basic = this.db.prepare(`
      SELECT
        COUNT(*) as txnCount,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) as totalExpense,
        COALESCE(SUM(CASE WHEN direction = 'income' AND is_refund = 0 THEN amount ELSE 0 END), 0) as totalIncome,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as totalRefund,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END)
          - SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as netExpense,
        COALESCE(SUM(CASE WHEN source = 'wechat' AND direction = 'expense' THEN amount ELSE 0 END), 0) as wechatExpense,
        COALESCE(SUM(CASE WHEN source = 'alipay' AND direction = 'expense' THEN amount ELSE 0 END), 0) as alipayExpense
      FROM transactions
      WHERE is_hidden = 0 AND direction != 'neutral' ${dateFilter}
    `).get(params) as any;

    // 未匹配数
    const unmatched = this.db.prepare(`
      SELECT COUNT(*) as count FROM transactions
      WHERE reconcile_status = 'unmatched' AND is_hidden = 0 ${dateFilter}
    `).get(params) as { count: number };

    const discrepancy = this.db.prepare(`
      SELECT COUNT(*) as count FROM transactions
      WHERE reconcile_status = 'discrepancy' AND is_hidden = 0 ${dateFilter}
    `).get(params) as { count: number };

    // 每日趋势
    const dailyTrend = this.db.prepare(`
      SELECT
        substr(trade_time, 1, 10) as date,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) as expense,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as refund,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END)
          - SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as net
      FROM transactions
      WHERE is_hidden = 0 AND direction != 'neutral' ${dateFilter}
      GROUP BY substr(trade_time, 1, 10)
      ORDER BY date
    `).all(params) as { date: string; expense: number; refund: number; net: number }[];

    // 分类统计 TOP 10
    const topCategories = this.db.prepare(`
      SELECT
        COALESCE(category, '未分类') as category,
        COUNT(*) as txn_count,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN net_amount ELSE 0 END), 0) as net_expense,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as refund_amount
      FROM transactions
      WHERE is_hidden = 0 AND direction != 'neutral' ${dateFilter}
      GROUP BY category
      ORDER BY net_expense DESC
      LIMIT 10
    `).all(params) as CategorySummary[];

    return {
      totalExpense: basic.totalExpense,
      totalIncome: basic.totalIncome,
      totalRefund: basic.totalRefund,
      netExpense: basic.netExpense,
      txnCount: basic.txnCount,
      unmatchedCount: unmatched.count,
      discrepancyCount: discrepancy.count,
      wechatExpense: basic.wechatExpense,
      alipayExpense: basic.alipayExpense,
      dailyTrend,
      topCategories,
    };
  }

  // ============================================================
  // MONTHLY SUMMARY
  // ============================================================

  getMonthlySummary(): MonthlySummary[] {
    return this.db.prepare(`
      SELECT
        strftime('%Y-%m', trade_time) AS month,
        source,
        COUNT(*) AS txn_count,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
        COALESCE(SUM(CASE WHEN direction = 'income' AND is_refund = 0 THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) AS total_refund,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END)
          - SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) AS net_expense
      FROM transactions
      WHERE is_hidden = 0 AND direction != 'neutral'
      GROUP BY strftime('%Y-%m', trade_time), source
      ORDER BY month DESC, source
    `).all() as MonthlySummary[];
  }

  // ============================================================
  // UNMATCHED TRANSACTIONS
  // ============================================================

  getUnmatchedTransactions(): Transaction[] {
    return this.db.prepare(`
      SELECT * FROM transactions
      WHERE reconcile_status IN ('unmatched', 'discrepancy')
        AND is_hidden = 0
      ORDER BY trade_time DESC
    `).all() as Transaction[];
  }

  // ============================================================
  // REFUND CHAINS
  // ============================================================

  getRefundChains(): RefundChain[] {
    // Step 1: Get all refund records and original payments with refund info
    const refundRelatedTxns = this.db.prepare(`
      SELECT * FROM transactions
      WHERE (is_refund = 1 OR refund_amount > 0)
        AND is_hidden = 0
      ORDER BY trade_time DESC
    `).all() as Transaction[];

    // Step 2: Find unmatched refunds and look up their original payments
    const allUnmatchedRefunds = refundRelatedTxns.filter(t => t.is_refund === 1 && !t.reconcile_group_id);
    const newlyLinked: { refund: Transaction; payment: Transaction }[] = [];

    if (allUnmatchedRefunds.length > 0) {
      const existingIds = new Set(refundRelatedTxns.map(t => t.id));
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      for (const refund of allUnmatchedRefunds) {
        if (!refund.counterparty) continue;
        const refundTime = new Date(refund.trade_time).getTime();

        const candidate = this.db.prepare(`
          SELECT * FROM transactions
          WHERE counterparty = @counterparty
            AND direction = 'expense'
            AND is_refund = 0
            AND is_hidden = 0
            AND amount >= @amount
            AND trade_time < @refundTime
          ORDER BY trade_time DESC
        `).get({
          counterparty: refund.counterparty,
          amount: refund.amount,
          refundTime: refund.trade_time,
        }) as Transaction | undefined;

        if (candidate && existingIds.has(candidate.id) === false) {
          const timeDiff = refundTime - new Date(candidate.trade_time).getTime();
          if (timeDiff > 0 && timeDiff < thirtyDaysMs) {
            refundRelatedTxns.push(candidate);
            newlyLinked.push({ refund, payment: candidate });
          }
        }
      }
    }

    // Step 2.5: Write newly linked records to database
    if (newlyLinked.length > 0) {
      const updateStmt = this.db.prepare(`
        UPDATE transactions SET reconcile_status=@rs, reconcile_group_id=@rg,
        refund_amount=@ra, net_amount=@na, updated_at=datetime('now','localtime') WHERE id=@id
      `);
      const groupStmt = this.db.prepare(`
        INSERT OR REPLACE INTO reconcile_groups (id,original_txn_id,total_paid,total_refunded,net_amount,
        refund_count,status,counterparty,product_desc,first_trade_time,last_trade_time)
        VALUES (@id,@original_txn_id,@total_paid,@total_refunded,@net_amount,@refund_count,@status,
        @counterparty,@product_desc,@first_trade_time,@last_trade_time)
      `);

      for (const { refund, payment } of newlyLinked) {
        const groupId = crypto.randomUUID();
        const netAmt = payment.amount - refund.amount;
        const st = netAmt <= 0.001 ? 'fully_refunded' : 'partial_refund';

        groupStmt.run({
          id: groupId, original_txn_id: payment.id!, total_paid: payment.amount,
          total_refunded: refund.amount, net_amount: netAmt, refund_count: 1, status: st,
          counterparty: refund.counterparty, product_desc: payment.product_desc,
          first_trade_time: payment.trade_time, last_trade_time: refund.trade_time,
        });

        updateStmt.run({ id: refund.id, rs: 'matched', rg: groupId, ra: refund.amount, na: 0 });
        updateStmt.run({
          id: payment.id, rs: st === 'fully_refunded' ? 'matched' : 'discrepancy',
          rg: groupId, ra: refund.amount, na: netAmt,
        });

        refund.reconcile_group_id = groupId;
        refund.reconcile_status = 'matched';
        payment.reconcile_group_id = groupId;
      }
    }

    // Step 3: Group by reconcile_group_id or counterparty+source
    const chains = new Map<string, RefundChain>();

    for (const txn of refundRelatedTxns) {
      const key = txn.reconcile_group_id || `${txn.counterparty}-${txn.source}`;
      if (!chains.has(key)) {
        chains.set(key, {
          groupId: key,
          groupStatus: 'open',
          counterparty: txn.counterparty || '未知',
          productDesc: txn.product_desc || '',
          items: [],
          totalPaid: 0,
          totalRefunded: 0,
          netAmount: 0,
        });
      }
      const chain = chains.get(key)!;
      chain.items.push({
        txnId: txn.id!,
        tradeTime: txn.trade_time,
        direction: txn.direction,
        amount: txn.amount,
        status: txn.status,
        source: txn.source,
        isRefund: txn.is_refund === 1,
      });

      if (txn.is_refund === 1) {
        chain.totalRefunded += txn.amount;
      } else if (txn.direction === 'expense') {
        chain.totalPaid += txn.amount;
      }
    }

    // Calculate net and status
    for (const chain of chains.values()) {
      chain.netAmount = chain.totalPaid - chain.totalRefunded;
      if (chain.totalRefunded >= chain.totalPaid) {
        chain.groupStatus = 'fully_refunded';
      } else if (chain.totalRefunded > 0) {
        chain.groupStatus = 'partial_refund';
      }
      // Sort items by time
      chain.items.sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));
    }

    return Array.from(chains.values());
  }

  // ============================================================
  // IMPORT RECORDS
  // ============================================================

  recordImport(source: Source, fileName: string, fileHash: string, count: number): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO import_records (source, file_name, file_hash, record_count)
      VALUES (?, ?, ?, ?)
    `).run(source, fileName, fileHash, count);
  }

  isFileImported(fileHash: string): boolean {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM import_records WHERE file_hash = ?').get(fileHash) as { count: number };
    return result.count > 0;
  }

  getImportHistory(): { id: number; source: string; file_name: string; record_count: number; imported_at: string }[] {
    return this.db.prepare('SELECT * FROM import_records ORDER BY imported_at DESC').all() as any[];
  }

  // ============================================================
  // CATEGORY RULES
  // ============================================================

  getCategoryRules(): CategoryRule[] {
    return this.db.prepare('SELECT * FROM category_rules ORDER BY priority DESC').all() as CategoryRule[];
  }

  autoClassify(txn: { counterparty?: string; product_desc?: string; trade_type?: string }): string | null {
    const rules = this.getCategoryRules();
    for (const rule of rules) {
      let fieldValue = '';
      if (rule.match_field === 'counterparty') fieldValue = txn.counterparty || '';
      else if (rule.match_field === 'product_desc') fieldValue = txn.product_desc || '';
      else if (rule.match_field === 'trade_type') fieldValue = txn.trade_type || '';

      let matched = false;
      if (rule.match_type === 'exact') {
        matched = fieldValue === rule.match_pattern;
      } else if (rule.match_type === 'contains') {
        matched = fieldValue.includes(rule.match_pattern);
      } else if (rule.match_type === 'regex') {
        matched = new RegExp(rule.match_pattern).test(fieldValue);
      }

      if (matched) return rule.category;
    }
    return null;
  }

  // ============================================================
  // EXPORT QUERIES
  // ============================================================

  getTransactionsForExport(startDate: string, endDate: string, sources?: Source[]): Transaction[] {
    let sql = 'SELECT * FROM transactions WHERE is_hidden = 0 AND trade_time >= ? AND trade_time <= ?';
    const params: any[] = [startDate, endDate + ' 23:59:59'];

    if (sources && sources.length > 0) {
      sql += ` AND source IN (${sources.map(() => '?').join(',')})`;
      params.push(...sources);
    }

    sql += ' ORDER BY trade_time DESC';
    return this.db.prepare(sql).all(...params) as Transaction[];
  }

  // ============================================================
  // RECONCILE GROUPS
  // ============================================================

  insertReconcileGroup(group: {
    id: string;
    original_txn_id: number;
    total_paid: number;
    total_refunded: number;
    net_amount: number;
    refund_count: number;
    status: string;
    counterparty?: string;
    product_desc?: string;
    first_trade_time: string;
    last_trade_time: string;
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO reconcile_groups (
        id, original_txn_id, total_paid, total_refunded, net_amount,
        refund_count, status, counterparty, product_desc,
        first_trade_time, last_trade_time
      ) VALUES (
        @id, @original_txn_id, @total_paid, @total_refunded, @net_amount,
        @refund_count, @status, @counterparty, @product_desc,
        @first_trade_time, @last_trade_time
      )
    `).run(group);
  }

  // ============================================================
  // DELETE / RESET
  // ============================================================

  deleteAllTransactions(): void {
    this.db.exec('DELETE FROM transactions');
    this.db.exec('DELETE FROM reconcile_groups');
    this.db.exec('DELETE FROM import_records');
  }

  getStats(): { total: number; wechat: number; alipay: number } {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number };
    const wechat = this.db.prepare("SELECT COUNT(*) as c FROM transactions WHERE source='wechat'").get() as { c: number };
    const alipay = this.db.prepare("SELECT COUNT(*) as c FROM transactions WHERE source='alipay'").get() as { c: number };
    return { total: total.c, wechat: wechat.c, alipay: alipay.c };
  }
}
