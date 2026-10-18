import React from 'react';
import {
  LayoutDashboard,
  Target,
  Sparkles,
  Users,
  History,
  Activity,
  ExternalLink,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'campaigns' | 'import' | 'leads' | 'runs';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingSearches?: number;
  openErrors?: number;
  needsReview?: number;
  isBackendHealthy: boolean | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  pendingSearches = 0,
  openErrors = 0,
  needsReview = 0,
  isBackendHealthy,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'campaigns' as NavTab,
      label: 'Campaigns',
      icon: Target,
      badge: pendingSearches > 0 ? `${pendingSearches} task${pendingSearches > 1 ? 's' : ''}` : undefined,
      badgeColor: 'badge-amber',
    },
    {
      id: 'import' as NavTab,
      label: 'Discover / Import',
      icon: Sparkles,
    },
    {
      id: 'leads' as NavTab,
      label: 'All Leads',
      icon: Users,
      badge: needsReview > 0 ? `${needsReview} new` : undefined,
      badgeColor: 'badge-purple',
    },
    {
      id: 'runs' as NavTab,
      label: 'Import History',
      icon: History,
      badge: openErrors > 0 ? `${openErrors} err` : undefined,
      badgeColor: 'badge-rose',
    },
  ];

  return (
    <aside className="app-sidebar">
      {/* Brand Header */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
            boxShadow: '0 0 14px rgba(99, 102, 241, 0.4)',
          }}
        >
          in
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            LeadDiscovery
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            LinkedIn Growth Platform
          </div>
        </div>
      </div>

      {/* Nav List */}
      <nav style={{ padding: '16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            padding: '4px 10px',
            fontSize: '0.675rem',
            fontWeight: 600,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Platform
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: isActive ? 'var(--bg-surface-active)' : 'transparent',
                color: isActive ? 'var(--text-white)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-surface)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={18} color={isActive ? 'var(--primary)' : 'var(--text-muted)'} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span className={`badge ${item.badgeColor || 'badge-slate'}`} style={{ fontSize: '0.675rem', padding: '1px 6px' }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Backend Status & API docs link */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(9, 13, 22, 0.4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem' }}>
            <Activity size={14} color={isBackendHealthy ? 'var(--success)' : 'var(--danger)'} />
            <span style={{ color: 'var(--text-secondary)' }}>Backend API</span>
          </div>
          <span
            className={`badge ${isBackendHealthy ? 'badge-emerald' : 'badge-rose'}`}
            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
          >
            {isBackendHealthy ? 'Online' : 'Disconnected'}
          </span>
        </div>

        <a
          href="http://127.0.0.1:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-surface)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <span>FastAPI Docs (Swagger)</span>
          <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  );
};
