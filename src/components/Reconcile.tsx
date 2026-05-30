import { useState, useEffect } from 'react';
import { dataService } from '../services/data-service';
import type { RefundChain } from '../types/index';

const sourceLabels: Record<string, string> = { wechat: '微信', alipay: '支付宝' };

export function Reconcile() {
  const [chains, setChains] = useState<RefundChain[]>([]);
  const [stats, setStats] = useState<{ unmatched: number; discrepancy: number }>({ unmatched: 0, discrepancy: 0 });

  useEffect(() => {
    dataService.getRefundChains().then(setChains);
    dataService.getDashboardStats().then(s => setStats({ unmatched: s.unmatchedCount, discrepancy: s.discrepancyCount }));
  }, []);

  const statusLabels: Record<string, { label: string; color: string; icon: string }> = {
    fully_refunded: { label: '全额退款', color: 'bg-green-100 text-green-700', icon: '✅' },
    partial_refund: { label: '部分退款', color: 'bg-amber-100 text-amber-700', icon: '⚠️' },
    open: { label: '待处理', color: 'bg-gray-100 text-gray-700', icon: '🔄' },
    closed: { label: '已关闭', color: 'bg-gray-100 text-gray-500', icon: '📁' },
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">退款对账分析</h2>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500">退款对账组</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{chains.length}</div>
          <div className="text-xs text-gray-400 mt-1">已识别的退款链路</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500">退款总额</div>
          <div className="text-3xl font-bold text-green-600 mt-1">
            ¥{chains.reduce((s, c) => s + c.totalRefunded, 0).toFixed(2)}
          </div>
          <div className="text-xs text-gray-400 mt-1">已关联的退款金额</div>
        </div>
        <div className={`rounded-xl border p-5 ${stats.unmatched > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="text-sm text-gray-500">待处理</div>
          <div className={`text-3xl font-bold mt-1 ${stats.unmatched > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.unmatched + stats.discrepancy} 笔
          </div>
          <div className="text-xs text-gray-400 mt-1">未匹配或有差异</div>
        </div>
      </div>

      {/* Refund Chains */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">退款链路追踪</h3>

        {chains.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            暂无退款记录
          </div>
        ) : (
          chains.map(chain => {
            const st = statusLabels[chain.groupStatus] || statusLabels.open;
            return (
              <div key={chain.groupId} className="bg-white rounded-xl border border-gray-200 p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📦</span>
                    <div>
                      <div className="font-semibold text-gray-900">{chain.counterparty}</div>
                      <div className="text-xs text-gray-500">{chain.productDesc}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                </div>

                {/* Timeline */}
                <div className="relative pl-8 space-y-3">
                  <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />
                  {chain.items.map((item, idx) => (
                    <div key={idx} className="relative flex items-center gap-3">
                      <div className={`absolute left-[-20px] w-3 h-3 rounded-full border-2 ${item.isRefund ? 'bg-green-400 border-green-500' : 'bg-blue-400 border-blue-500'}`} />
                      <span className="text-xs text-gray-500 w-32 shrink-0">{item.tradeTime.substring(5, 16)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${item.isRefund ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.isRefund ? '退款' : '支付'}
                      </span>
                      <span className="font-mono text-sm font-medium">
                        {item.isRefund ? '+' : '-'}¥{item.amount.toFixed(2)}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${item.source === 'wechat' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                        {sourceLabels[item.source]}
                      </span>
                      <span className="text-xs text-gray-400">{item.status}</span>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-6 text-sm">
                  <span className="text-gray-500">支付: <span className="font-medium text-gray-900">¥{chain.totalPaid.toFixed(2)}</span></span>
                  <span className="text-gray-500">退款: <span className="font-medium text-green-600">¥{chain.totalRefunded.toFixed(2)}</span></span>
                  <span className="text-gray-500">净额: <span className={`font-bold ${chain.netAmount > 0 ? 'text-amber-600' : 'text-green-600'}`}>¥{chain.netAmount.toFixed(2)}</span></span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
