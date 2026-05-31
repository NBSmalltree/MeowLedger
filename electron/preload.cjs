// ============================================================
// 喵喵账本 - Electron Preload Script
// 安全地将 IPC 接口暴露给渲染进程
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meowLedger', {
  // 交易数据
  getTransactions: (filters) => ipcRenderer.invoke('get-transactions', filters),
  updateTransaction: (id, updates) => ipcRenderer.invoke('update-transaction', id, updates),
  deleteTransactions: (ids) => ipcRenderer.invoke('delete-transactions', ids),
  addTransaction: (txn) => ipcRenderer.invoke('add-transaction', txn),

  // 统计
  getDashboardStats: (startDate, endDate, memberId) => ipcRenderer.invoke('get-dashboard-stats', startDate, endDate, memberId),
  getMonthlySummary: (memberId) => ipcRenderer.invoke('get-monthly-summary', memberId),
  getRefundChains: () => ipcRenderer.invoke('get-refund-chains'),
  getStats: (memberId) => ipcRenderer.invoke('get-stats', memberId),

  // 成员管理
  getMembers: () => ipcRenderer.invoke('get-members'),
  addMember: (member) => ipcRenderer.invoke('add-member', member),
  updateMember: (id, updates) => ipcRenderer.invoke('update-member', id, updates),
  deleteMember: (id) => ipcRenderer.invoke('delete-member', id),

  // 分类
  getCategories: () => ipcRenderer.invoke('get-categories'),
  addCategoryRule: (rule) => ipcRenderer.invoke('add-category-rule', rule),

  // 导入
  importFile: (filePath, memberId) => ipcRenderer.invoke('import-file', filePath, memberId),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getImportHistory: () => ipcRenderer.invoke('get-import-history'),

  // 导出
  exportExcel: (options) => ipcRenderer.invoke('export-excel', options),

  // 对账
  runReconciliation: () => ipcRenderer.invoke('run-reconciliation'),

  // 清空数据
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
});
