// ============================================================
// 喵喵账本 - Electron Preload Script
// 安全地将 IPC 接口暴露给渲染进程
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meowLedger', {
  // 交易数据
  getTransactions: (filters) => ipcRenderer.invoke('get-transactions', filters),
  updateTransaction: (id, updates) => ipcRenderer.invoke('update-transaction', id, updates),

  // 统计
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getMonthlySummary: () => ipcRenderer.invoke('get-monthly-summary'),
  getRefundChains: () => ipcRenderer.invoke('get-refund-chains'),
  getStats: () => ipcRenderer.invoke('get-stats'),

  // 导入
  importFile: (filePath) => ipcRenderer.invoke('import-file', filePath),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getImportHistory: () => ipcRenderer.invoke('get-import-history'),

  // 导出
  exportExcel: (options) => ipcRenderer.invoke('export-excel', options),

  // 对账
  runReconciliation: () => ipcRenderer.invoke('run-reconciliation'),

  // 清空数据
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
});
