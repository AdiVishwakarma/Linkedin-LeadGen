import React from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { NavTab } from './Sidebar';

interface HeaderProps {
  activeTab: NavTab;
  onQuickImport: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onQuickImport,
  onRefresh,
  isLoading = false,
}) => {
  const getTabTitle = (tab: NavTab) => {
    switch (tab) {
      case 'dashboard':
        return { title: 'Executive Dashboard', subtitle: 'Overview of lead generation metrics and assisted search checklist' };
      case 'campaigns':
        return { title: 'Campaigns & Search Tasks', subtitle: 'Target specific niches and manage generated LinkedIn search URLs' };
      case 'import':
        return { title: 'Lead Discovery & Post Capture', subtitle: 'Manual assisted capture and structured batch post classification' };
      case 'leads':
        return { title: 'Lead Pipeline & Reviews', subtitle: 'Filter, score, review, and shortlist qualified prospective clients' };
      case 'runs':
        return { title: 'Import History & Error Diagnostics', subtitle: 'Audit collection batches, retry failed items, and inspect raw payloads' };
    }
  };

  const { title, subtitle } = getTabTitle(activeTab);

  return (
    <header className="app-header">
      <div>
        <h1 className="h1" style={{ fontSize: '1.25rem' }}>{title}</h1>
        <p className="text-xs text-muted" style={{ marginTop: 2 }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onRefresh}
          className="btn btn-secondary btn-sm"
          title="Refresh current view"
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>

        {activeTab !== 'import' && (
          <button onClick={onQuickImport} className="btn btn-primary btn-sm">
            <Sparkles size={14} />
            <span>Import Lead</span>
          </button>
        )}
      </div>
    </header>
  );
};
