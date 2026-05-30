# 喵喵账本 (MeowLedger) - 架构设计文档

> 家庭财务对账系统，核心解决电商多平台购物中"退款交易"导致账目难以对平的痛点

---

## 1. 整体技术选型

### 1.1 技术选型矩阵

| 层级 | 选型 | 理由 |
|------|------|------|
| **桌面框架** | Tauri 2.x | 跨平台(Mac/Win)、二进制约 3-5MB（Electron 150MB+）、原生性能、安全性沙箱 |
| **后端语言** | Rust (Tauri 原生) | 零 GC、内存安全、极致性能、Tauri 原生集成 |
| **前端框架** | React 18 + TypeScript | 生态成熟、类型安全、组件丰富 |
| **UI 组件库** | Tailwind CSS + shadcn/ui | 离线可用、美观一致、高度可定制 |
| **本地数据库** | SQLite 3 (via rusqlite) | 零配置、单文件存储、跨平台、ACID 事务、轻量 |
| **Excel 解析** | calamine (Rust) + xlsxwriter | Rust 原生解析 xlsx/csv，无需 Node 依赖 |
| **图表库** | Recharts (前端) | React 原生、离线可用、交互性强 |
| **构建工具** | Vite + Tauri CLI | 快速 HMR、优化构建 |

### 1.2 备选方案对比

| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| Electron + Vue3 | 生态成熟 | 包体巨大(150MB+)、内存占用高 | ❌ 不够轻量 |
| Tauri + React | 轻量(5MB)、原生性能 | Rust 学习曲线 | ✅ **最终选择** |
| JavaFX / Compose Desktop | JVM 生态 | 启动慢、包体大、UI 不够现代 | ❌ 不适合 |
| 纯 Python + tkinter | 最简 | 美观度差、性能弱 | ❌ 体验差 |

**存储方案对比：**

| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| SQLite | 零配置、单文件、SQL 查询、ACID | 无内置加密(可加SQLCipher) | ✅ **最终选择** |
| DuckDB | OLAP 分析强 | 依赖重、社区较新 | ❌ 过度设计 |
| H2 (Java) | Java 生态 | 需要 JVM | ❌ 绑定 Java |
| 直接读 Excel/JSON | 最简 | 无索引、查询弱、并发差 | ❌ 性能瓶颈 |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tauri 桌面应用 (跨平台)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  React 前端 (TypeScript)                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ 仪表盘   │ │ 流水明细 │ │ 对账分析 │ │ 导入/导出    │ │  │
│  │  │ Dashboard │ │ Ledger   │ │ Reconcile│ │ Import/Export│ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐                               │  │
│  │  │ 统计图表 │ │ 设置     │                               │  │
│  │  │ Charts   │ │ Settings │                               │  │
│  │  └──────────┘ └──────────┘                               │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │ Tauri IPC (invoke)                    │
│  ┌──────────────────────┴────────────────────────────────────┐  │
│  │                Rust 后端 (Tauri Commands)                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ 解析器   │ │ 存储层   │ │ 对账引擎 │ │ 导出器       │ │  │
│  │  │ Parser   │ │ Storage  │ │ Reconcile│ │ Exporter     │ │  │
│  │  │ (calamine)│ │(rusqlite)│ │ Engine   │ │ (xlsxwriter) │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    SQLite 数据库文件                        │  │
│  │              ~/MeowLedger/meowledger.db                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 数据流

```
原始文件导入          解析 & 清洗             入库                    功能层
┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌──────────────────┐
│ 微信 .xlsx│───→│ WechatParser  │───→│  transactions │───→│ 对账引擎(轧差)   │
│ 支付宝.csv│───→│ AlipayParser  │───→│  table        │───→│ 统计分析 & 图表  │
└──────────┘    │               │    │              │───→│ Excel 导出       │
                │ · 编码检测     │    │ · 去重       │    │ CRUD 手动修正    │
                │ · 跳过表头    │    │ · 索引       │    └──────────────────┘
                │ · 字段映射    │    │ · 事务       │
                │ · 退款识别    │    └──────────────┘
                └───────────────┘
```

---

## 3. 数据库 Schema

基于对真实流水的分析（微信23笔、支付宝85笔），设计如下：

