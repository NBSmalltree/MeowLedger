// ============================================================
// 喵喵账本 - CLI: 数据导入
// 用法: npx tsx src/core/cli-import.ts <file1> [file2] ...
// ============================================================

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { MeowDB } from './database.js';
import { parseWechatXlsx } from './parser-wechat.js';
import { parseAlipayCsv } from './parser-alipay.js';
import type { Source } from './types.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: npx tsx src/core/cli-import.ts <文件路径1> [文件路径2] ...');
    console.log('');
    console.log('支持的文件格式:');
    console.log('  微信支付: .xlsx 文件');
    console.log('  支付宝:   .csv 文件');
    process.exit(1);
  }

  const dbPath = path.join(process.cwd(), 'meowledger.db');
  const db = new MeowDB(dbPath);

  console.log('🐱 喵喵账本 - 数据导入');
  console.log('═'.repeat(50));
  console.log(`数据库: ${dbPath}`);
  console.log('');

  for (const filePath of args) {
    const absPath = path.resolve(filePath);
    const fileName = path.basename(absPath);
    const ext = path.extname(absPath).toLowerCase();

    if (!fs.existsSync(absPath)) {
      console.error(`❌ 文件不存在: ${absPath}`);
      continue;
    }

    // 计算文件 hash（防重复导入）
    const fileBuffer = fs.readFileSync(absPath);
    const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');

    if (db.isFileImported(fileHash)) {
      console.log(`⏭️  已导入过，跳过: ${fileName}`);
      continue;
    }

    let source: Source;
    let txns;

    try {
      if (ext === '.xlsx' && fileName.includes('微信')) {
        source = 'wechat';
        console.log(`📄 解析微信账单: ${fileName}`);
        txns = await parseWechatXlsx(absPath, (txn) => db.autoClassify(txn) || '');
      } else if (ext === '.csv' && fileName.includes('支付宝')) {
        source = 'alipay';
        console.log(`📄 解析支付宝账单: ${fileName}`);
        txns = await parseAlipayCsv(absPath, (txn) => db.autoClassify(txn) || '');
      } else {
        console.log(`⚠️  无法识别文件类型: ${fileName} (需要文件名包含"微信"或"支付宝")`);
        continue;
      }

      // 标记来源文件
      for (const txn of txns) {
        txn.source_file = fileName;
        // 处理空分类
        if (!txn.category || txn.category === '') {
          txn.category = db.autoClassify(txn) || '未分类';
        }
      }

      // 批量入库
      const imported = db.insertTransactionsBatch(txns);

      // 记录导入
      db.recordImport(source, fileName, fileHash, imported);

      const stats = db.getStats();
      console.log(`✅ 导入成功: ${imported}/${txns.length} 条记录`);
      console.log(`   退款记录: ${txns.filter(t => t.is_refund === 1).length} 条`);
      console.log(`   数据库合计: ${stats.total} 条 (微信: ${stats.wechat}, 支付宝: ${stats.alipay})`);
      console.log('');

    } catch (err: any) {
      console.error(`❌ 解析失败: ${fileName}`);
      console.error(`   错误: ${err.message}`);
    }
  }

  db.close();
  console.log('═'.repeat(50));
  console.log('🎉 导入完成！');
}

main().catch(console.error);
