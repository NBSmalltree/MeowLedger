import { useState, useEffect } from 'react';
import { dataService } from '../services/data-service';
import type { RefundChain, Transaction, Member } from '../types/index';

const sourceLabels: Record<string, string> = { wechat: '微信', alipay: '支付宝' };
type TimeRange = 'month' | 'year' | 'all' | 'custom';

function getDateRange(range: TimeRange, customStart?: string, customEnd?: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (range) {
    case 'month': return { start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: `${y}-${String(m + 1).padStart(2, '0')}-31` };
    case 'year': return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'all': return { start: '', end: '' };
    case 'custom': return { start: customStart || '', end: customEnd || '' };
  }
}

export function Reconcile() {
  const [allChains, setAllChains] = useState<RefundChain[]>([]);
  const [stats, setStats] = useState<{ unmatched: number; discrepancy: number }>({ unmatched: 0, discrepancy: 0 });
  const [showPending, setShowPending] = useState(false);
  const [pendingTxns, setPendingTxns] = useState<Transaction[]>([]);
  const [detailTxn, setDetailTxn] = useState<Transaction | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [range, setRange] = useState<TimeRange>('all');
  const [customStart, setCustomStart] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const [customEnd, setCustomEnd] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-31`; });

  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  // 根据时间范围过滤链路（链路中任一交易在范围内即显示）
  const { start, end } = getDateRange(range, customStart, customEnd);
  const chains = (start || end)
    ? allChains.filter(chain =>
        chain.items.some(item => {
          const t = item.tradeTime.substring(0, 10);
          return (!start || t >= start) && (!end || t <= end);
        })
      )
    : allChains;

  useEffect(() => {
    dataService.getRefundChains().then(chains => {
      setAllChains(chains);
      const { start: s, end: e } = getDateRange(range, customStart, customEnd);
      dataService.getDashboardStats(s || undefined, e || undefined).then(st =>
        setStats({ unmatched: st.unmatchedCount, discrepancy: st.discrepancyCount })
      );
    });
    dataService.getMembers().then(setMembers);
  }, [range, customStart, customEnd]);

  const loadPendingTxns = async () => {
    const { start: s, end: e } = getDateRange(range, customStart, customEnd);
    const opts = { startDate: s || undefined, endDate: e || undefined };
    const [unmatched, discrepancy] = await Promise.all([
      dataService.getTransactions({ reconcileStatus: 'unmatched', ...opts }),
      dataService.getTransactions({ reconcileStatus: 'discrepancy', ...opts }),
    ]);
    setPendingTxns([...unmatched, ...discrepancy].sort((a, b) => b.trade_time.localeCompare(a.trade_time)));
    setShowPending(true);
  };

  const statusLabels: Record<string, { label: string; color: string; icon: string }> = {
    fully_refunded: { label: '全额退款', color: 'bg-green-100 text-green-700', icon: '✅' },
    partial_refund: { label: '部分退款', color: 'bg-amber-100 text-amber-700', icon: '⚠️' },
    open: { label: '待处理', color: 'bg-gray-100 text-gray-700', icon: '🔄' },
    closed: { label: '已关闭', color: 'bg-gray-100 text-gray-500', icon: '📁' },
  };

  return (
    <>
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">退款对账分析</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {([['month','本月'],['year','本年'],['all','全部'],['custom','自定义']] as [TimeRange,string][]).map(([r,label]) => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${range === r ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-2 py-1 text-sm border border-gray-200 rounded-lg" />
              <span className="text-gray-400 text-sm">~</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-2 py-1 text-sm border border-gray-200 rounded-lg" />
            </div>
          )}
        </div>
      </div>

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
        <div
          className={`rounded-xl border p-5 cursor-pointer transition-all hover:shadow-md ${stats.unmatched + stats.discrepancy > 0 ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-white border-gray-200'}`}
          onClick={() => { if (showPending) { setShowPending(false); } else { loadPendingTxns(); } }}
        >
          <div className="text-sm text-gray-500">待处理</div>
          <div className={`text-3xl font-bold mt-1 ${stats.unmatched + stats.discrepancy > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.unmatched + stats.discrepancy} 笔
          </div>
          <div className="text-xs text-gray-400 mt-1">{showPending ? '点击收起' : '未匹配或有差异，点击查看详情'}</div>
        </div>
      </div>

      {/* Pending Transactions Detail */}
      {showPending && pendingTxns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">待处理交易明细</h3>
            <button
              className="text-sm text-gray-400 hover:text-gray-600"
              onClick={() => setShowPending(false)}
            >
              收起
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">时间</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">成员</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">来源</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">对方</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">商品</th>
                  <th className="text-right py-2 px-2 text-gray-500 font-medium">金额</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">状态</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">原因</th>
                </tr>
              </thead>
              <tbody>
                {pendingTxns.map(txn => {
                  const member = txn.member_id ? memberMap[txn.member_id] : null;
                  return (
                    <tr key={txn.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onDoubleClick={() => setDetailTxn(txn)}>
                      <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{txn.trade_time.substring(5, 16)}</td>
                      <td className="py-2 px-2">
                        {member ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="w-4 h-4 rounded-full text-white text-[10px] font-bold leading-4 text-center"
                              style={{ backgroundColor: member.color }}>{member.name[0]}</span>
                            {member.name}
                          </span>
                        ) : <span className="text-xs text-gray-300">-</span>}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${txn.source === 'wechat' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                          {sourceLabels[txn.source] || txn.source}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-900">{txn.counterparty || '-'}</td>
                      <td className="py-2 px-2 text-gray-500 text-xs max-w-48 truncate">{txn.product_desc || '-'}</td>
                      <td className={`py-2 px-2 text-right font-mono font-medium ${txn.is_refund ? 'text-green-600' : 'text-gray-900'}`}>
                        {txn.is_refund ? '+' : '-'}¥{txn.amount.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${txn.reconcile_status === 'unmatched' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                          {txn.reconcile_status === 'unmatched' ? '未匹配' : '有差异'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center text-xs text-gray-400">
                        {txn.is_refund ? '退款未找到原支付' : txn.reconcile_status === 'discrepancy' ? '退款金额有差' : '未被退款关联'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
            // Infer member from items
            const chainMemberId = chain.items[0]?.memberId;
            const chainMember = chainMemberId ? memberMap[chainMemberId] : null;

            return (
              <div key={chain.groupId} className="bg-white rounded-xl border border-gray-200 p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📦</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{chain.counterparty}</span>
                        {chainMember && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: chainMember.color + '20', color: chainMember.color }}>
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: chainMember.color }} />
                            {chainMember.name}
                          </span>
                        )}
                      </div>
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
                  {chain.items.map((item, idx) => {
                    const itemMember = item.memberId ? memberMap[item.memberId] : null;
                    return (
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
                        {itemMember && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: itemMember.color + '20', color: itemMember.color }}>
                            {itemMember.name}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{item.status}</span>
                      </div>
                    );
                  })}
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

    {/* Transaction Detail Modal - 放在容器外，避免父级 padding 影响遮罩 */}
    {detailTxn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDetailTxn(null)}>
          <div className="bg-white rounded-2xl p-6 w-[480px] max-h-[80vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">交易明细</h3>
              <button onClick={() => setDetailTxn(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="交易时间" value={detailTxn.trade_time} />
              <Row label="来源" value={sourceLabels[detailTxn.source] || detailTxn.source} />
              <Row label="交易对方" value={detailTxn.counterparty || '-'} />
              <Row label="商品说明" value={detailTxn.product_desc || '-'} />
              <Row label="交易类型" value={detailTxn.trade_type} />
              <Row label="金额" value={`¥${detailTxn.amount.toFixed(2)}`} highlight />
              <Row label="方向" value={detailTxn.is_refund ? '退款' : detailTxn.direction === 'income' ? '收入' : detailTxn.direction === 'expense' ? '支出' : '中性'} />
              <Row label="支付方式" value={detailTxn.payment_method || '-'} />
              <Row label="交易状态" value={detailTxn.status} />
              <Row label="分类" value={detailTxn.category || '未分类'} />
              <Row label="对账状态" value={detailTxn.reconcile_status === 'unmatched' ? '未匹配' : detailTxn.reconcile_status === 'discrepancy' ? '有差异' : detailTxn.reconcile_status === 'matched' ? '已对平' : '手动匹配'} />
              <Row label="轧差净额" value={detailTxn.net_amount != null ? `¥${detailTxn.net_amount.toFixed(2)}` : '-'} />
              <Row label="退款金额" value={detailTxn.refund_amount > 0 ? `¥${detailTxn.refund_amount.toFixed(2)}` : '-'} />
              {detailTxn.reconcile_group_id && <Row label="对账组ID" value={detailTxn.reconcile_group_id.substring(0, 8) + '...'} />}
              {detailTxn.platform_txn_id && <Row label="交易单号" value={detailTxn.platform_txn_id} />}
              {detailTxn.merchant_txn_id && <Row label="商户单号" value={detailTxn.merchant_txn_id} />}
              {detailTxn.platform_order_id && <Row label="交易订单号" value={detailTxn.platform_order_id} />}
              {detailTxn.merchant_order_id && <Row label="商家订单号" value={detailTxn.merchant_order_id} />}
              {detailTxn.remark && <Row label="备注" value={detailTxn.remark} />}
              {detailTxn.user_note && <Row label="用户备注" value={detailTxn.user_note} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`text-right ml-4 ${highlight ? 'font-bold text-gray-900' : 'text-gray-800'} truncate`}>{value}</span>
    </div>
  );
}
