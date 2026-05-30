import { useState } from 'react';
import { dataService } from '../services/data-service';

export function ExportPage() {
  const [startDate, setStartDate] = useState('2026-05-01');
  const [endDate, setEndDate] = useState('2026-05-31');
  const [includeRefunds, setIncludeRefunds] = useState(true);
  const [netMode, setNetMode] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'wechat' | 'alipay'>('all');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);

    const sources = sourceFilter === 'all' ? undefined : [sourceFilter];
    const result = await dataService.exportExcel({
      startDate, endDate, sources, includeRefunds, netMode,
    });

    setExporting(false);
   setMessage(result.message);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">数据导出</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">时间范围</label>
          <div className="flex items-center gap-3">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cat-400" />
            <span className="text-gray-400">至</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cat-400" />
          </div>
        </div>

        {/* Source Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">支付来源</label>
          <div className="flex bg-gray-100 rounded-lg p-0.5 w-fit">
            {([ { value: 'all', label: '全部' }, { value: 'wechat', label: '微信' }, { value: 'alipay', label: '支付宝' }] as const).map(opt => (
              <button key={opt.value} onClick={() => setSourceFilter(opt.value)}
                className={`px-4 py-1.5 text-sm rounded-md transition ${sourceFilter === opt.value ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={netMode} onChange={e => setNetMode(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-cat-500 focus:ring-cat-400" />
            <div>
              <div className="text-sm font-medium text-gray-700">显示轧差净额</div>
              <div className="text-xs text-gray-400">扣除退款后的实际消费金额</div>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={includeRefunds} onChange={e => setIncludeRefunds(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-cat-500 focus:ring-cat-400" />
            <div>
              <div className="text-sm font-medium text-gray-700">包含退款明细</div>
              <div className="text-xs text-gray-400">额外生成退款明细 Sheet</div>
            </div>
          </label>
        </div>

        {/* Export Preview */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">导出内容预览</h4>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>📄 Sheet 1: 交易明细（含来源、分类、轧差净额等）</li>
            <li>📄 Sheet 2: 月度汇总（按来源分组）</li>
            {includeRefunds && <li>📄 Sheet 3: 退款明细（退款链路追踪）</li>}
          </ul>
        </div>

        {/* Message */}
        {message && (
          <div className={`rounded-lg p-3 text-sm ${message.includes('成功') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
            {message}
          </div>
        )}

        {/* Export Button */}
        <button onClick={handleExport} disabled={exporting}
          className="w-full py-3 bg-cat-500 text-white rounded-lg hover:bg-cat-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {exporting ? (<><span className="animate-spin">⏳</span>导出中...</>) : (<>📤 导出为 Excel</>)}
        </button>
      </div>
    </div>
  );
}
