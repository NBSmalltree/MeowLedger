import { useState, useEffect } from 'react';
import { dataService } from '../services/data-service';
import type { Transaction, Source, Direction } from '../types/index';

const sourceLabels: Record<Source, string> = { wechat: '微信', alipay: '支付宝' };
const dirLabels: Record<string, string> = { income: '收入', expense: '支出', neutral: '中性', '退款': '退款' };
const statusIcons: Record<string, string> = {
  matched: '✅', unmatched: '❌', discrepancy: '⚠️', manual_matched: '🔗',
};

export function Ledger() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');
  const [dirFilter, setDirFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    dataService.getTransactions({
      source: sourceFilter === 'all' ? undefined : sourceFilter,
      direction: dirFilter === 'all' ? undefined : (dirFilter as Direction),
      search: search || undefined,
    }).then(setTxns);
  }, [sourceFilter, dirFilter, search]);

  const formatAmount = (txn: Transaction) => {
    const prefix = txn.is_refund ? '+' : (txn.direction === 'income' ? '+' : txn.direction === 'expense' ? '-' : '');
    return `${prefix}¥${txn.amount.toFixed(2)}`;
  };

  const getAmountColor = (txn: Transaction) => {
    if (txn.is_refund) return 'text-green-600';
    return txn.direction === 'income' ? 'text-green-600' : txn.direction === 'expense' ? 'text-gray-900' : 'text-gray-500';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">流水明细</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['all', 'wechat', 'alipay'] as const).map(s => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${sourceFilter === s ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {s === 'all' ? '全部' : sourceLabels[s]}
            </button>
          ))}
        </div>

        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['all', 'expense', 'income', 'neutral'] as const).map(d => (
            <button key={d} onClick={() => setDirFilter(d)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${dirFilter === d ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {d === 'all' ? '全部' : dirLabels[d]}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="搜索交易对方/商品..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cat-400 focus:border-transparent w-60"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">来源</th>
              <th className="px-4 py-3 font-medium">交易对方</th>
              <th className="px-4 py-3 font-medium">商品</th>
              <th className="px-4 py-3 font-medium text-right">金额</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">对账</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {txns.map(txn => (
              <>
                <tr key={txn.id}
                  className={`hover:bg-gray-50 cursor-pointer transition ${txn.is_refund ? 'bg-green-50/40' : ''}`}
                  onClick={() => setExpandedId(expandedId === txn.id ? null : txn.id)}>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{txn.trade_time.substring(5, 16)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${txn.source === 'wechat' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {sourceLabels[txn.source]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 max-w-[180px] truncate">{txn.counterparty || '-'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{txn.product_desc || '-'}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${getAmountColor(txn)}`}>
                    {formatAmount(txn)}
                    {txn.refund_amount > 0 && !txn.is_refund && (
                      <span className="text-xs text-amber-600 block">已退¥{txn.refund_amount.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{txn.status}</td>
                  <td className="px-4 py-3">{statusIcons[txn.reconcile_status] || '-'}</td>
                </tr>
                {expandedId === txn.id && (
                  <tr key={`${txn.id}-detail`} className="bg-gray-50">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
                        <div><span className="text-gray-400">交易类型：</span>{txn.trade_type}</div>
                        <div><span className="text-gray-400">分类：</span>{txn.category || '未分类'}</div>
                        <div><span className="text-gray-400">支付方式：</span>{txn.payment_method || '-'}</div>
                        <div><span className="text-gray-400">净额：</span>¥{(txn.net_amount ?? txn.amount).toFixed(2)}</div>
                        {txn.platform_txn_id && <div><span className="text-gray-400">交易单号：</span><span className="font-mono">{txn.platform_txn_id}</span></div>}
                        {txn.merchant_txn_id && <div><span className="text-gray-400">商户单号：</span><span className="font-mono">{txn.merchant_txn_id}</span></div>}
                        {txn.platform_order_id && <div><span className="text-gray-400">订单号：</span><span className="font-mono">{txn.platform_order_id}</span></div>}
                        {txn.remark && <div className="col-span-2"><span className="text-gray-400">备注：</span>{txn.remark}</div>}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {txns.length === 0 && (
          <div className="text-center py-12 text-gray-400">暂无数据</div>
        )}
      </div>

      <div className="mt-3 text-sm text-gray-500">
        共 {txns.length} 条记录 | 支出 ¥{txns.filter(t => t.direction === 'expense').reduce((s, t) => s + t.amount, 0).toFixed(2)}
      </div>
    </div>
  );
}
