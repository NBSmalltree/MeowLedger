import { useState, useEffect, useCallback } from 'react';
import { dataService } from '../services/data-service';
import type { Transaction, Source, Direction, Member } from '../types/index';

const sourceLabels: Record<string, string> = { wechat: '微信', alipay: '支付宝', manual: '手动' };

export function Ledger() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');
  const [dirFilter, setDirFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  const refresh = useCallback(async () => {
    const data = await dataService.getTransactions({
      source: sourceFilter === 'all' ? undefined : sourceFilter,
      direction: dirFilter === 'all' ? undefined : (dirFilter as Direction),
      search: search || undefined,
      memberId: memberFilter === 'all' ? undefined : parseInt(memberFilter),
    });
    setTxns(categoryFilter === 'all' ? data : data.filter(t => t.category === categoryFilter));
  }, [sourceFilter, dirFilter, categoryFilter, memberFilter, search]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    dataService.getCategories().then(setCategories);
    dataService.getMembers().then(setMembers);
  }, []);

  const handleDelete = async (ids: number[]) => {
    if (ids.length === 0) return;
    const msg = ids.length === 1 ? '确定删除这条记录？' : `确定删除选中的 ${ids.length} 条记录？`;
    if (!confirm(msg)) return;
    await dataService.deleteTransactions(ids);
    setSelected(new Set());
    refresh();
  };

  const handleBatchDelete = () => handleDelete(Array.from(selected));

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === txns.length) setSelected(new Set());
    else setSelected(new Set(txns.map(t => t.id)));
  };

  const formatTime = (t: string) => {
    if (!t) return '-';
    const clean = t.replace('T', ' ');
    const parts = clean.split(' ');
    const datePart = parts[0] || '';
    const timePart = parts[1] || '';
    const short = datePart.length >= 10 ? datePart.substring(5) : datePart;
    return timePart ? `${short} ${timePart.substring(0, 5)}` : short;
  };

  const dirIcon = (t: Transaction) => {
    if (t.is_refund) return '↩️';
    if (t.direction === 'income') return '📈';
    if (t.direction === 'neutral') return '➖';
    return '💰';
  };

  const amountStr = (t: Transaction) => {
    const sign = t.is_refund ? '+' : t.direction === 'income' ? '+' : t.direction === 'expense' ? '-' : '';
    return `${sign}¥${t.amount.toFixed(2)}`;
  };

  const amountColor = (t: Transaction) => {
    if (t.is_refund) return 'text-green-600';
    return t.direction === 'income' ? 'text-green-600' : t.direction === 'expense' ? 'text-gray-900' : 'text-gray-400';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">流水明细</h2>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={handleBatchDelete}
              className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition">
              删除选中 ({selected.size})
            </button>
          )}
          <button onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-cat-500 text-white text-sm rounded-lg hover:bg-cat-600 transition">
            + 手动录入
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Member Filter */}
        {members.length > 0 && (
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setMemberFilter('all')}
              className={`px-3 py-1.5 text-sm rounded-md transition ${memberFilter === 'all' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              全部成员
            </button>
            {members.map(m => (
              <button key={m.id} onClick={() => setMemberFilter(String(m.id))}
                className={`px-3 py-1.5 text-sm rounded-md transition ${memberFilter === String(m.id) ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {m.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['all', 'wechat', 'alipay', 'manual'] as const).map(s => (
            <button key={s} onClick={() => setSourceFilter(s as any)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${sourceFilter === s ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {s === 'all' ? '全部' : sourceLabels[s]}
            </button>
          ))}
        </div>

        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['all', 'expense', 'income', 'neutral'] as const).map(d => (
            <button key={d} onClick={() => setDirFilter(d)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${dirFilter === d ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {d === 'all' ? '全部' : d === 'expense' ? '支出' : d === 'income' ? '收入' : '中性'}
            </button>
          ))}
        </div>

        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cat-400">
          <option value="all">全部分类</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <input type="text" placeholder="搜索交易对方/商品..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cat-400 w-52" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              <th className="px-3 py-3 w-8">
                <input type="checkbox" checked={txns.length > 0 && selected.size === txns.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-cat-500" />
              </th>
              <th className="px-3 py-3 font-medium w-28">时间</th>
              <th className="px-3 py-3 font-medium w-16">成员</th>
              <th className="px-3 py-3 font-medium w-20">来源</th>
              <th className="px-3 py-3 font-medium w-24">分类</th>
              <th className="px-3 py-3 font-medium">交易对方</th>
              <th className="px-3 py-3 font-medium">商品</th>
              <th className="px-3 py-3 font-medium w-24">支付方式</th>
              <th className="px-3 py-3 font-medium text-right w-24">金额</th>
              <th className="px-3 py-3 font-medium w-12">状态</th>
              <th className="px-3 py-3 font-medium w-16">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {txns.map(txn => {
              const member = txn.member_id ? memberMap[txn.member_id] : null;
              return (
                <tr key={txn.id}
                  className={`hover:bg-gray-50 transition cursor-pointer ${txn.is_refund ? 'bg-green-50/30' : ''} ${selected.has(txn.id) ? 'bg-blue-50/30' : ''}`}
                  onDoubleClick={() => setEditingTxn(txn)}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(txn.id)} onChange={() => toggleSelect(txn.id)}
                      className="w-4 h-4 rounded border-gray-300 text-cat-500" />
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap text-xs">{formatTime(txn.trade_time)}</td>
                  <td className="px-3 py-2.5">
                    {member ? (
                      <span className="inline-block w-6 h-6 rounded-full text-white text-xs font-bold leading-6 text-center"
                        style={{ backgroundColor: member.color }} title={member.name}>
                        {member.name[0]}
                      </span>
                    ) : <span className="text-xs text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${txn.source === 'wechat' ? 'bg-green-100 text-green-700' : txn.source === 'alipay' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {sourceLabels[txn.source] || txn.source}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[80px] truncate" title={txn.category}>{txn.category || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-900 max-w-[140px] truncate" title={txn.counterparty}>{txn.counterparty || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-500 max-w-[160px] truncate" title={txn.product_desc}>{txn.product_desc || '-'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[100px] truncate" title={txn.payment_method}>{txn.payment_method || '-'}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap ${amountColor(txn)}`}>
                    {dirIcon(txn)} {amountStr(txn)}
                    {txn.refund_amount > 0 && !txn.is_refund && (
                      <div className="text-xs text-amber-500">已退¥{txn.refund_amount.toFixed(2)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">
                    {txn.reconcile_status === 'matched' ? '✅' : txn.reconcile_status === 'discrepancy' ? '⚠️' : txn.reconcile_status === 'unmatched' ? '❌' : '🔗'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingTxn(txn)} title="编辑"
                        className="p-1 text-gray-400 hover:text-cat-600 rounded transition">✏️</button>
                      <button onClick={() => handleDelete([txn.id])} title="删除"
                        className="p-1 text-gray-400 hover:text-red-600 rounded transition">🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {txns.length === 0 && <div className="text-center py-12 text-gray-400">暂无数据</div>}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
        <span>共 {txns.length} 条记录</span>
        <span>支出 ¥{txns.filter(t => t.direction === 'expense').reduce((s, t) => s + t.amount, 0).toFixed(2)} | 退款 ¥{txns.filter(t => t.is_refund).reduce((s, t) => s + t.amount, 0).toFixed(2)}</span>
      </div>

      {/* Edit Modal */}
      {editingTxn && <EditModal txn={editingTxn} categories={categories} members={members} onClose={() => setEditingTxn(null)}
        onSave={async (id, updates) => { await dataService.updateTransaction(id, updates); setEditingTxn(null); refresh(); }} />}

      {/* Add Modal */}
      {showAddModal && <AddModal categories={categories} members={members} onClose={() => setShowAddModal(false)}
        onSave={async (txn) => { await dataService.addTransaction(txn); setShowAddModal(false); refresh(); }} />}
    </div>
  );
}

// ============================================================
// Edit Modal
// ============================================================

function EditModal({ txn, categories, members, onClose, onSave }: {
  txn: Transaction; categories: string[]; members: Member[];
  onClose: () => void; onSave: (id: number, updates: Partial<Transaction>) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...txn });
  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[520px] max-h-[85vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">编辑交易</h3>
        <div className="space-y-3">
          <Field label="交易时间">
            <input type="datetime-local" value={form.trade_time?.replace(' ', 'T')?.substring(0, 16) || ''} onChange={e => set('trade_time', e.target.value.replace('T', ' '))} />
          </Field>
          {members.length > 0 && (
            <Field label="成员">
              <select value={form.member_id || ''} onChange={e => set('member_id', e.target.value ? parseInt(e.target.value) : undefined)}>
                <option value="">未指定</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="交易对方">
            <input value={form.counterparty || ''} onChange={e => set('counterparty', e.target.value)} />
          </Field>
          <Field label="商品说明">
            <input value={form.product_desc || ''} onChange={e => set('product_desc', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="金额">
              <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="方向">
              <select value={form.direction} onChange={e => set('direction', e.target.value)}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
                <option value="neutral">中性</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="分类">
              <select value={form.category || ''} onChange={e => set('category', e.target.value)}>
                <option value="">未分类</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="来源">
              <select value={form.source} onChange={e => set('source', e.target.value)}>
                <option value="wechat">微信</option>
                <option value="alipay">支付宝</option>
                <option value="manual">手动</option>
              </select>
            </Field>
          </div>
          <Field label="支付方式">
            <input value={form.payment_method || ''} onChange={e => set('payment_method', e.target.value)} />
          </Field>
          <Field label="备注">
            <input value={form.remark || ''} onChange={e => set('remark', e.target.value)} />
          </Field>
          <Field label="用户备注">
            <input value={form.user_note || ''} onChange={e => set('user_note', e.target.value)} placeholder="仅自己可见的备注" />
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">取消</button>
          <button onClick={() => onSave(txn.id, form)}
            className="px-4 py-2 text-sm bg-cat-500 text-white rounded-lg hover:bg-cat-600 transition">保存</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Add Modal
// ============================================================

function AddModal({ categories, members, onClose, onSave }: {
  categories: string[]; members: Member[];
  onClose: () => void; onSave: (txn: any) => Promise<void>;
}) {
  const [form, setForm] = useState({
    trade_time: new Date().toISOString().replace('T', ' ').substring(0, 19),
    counterparty: '', product_desc: '', amount: 0,
    direction: 'expense' as Direction, category: '其他',
    source: 'manual' as Source, payment_method: '', remark: '',
    member_id: members.length > 0 ? members[0].id : undefined,
  });
  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[520px] max-h-[85vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">手动录入交易</h3>
        <div className="space-y-3">
          <Field label="交易时间">
            <input type="datetime-local" value={form.trade_time.replace(' ', 'T').substring(0, 16)} onChange={e => set('trade_time', e.target.value.replace('T', ' '))} />
          </Field>
          {members.length > 0 && (
            <Field label="成员">
              <select value={form.member_id || ''} onChange={e => set('member_id', e.target.value ? parseInt(e.target.value) : undefined)}>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="交易对方">
            <input value={form.counterparty} onChange={e => set('counterparty', e.target.value)} placeholder="如：淘宝闪购" />
          </Field>
          <Field label="商品说明">
            <input value={form.product_desc} onChange={e => set('product_desc', e.target.value)} placeholder="如：外卖订单" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="金额">
              <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="方向">
              <select value={form.direction} onChange={e => set('direction', e.target.value)}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </Field>
          </div>
          <Field label="分类">
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="支付方式">
            <input value={form.payment_method} onChange={e => set('payment_method', e.target.value)} placeholder="如：微信零钱" />
          </Field>
          <Field label="备注">
            <input value={form.remark} onChange={e => set('remark', e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">取消</button>
          <button onClick={() => onSave(form)} disabled={form.amount <= 0}
            className="px-4 py-2 text-sm bg-cat-500 text-white rounded-lg hover:bg-cat-600 transition disabled:opacity-40">保存</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="[&>input,&>select]:w-full [&>input,&>select]:px-3 [&>input,&>select]:py-2 [&>input,&>select]:text-sm [&>input,&>select]:border [&>input,&>select]:border-gray-200 [&>input,&>select]:rounded-lg [&>input,&>select]:focus:outline-none [&>input,&>select]:focus:ring-2 [&>input,&>select]:focus:ring-cat-400">
        {children}
      </div>
    </div>
  );
}
