// ============================================================
// 喵喵账本 - Excel 导出器
// ============================================================

import ExcelJS from 'exceljs';
import path from 'path';
import type { MeowDB } from './database.js';
import type { Transaction, ExportOptions } from './types.js';

/**
 * 导出交易数据为 Excel
 *
 * 生成的 Excel 包含：
 * Sheet 1: 交易明细
 * Sheet 2: 月度汇总（如果跨月）
 * Sheet 3: 退款明细（如果有退款）
 */
export async function exportToExcel(
  db: MeowDB,
  options: ExportOptions
): Promise<string> {
  const txns = db.getTransactionsForExport(options.startDate, options.endDate, options.sources);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '喵喵账本';
  workbook.created = new Date();

  // ============================================================
  // Sheet 1: 交易明细
  // ============================================================
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
    { header: '用户备注', key: 'user_note', width: 20 },
  ];

  // 设置表头样式
  styleHeader(ws1);

  for (const txn of txns) {
    const row = ws1.addRow({
      trade_time: txn.trade_time,
      source: txn.source === 'wechat' ? '微信' : '支付宝',
      trade_type: txn.trade_type,
      counterparty: txn.counterparty,
      product_desc: txn.product_desc,
      direction: txn.is_refund ? '退款' : (txn.direction === 'income' ? '收入' : txn.direction === 'expense' ? '支出' : '中性'),
      amount: txn.amount,
      net_amount: options.netMode ? (txn.net_amount ?? txn.amount) : txn.amount,
      payment_method: txn.payment_method,
      status: txn.status,
      category: txn.category,
      remark: txn.remark,
      user_note: txn.user_note,
    });

    // 退款行高亮
    if (txn.is_refund) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
      });
    }
    // 差异行高亮
    if (txn.reconcile_status === 'discrepancy') {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
      });
    }

    // 金额列格式
    const amountCell = row.getCell('amount');
    amountCell.numFmt = '#,##0.00';
    const netCell = row.getCell('net_amount');
    netCell.numFmt = '#,##0.00';
  }

  // ============================================================
  // Sheet 2: 月度汇总
  // ============================================================
  const monthly = db.getMonthlySummary();
  if (monthly.length > 0) {
    const ws2 = workbook.addWorksheet('月度汇总');
    ws2.columns = [
      { header: '月份', key: 'month', width: 10 },
      { header: '来源', key: 'source', width: 8 },
      { header: '交易笔数', key: 'txn_count', width: 10 },
      { header: '总支出', key: 'total_expense', width: 14 },
      { header: '总收入', key: 'total_income', width: 14 },
      { header: '退款金额', key: 'total_refund', width: 14 },
      { header: '净支出', key: 'net_expense', width: 14 },
    ];
    styleHeader(ws2);

    for (const m of monthly) {
      const row = ws2.addRow({
        ...m,
        source: m.source === 'wechat' ? '微信' : '支付宝',
      });
      row.getCell('total_expense').numFmt = '#,##0.00';
      row.getCell('total_income').numFmt = '#,##0.00';
      row.getCell('total_refund').numFmt = '#,##0.00';
      row.getCell('net_expense').numFmt = '#,##0.00';
    }
  }

  // ============================================================
  // Sheet 3: 退款明细
  // ============================================================
  if (options.includeRefunds) {
    const refundTxns = txns.filter(t => t.is_refund === 1 || t.refund_amount > 0);
    if (refundTxns.length > 0) {
      const ws3 = workbook.addWorksheet('退款明细');
      ws3.columns = [
        { header: '交易时间', key: 'trade_time', width: 20 },
        { header: '来源', key: 'source', width: 8 },
        { header: '交易对方', key: 'counterparty', width: 20 },
        { header: '商品说明', key: 'product_desc', width: 30 },
        { header: '原始金额', key: 'amount', width: 12 },
        { header: '退款金额', key: 'refund_amount', width: 12 },
        { header: '净额', key: 'net_amount', width: 12 },
        { header: '退款状态', key: 'status', width: 15 },
      ];
      styleHeader(ws3);

      for (const txn of refundTxns) {
        const row = ws3.addRow({
          trade_time: txn.trade_time,
          source: txn.source === 'wechat' ? '微信' : '支付宝',
          counterparty: txn.counterparty,
          product_desc: txn.product_desc,
          amount: txn.amount,
          refund_amount: txn.refund_amount,
          net_amount: txn.net_amount ?? txn.amount,
          status: txn.status,
        });
        row.getCell('amount').numFmt = '#,##0.00';
        row.getCell('refund_amount').numFmt = '#,##0.00';
        row.getCell('net_amount').numFmt = '#,##0.00';
      }
    }
  }

  // 写入文件
  const fileName = `喵喵账本_${options.startDate}_${options.endDate}.xlsx`;
  const outputPath = path.join(process.cwd(), fileName);
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF49044' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;
  ws.autoFilter = 'A1:' + String.fromCharCode(64 + ws.columns.length) + '1';
}
