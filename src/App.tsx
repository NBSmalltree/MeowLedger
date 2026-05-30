import { useState } from 'react';
import type { ActivePage } from './types/index';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Ledger } from './components/Ledger';
import { Reconcile } from './components/Reconcile';
import { ImportPage } from './components/ImportPage';
import { ExportPage } from './components/ExportPage';

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />;
      case 'ledger': return <Ledger />;
      case 'reconcile': return <Reconcile />;
      case 'import': return <ImportPage />;
      case 'export': return <ExportPage />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 overflow-auto">
        {renderPage()}
      </main>
    </div>
  );
}
