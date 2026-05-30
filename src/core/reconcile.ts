// ============================================================
// 喵喵账本 - 对账引擎（轧差对账算法）
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import type { MeowDB } from './database.js';
import type { Transaction, RefundChain } from './types.js';

/**
 * 执行全量对账
 *
 * 算法流程：
 * 1. 找出所有退款记录（is_refund=1 或 status 退款相关）
 * 2. 对每条退款，寻找匹配的原始支付交易
 * 3. 创建对账组，计算轧差净额
 * 4. 更新交易记录的 reconcile_status
 *
 * 匹配策略（按优先级）：
 * a. merchant_order_id 精确匹配
 * b. counterparty 相同 + amount <= 原交易 + 时间窗口
 * c. product_desc 模糊匹配
 */
export function runReconciliation(db: MeowDB): {
  groupsCreated: number;
  matched: number;
  unmatched: number;
  discrepancies: number;
} {
  // 获取所有交易
  const allTxns = db.getTransactions();

  // 分离退款记录和支付记录
  const refundTxns = allTxns.filter(t => t.is_refund === 1 || t.status === '退款成功');
  const paymentTxns = allTxns.filter(t => t.direction === 'expense' && t.is_refund === 0);

  let groupsCreated = 0;
  let matched = 0;
  let unmatched = 0;
  let discrepancies = 0;

  // 策略一：通过 merchant_order_id / merchant_txn_id 关联
  for (const refund of refundTxns) {
    let bestMatch: Transaction | null = null;

    // 尝试精确匹配商户单号
    const refundMerchantId = refund.merchant_txn_id || refund.merchant_order_id || '';
    const refundPlatformId = refund.platform_txn_id || refund.platform_order_id || '';

    if (refundMerchantId) {
      bestMatch = paymentTxns.find(t =>
        (t.merchant_txn_id === refundMerchantId || t.merchant_order_id === refundMerchantId) &&
        t.id !== refund.id
      ) || null;
    }

    // 策略二：counterparty + 金额 + 时间窗口
    if (!bestMatch && refund.counterparty) {
      const refundTime = new Date(refund.trade_time).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      const candidates = paymentTxns.filter(t => {
        if (t.id === refund.id) return false;

        // 对方匹配
        const cpMatch = t.counterparty === refund.counterparty;
        // 退款金额 <= 原支付金额
        const amountOk = refund.amount <= t.amount;
        // 退款时间在支付之后 30 天内
        const payTime = new Date(t.trade_time).getTime();
        const timeOk = refundTime > payTime && (refundTime - payTime) < thirtyDaysMs;

        return cpMatch && amountOk && timeOk;
      });

      // 选择时间最接近的
      if (candidates.length > 0) {
        bestMatch = candidates.reduce((closest, curr) => {
          const currDiff = Math.abs(new Date(curr.trade_time).getTime() - refundTime);
          const closestDiff = Math.abs(new Date(closest.trade_time).getTime() - refundTime);
          return currDiff < closestDiff ? curr : closest;
        });
      }
    }

    // 策略三：product_desc 模糊匹配
    if (!bestMatch && refund.product_desc) {
      // 尝试从退款描述中提取原交易关键词
      const refundProductClean = refund.product_desc.replace(/^退款[-\s]*/, '');
      if (refundProductClean.length > 2) {
        const refundTime = new Date(refund.trade_time).getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

        bestMatch = paymentTxns.find(t => {
          if (t.id === refund.id) return false;
          const productMatch = (t.product_desc || '').includes(refundProductClean) ||
            (t.counterparty || '').includes(refundProductClean) ||
            refundProductClean.includes(t.counterparty || '');
          const timeOk = refundTime > new Date(t.trade_time).getTime() &&
            (refundTime - new Date(t.trade_time).getTime()) < thirtyDaysMs;
          return productMatch && timeOk;
        }) || null;
      }
    }

    if (bestMatch) {
      // 匹配成功 → 创建对账组
      const groupId = uuidv4();
      const totalPaid = bestMatch.amount;
      const totalRefunded = refund.amount;
      const netAmount = totalPaid - totalRefunded;

      let groupStatus: string;
      if (netAmount <= 0.001) {
        groupStatus = 'fully_refunded';
      } else {
        groupStatus = 'partial_refund';
      }

      // 插入对账组
      db.insertReconcileGroup({
        id: groupId,
        original_txn_id: bestMatch.id!,
        total_paid: totalPaid,
        total_refunded: totalRefunded,
        net_amount: netAmount,
        refund_count: 1,
        status: groupStatus as any,
        counterparty: refund.counterparty,
        product_desc: bestMatch.product_desc,
        first_trade_time: bestMatch.trade_time,
        last_trade_time: refund.trade_time,
      });

      // 更新原支付记录
      db.updateTransaction(bestMatch.id!, {
        reconcile_status: groupStatus === 'fully_refunded' ? 'matched' : 'discrepancy',
        reconcile_group_id: groupId,
        net_amount: netAmount,
        refund_amount: totalRefunded,
      });

      // 更新退款记录
      db.updateTransaction(refund.id!, {
        reconcile_status: 'matched',
        reconcile_group_id: groupId,
      });

      matched++;
      groupsCreated++;

      // 从待匹配列表中移除已匹配的
      const idx = paymentTxns.findIndex(t => t.id === bestMatch!.id);
      if (idx !== -1) paymentTxns.splice(idx, 1);
    } else {
      // 无法匹配
      db.updateTransaction(refund.id!, {
        reconcile_status: 'unmatched',
      });
      unmatched++;
    }
  }

  // 处理部分退款的原交易（有 refund_amount 但未被退款记录匹配的）
  const partialRefunds = allTxns.filter(t =>
    t.refund_amount > 0 && t.is_refund === 0 && t.reconcile_status === 'discrepancy'
  );
  discrepancies = partialRefunds.length;

  // 无退款的消费记录 → 直接标记为 matched
  const cleanPayments = allTxns.filter(t =>
    t.direction === 'expense' &&
    t.is_refund === 0 &&
    t.refund_amount === 0 &&
    t.reconcile_status === 'unmatched'
  );
  for (const txn of cleanPayments) {
    db.updateTransaction(txn.id!, { reconcile_status: 'matched' });
    matched++;
  }

  return { groupsCreated, matched, unmatched, discrepancies };
}
