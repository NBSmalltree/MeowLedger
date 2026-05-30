import { useState } from 'react';
import { dataService } from '../services/data-service';

export function SettingsPage() {
  const [confirmStep, setConfirmStep] = useState(0);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleClear = async () => {
    if (confirmStep === 0) {
      setConfirmStep(1);
      return;
    }
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    if (confirmStep === 2 && confirmText === '确认清空') {
      setClearing(true);
      try {
        await dataService.clearAllData();
        setResult('所有数据已清空');
        setConfirmStep(0);
        setConfirmText('');
      } catch {
        setResult('清空失败');
      }
      setClearing(false);
    }
  };

  const cancelClear = () => {
    setConfirmStep(0);
    setConfirmText('');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">设置</h2>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h3 className="text-lg font-semibold text-red-700 mb-2">危险操作</h3>
        <p className="text-sm text-gray-500 mb-4">以下操作不可恢复，请谨慎使用。</p>

        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-medium text-red-800">清空所有数据</div>
              <div className="text-xs text-red-600">删除所有交易记录、对账组、导入历史</div>
            </div>
          </div>

          {confirmStep === 0 && (
            <button onClick={handleClear}
              className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition">
              清空所有数据
            </button>
          )}

          {confirmStep === 1 && (
            <div className="space-y-3">
              <div className="text-sm text-red-700 font-medium">⚠️ 第一次确认：确定要清空所有数据吗？此操作不可恢复！</div>
              <div className="flex gap-2">
                <button onClick={handleClear}
                  className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition">
                  确定，继续
                </button>
                <button onClick={cancelClear}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  取消
                </button>
              </div>
            </div>
          )}

          {confirmStep === 2 && (
            <div className="space-y-3">
              <div className="text-sm text-red-700 font-medium">⚠️ 第二次确认：请输入"确认清空"四个字</div>
              <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                placeholder="输入：确认清空"
                className="px-3 py-2 border border-red-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-2">
                <button onClick={handleClear} disabled={confirmText !== '确认清空' || clearing}
                  className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition disabled:opacity-40">
                  {clearing ? '清空中...' : '确认清空'}
                </button>
                <button onClick={cancelClear}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  取消
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-3 text-sm text-green-700 bg-green-50 rounded p-2">{result}</div>
          )}
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">关于</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>🐱 喵喵账本 v1.0.0</p>
          <p>家庭财务对账系统，核心解决退款轧差对账难题</p>
          <p className="text-xs text-gray-400 mt-3">数据完全存储在本地，不会上传到任何服务器</p>
        </div>
      </div>
    </div>
  );
}