### 3.1 核心表：transactions（统一交易流水表）

```sql
-- ============================================================
-- 喵喵账本 - 核心数据库 Schema
-- ============================================================

-- 主交易表：双渠道数据清洗后统一入库
CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 来源标识
    source          TEXT NOT NULL CHECK(source IN ('wechat', 'alipay')),
    source_file     TEXT,                          -- 导入的源文件名
    
    -- 时间信息
    trade_time      TEXT NOT NULL,                  -- 交易时间 ISO8601: 2026-05-27 22:23:16
    
    -- 交易分类
    trade_type      TEXT NOT NULL,                  -- 原始交易类型 (商户消费/扫码付款/退款等)
    category        TEXT,                           -- 标准分类 (餐饮/交通/购物/退款等)
    
    -- 交易对方
    counterparty    TEXT,                           -- 交易对方名称
    counterparty_account TEXT,                      -- 对方账号 (支付宝特有)
    
    -- 商品信息
    product_desc    TEXT,                           -- 商品说明
    
    -- 金额信息
    direction       TEXT NOT NULL CHECK(direction IN ('income', 'expense', 'neutral')),
    amount          REAL NOT NULL,                  -- 交易金额 (原始值)
    net_amount      REAL,                           -- 轧差后净额 (扣除退款后)
    payment_method  TEXT,                           -- 支付方式
    
    -- 状态信息
    status          TEXT NOT NULL,                  -- 交易状态 (成功/退款/关闭等)
    is_refund       INTEGER NOT NULL DEFAULT 0,     -- 是否为退款记录
    refund_amount   REAL DEFAULT 0,                 -- 已退款金额
    original_txn_id TEXT,                           -- 关联的原交易ID (用于退款追溯)
    
    -- 平台标识
    platform_txn_id TEXT,                           -- 交易单号 (微信/支付宝内部)
    merchant_txn_id TEXT,                           -- 商户单号
    platform_order_id TEXT,                         -- 交易订单号 (支付宝)
    merchant_order_id TEXT,                         -- 商家订单号 (支付宝)
    
    -- 备注
    remark          TEXT,                           -- 备注/优惠信息
    
    -- 对账状态
    reconcile_status TEXT DEFAULT 'unmatched'       -- 对账状态
        CHECK(reconcile_status IN ('matched', 'unmatched', 'manual_matched', 'discrepancy')),
    reconcile_group_id TEXT,                        -- 对账组ID (同一笔消费+退款归为一组)
    
    -- 用户修正
    user_note       TEXT,                           -- 用户手动添加的备注
    is_hidden       INTEGER NOT NULL DEFAULT 0,     -- 是否隐藏 (不计入统计)
    
    -- 元数据
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    
    -- 去重约束：同一来源+交易单号 不重复
    UNIQUE(source, platform_txn_id, trade_time)
);

-- 索引：加速常用查询
CREATE INDEX IF NOT EXISTS idx_txn_trade_time ON transactions(trade_time);
CREATE INDEX IF NOT EXISTS idx_txn_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_txn_direction ON transactions(direction);
CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_reconcile ON transactions(reconcile_status);
CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_txn_counterparty ON transactions(counterparty);
CREATE INDEX IF NOT EXISTS idx_txn_platform_id ON transactions(platform_txn_id);
CREATE INDEX IF NOT EXISTS idx_txn_merchant_id ON transactions(merchant_txn_id);
CREATE INDEX IF NOT EXISTS idx_txn_is_refund ON transactions(is_refund);
CREATE INDEX IF NOT EXISTS idx_txn_reconcile_group ON transactions(reconcile_group_id);
```

### 3.2 对账组表：reconcile_groups（退款链路追踪）

