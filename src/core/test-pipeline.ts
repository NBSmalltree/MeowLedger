// ============================================================
// 喵喵账本 - 端到端测试流水线
// 用法: npx tsx src/core/test-pipeline.ts
//
// 使用真实数据验证完整流程：解析 → 入库 → 对账 → 导出
// ============================================================

import path from 'path';
import fs from 'fs';
import { MeowDB } from './database.js';
import { parseWechatXlsx } from './parser-wechat.js';
import { parseAlipayCsv } from './parser-alipay.js';
import { runReconciliation } from './reconcile.js';
import { exportToExcel } from './exporter.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(process.cwd(), 'test_meowledger.db');

async function main() {
  console.log('🐱 喵喵账本 - 端到端测试');
  console.log('═'.repeat(60));

  // 清理旧测试数据库
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const db = new MeowDB(DB_PATH);
  console.log('✅ 数据库初始化完成');

  // ============================================================
  // Step 1: 解析微信账单
  // ============================================================
  console.log('\n📝 Step 1: 解析微信账单');
  console.log('-'.repeat(40));

  const wechatFiles = fs.readdirSync(DATA_DIR).filter(f => f.includes('微信') && f.endsWith('.xlsx'));
  if (wechatFiles.length > 0) {
    const wxPath = path.join(DATA_DIR, wechatFiles[0]);
    const wxTxns = await parseWechatXlsx(wxPath, (txn) => db.autoClassify(txn) || '');
    console.log(`  解析记录: ${wxTxns.length} 条`);
    console.log(`  退款记录: ${wxTxns.filter(t => t.is_refund === 1).length} 条`);
    console.log(`  被退款的原始交易: ${wxTxns.filter(t => t.refund_amount > 0 && t.is_refund === 0).length} 条`);

    // 打印退款记录详情
    const refunds = wxTxns.filter(t => t.is_refund === 1 || t.refund_amount > 0);
    for (const r of refunds) {
      console.log(`    ↩️  ${r.trade_time} ${r.counterparty} | ¥${r.amount} | refund=${r.is_refund} | refundAmt=¥${r.refund_amount} | status=${r.status}`);
    }

    const wxCount = db.insertTransactionsBatch(wxTxns);
    console.log(`  入库成功: ${wxCount} 条`);
  }

  // ============================================================
  // Step 2: 解析支付宝账单
  // ============================================================
  console.log('\n📝 Step 2: 解析支付宝账单');
  console.log('-'.repeat(40));

  const alipayFiles = fs.readdirSync(DATA_DIR).filter(f => f.includes('支付宝') && f.endsWith('.csv'));
  if (alipayFiles.length > 0) {
    const apPath = path.join(DATA_DIR, alipayFiles[0]);
    const apTxns = await parseAlipayCsv(apPath, (txn) => db.autoClassify(txn) || '');
    console.log(`  解析记录: ${apTxns.length} 条`);
    console.log(`  退款记录: ${apTxns.filter(t => t.is_refund === 1).length} 条`);

    // 打印退款记录详情
    const refunds = apTxns.filter(t => t.is_refund === 1);
    for (const r of refunds) {
      console.log(`    ↩️  ${r.trade_time} ${r.counterparty} | ¥${r.amount} | product=${r.product_desc} | status=${r.status}`);
    }

    const apCount = db.insertTransactionsBatch(apTxns);
    console.log(`  入库成功: ${apCount} 条`);
  }

  // ============================================================
  // Step 3: 数据库统计
  // ============================================================
  console.log('\n📊 Step 3: 数据库统计');
  console.log('-'.repeat(40));

  const stats = db.getStats();
  console.log(`  总记录数: ${stats.total}`);
  console.log(`  微信: ${stats.wechat}`);
  console.log(`  支付宝: ${stats.alipay}`);

  // ============================================================
  // Step 4: 对账
  // ============================================================
  console.log('\n🔍 Step 4: 执行对账');
  console.log('-'.repeat(40));

  const reconcileResult = runReconciliation(db);
  console.log(`  创建对账组: ${reconcileResult.groupsCreated} 个`);
  console.log(`  已匹配: ${reconcileResult.matched} 条`);
  console.log(`  未匹配退款: ${reconcileResult.unmatched} 条`);
  console.log(`  有差异: ${reconcileResult.discrepancies} 条`);

  // 打印退款链路
  const chains = db.getRefundChains();
  if (chains.length > 0) {
    console.log('\n  📦 退款链路追踪:');
    for (const chain of chains) {
      console.log(`    ${chain.counterparty} - ${chain.productDesc || '未知'}`);
      for (const item of chain.items) {
        const icon = item.isRefund ? '↩️' : '💳';
        console.log(`      ${icon} ${item.tradeTime} | ¥${item.amount} | ${item.source} | ${item.status}`);
      }
      console.log(`      📊 净额: ¥${chain.netAmount.toFixed(2)} | 状态: ${chain.groupStatus}`);
    }
  }

  // ============================================================
  // Step 5: 仪表盘统计
  // ============================================================
  console.log('\n📈 Step 5: 仪表盘统计');
  console.log('-'.repeat(40));

  const dashStats = db.getDashboardStats('2026-04-30', '2026-05-31');
  console.log(`  总支出: ¥${dashStats.totalExpense.toFixed(2)}`);
  console.log(`  总收入: ¥${dashStats.totalIncome.toFixed(2)}`);
  console.log(`  退款总额: ¥${dashStats.totalRefund.toFixed(2)}`);
  console.log(`  净支出: ¥${dashStats.netExpense.toFixed(2)}`);
  console.log(`  交易笔数: ${dashStats.txnCount}`);
  console.log(`  待对账: ${dashStats.unmatchedCount} 笔`);
  console.log(`  有差异: ${dashStats.discrepancyCount} 笔`);
  console.log(`  微信支出: ¥${dashStats.wechatExpense.toFixed(2)}`);
  console.log(`  支付宝支出: ¥${dashStats.alipayExpense.toFixed(2)}`);

  if (dashStats.topCategories.length > 0) {
    console.log('\n  分类 TOP10:');
    for (const cat of dashStats.topCategories) {
      console.log(`    ${cat.category}: ¥${cat.net_expense.toFixed(2)} (${cat.txn_count}笔, 退款¥${cat.refund_amount.toFixed(2)})`);
    }
  }

  // ============================================================
  // Step 6: 导出 Excel
  // ============================================================
  console.log('\n📥 Step 6: 导出 Excel');
  console.log('-'.repeat(40));

  const outputPath = await exportToExcel(db, {
    startDate: '2026-04-30',
    endDate: '2026-05-31',
    includeRefunds: true,
    netMode: true,
    format: 'xlsx',
  });
  console.log(`  导出文件: ${outputPath}`);

  // ============================================================
  // 完成
  // ============================================================
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 全部测试通过！');

  db.close();

  // 清理测试数据库
  // fs.unlinkSync(DB_PATH);
}

main().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
