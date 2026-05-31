import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { dataService } from '../services/data-service';
import type { DashboardStats, Member } from '../types/index';

const COLORS = ['#f49044', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#6b7280'];

type TimeRange = 'month' | 'year' | 'all' | 'custom';

function getDateRange(range: TimeRange, customStart?: string, customEnd?: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (range) {
    case 'month': return { start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: `${y}-${String(m + 1).padStart(2, '0')}-31` };
    case 'year': return { start: `${y}-01-01`, end: `${y}-12-31` };
    case 'all': return { start: '2020-01-01', end: '2099-12-31' };
    case 'custom': return { start: customStart || '2020-01-01', end: customEnd || '2099-12-31' };
  }
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [range, setRange] = useState<TimeRange>('month');
  const [customStart, setCustomStart] = useState('2026-05-01');
  const [customEnd, setCustomEnd] = useState('2026-05-31');
  const [members, setMembers] = useState<Member[]>([]);
  const [memberFilter, setMemberFilter] = useState<string>('all');

  useEffect(() => {
    dataService.getMembers().then(setMembers);
  }, []);

  useEffect(() => {
    const { start, end } = getDateRange(range, customStart, customEnd);
    const memberId = memberFilter === 'all' ? undefined : parseInt(memberFilter);
    dataService.getDashboardStats(start, end, memberId).then(setStats);
  }, [range, customStart, customEnd, memberFilter]);

  if (!stats) return <div className="p-8 text-gray-400">加载中...</div>;

  const rangeLabels: Record<TimeRange, string> = {
    month: '本月', year: '本年', all: '全部', custom: '自定义',
  };

  const platformData = [
    { name: '微信支付', value: stats.wechatExpense },
    { name: '支付宝', value: stats.alipayExpense },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header + Filters */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">财务概览</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Member Switcher */}
          {members.length > 0 && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setMemberFilter('all')}
                className={`px-3 py-1.5 text-sm rounded-md transition ${memberFilter === 'all' ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                全部
              </button>
              {members.map(m => (
                <button key={m.id} onClick={() => setMemberFilter(String(m.id))}
                  className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1.5 ${memberFilter === String(m.id) ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {/* Time Range */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['month', 'year', 'all', 'custom'] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${range === r ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {rangeLabels[r]}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="总支出" value={`¥${stats.totalExpense.toFixed(2)}`} icon="💳" color="blue" />
        <Card title="退款" value={`¥${stats.totalRefund.toFixed(2)}`} icon="↩️" color="green" />
        <Card title="净支出" value={`¥${stats.netExpense.toFixed(2)}`} icon="📊" color="orange" />
        <Card title="待对账" value={`${stats.unmatchedCount + stats.discrepancyCount} 笔`} icon="⚠️"
          color={stats.unmatchedCount + stats.discrepancyCount > 0 ? 'red' : 'gray'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">支出趋势</h3>
          {stats.dailyTrend.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-gray-400">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stats.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.length > 5 ? v.substring(5) : v} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
                <Legend />
                <Line type="monotone" dataKey="expense" name="支出" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="refund" name="退款" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="net" name="净额" stroke="#f49044" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Platform Pie */}
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">支付渠道</h3>
          {stats.wechatExpense + stats.alipayExpense === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-gray-400">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={platformData} cx="50%" cy="45%" outerRadius={80} innerRadius={45} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {platformData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Category Bar Chart */}
      {stats.topCategories.length > 0 && (
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">分类消费排行 (轧差后净额)</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, stats.topCategories.length * 40)}>
            <BarChart data={stats.topCategories} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 12 }} width={100} />
              <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
              <Bar dataKey="net_expense" name="净支出" fill="#f49044" radius={[0, 4, 4, 0]} />
              <Bar dataKey="refund_amount" name="退款" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pending Actions */}
      {(stats.unmatchedCount > 0 || stats.discrepancyCount > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">待处理事项</h3>
          <ul className="text-sm text-amber-700 space-y-1">
            {stats.unmatchedCount > 0 && <li>⚠️ {stats.unmatchedCount} 笔退款未找到对应原交易</li>}
            {stats.discrepancyCount > 0 && <li>⚠️ {stats.discrepancyCount} 笔退款金额与原支付不一致</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) {
  const cls: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200', green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200', red: 'bg-red-50 border-red-200',
    gray: 'bg-gray-50 border-gray-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${cls[color] || cls.gray}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
}