```sql
-- 对账组表：将原始支付和关联退款归为一组，实现"轧差对账"
CREATE TABLE IF NOT EXISTS reconcile_groups (
    id                  TEXT PRIMARY KEY,            -- UUID
    original_txn_id     INTEGER NOT NULL,            -- 原始支付交易ID
    total_paid          REAL NOT NULL,               -- 原始支付金额
    total_refunded      REAL NOT NULL DEFAULT 0,     -- 累计退款金额
    net_amount          REAL NOT NULL,               -- 净额 = paid - refunded
    refund_count        INTEGER NOT NULL DEFAULT 0,  -- 退款笔数
    status              TEXT NOT NULL DEFAULT 'open'  -- 状态
        CHECK(status IN ('open', 'partial_refund', 'fully_refunded', 'closed')),
    counterparty        TEXT,
    product_desc        TEXT,
    first_trade_time    TEXT NOT NULL,
    last_trade_time     TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (original_txn_id) REFERENCES transactions(id)
);
```

### 3.3 导入记录表（防止重复导入）

```sql
-- 文件导入记录
CREATE TABLE IF NOT EXISTS import_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source          TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    file_hash       TEXT NOT NULL,                   -- 文件内容 hash，防重复导入
    record_count    INTEGER NOT NULL,
    imported_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE(file_hash)
);
```

### 3.4 分类规则表（可配置的自动分类）

```sql
-- 自动分类规则
CREATE TABLE IF NOT EXISTS category_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    match_field     TEXT NOT NULL CHECK(match_field IN ('counterparty', 'product_desc', 'trade_type')),
    match_pattern   TEXT NOT NULL,                   -- 匹配模式 (精确/包含/正则)
    match_type      TEXT NOT NULL DEFAULT 'contains' CHECK(match_type IN ('exact', 'contains', 'regex')),
    category        TEXT NOT NULL,                   -- 分配的分类
    priority        INTEGER NOT NULL DEFAULT 0,      -- 优先级 (数值越大越优先)
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 预置分类规则（基于真实数据分析）
INSERT INTO category_rules (match_field, match_pattern, match_type, category, priority) VALUES
    ('counterparty', '国网浙江电力', 'contains', '公共服务-电费', 10),
    ('counterparty', 'P云停车平台', 'contains', '交通-停车', 10),
    ('counterparty', 'PP停车', 'contains', '交通-停车', 10),
    ('counterparty', '拼多多', 'contains', '电商-拼多多', 10),
    ('counterparty', '淘宝', 'contains', '电商-淘宝', 10),
    ('counterparty', '京东', 'contains', '电商-京东', 10),
    ('counterparty', '得物', 'contains', '电商-得物', 10),
    ('product_desc', '充电桩', 'contains', '交通-充电', 10),
    ('product_desc', '停车费', 'contains', '交通-停车', 8),
    ('trade_type', '退款', 'contains', '退款', 100),
    ('trade_type', '退款成功', 'contains', '退款', 100),
    ('product_desc', '余额宝', 'contains', '理财', 10),
    ('trade_type', '扫码', 'contains', '线下消费', 5);
```

---

## 4. 数据源字段映射

基于真实流水的字段分析：

### 4.1 微信支付 (WeChat Pay)

原始格式：`.xlsx`，前 17 行为表头信息，第 18 行为列标题，第 19 行起为数据。

| 原始列名 | 位置 | 映射到 | 处理逻辑 |
|----------|------|--------|----------|
| 交易时间 | col[0] | trade_time | 直接映射 |
| 交易类型 | col[1] | trade_type | 如"商户消费"、"贵阳风驰-退款" |
| 交易对方 | col[2] | counterparty | 直接映射 |
| 商品 | col[3] | product_desc | 直接映射 |
| 收/支 | col[4] | direction | "收入"→income, "支出"→expense |
| 金额(元) | col[5] | amount | 解析为浮点数 |
| 支付方式 | col[6] | payment_method | 直接映射 |
| 当前状态 | col[7] | status + is_refund + refund_amount | **关键解析逻辑见下** |
| 交易单号 | col[8] | platform_txn_id | 直接映射 |
| 商户单号 | col[9] | merchant_txn_id | 直接映射 |
| 备注 | col[10] | remark | 提取"已优惠¥X.XX" |

**微信退款解析逻辑（核心难点）：**

