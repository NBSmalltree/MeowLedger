// ============================================================
// 喵喵账本 - Electron 主进程
// ============================================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
// 数据库与解析器（CommonJS 动态加载）
// ============================================================

// better-sqlite3 和其他原生模块需要在主进程中加载
let db = null;

function getDb() {
  if (!db) {
    const Database = require('better-sqlite3');
    const dbPath = path.join(app.getPath('userData'), 'meowledger.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source          TEXT NOT NULL,
      source_file     TEXT,
      trade_time      TEXT NOT NULL,
      trade_type      TEXT NOT NULL,
      category        TEXT,
      counterparty    TEXT,
      counterparty_account TEXT,
      product_desc    TEXT,
      direction       TEXT NOT NULL,
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
      reconcile_status TEXT DEFAULT 'unmatched',
      reconcile_group_id TEXT,
      user_note       TEXT,
      is_hidden       INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(source, platform_txn_id, trade_time)
    );
    CREATE INDEX IF NOT EXISTS idx_txn_trade_time ON transactions(trade_time);
    CREATE INDEX IF NOT EXISTS idx_txn_source ON transactions(source);
    CREATE INDEX IF NOT EXISTS idx_txn_reconcile ON transactions(reconcile_status);
    CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_txn_is_refund ON transactions(is_refund);

    CREATE TABLE IF NOT EXISTS reconcile_groups (
      id              TEXT PRIMARY KEY,
      original_txn_id INTEGER NOT NULL,
      total_paid      REAL NOT NULL,
      total_refunded  REAL NOT NULL DEFAULT 0,
      net_amount      REAL NOT NULL,
      refund_count    INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'open',
      counterparty    TEXT,
      product_desc    TEXT,
      first_trade_time TEXT NOT NULL,
      last_trade_time  TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (original_txn_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS import_records (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source          TEXT NOT NULL,
      file_name       TEXT NOT NULL,
      file_hash       TEXT NOT NULL,
      record_count    INTEGER NOT NULL,
      imported_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(file_hash)
    );

    CREATE TABLE IF NOT EXISTS category_rules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      match_field     TEXT NOT NULL,
      match_pattern   TEXT NOT NULL,
      match_type      TEXT NOT NULL DEFAULT 'contains',
      category        TEXT NOT NULL,
      priority        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

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
  `);
}

// ============================================================
// IPC Handlers
// ============================================================

function registerIpcHandlers() {
  // 查询交易列表
  ipcMain.handle('get-transactions', async (_event, filters) => {
    const database = getDb();
    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params = {};

    if (filters?.source) { sql += ' AND source = @source'; params.source = filters.source; }
    if (filters?.direction) { sql += ' AND direction = @direction'; params.direction = filters.direction; }
    if (filters?.search) {
      sql += ' AND (counterparty LIKE @search OR product_desc LIKE @search OR remark LIKE @search)';
      params.search = `%${filters.search}%`;
    }
    if (filters?.isRefund !== undefined) { sql += ' AND is_refund = @isRefund'; params.isRefund = filters.isRefund; }
    if (filters?.startDate) { sql += ' AND trade_time >= @startDate'; params.startDate = filters.startDate; }
    if (filters?.endDate) { sql += ' AND trade_time <= @endDate'; params.endDate = filters.endDate + ' 23:59:59'; }

    sql += ' ORDER BY trade_time DESC';
    if (filters?.limit) { sql += ' LIMIT @limit'; params.limit = filters.limit; }
    if (filters?.offset) { sql += ' OFFSET @offset'; params.offset = filters.offset; }

    return database.prepare(sql).all(params);
  });

  // 获取仪表盘统计
  ipcMain.handle('get-dashboard-stats', async () => {
    const database = getDb();

    const basic = database.prepare(`
      SELECT
        COUNT(*) as txnCount,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) as totalExpense,
        COALESCE(SUM(CASE WHEN direction = 'income' AND is_refund = 0 THEN amount ELSE 0 END), 0) as totalIncome,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as totalRefund,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END)
          - SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as netExpense,
        COALESCE(SUM(CASE WHEN source = 'wechat' AND direction = 'expense' THEN amount ELSE 0 END), 0) as wechatExpense,
        COALESCE(SUM(CASE WHEN source = 'alipay' AND direction = 'expense' THEN amount ELSE 0 END), 0) as alipayExpense
      FROM transactions WHERE is_hidden = 0 AND direction != 'neutral'
    `).get();

    const unmatched = database.prepare(`SELECT COUNT(*) as c FROM transactions WHERE reconcile_status = 'unmatched' AND is_hidden = 0`).get();
    const discrepancy = database.prepare(`SELECT COUNT(*) as c FROM transactions WHERE reconcile_status = 'discrepancy' AND is_hidden = 0`).get();

    const dailyTrend = database.prepare(`
      SELECT substr(trade_time, 1, 10) as date,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) as expense,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as refund,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END)
          - SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as net
      FROM transactions WHERE is_hidden = 0 AND direction != 'neutral'
      GROUP BY substr(trade_time, 1, 10) ORDER BY date
    `).all();

    const topCategories = database.prepare(`
      SELECT COALESCE(category, '未分类') as category, COUNT(*) as txn_count,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN net_amount ELSE 0 END), 0) as net_expense,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) as refund_amount
      FROM transactions WHERE is_hidden = 0 AND direction != 'neutral'
      GROUP BY category ORDER BY net_expense DESC LIMIT 10
    `).all();

    return {
      totalExpense: basic.totalExpense,
      totalIncome: basic.totalIncome,
      totalRefund: basic.totalRefund,
      netExpense: basic.netExpense,
      txnCount: basic.txnCount,
      unmatchedCount: unmatched.c,
      discrepancyCount: discrepancy.c,
      wechatExpense: basic.wechatExpense,
      alipayExpense: basic.alipayExpense,
      dailyTrend,
      topCategories,
    };
  });

  // 获取退款链路
  ipcMain.handle('get-refund-chains', async () => {
    const database = getDb();
    const refundTxns = database.prepare(`
      SELECT * FROM transactions WHERE (is_refund = 1 OR refund_amount > 0) AND is_hidden = 0 ORDER BY trade_time DESC
    `).all();

    const chains = new Map();
    for (const txn of refundTxns) {
      const key = txn.reconcile_group_id || `${txn.counterparty}-${txn.source}`;
      if (!chains.has(key)) {
        chains.set(key, {
          groupId: key, groupStatus: 'open', counterparty: txn.counterparty || '未知',
          productDesc: txn.product_desc || '', items: [], totalPaid: 0, totalRefunded: 0, netAmount: 0,
        });
      }
      const chain = chains.get(key);
      chain.items.push({ txnId: txn.id, tradeTime: txn.trade_time, direction: txn.direction, amount: txn.amount, status: txn.status, source: txn.source, isRefund: txn.is_refund === 1 });
      if (txn.is_refund === 1) chain.totalRefunded += txn.amount;
      else if (txn.direction === 'expense') chain.totalPaid += txn.amount;
    }
    for (const chain of chains.values()) {
      chain.netAmount = chain.totalPaid - chain.totalRefunded;
      if (chain.totalRefunded >= chain.totalPaid) chain.groupStatus = 'fully_refunded';
      else if (chain.totalRefunded > 0) chain.groupStatus = 'partial_refund';
      chain.items.sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));
    }
    return Array.from(chains.values());
  });

  // 获取月度汇总
  ipcMain.handle('get-monthly-summary', async () => {
    const database = getDb();
    return database.prepare(`
      SELECT strftime('%Y-%m', trade_time) AS month, source, COUNT(*) AS txn_count,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
        COALESCE(SUM(CASE WHEN direction = 'income' AND is_refund = 0 THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) AS total_refund,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END)
          - SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END), 0) AS net_expense
      FROM transactions WHERE is_hidden = 0 AND direction != 'neutral'
      GROUP BY strftime('%Y-%m', trade_time), source ORDER BY month DESC, source
    `).all();
  });

  // 获取数据库统计
  ipcMain.handle('get-stats', async () => {
    const database = getDb();
    const total = database.prepare('SELECT COUNT(*) as c FROM transactions').get();
    const wechat = database.prepare("SELECT COUNT(*) as c FROM transactions WHERE source='wechat'").get();
    const alipay = database.prepare("SELECT COUNT(*) as c FROM transactions WHERE source='alipay'").get();
    return { total: total.c, wechat: wechat.c, alipay: alipay.c };
  });

  // 获取导入历史
  ipcMain.handle('get-import-history', async () => {
    const database = getDb();
    return database.prepare('SELECT * FROM import_records ORDER BY imported_at DESC').all();
  });

  // 导入文件
  ipcMain.handle('import-file', async (_event, filePath) => {
    try {
      const database = getDb();
      const crypto = require('crypto');
      const fileName = path.basename(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');

      // Check duplicate
      const existing = database.prepare('SELECT COUNT(*) as c FROM import_records WHERE file_hash = ?').get(fileHash);
      if (existing.c > 0) return { success: false, message: '该文件已导入过', imported: 0 };

      // Parse based on file type
      let txns = [];
      let source = '';

      if (fileName.includes('微信') && fileName.endsWith('.xlsx')) {
        source = 'wechat';
        txns = parseWechatXlsxSync(filePath);
      } else if (fileName.includes('支付宝') && fileName.endsWith('.csv')) {
        source = 'alipay';
        txns = parseAlipayCsvSync(filePath);
      } else {
        return { success: false, message: '无法识别文件类型，请确保文件名包含"微信"或"支付宝"', imported: 0 };
      }

      // Auto-classify
      const rules = database.prepare('SELECT * FROM category_rules ORDER BY priority DESC').all();
      for (const txn of txns) {
        if (!txn.category || txn.category === '') {
          txn.category = autoClassify(rules, txn) || '未分类';
        }
        txn.source_file = fileName;
      }

      // Insert batch
      const stmt = database.prepare(`
        INSERT OR IGNORE INTO transactions (source, source_file, trade_time, trade_type, category,
          counterparty, counterparty_account, product_desc, direction, amount, net_amount,
          payment_method, status, is_refund, refund_amount, platform_txn_id, merchant_txn_id,
          platform_order_id, merchant_order_id, remark, reconcile_status)
        VALUES (@source, @source_file, @trade_time, @trade_type, @category,
          @counterparty, @counterparty_account, @product_desc, @direction, @amount, @net_amount,
          @payment_method, @status, @is_refund, @refund_amount, @platform_txn_id, @merchant_txn_id,
          @platform_order_id, @merchant_order_id, @remark, @reconcile_status)
      `);

      const insertMany = database.transaction((items) => {
        let count = 0;
        for (const t of items) {
          const r = stmt.run({
            source: t.source, source_file: t.source_file || null, trade_time: t.trade_time,
            trade_type: t.trade_type, category: t.category || null, counterparty: t.counterparty || null,
            counterparty_account: t.counterparty_account || null, product_desc: t.product_desc || null,
            direction: t.direction, amount: t.amount, net_amount: t.net_amount ?? t.amount,
            payment_method: t.payment_method || null, status: t.status, is_refund: t.is_refund || 0,
            refund_amount: t.refund_amount || 0, platform_txn_id: t.platform_txn_id || null,
            merchant_txn_id: t.merchant_txn_id || null, platform_order_id: t.platform_order_id || null,
            merchant_order_id: t.merchant_order_id || null, remark: t.remark || null,
            reconcile_status: t.reconcile_status || 'unmatched',
          });
          if (r.changes > 0) count++;
        }
        return count;
      });

      const imported = insertMany(txns);

      database.prepare('INSERT OR IGNORE INTO import_records (source, file_name, file_hash, record_count) VALUES (?,?,?,?)')
        .run(source, fileName, fileHash, imported);

      return { success: true, message: `成功导入 ${imported}/${txns.length} 条记录`, imported, total: txns.length, source };
    } catch (err) {
      return { success: false, message: `导入失败: ${err.message}`, imported: 0 };
    }
  });

  // 执行对账
  ipcMain.handle('run-reconciliation', async () => {
    const database = getDb();
    const crypto = require('crypto');

    // Get all transactions
    const allTxns = database.prepare('SELECT * FROM transactions ORDER BY trade_time DESC').all();
    const refundTxns = allTxns.filter(t => t.is_refund === 1 || t.status === '退款成功');
    const paymentTxns = allTxns.filter(t => t.direction === 'expense' && t.is_refund === 0);

    let groupsCreated = 0;
    let matched = 0;
    let unmatched = 0;

    const updateStmt = database.prepare(`
      UPDATE transactions SET reconcile_status=@rs, reconcile_group_id=@rg, net_amount=@na,
      refund_amount=@ra, updated_at=datetime('now','localtime') WHERE id=@id
    `);
    const groupStmt = database.prepare(`
      INSERT OR REPLACE INTO reconcile_groups (id,original_txn_id,total_paid,total_refunded,net_amount,
      refund_count,status,counterparty,product_desc,first_trade_time,last_trade_time)
      VALUES (@id,@original_txn_id,@total_paid,@total_refunded,@net_amount,@refund_count,@status,
      @counterparty,@product_desc,@first_trade_time,@last_trade_time)
    `);

    const runReconcile = database.transaction(() => {
      for (const refund of refundTxns) {
        let bestMatch = null;

        // Strategy 1: merchant id match
        const refundMId = refund.merchant_txn_id || refund.merchant_order_id || '';
        if (refundMId) {
          bestMatch = paymentTxns.find(t =>
            (t.merchant_txn_id === refundMId || t.merchant_order_id === refundMId) && t.id !== refund.id
          ) || null;
        }

        // Strategy 2: counterparty + amount + time window
        if (!bestMatch && refund.counterparty) {
          const refundTime = new Date(refund.trade_time).getTime();
          const candidates = paymentTxns.filter(t => {
            if (t.id === refund.id) return false;
            return t.counterparty === refund.counterparty && refund.amount <= t.amount &&
              refundTime > new Date(t.trade_time).getTime() &&
              (refundTime - new Date(t.trade_time).getTime()) < 30 * 86400000;
          });
          if (candidates.length > 0) {
            bestMatch = candidates.reduce((c, curr) =>
              Math.abs(new Date(curr.trade_time).getTime() - refundTime) < Math.abs(new Date(c.trade_time).getTime() - refundTime) ? curr : c
            );
          }
        }

        // Strategy 3: product description fuzzy match
        if (!bestMatch && refund.product_desc) {
          const clean = refund.product_desc.replace(/^退款[-\s]*/, '');
          if (clean.length > 2) {
            const refundTime = new Date(refund.trade_time).getTime();
            bestMatch = paymentTxns.find(t => {
              if (t.id === refund.id) return false;
              const pm = (t.product_desc || '').includes(clean) || (t.counterparty || '').includes(clean) || clean.includes(t.counterparty || '');
              const tm = refundTime > new Date(t.trade_time).getTime() && (refundTime - new Date(t.trade_time).getTime()) < 30 * 86400000;
              return pm && tm;
            }) || null;
          }
        }

        if (bestMatch) {
          const groupId = crypto.randomUUID();
          const netAmt = bestMatch.amount - refund.amount;
          const st = netAmt <= 0.001 ? 'fully_refunded' : 'partial_refund';

          groupStmt.run({
            id: groupId, original_txn_id: bestMatch.id, total_paid: bestMatch.amount,
            total_refunded: refund.amount, net_amount: netAmt, refund_count: 1, status: st,
            counterparty: refund.counterparty, product_desc: bestMatch.product_desc,
            first_trade_time: bestMatch.trade_time, last_trade_time: refund.trade_time,
          });

          updateStmt.run({
            id: bestMatch.id, rs: st === 'fully_refunded' ? 'matched' : 'discrepancy',
            rg: groupId, na: netAmt, ra: refund.amount,
          });
          updateStmt.run({ id: refund.id, rs: 'matched', rg: groupId, na: 0, ra: refund.amount });

          const idx = paymentTxns.findIndex(t => t.id === bestMatch.id);
          if (idx !== -1) paymentTxns.splice(idx, 1);

          matched++;
          groupsCreated++;
        } else {
          updateStmt.run({ id: refund.id, rs: 'unmatched', rg: null, na: 0, ra: refund.amount });
          unmatched++;
        }
      }

      // Mark clean payments as matched
      const cleanPayments = allTxns.filter(t => t.direction === 'expense' && t.is_refund === 0 && t.refund_amount === 0 && t.reconcile_status === 'unmatched');
      for (const txn of cleanPayments) {
        updateStmt.run({ id: txn.id, rs: 'matched', rg: null, na: txn.amount, ra: 0 });
        matched++;
      }
    });

    runReconcile();
    return { groupsCreated, matched, unmatched };
  });

  // 更新交易记录
  ipcMain.handle('update-transaction', async (_event, id, updates) => {
    const database = getDb();
    const allowed = ['category', 'direction', 'net_amount', 'reconcile_status', 'user_note', 'is_hidden'];
    const sets = [];
    const params = { id };
    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) { sets.push(`${key} = @${key}`); params[key] = value; }
    }
    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now', 'localtime')");
    database.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return true;
  });

  // 导出 Excel
  ipcMain.handle('export-excel', async (_event, options) => {
    try {
      const database = getDb();
      const ExcelJS = require('exceljs');

      let sql = 'SELECT * FROM transactions WHERE is_hidden = 0 AND trade_time >= ? AND trade_time <= ?';
      const params = [options.startDate, options.endDate + ' 23:59:59'];
      if (options.sources && options.sources.length > 0) {
        sql += ` AND source IN (${options.sources.map(() => '?').join(',')})`;
        params.push(...options.sources);
      }
      sql += ' ORDER BY trade_time DESC';
      const txns = database.prepare(sql).all(...params);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = '喵喵账本';

      const ws1 = workbook.addWorksheet('交易明细');
      ws1.columns = [
        { header: '交易时间', key: 'trade_time', width: 20 },
        { header: '来源', key: 'source', width: 8 },
        { header: '交易类型', key: 'trade_type', width: 12 },
        { header: '交易对方', key: 'counterparty', width: 20 },
        { header: '商品说明', key: 'product_desc', width: 30 },
        { header: '收/支', key: 'direction', width: 8 },
        { header: '金额', key: 'amount', width: 12 },
        { header: '轧差净额', key: 'net_amount', width: 12 },
        { header: '支付方式', key: 'payment_method', width: 20 },
        { header: '状态', key: 'status', width: 12 },
        { header: '分类', key: 'category', width: 15 },
        { header: '备注', key: 'remark', width: 20 },
      ];

      const headerRow = ws1.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF49044' } };
      ws1.autoFilter = 'A1:L1';

      for (const txn of txns) {
        const row = ws1.addRow({
          trade_time: txn.trade_time,
          source: txn.source === 'wechat' ? '微信' : '支付宝',
          trade_type: txn.trade_type,
          counterparty: txn.counterparty,
          product_desc: txn.product_desc,
          direction: txn.is_refund ? '退款' : (txn.direction === 'income' ? '收入' : txn.direction === 'expense' ? '支出' : '中性'),
          amount: txn.amount,
          net_amount: txn.net_amount ?? txn.amount,
          payment_method: txn.payment_method,
          status: txn.status,
          category: txn.category,
          remark: txn.remark,
        });
        row.getCell('amount').numFmt = '#,##0.00';
        row.getCell('net_amount').numFmt = '#,##0.00';
        if (txn.is_refund) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }; });
      }

      const defaultPath = `喵喵账本_${options.startDate}_${options.endDate}.xlsx`;
      const { filePath } = await dialog.showSaveDialog({
        title: '导出账单',
        defaultPath: defaultPath,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });

      if (!filePath) return { success: false, message: '已取消' };

      await workbook.xlsx.writeFile(filePath);
      return { success: true, message: `导出成功: ${txns.length} 条记录`, path: filePath };
    } catch (err) {
      return { success: false, message: `导出失败: ${err.message}` };
    }
  });

  // 打开文件对话框
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择账单文件',
      filters: [
        { name: '账单文件', extensions: ['xlsx', 'csv'] },
        { name: '微信支付', extensions: ['xlsx'] },
        { name: '支付宝', extensions: ['csv'] },
      ],
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // 清空数据
  ipcMain.handle('clear-all-data', async () => {
    const database = getDb();
    database.exec('DELETE FROM transactions');
    database.exec('DELETE FROM reconcile_groups');
    database.exec('DELETE FROM import_records');
    return true;
  });
}

// ============================================================
// 微信解析（主进程内同步版本）
// ============================================================

function parseWechatXlsxSync(filePath) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();

  // Use sync wrapper
  return new Promise((resolve, reject) => {
    workbook.xlsx.readFile(filePath).then(() => {
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return reject(new Error('空文件'));

      const rows = [];
      worksheet.eachRow((row) => rows.push(row.values));

      let headerIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][1] || '').includes('交易时间')) { headerIdx = i; break; }
      }
      if (headerIdx === -1) return reject(new Error('找不到列标题'));

      const txns = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[1]) continue;
        const tradeTime = String(row[1] || '').trim();
        const tradeType = String(row[2] || '').trim();
        const counterparty = String(row[3] || '').trim();
        const product = String(row[4] || '').trim();
        const dirStr = String(row[5] || '').trim();
        const amountStr = String(row[6] || '').trim();
        const payMethod = String(row[7] || '').trim();
        const status = String(row[8] || '').trim();
        const txnId = String(row[9] || '').trim();
        const merchantId = String(row[10] || '').trim();
        const remark = String(row[11] || '').trim();

        if (!tradeTime || !amountStr) continue;
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) continue;

        const direction = dirStr === '收入' ? 'income' : 'expense';
        const refundMatch = status.match(/已退款[（(]?\s*¥?([\d.]+)/);
        let isRefund = 0, refundAmount = 0, netAmount = amount, normStatus = status;

        if (refundMatch) {
          refundAmount = parseFloat(refundMatch[1]);
          if (direction === 'income') { isRefund = 1; netAmount = 0; normStatus = 'refund_received'; }
          else { netAmount = amount - refundAmount; normStatus = refundAmount >= amount ? 'fully_refunded' : 'partial_refunded'; }
        }

        txns.push({
          source: 'wechat', trade_time: tradeTime, trade_type: tradeType, category: null,
          counterparty, product_desc: product || null, direction, amount, net_amount: netAmount,
          payment_method: payMethod || null, status: normStatus, is_refund: isRefund,
          refund_amount: refundAmount, platform_txn_id: txnId || null, merchant_txn_id: merchantId || null,
          platform_order_id: null, merchant_order_id: null,
          remark: remark === '/' ? null : remark,
          reconcile_status: isRefund ? 'unmatched' : (refundAmount > 0 ? 'discrepancy' : 'matched'),
        });
      }
      resolve(txns);
    }).catch(reject);
  });
}

// ============================================================
// 支付宝解析（主进程内同步版本）
// ============================================================

function parseAlipayCsvSync(filePath) {
  const iconv = require('iconv-lite');
  const chardet = require('chardet');

  const buffer = fs.readFileSync(filePath);
  const encoding = chardet.detect(buffer) || 'utf-8';
  const content = encoding.toLowerCase().includes('gb') ? iconv.decode(buffer, 'gb18030') : buffer.toString('utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('交易时间') && lines[i].includes('交易分类')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error('找不到列标题');

  const txns = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('---') || line.startsWith('共')) continue;
    const cols = line.replace(/,+$/, '').split(',').map(s => s.trim());
    if (cols.length < 9) continue;

    const tradeTime = cols[0], categoryRaw = cols[1], counterparty = cols[2];
    const cpAccount = cols[3], productDesc = cols[4], dirStr = cols[5];
    const amountStr = cols[6], payMethod = cols[7], status = cols[8];
    const platformOrderId = cols[9]?.trim() || null, merchantOrderId = cols[10]?.trim() || null;
    const remark = cols[11]?.trim() || null;

    if (!tradeTime || !amountStr) continue;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) continue;

    let direction = 'expense';
    if (dirStr === '收入') direction = 'income';
    else if (dirStr === '不计收支' || dirStr === '其他') direction = 'neutral';

    const isRefund = status === '退款成功' ? 1 : 0;

    txns.push({
      source: 'alipay', trade_time: tradeTime, trade_type: categoryRaw, category: isRefund ? '退款' : categoryRaw,
      counterparty, counterparty_account: cpAccount !== '/' ? cpAccount : null, product_desc: productDesc || null,
      direction, amount, net_amount: isRefund ? 0 : amount, payment_method: payMethod || null,
      status, is_refund: isRefund, refund_amount: isRefund ? amount : 0,
      platform_txn_id: null, merchant_txn_id: null,
      platform_order_id: platformOrderId, merchant_order_id: merchantOrderId,
      remark, reconcile_status: isRefund ? 'unmatched' : 'matched',
    });
  }
  return txns;
}

// ============================================================
// 自动分类
// ============================================================

function autoClassify(rules, txn) {
  for (const rule of rules) {
    let fieldValue = '';
    if (rule.match_field === 'counterparty') fieldValue = txn.counterparty || '';
    else if (rule.match_field === 'product_desc') fieldValue = txn.product_desc || '';
    else if (rule.match_field === 'trade_type') fieldValue = txn.trade_type || '';

    let matched = false;
    if (rule.match_type === 'exact') matched = fieldValue === rule.match_pattern;
    else if (rule.match_type === 'contains') matched = fieldValue.includes(rule.match_pattern);
    else if (rule.match_type === 'regex') matched = new RegExp(rule.match_pattern).test(fieldValue);

    if (matched) return rule.category;
  }
  return null;
}

// ============================================================
// 窗口管理
// ============================================================

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: '喵喵账本',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式加载 Vite dev server，生产模式加载打包后的文件
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:1420');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
