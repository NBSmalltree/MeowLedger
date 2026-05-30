// ============================================================
// 喵喵账本 - 初始化数据库
// 用法: npx tsx src/core/init-db.ts
// ============================================================

import path from 'path';
import { MeowDB } from './database.js';

const dbPath = path.join(process.cwd(), 'meowledger.db');
console.log(`🐱 初始化数据库: ${dbPath}`);

const db = new MeowDB(dbPath);
const rules = db.getCategoryRules();
console.log(`✅ 数据库创建成功`);
console.log(`✅ 预置分类规则: ${rules.length} 条`);

const stats = db.getStats();
console.log(`   当前记录数: ${stats.total}`);

db.close();
console.log('🎉 初始化完成');
