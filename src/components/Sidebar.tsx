import type { ActivePage } from '../types/index';

interface SidebarProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
}

const navItems: { key: ActivePage; icon: string; label: string }[] = [
  { key: 'dashboard', icon: '📊', label: '仪表盘' },
  { key: 'ledger', icon: '📋', label: '流水明细' },
  { key: 'reconcile', icon: '🔍', label: '对账分析' },
  { key: 'import', icon: '📥', label: '数据导入' },
  { key: 'export', icon: '📤', label: '数据导出' },
  { key: 'settings', icon: '⚙️', label: '设置' },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <h1 className="text-xl font-bold text-cat-600 flex items-center gap-2">
          <span className="text-2xl">🐱</span>
          喵喵账本
        </h1>
        <p className="text-xs text-gray-400 mt-1">MeowLedger v1.0</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activePage === item.key
                ? 'bg-cat-50 text-cat-700 border border-cat-200'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100">
        <div className="text-xs text-gray-400 text-center">
          完全离线 &middot; 数据仅存本地
        </div>
      </div>
    </aside>
  );
}