```
微信退款表现为两行：
  1. 原始支付行：direction=支出, status="已退款(¥36.97)"
     → is_refund=0 (这是原交易), refund_amount=36.97
  2. 退款收入行：direction=收入, status="已退款¥36.97", trade_type含"退款"
     → is_refund=1, amount=36.97

识别模式：
  - status 匹配 /已退款[（(]?\s*¥?([\d.]+)/ → 提取退款金额
  - trade_type 包含 "退款" → 标记为退款记录
  - 退款行的 platform_txn_id 可能为空（如示例中 Row 39）
  - 需要通过 counterparty + 时间窗口 + 金额 关联原交易
```

### 4.2 支付宝 (Alipay)

原始格式：`.csv` (GB18030 编码)，前 23 行为表头信息，第 24 行为列标题，第 25 行起为数据。

| 原始列名 | 位置 | 映射到 | 处理逻辑 |
|----------|------|--------|----------|
| 交易时间 | col[0] | trade_time | 直接映射 |
| 交易分类 | col[1] | category | 平台自带分类 |
| 交易对方 | col[2] | counterparty | 直接映射 |
| 对方账号 | col[3] | counterparty_account | 脱敏显示 |
| 商品说明 | col[4] | product_desc | 含退款前缀需处理 |
| 收/支 | col[5] | direction | "支出"→expense, "收入"→income, "不计收支"→neutral |
| 金额 | col[6] | amount | 解析为浮点数 |
| 收/付款方式 | col[7] | payment_method | 如"宁波银行信用卡(1611)&优惠" |
| 交易状态 | col[8] | status | "交易成功"/"交易关闭"/"退款成功" |
| 交易订单号 | col[9] | platform_order_id | 支付宝内部单号 |
| 商家订单号 | col[10] | merchant_order_id | 商户单号 |
| 备注 | col[11] | remark | 可能为空 |

**支付宝退款解析逻辑：**

```
支付宝退款表现：
  - 单独一行，status="退款成功"，direction="不计收支"
  - product_desc 以"退款-"开头（如"退款-高德车服充电订单"）
  - category="退款"
  - 金额为退款实际到账金额

关联逻辑：
  - 通过 platform_order_id 的前缀匹配原交易
  - 或通过 counterparty + 金额 + 时间窗口关联
  - 支付宝的退款比微信更容易识别（status 字段直接标记）
```

---

## 5. 对账引擎设计

### 5.1 轧差对账算法

```
输入：transactions 表中所有记录
输出：reconcile_groups 表 + 每笔交易的 reconcile_status

步骤：
1. 识别退款记录（is_refund=1 或 status="退款成功"）
2. 对每条退款记录，寻找匹配的原始支付：
   匹配条件（按优先级）：
   a. merchant_order_id 相同（最精确）
   b. counterparty 相同 + 金额 <= 原交易金额 + 时间在之后 30 天内
   c. product_desc 包含关系匹配
3. 匹配成功 → 创建/更新 reconcile_group，计算 net_amount
4. 无法匹配 → 标记为 discrepancy（需人工处理）
5. 无退款的纯消费 → 直接标记 matched，net_amount = amount
```

### 5.2 关键 SQL 视图

```sql
-- ============================================================
-- 轧差后净额统计视图
-- ============================================================

-- 月度收支轧差概览
CREATE VIEW IF NOT EXISTS v_monthly_summary AS
SELECT 
    strftime('%Y-%m', trade_time) AS month,
    source,
    COUNT(*) AS txn_count,
    SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END) AS total_expense,
    SUM(CASE WHEN direction = 'income' AND is_refund = 0 THEN amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END) AS total_refund,
    SUM(CASE WHEN direction = 'expense' THEN amount ELSE 0 END) 
      - SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END) AS net_expense
FROM transactions
WHERE is_hidden = 0 AND direction != 'neutral'
GROUP BY strftime('%Y-%m', trade_time), source;

-- 未对平流水（需人工处理）
CREATE VIEW IF NOT EXISTS v_unmatched_transactions AS
SELECT 
    id, source, trade_time, counterparty, product_desc,
    amount, direction, status, platform_txn_id, merchant_txn_id
FROM transactions
WHERE reconcile_status IN ('unmatched', 'discrepancy')
  AND is_hidden = 0
ORDER BY trade_time DESC;

-- 退款链路追踪
CREATE VIEW IF NOT EXISTS v_refund_chain AS
SELECT 
    rg.id AS group_id,
    rg.status AS group_status,
    t_orig.trade_time AS original_time,
    t_orig.counterparty,
    t_orig.product_desc,
    t_orig.amount AS paid_amount,
    t_ref.trade_time AS refund_time,
    t_ref.amount AS refund_amount,
    rg.net_amount,
    rg.refund_count
FROM reconcile_groups rg
JOIN transactions t_orig ON rg.original_txn_id = t_orig.id
LEFT JOIN transactions t_ref ON t_ref.reconcile_group_id = rg.id AND t_ref.is_refund = 1
ORDER BY t_orig.trade_time DESC;

-- 按分类统计（已轧差）
CREATE VIEW IF NOT EXISTS v_category_summary AS
SELECT 
    category,
    source,
    COUNT(*) AS txn_count,
    SUM(CASE WHEN direction = 'expense' THEN net_amount ELSE 0 END) AS net_expense,
    SUM(CASE WHEN is_refund = 1 THEN amount ELSE 0 END) AS refund_amount
FROM transactions
WHERE is_hidden = 0 AND direction != 'neutral'
GROUP BY category, source
ORDER BY net_expense DESC;
```

