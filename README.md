# 喵喵账本 (MeowLedger)

家庭财务对账系统，核心解决多平台账单中退款交易导致账目难以对平的痛点。

## 功能特性

- **双平台账单导入** — 支持微信支付 (.xlsx) 和支付宝 (.csv)，自动识别编码和表头结构
- **退款轧差对账** — 自动将退款记录关联到原支付交易，计算实际净支出
- **多退款匹配** — 一笔支付对应多笔退款（如分批退回）也能正确关联
- **家庭成员管理** — 支持多个家庭成员各自导入账单，按成员筛选统计
- **退款链路追踪** — 时间线展示每笔退款的完整生命周期
- **财务仪表盘** — 支出趋势、分类排行、支付渠道占比等图表
- **智能分类** — 预置分类规则，自动识别交易类型（可自定义）
- **数据导出** — 导出为 Excel，含交易明细、月度汇总、退款明细
- **时间筛选** — 所有页面支持按本月/本年/全部/自定义时间范围筛选
- **完全离线** — 数据存储在本地 SQLite，不上传任何服务器

## 截图

| 仪表盘 | 流水明细 | 对账分析 |
|--------|---------|---------|
| 财务概览、趋势图表、待处理提醒 | 多维度筛选、成员标识、手动录入 | 退款链路时间线、待处理明细展开 |

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装运行

```bash
# 克隆项目
git clone https://github.com/yourname/meow-ledger.git
cd meow-ledger

# 安装依赖
npm install

# 开发模式运行
npm run dev
```

### 打包发布

```bash
# macOS
npm run build:mac

# Windows
npm run build:win
```

## 使用流程

1. **添加成员** — 进入设置页，添加家庭成员（如"爸爸"、"妈妈"）
2. **导入账单** — 选择成员 → 拖入账单文件 → 自动解析入库并执行对账
3. **查看仪表盘** — 按成员/时间范围查看收支概览
4. **检查对账分析** — 确认退款链路是否正确，处理待匹配的交易
5. **导出数据** — 按需导出 Excel 报表

### 如何获取原始账单

**微信支付：** 微信 → 我 → 服务 → 钱包 → 账单 → 右上角「...」→ 下载账单 → 用于个人对账

**支付宝：** 支付宝 → 我的 → 账单 → 右上角「...」→ 开具交易流水证明，或电脑端登录下载 CSV

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 前端 | React 18 + TypeScript + Tailwind CSS |
| 图表 | Recharts |
| 数据库 | SQLite (better-sqlite3) |
| Excel | ExcelJS |
| 构建 | Vite + electron-builder |

## 项目结构

```
src/
├── components/          # 页面组件
│   ├── Dashboard.tsx    # 仪表盘
│   ├── Ledger.tsx       # 流水明细
│   ├── Reconcile.tsx    # 对账分析
│   ├── ImportPage.tsx   # 数据导入
│   ├── ExportPage.tsx   # 数据导出
│   ├── SettingsPage.tsx # 设置（成员管理）
│   └── Sidebar.tsx      # 侧边导航
├── core/                # 核心逻辑
│   ├── database.ts      # SQLite 数据库层
│   ├── reconcile.ts     # 对账引擎
│   ├── parser-wechat.ts # 微信账单解析
│   ├── parser-alipay.ts # 支付宝账单解析
│   └── exporter.ts      # Excel 导出
├── services/
│   └── data-service.ts  # 数据服务层（Electron IPC / Mock）
└── types/
    └── index.ts         # 类型定义
electron/
├── main.cjs             # Electron 主进程
└── preload.cjs          # 预加载脚本
```

## CLI 用法

除了图形界面，也支持命令行导入：

```bash
# 导入账单
npx tsx src/core/cli-import.ts 微信支付账单.xlsx 支付宝交易明细.csv

# 指定成员
npx tsx src/core/cli-import.ts 账单.xlsx --member 锐彬
```

## License

MIT
