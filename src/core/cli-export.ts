// ============================================================
// 喵喵账本 - CLI: 数据导出
// 用法: npx tsx src/core/cli-export.ts [startDate] [endDate]
// ============================================================

import path from 'path';
import { MeowDB } from './database.js';
import { exportToExcel } from './exporter.js';

async function main() {
  const startDate = process.argv[2] || '2026-04-30';
  const endDate = process.argv[3] || '2026-05-31';

  const dbPath = path.join(process.cwd(), 'meowledger.db');
  const db = new MeowDB(dbPath);

  console.log('🐱 喵喵账本 - 数据导出');
  console.log('═'.repeat(50));
  console.log(`时间范围: ${startDate} ~ ${endDate}`);

  const count = db.getTransactionCount({ startDate, endDate });
  console.log(`匹配记录: ${count} 条`);

  if (count === 0) {
    console.log('⚠️  无数据可导出，请先导入数据');
    db.close();
    return;
  }

  const outputPath = await exportToExcel(db, {
    startDate,
    endDate,
    includeRefunds: true,
    netMode: true,
    format: 'xlsx',
  });

  console.log(`✅ 导出成功: ${outputPath}`);
  db.close();
}

main().catch(console.error);