---

## 6. UI 界面设计

### 6.1 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│  🐱 喵喵账本                              [导入] [导出] [设置]│
├────────┬────────────────────────────────────────────────────┤
│        │                                                    │
│ 导航栏  │              内容区域                               │
│        │                                                    │
│ 📊 仪表盘 │  ┌──────────────────────────────────────────┐   │
│ 📋 流水明细│  │         当前页面内容                        │   │
│ 🔍 对账分析│  │                                          │   │
│ 📈 统计图表│  │                                          │   │
│ 📥 数据管理│  │                                          │   │
│ ⚙️  设置   │  └──────────────────────────────────────────┘   │
│        │                                                    │
├────────┴────────────────────────────────────────────────────┤
│  状态栏：共108笔 | 本月支出 ¥3,578.77 | 退款 ¥36.97 | 净额...│
└─────────────────────────────────────────────────────────────┘
```

### 6.2 核心页面详情

**页面一：仪表盘 Dashboard**

```
┌──────────────────────────────────────────────────────────┐
│                    2026年5月 财务概览                       │
├────────────┬────────────┬────────────┬───────────────────┤
│  💰 总支出  │  📥 退款    │  📊 净支出  │  ⚠️ 待对账         │
│  ¥3,578.77 │  ¥76.65    │  ¥3,502.12 │  3 笔             │
├────────────┴────────────┴────────────┴───────────────────┤
│                                                          │
│  ┌─── 月度收支趋势 ──────────────────────────────────┐   │
│  │  [Recharts 折线图: 支出/退款/净额 按日]             │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─── 支付渠道占比 ──┐  ┌─── 分类 TOP10 ────────────┐   │
│  │  [饼图]           │  │  [柱状图]                  │   │
│  │  微信 45%         │  │  电商-拼多多  ¥120.53     │   │
│  │  支付宝 55%       │  │  交通-停车    ¥195.00     │   │
│  └───────────────────┘  └───────────────────────────┘   │
│                                                          │
│  ┌─── 待处理事项 ────────────────────────────────────┐   │
│  │  ⚠️  3笔未匹配退款                                  │   │
│  │  ⚠️  1笔金额有差异                                   │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**页面二：流水明细 Ledger**

```
┌──────────────────────────────────────────────────────────┐
│  流水明细    [全部|微信|支付宝] [本月▼] [收入|支出|退款|全部]│
│                               [🔍 搜索交易对方/商品]       │
├────┬──────────┬────────┬──────────┬────────┬──────┬──────┤
│ #  │ 交易时间  │ 来源   │ 交易对方  │ 商品   │ 金额 │ 状态 │
├────┼──────────┼────────┼──────────┼────────┼──────┼──────┤
│ 1  │ 05-27    │ 微信   │ 国网浙江  │ 电费   │-3.45 │ ✅  │
│ 2  │ 05-10    │ 拼多多 │ 拼多多   │ XX商品  │-29.51│ ✅  │
│ 3  │ 05-03    │ 微信   │ 贵阳风驰  │ 充电桩 │-49.00│ ⚠️  │
│    │          │        │          │        │      │已退12│
│ 4  │ 05-03    │ 微信   │ 贵阳风驰  │ 退款   │+36.97│ ↩️  │
│ 5  │ 05-30    │ 支付宝 │ 逸安启   │ 充电退款│+39.68│ ↩️  │
├────┴──────────┴────────┴──────────┴────────┴──────┴──────┤
│  显示 1-20 / 共 108 条    [< 1 2 3 ... 6 >]              │
│                                                          │
│  💡 点击行展开详情：交易单号、商户单号、支付方式、备注       │
│  ✏️  可编辑：分类、备注、隐藏标记                           │
└──────────────────────────────────────────────────────────┘

行状态图标说明：
  ✅ 已对平  ⚠️ 部分退款  ❌ 未对平  ↩️ 退款记录
```

