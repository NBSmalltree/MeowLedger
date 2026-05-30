// ============================================================
// 喵喵账本 - 支付宝解析器
// ============================================================

import fs from 'fs';
import iconv from 'iconv-lite';
import chardet from 'chardet';
import type { Transaction, Direction } from './types.js';

/**
 * 从支付宝 CSV 文件解析交易记录
 *
 * 支付宝账单格式分析（基于真实数据）：
 * - GB18030 编码
 * - 前 23 行为表头信息（姓名、账户、时间范围、统计、特别提示）
 * - 第 24 行为列标题：交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注,
 * - 第 25 行起为数据行
 * - 每行末尾有一个多余的逗号
 * - 不计收支：余额宝收益等
 *
 * 退款表现形式：
 * - 单独一行，status="退款成功"，direction="不计收支"
 * - product_desc 以"退款-"开头
 * - category="退款"
 */
export async function parseAlipayCsv(
  filePath: string,
  autoClassify: (txn: { counterparty?: string; product_desc?: string; trade_type?: string }) => string | null
): Promise<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]> {
  // 读取文件并检测编码
  const buffer = fs.readFileSync(filePath);
  const encoding = chardet.detect(buffer) || 'utf-8';

  let content: string;
  if (encoding.toLowerCase().includes('gb')) {
    content = iconv.decode(buffer, 'gb18030');
  } else {
    content = buffer.toString('utf-8');
  }

  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // 找到列标题行（包含"交易时间"和"交易分类"的行）
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('交易时间') && lines[i].includes('交易分类')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('无法找到支付宝账单的列标题行，请确认文件格式');
  }

  // 解析标题行确认列顺序
  const headers = parseAlipayLine(lines[headerIdx]);
  // 标准顺序：交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注

  const transactions: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('---') || line.startsWith('共')) continue;

    const cols = parseAlipayLine(line);
    if (cols.length < 9) continue;

    const tradeTime = cols[0]?.trim();
    const category_raw = cols[1]?.trim();
    const counterparty = cols[2]?.trim();
    const counterpartyAccount = cols[3]?.trim();
    const productDesc = cols[4]?.trim();
    const dirStr = cols[5]?.trim();
    const amountStr = cols[6]?.trim();
    const payMethod = cols[7]?.trim();
    const status = cols[8]?.trim();
    const platformOrderId = cols[9]?.trim() || undefined;
    const merchantOrderId = cols[10]?.trim() || undefined;
    const remark = cols[11]?.trim() || undefined;

    if (!tradeTime || !amountStr) continue;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) continue;

    // 解析方向
    let direction: Direction;
    if (dirStr === '收入') direction = 'income';
    else if (dirStr === '支出') direction = 'expense';
    else direction = 'neutral'; // "不计收支"

    // 退款识别
    const isRefund = status === '退款成功' ? 1 : 0;

    // 应用自动分类
    const category = autoClassify({
      counterparty,
      product_desc: productDesc,
      trade_type: category_raw,
    });

    // 对于退款记录，使用"退款"分类；否则用自动分类或平台原始分类
    const finalCategory = isRefund ? '退款' : (category || category_raw);

    transactions.push({
      source: 'alipay',
      trade_time: tradeTime,
      trade_type: category_raw,
      category: finalCategory || undefined,
      counterparty: counterparty || undefined,
      counterparty_account: counterpartyAccount !== '/' ? counterpartyAccount : undefined,
      product_desc: productDesc || undefined,
      direction,
      amount,
      net_amount: isRefund ? 0 : amount,
      payment_method: payMethod || undefined,
      status,
      is_refund: isRefund,
      refund_amount: isRefund ? amount : 0,
      platform_order_id: platformOrderId,
      merchant_order_id: merchantOrderId,
      remark: remark || undefined,
      reconcile_status: isRefund ? 'unmatched' : 'matched',
    });
  }

  return transactions;
}

/**
 * 解析支付宝 CSV 行（处理末尾多余逗号和包含逗号的字段）
 * 支付宝的 CSV 使用逗号分隔，但字段内可能不包含逗号（与标准 CSV 不同）
 */
function parseAlipayLine(line: string): string[] {
  // 移除末尾的逗号
  const cleanLine = line.replace(/,+$/, '');
  return cleanLine.split(',').map(s => s.trim());
}
