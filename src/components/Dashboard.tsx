import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { dataService } from '../services/data-service';
import type { DashboardStats } from '../types/index';

const COLORS = ['#f49044', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#6b7280'];

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    dataService.getDashboardStats().then(setStats);
  }, []);

  if (!stats) return <div className="p-8 text-gray-400">加载中...</div>;

  const platformData = [
    { name: '微信支付', value: stats.wechatExpense },
    { name: '支付宝', value: stats.alipayExpense },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">2026年5月 财务概览</h2>
          <p className="text-sm text-gray-500 mt-1">数据时间范围: 2026-04-30 ~ 2026-05-30</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="总支出" value={`¥${stats.totalExpense.toFixed(2)}`} icon="💳" color="blue" />
        <Card title="退款" value={`¥${stats.totalRefund.toFixed(2)}`} icon="↩️" color="green" />
        <Card title="净支出" value={`¥${stats.netExpense.toFixed(2)}`} icon="📊" color="orange" />
        <Card title="待对账" value={`${stats.unmatchedCount + stats.discrepancyCount} 笔`} icon="⚠️" color={stats.unmatchedCount > 0 ? 'red' : 'gray'} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">每日支出趋势</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={stats.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.substring(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
              <Legend />
              <Line type="monotone" dataKey="expense" name="支出" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="refund" name="退款" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="net" name="净额" stroke="#f49044" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Platform Pie */}
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">支付渠道占比</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={platformData} cx="50%" cy="45%" outerRadius={80} innerRadius={45} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {platformData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Bar Chart */}
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
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    red: 'bg-red-50 border-red-200',
    gray: 'bg-gray-50 border-gray-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color] || colorClasses.gray}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{title}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
}