**页面三：对账分析 Reconcile**

```
┌──────────────────────────────────────────────────────────┐
│                    🔍 退款对账分析                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─── 对账汇总 ────────────────────────────────────────┐ │
│  │  总消费笔数: 75    已对平: 70    有退款: 5            │ │
│  │  总消费额: ¥3,578  退款总额: ¥76.65  净额: ¥3,502   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─── 退款链路追踪 ────────────────────────────────────┐ │
│  │                                                     │ │
│  │  📦 贵阳风驰 - 充电桩订单                            │ │
│  │  ├── 💳 05-03 07:17  支付  ¥49.00  [微信]           │ │
│  │  ├── ↩️ 05-03 08:07  退款  ¥36.97  [微信]           │ │
│  │  └── 📊 净额: ¥12.03  状态: ⚠️ 部分退款             │ │
│  │                                                     │ │
│  │  📦 逸安启 - 高德车服充电                             │ │
│  │  ├── 💳 (未知)  支付  ¥39.68  [支付宝]              │ │
│  │  ├── ↩️ 05-24  退款  ¥39.68  [支付宝]               │ │
│  │  └── 📊 净额: ¥0.00   状态: ✅ 全额退款              │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─── ⚠️ 未匹配 / 有差异 ──────────────────────────────┐ │
│  │  [可展开的表格，显示所有未对平的流水，支持手动关联]     │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**页面四：数据导入 Import**

```
┌──────────────────────────────────────────────────────────┐
│                    📥 数据导入                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │           📁 拖拽文件到这里                         │  │
│  │                                                    │  │
│  │     支持格式：微信支付(.xlsx) 支付宝(.csv/.xlsx)    │  │
│  │                                                    │  │
│  │              [选择文件]                             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─── 导入历史 ────────────────────────────────────────┐  │
│  │  2026-05-30  微信支付  23笔  ✅ 成功                 │  │
│  │  2026-05-30  支付宝    85笔  ✅ 成功                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  导入流程预览：                                            │
│  1. 📄 解析文件  →  2. 🔍 检测重复  →  3. ✅ 确认入库     │
│                                                          │
│  ┌─── 解析预览（入库前确认）───────────────────────────┐  │
│  │  [表格展示解析后的前10条数据，让用户确认格式正确]     │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 7. 核心解析逻辑 (TypeScript 伪代码)

> 注：在 Tauri 生态中推荐 Rust 实现解析器以获得最佳性能，但为便于理解，
> 此处先用 TypeScript 伪代码说明算法逻辑，实际实现见 src-tauri/ 下的 Rust 代码。

### 7.1 微信支付解析器

