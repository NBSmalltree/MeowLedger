import { useState, useEffect, useCallback } from 'react';
import { dataService } from '../services/data-service';
import type { Member } from '../types/index';

export function ImportPage() {
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ message: string; success: boolean }[]>([]);
  const [stats, setStats] = useState({ total: 0, wechat: 0, alipay: 0 });
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [history, s, m] = await Promise.all([
      dataService.getImportHistory(),
      dataService.getStats(),
      dataService.getMembers(),
    ]);
    setImportHistory(history);
    setStats(s);
    setMembers(m);
    if (m.length > 0 && selectedMember === null) setSelectedMember(m[0].id);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleImport = async (filePaths: string[]) => {
    if (!selectedMember) {
      setResults([{ message: '请先选择成员', success: false }]);
      return;
    }
    setImporting(true);
    setResults([]);
    const newResults: { message: string; success: boolean }[] = [];

    for (const fp of filePaths) {
      const result = await dataService.importFile(fp, selectedMember);
      newResults.push({ message: result.message, success: result.success });
    }

    setResults(newResults);

    // 导入后自动执行对账
    const hasSuccess = newResults.some(r => r.success);
    if (hasSuccess) {
      const r = await dataService.runReconciliation();
      setReconcileResult(`对账完成：创建对账组 ${r.groupsCreated} 个，已匹配 ${r.matched} 条，未匹配 ${r.unmatched} 条`);
    }

    setImporting(false);
    refresh();
  };

  const handleFileSelect = async () => {
    const paths = await dataService.openFileDialog();
    if (paths.length > 0) await handleImport(paths);
  };

  const handleRunReconcile = async () => {
    const r = await dataService.runReconciliation();
    setReconcileResult(`创建对账组 ${r.groupsCreated} 个，已匹配 ${r.matched} 条，未匹配 ${r.unmatched} 条`);
    refresh();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const paths = Array.from(e.dataTransfer.files).map((f: any) => f.path).filter(Boolean);
    if (paths.length > 0) handleImport(paths);
  };

  const memberMap = Object.fromEntries(members.map(m => [m.id, m.name]));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">数据导入</h2>

      {/* Member Selection */}
      {members.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-3">选择账单归属成员</div>
          <div className="flex items-center gap-2">
            {members.map(m => (
              <button key={m.id} onClick={() => setSelectedMember(m.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedMember === m.id
                    ? 'text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={selectedMember === m.id ? { backgroundColor: m.color } : {}}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={selectedMember === m.id ? { backgroundColor: 'rgba(255,255,255,0.3)' } : { backgroundColor: m.color, color: 'white' }}>
                  {m.name[0]}
                </div>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current DB Stats */}
      {stats.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-6">
          <span className="text-sm text-gray-500">当前数据库:</span>
          <span className="text-sm font-medium">总计 {stats.total} 笔</span>
          <span className="text-sm text-green-600">微信 {stats.wechat} 笔</span>
          <span className="text-sm text-blue-600">支付宝 {stats.alipay} 笔</span>
          <button onClick={handleRunReconcile}
            className="ml-auto px-4 py-1.5 bg-cat-500 text-white rounded-lg text-sm hover:bg-cat-600 transition">
            🔍 执行对账
          </button>
        </div>
      )}
      {reconcileResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          ✅ {reconcileResult}
        </div>
      )}

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
          dragOver ? 'border-cat-400 bg-cat-50' : 'border-gray-300 bg-white hover:border-cat-300'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="text-5xl mb-4">{importing ? '⏳' : '📁'}</div>
        <p className="text-lg font-medium text-gray-700">
          {importing ? '导入中...' : '拖拽账单文件到这里，或点击下方按钮'}
        </p>
        <p className="text-sm text-gray-500 mt-2">支持格式：微信支付 (.xlsx) / 支付宝 (.csv)</p>
        <button onClick={handleFileSelect} disabled={importing || !selectedMember}
          className="mt-4 px-6 py-2 bg-cat-500 text-white rounded-lg hover:bg-cat-600 transition font-medium text-sm disabled:opacity-50">
          选择文件
        </button>
      </div>

      {/* Import Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm ${r.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {r.success ? '✅' : '❌'} {r.message}
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-3">如何获取原始账单</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 rounded-lg p-4">
            <h4 className="font-medium text-green-800 text-sm mb-2">微信支付</h4>
            <ol className="text-xs text-green-700 space-y-1 list-decimal list-inside">
              <li>打开微信 → 我 → 服务 → 钱包</li>
              <li>点击右上角「账单」</li>
              <li>点击右上角「...」→ 下载账单</li>
              <li>选择「用于个人对账」</li>
              <li>选择时间范围后下载 Excel</li>
            </ol>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 text-sm mb-2">支付宝</h4>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>打开支付宝 → 我的 → 账单</li>
              <li>点击右上角「...」→ 开具交易流水证明</li>
              <li>或在电脑端登录支付宝</li>
              <li>交易记录 → 筛选时间 → 下载账单</li>
              <li>选择 CSV 格式下载</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Import History */}
      {importHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">导入历史</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="px-5 py-2 text-left font-medium">时间</th>
                <th className="px-5 py-2 text-left font-medium">成员</th>
                <th className="px-5 py-2 text-left font-medium">来源</th>
                <th className="px-5 py-2 text-left font-medium">文件</th>
                <th className="px-5 py-2 text-right font-medium">记录数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {importHistory.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600">{item.imported_at}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {memberMap[item.member_id] || '未指定'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.source === 'wechat' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {item.source === 'wechat' ? '微信' : '支付宝'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 max-w-[300px] truncate">{item.file_name}</td>
                  <td className="px-5 py-3 text-right font-mono">{item.record_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
