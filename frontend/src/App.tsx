import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider, useToast } from './context/ToastContext';
import { Sidebar, type NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { CampaignsView } from './views/CampaignsView';
import { DiscoverImportView } from './views/DiscoverImportView';
import { LeadsView } from './views/LeadsView';
import { RunsHistoryView } from './views/RunsHistoryView';
import { api } from './services/api';
import { AlertCircle, RefreshCw } from 'lucide-react';

const AppContent: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [navParams, setNavParams] = useState<any>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Live sidebar counters & health
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);
  const [pendingSearches, setPendingSearches] = useState(0);
  const [openErrors, setOpenErrors] = useState(0);
  const [needsReview, setNeedsReview] = useState(0);

  const checkHealthAndStats = useCallback(async () => {
    try {
      setIsLoading(true);
      await api.getHealth();
      setIsBackendHealthy(true);

      // Fetch dashboard metrics for sidebar badges
      const d = await api.getDashboard();
      if (d?.totals) {
        setPendingSearches(d.totals.pending_searches || 0);
        setOpenErrors(d.totals.open_errors || 0);
        setNeedsReview(d.totals.needs_review || 0);
      }
    } catch {
      setIsBackendHealthy(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealthAndStats();
    const interval = setInterval(checkHealthAndStats, 30000);
    return () => clearInterval(interval);
  }, [checkHealthAndStats, refreshKey]);

  const handleNavigate = (tab: NavTab, params: any = {}) => {
    setNavParams(params);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
    checkHealthAndStats();
    toast.info('Refreshed', 'Refreshed backend data and statistics.');
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => handleNavigate(tab)}
        pendingSearches={pendingSearches}
        openErrors={openErrors}
        needsReview={needsReview}
        isBackendHealthy={isBackendHealthy}
      />

      {/* Main Content Area */}
      <div className="app-main">
        {/* Disconnected Warning Banner if Backend is down */}
        {isBackendHealthy === false && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid var(--danger-border)',
              padding: '10px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.825rem',
              color: 'var(--danger-text)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={16} />
              <span>
                <strong>Backend Unreachable:</strong> Could not connect to{' '}
                <code>{api.getBaseUrl()}</code>. Ensure the FastAPI backend is running.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={checkHealthAndStats}
                className="btn btn-secondary btn-sm"
                style={{ padding: '3px 8px', fontSize: '0.75rem' }}
              >
                <RefreshCw size={12} />
                <span>Retry Connection</span>
              </button>
            </div>
          </div>
        )}

        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onQuickImport={() => handleNavigate('import')}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />

        {/* Page Content */}
        <main className="app-content" key={refreshKey}>
          {activeTab === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}

          {activeTab === 'campaigns' && (
            <CampaignsView
              onNavigate={handleNavigate}
              selectedCampaignId={navParams.campaignId}
            />
          )}

          {activeTab === 'import' && (
            <DiscoverImportView
              onNavigate={handleNavigate}
              preselectedCampaignId={navParams.campaignId}
              preselectedSearchTaskId={navParams.searchTaskId}
            />
          )}

          {activeTab === 'leads' && (
            <LeadsView
              initialCampaignId={navParams.campaignId}
              initialRunId={navParams.runId}
            />
          )}

          {activeTab === 'runs' && <RunsHistoryView onNavigate={handleNavigate} />}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