```typescript
interface WechatRawRow {
  tradeTime: string;       // "2026-05-27 22:23:16"
  tradeType: string;       // "商户消费" | "扫二维码付款" | "贵阳风驰-退款"
  counterparty: string;    // "国网浙江电力生活缴费"
  product: string;         // "生活缴费"
  direction: string;       // "收入" | "支出"
  amount: string;          // "3.45"
  paymentMethod: string;   // "农业银行储蓄卡(2679)"
  status: string;          // "支付成功" | "已退款¥36.97" | "已退款(¥36.97)"
  txnId: string;           // 交易单号
  merchantId: string;      // 商户单号
  remark: string;          // "已优惠¥1.55"
}

function parseWechatXlsx(filePath: string): Transaction[] {
  // 1. 打开 xlsx 文件
  // 2. 找到 header 行（包含 "交易时间" 的行）
  // 3. 从 header+1 行开始逐行解析
  // 4. 字段映射：
  
  return rows.map(row => ({
    source: 'wechat',
    tradeTime: row.tradeTime,
    tradeType: row.tradeType,
    category: autoClassify(row),  // 应用分类规则
    counterparty: row.counterparty,
    productDesc: row.product,
    direction: mapDirection(row.direction),
    amount: parseFloat(row.amount),
    paymentMethod: row.paymentMethod,
    ...parseWechatStatus(row.status, row.direction, parseFloat(row.amount)),
    platformTxnId: row.txnId || null,
    merchantTxnId: row.merchantId || null,
    remark: row.remark === '/' ? null : row.remark,
  }));
}

function parseWechatStatus(status: string, direction: string, amount: number) {
  // 核心退款识别逻辑
  const refundMatch = status.match(/已退款[（(]?\s*¥?([\d.]+)/);
  
  if (refundMatch) {
    const refundAmount = parseFloat(refundMatch[1]);
    
    if (direction === '收入') {
      // 这是退款到账记录
      return {
        isRefund: 1,
        refundAmount: refundAmount,
        netAmount: 0,  // 退款行自身净额为0
        status: 'refunded',
      };
    } else {
      // 这是原支付记录（已被部分/全部退款）
      return {
        isRefund: 0,
        refundAmount: refundAmount,
        netAmount: amount - refundAmount,  // 轧差
        status: refundAmount >= amount ? 'fully_refunded' : 'partial_refunded',
      };
    }
  }
  
  return {
    isRefund: 0,
    refundAmount: 0,
    netAmount: amount,
    status: status,  // "支付成功" / "已转账" 等
  };
}
```

### 7.2 支付宝解析器

```typescript
function parseAlipayCsv(filePath: string): Transaction[] {
  // 1. 读取文件，尝试 GB18030/GBK 编码
  // 2. 跳过前23行（表头信息）
  // 3. 第24行为列标题，校验
  // 4. 第25行起为数据，按逗号分隔（注意尾部逗号）
  
  return dataLines.map(line => {
    const cols = splitAlipayLine(line);
    return {
      source: 'alipay',
      tradeTime: cols[0],
      category: cols[1],          // 支付宝自带分类
      tradeType: cols[1],
      counterparty: cols[2],
      counterpartyAccount: cols[3],
      productDesc: cols[4],
      direction: mapDirection(cols[5]),  // "不计收支" → neutral
      amount: parseFloat(cols[6]),
      paymentMethod: cols[7],
      status: cols[8],
      isRefund: cols[8] === '退款成功' ? 1 : 0,
      platformOrderId: cols[9]?.trim(),
      merchantOrderId: cols[10]?.trim(),
      remark: cols[11] || null,
      netAmount: cols[8] === '退款成功' ? 0 : parseFloat(cols[6]),
    };
  });
}
```

---

## 8. 数据导出方案

### 8.1 Excel 导出逻辑

```typescript
interface ExportOptions {
  startDate: string;         // "2026-05-01"
  endDate: string;           // "2026-05-31"
  sources?: ('wechat' | 'alipay')[];  // 可选筛选
  includeRefunds: boolean;   // 是否包含退款明细
  netMode: boolean;          // true=显示轧差后净额, false=显示原始金额
  format: 'xlsx' | 'csv';
}

function exportToExcel(options: ExportOptions): string {
  // 1. 按条件查询 transactions
  // 2. 根据 netMode 决定输出金额列
  // 3. 生成 Excel：
  //    Sheet 1: 交易明细
  //    Sheet 2: 月度汇总（如果跨月）
  //    Sheet 3: 退款明细（如果有）
  // 4. 设置列宽、表头样式
  // 5. 返回文件路径
}
```

### 8.2 导出 Excel 表头设计

**Sheet 1 - 交易明细：**

| 交易时间 | 来源 | 交易类型 | 交易对方 | 商品说明 | 收/支 | 金额 | 轧差净额 | 支付方式 | 状态 | 分类 | 备注 |
|---------|------|---------|---------|---------|------|------|---------|---------|------|------|------|

