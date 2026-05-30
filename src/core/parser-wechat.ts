// ============================================================
// 喵喵账本 - 微信支付解析器
// ============================================================

import ExcelJS from 'exceljs';
import type { Transaction, Source, Direction } from './types.js';

/**
 * 从微信支付 xlsx 文件解析交易记录
 *
 * 微信账单格式分析（基于真实数据）：
 * - 前 17 行为表头信息（微信昵称、时间范围、统计等）
 * - 第 18 行为列标题：交易时间|交易类型|交易对方|商品|收/支|金额(元)|支付方式|当前状态|交易单号|商户单号|备注
 * - 第 19 行起为数据行
 *
 * 退款表现形式：
 * 1. 原始支付行：direction=支出, status="已退款(¥36.97)"
 * 2. 退款收入行：direction=收入, status="已退款¥36.97", tradeType含"退款"
 */
export async function parseWechatXlsx(
  filePath: string,
  autoClassify: (txn: { counterparty?: string; product_desc?: string; trade_type?: string }) => string | null
): Promise<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error('微信账单文件为空或格式不正确');
  }

  const rows: any[][] = [];
  worksheet.eachRow((row) => {
    rows.push(row.values as any[]);
  });

  // 找到列标题行（包含"交易时间"的行）
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const firstCell = String(rows[i][1] || '');
    if (firstCell.includes('交易时间')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('无法找到微信账单的列标题行');
  }

  const transactions: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[] = [];

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

    // 解析方向
    const direction: Direction = dirStr === '收入' ? 'income' : 'expense';

    // 解析退款状态（核心逻辑）
    const { isRefund, refundAmount, netAmount, normalizedStatus } = parseWechatStatus(status, direction, amount);

    // 应用自动分类
    const category = autoClassify({ counterparty, product_desc: product, trade_type: tradeType });

    // 提取优惠信息
    const cleanRemark = remark === '/' ? undefined : remark;

    transactions.push({
      source: 'wechat',
      trade_time: tradeTime,
      trade_type: tradeType,
      category: category || undefined,
      counterparty: counterparty || undefined,
      product_desc: product || undefined,
      direction,
      amount,
      net_amount: netAmount,
      payment_method: payMethod || undefined,
      status: normalizedStatus,
      is_refund: isRefund,
      refund_amount: refundAmount,
      platform_txn_id: txnId || undefined,
      merchant_txn_id: merchantId || undefined,
      remark: cleanRemark,
      reconcile_status: isRefund ? 'unmatched' : (refundAmount > 0 ? 'discrepancy' : 'matched'),
    });
  }

  return transactions;
}

/**
 * 微信退款状态解析
 *
 * 解析逻辑：
 * - status 匹配 /已退款[（(]?\s*¥?([\d.]+)/ → 提取退款金额
 * - 如果 direction=收入 且 status 含"退款" → 这是退款到账记录 (is_refund=1)
 * - 如果 direction=支出 且 status 含"退款" → 这是原交易，已被退款
 */
function parseWechatStatus(
  status: string,
  direction: Direction,
  amount: number
): { isRefund: number; refundAmount: number; netAmount: number; normalizedStatus: string } {
  const refundMatch = status.match(/已退款[（(]?\s*¥?([\d.]+)/);

  if (refundMatch) {
    const refundAmount = parseFloat(refundMatch[1]);

    if (direction === 'income') {
      // 退款到账行
      return {
        isRefund: 1,
        refundAmount,
        netAmount: 0,
        normalizedStatus: 'refund_received',
      };
    } else {
      // 原支付行（已被退款）
      return {
        isRefund: 0,
        refundAmount,
        netAmount: amount - refundAmount,
        normalizedStatus: refundAmount >= amount ? 'fully_refunded' : 'partial_refunded',
      };
    }
  }

  return {
    isRefund: 0,
    refundAmount: 0,
    netAmount: amount,
    normalizedStatus: status,
  };
}