**Sheet 2 - 退款明细：**

| 原交易时间 | 原交易对方 | 原金额 | 退款时间 | 退款金额 | 净额 | 退款状态 |
|-----------|-----------|--------|---------|---------|------|---------|

---

## 9. 统计分析维度

基于"退款对账难"痛点，以下维度最有价值：

| 维度 | 图表类型 | 解决什么问题 |
|------|---------|-------------|
| 月度收支轧差 | 柱状+折线图 | 扣除退款后的实际支出到底是多少 |
| 未对平流水列表 | 高亮表格 | 哪些退款还没找到原交易 |
| 退款链路追踪 | 时间线/树形 | 每一笔退款的完整生命周期 |
| 平台消费对比 | 分组柱状图 | 微信 vs 支付宝各花了多少 |
| 分类消费分布 | 饼图/环形图 | 钱主要花在哪里了 |
| 退款率 by 商户 | 排行榜 | 哪些商户退款最多（可能踩雷） |
| 日消费趋势 | 折线图 | 发现消费高峰和异常 |
| 挂账流水跟踪 | 待办列表 | 退款金额与原支付不一致的情况 |

---

## 10. 项目目录结构

```
MeowLedger/
├── README.md
├── ARCHITECTURE.md              ← 本文档
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
│
├── src/                         ← React 前端
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── dashboard/
│   │   │   ├── SummaryCards.tsx
│   │   │   ├── TrendChart.tsx
│   │   │   └── PlatformPieChart.tsx
│   │   ├── ledger/
│   │   │   ├── TransactionTable.tsx
│   │   │   ├── TransactionDetail.tsx
│   │   │   └── FilterBar.tsx
│   │   ├── reconcile/
│   │   │   ├── ReconcileSummary.tsx
│   │   │   ├── RefundChain.tsx
│   │   │   └── UnmatchedList.tsx
│   │   ├── import/
│   │   │   ├── FileDropZone.tsx
│   │   │   └── ImportPreview.tsx
│   │   └── charts/
│   │       ├── MonthlyTrend.tsx
│   │       └── CategoryPie.tsx
│   ├── hooks/
│   │   ├── useTransactions.ts
│   │   └── useReconcile.ts
│   ├── lib/
│   │   └── tauri.ts            ← Tauri invoke 封装
│   └── types/
│       └── index.ts
│
├── src-tauri/                   ← Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/            ← Tauri Commands
│   │   │   ├── mod.rs
│   │   │   ├── import.rs
│   │   │   ├── transaction.rs
│   │   │   ├── reconcile.rs
│   │   │   └── export.rs
│   │   ├── db/                  ← 数据库层
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs
│   │   │   └── models.rs
│   │   ├── parser/              ← 文件解析器
│   │   │   ├── mod.rs
│   │   │   ├── wechat.rs
│   │   │   └── alipay.rs
│   │   ├── engine/              ← 对账引擎
│   │   │   ├── mod.rs
│   │   │   └── reconcile.rs
│   │   └── exporter/            ← 数据导出
│   │       ├── mod.rs
│   │       └── excel.rs
│   └── migrations/              ← 数据库迁移
│       └── 001_init.sql
│
├── data/                        ← 测试数据（不入版本控制）
│   ├── 微信支付账单流水文件.xlsx
│   └── 支付宝交易明细.csv
│
└── tests/
    ├── parser.test.ts
    └── reconcile.test.ts
```

---

## 11. 开发路线图

| 阶段 | 内容 | 预估时间 |
|------|------|---------|
| **Phase 1** | 数据库 Schema + 解析器 + 导入命令行工具 | 1-2 天 |
| **Phase 2** | Tauri 应用骨架 + 流水明细 CRUD | 2-3 天 |
| **Phase 3** | 对账引擎 + 轧差算法 | 1-2 天 |
| **Phase 4** | 仪表盘 + 图表统计 | 1-2 天 |
| **Phase 5** | 数据导出 + 设置页面 | 1 天 |
| **Phase 6** | 测试 + 打包分发 | 1 天 |

---

*文档版本: 1.0 | 生成日期: 2026-05-30 | 基于真实流水数据分析*
