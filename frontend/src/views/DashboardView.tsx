import React, { useEffect, useState } from 'react';
import {
  Users,
  Award,
  BookmarkCheck,
  Search,
  AlertTriangle,
  History,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import type { DashboardData } from '../types/api';
import { RunStatusBadge, CategoryBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/EmptyState';
import type { NavTab } from '../components/layout/Sidebar';

interface DashboardViewProps {
  onNavigate: (tab: NavTab, params?: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getDashboard();
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin" style={{ display: 'inline-block', marginBottom: 12 }}>
            <Sparkles size={28} color="var(--primary)" />
          </div>
          <div className="text-sm text-muted">Loading metrics and statistics...</div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 20 }}>
        <EmptyState
          icon={AlertTriangle}
          title="Could not connect to backend"
          description={error}
          actionLabel="Try Again"
          onAction={fetchDashboard}
        />
      </div>
    );
  }

  const totals = data?.totals || {
    leads: 0,
    duplicates_hidden: 0,
    high_intent: 0,
    shortlisted: 0,
    needs_review: 0,
    open_errors: 0,
    pending_searches: 0,
    runs: 0,
  };

  const byStatus = data?.by_status || {};
  const byCategory = data?.by_category || {};
  const byIntent = data?.by_intent_label || {};
  const leadsPerDay = data?.leads_per_day || [];
  const precision = data?.review_precision;

  // Compute total reviewed for percentages
  const totalLeads = totals.leads || 0;

  // Maximum count in leads_per_day for chart scaling
  const maxPerDay = Math.max(1, ...leadsPerDay.map((d) => d.count || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
          border: '1px solid var(--border-base)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="badge badge-purple" style={{ fontSize: '0.725rem' }}>Assisted Lead Intelligence</span>
            <span className="badge badge-slate" style={{ fontSize: '0.725rem' }}>100% Policy-Safe</span>
          </div>
          <h2 className="h2" style={{ fontSize: '1.35rem' }}>
            LinkedIn Client Pipeline Overview
          </h2>
          <p className="text-sm text-muted" style={{ maxWidth: 640, marginTop: 4 }}>
            Zero-scraping workflow: users search public posts, paste links and content, while our NLP classifier scores intent, detects hiring signals, and filters out noise.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onNavigate('campaigns')} className="btn btn-secondary btn-sm">
            <Search size={14} />
            <span>Search Tasks ({totals.pending_searches})</span>
          </button>
          <button onClick={() => onNavigate('import')} className="btn btn-primary btn-sm">
            <Sparkles size={14} />
            <span>Capture New Post</span>
          </button>
        </div>
      </div>

      {/* Top Stat Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
        }}
      >
        {/* Total Unique Leads */}
        <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Total Leads
              </div>
              <div className="h1" style={{ marginTop: 6, fontSize: '1.85rem' }}>
                {totals.leads}
              </div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: 'var(--primary)',
              }}
            >
              <Users size={20} />
            </div>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{totals.duplicates_hidden} duplicates auto-deduped</span>
          </div>
        </div>

        {/* High-Intent Leads */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                High Intent Leads
              </div>
              <div className="h1" style={{ marginTop: 6, fontSize: '1.85rem', color: 'var(--success-text)' }}>
                {totals.high_intent}
              </div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--success-subtle)',
                color: 'var(--success-text)',
              }}
            >
              <Award size={20} />
            </div>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 12 }}>
            Strong agency/hiring signals detected
          </div>
        </div>

        {/* Shortlisted Leads */}
        <div
          className="card"
          style={{ padding: 18, cursor: 'pointer' }}
          onClick={() => onNavigate('leads')}
          title="Click to view shortlisted leads"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Shortlisted
              </div>
              <div className="h1" style={{ marginTop: 6, fontSize: '1.85rem', color: 'var(--info-text)' }}>
                {totals.shortlisted}
              </div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--info-subtle)',
                color: 'var(--info-text)',
              }}
            >
              <BookmarkCheck size={20} />
            </div>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{totals.needs_review} awaiting human review</span>
            <ArrowRight size={12} />
          </div>
        </div>

        {/* Pending Search Tasks */}
        <div
          className="card"
          style={{ padding: 18, cursor: 'pointer' }}
          onClick={() => onNavigate('campaigns')}
          title="Click to view search checklist"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Pending Searches
              </div>
              <div className="h1" style={{ marginTop: 6, fontSize: '1.85rem', color: totals.pending_searches > 0 ? 'var(--warning-text)' : 'var(--text-muted)' }}>
                {totals.pending_searches}
              </div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--warning-subtle)',
                color: 'var(--warning-text)',
              }}
            >
              <Search size={20} />
            </div>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Targeted LinkedIn queries generated</span>
            <ArrowRight size={12} />
          </div>
        </div>

        {/* Open Errors & Runs */}
        <div
          className="card"
          style={{ padding: 18, cursor: 'pointer' }}
          onClick={() => onNavigate('runs')}
          title="Click to view import runs and error logs"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Import Batches
              </div>
              <div className="h1" style={{ marginTop: 6, fontSize: '1.85rem' }}>
                {totals.runs}
              </div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 'var(--radius-md)',
                backgroundColor: totals.open_errors > 0 ? 'var(--danger-subtle)' : 'rgba(255, 255, 255, 0.05)',
                color: totals.open_errors > 0 ? 'var(--danger-text)' : 'var(--text-muted)',
              }}
            >
              {totals.open_errors > 0 ? <AlertTriangle size={20} /> : <History size={20} />}
            </div>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 12 }}>
            {totals.open_errors > 0 ? (
              <span style={{ color: 'var(--danger-text)' }}>{totals.open_errors} open errors to review</span>
            ) : (
              <span>All imports clean & processed</span>
            )}
          </div>
        </div>
      </div>

      {/* Charts & Breakdown Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* Leads Volume Over Time */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <TrendingUp size={18} color="var(--primary)" />
                Leads Captured Over Time
              </h3>
              <p className="card-description">Daily discovery count over the past 14 days</p>
            </div>
            <span className="badge badge-slate">{leadsPerDay.reduce((acc, d) => acc + (d.count || 0), 0)} in 14d</span>
          </div>

          {leadsPerDay.length === 0 ? (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No capture history in the last 14 days. Use Discover / Import to add posts.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Bar visualization */}
              <div
                style={{
                  height: 160,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 8,
                  paddingTop: 20,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {leadsPerDay.map((item, idx) => {
                  const heightPercent = Math.max(8, Math.round((item.count / maxPerDay) * 100));
                  return (
                    <div
                      key={idx}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                      }}
                      title={`${item.date}: ${item.count} leads`}
                    >
                      <span style={{ fontSize: '0.675rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {item.count}
                      </span>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 32,
                          height: `${heightPercent}%`,
                          borderRadius: '4px 4px 0 0',
                          background: 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)',
                          transition: 'height 0.3s ease',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Date labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', color: 'var(--text-dim)' }}>
                <span>{leadsPerDay[0]?.date}</span>
                <span>{leadsPerDay[leadsPerDay.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </div>

        {/* Human Review Quality & Precision */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <ShieldCheck size={18} color="var(--success-text)" />
                Review Precision & Quality
              </h3>
              <p className="card-description">Signal accuracy: % of reviewed leads that human reviewers kept</p>
            </div>
            {precision && precision.overall !== null ? (
              <span className="badge badge-emerald">{Math.round(precision.overall * 100)}% Kept</span>
            ) : (
              <span className="badge badge-slate">Awaiting Reviews</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="text-sm" style={{ fontWeight: 600 }}>Overall Human Acceptance Rate</div>
                <div className="text-xs text-muted">
                  {precision?.decided ? `${precision.decided} total decisions made (shortlisted vs rejected)` : 'Start reviewing leads in the Leads table'}
                </div>
              </div>
              <div className="h2" style={{ color: precision?.overall ? 'var(--success-text)' : 'var(--text-muted)' }}>
                {precision?.overall !== null && precision?.overall !== undefined
                  ? `${Math.round(precision.overall * 100)}%`
                  : 'N/A'}
              </div>
            </div>

            {/* Breakdown per intent label */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Precision by Classifier Score:
              </div>
              {['high', 'medium', 'low'].map((label) => {
                const labelData = precision?.by_intent_label?.[label];
                const prec = labelData?.precision;
                const s = labelData?.shortlisted || 0;
                const r = labelData?.rejected || 0;
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`badge ${label === 'high' ? 'badge-emerald' : label === 'medium' ? 'badge-amber' : 'badge-slate'}`} style={{ textTransform: 'capitalize' }}>
                        {label} Intent
                      </span>
                      <span className="text-xs text-muted">({s} kept, {r} rejected)</span>
                    </div>
                    <span style={{ fontWeight: 600, color: prec !== null && prec !== undefined ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                      {prec !== null && prec !== undefined ? `${Math.round(prec * 100)}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Status & Service Category Distributions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* By Status */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Leads by Review Status</h3>
            <span className="text-xs text-muted">{totalLeads} total</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'new', label: 'New / Unreviewed', color: 'var(--purple)', count: byStatus['new'] || 0 },
              { key: 'reviewed', label: 'Reviewed', color: 'var(--info)', count: byStatus['reviewed'] || 0 },
              { key: 'shortlisted', label: 'Shortlisted', color: 'var(--success)', count: byStatus['shortlisted'] || 0 },
              { key: 'rejected', label: 'Rejected', color: 'var(--danger)', count: byStatus['rejected'] || 0 },
            ].map((item) => {
              const pct = totalLeads > 0 ? Math.round((item.count / totalLeads) * 100) : 0;
              return (
                <div key={item.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    <span style={{ fontWeight: 600 }}>{item.count} <span className="text-dim">({pct}%)</span></span>
                  </div>
                  <div style={{ height: 6, width: '100%', backgroundColor: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: item.color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Service Category */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Leads by Service Category</h3>
            <span className="text-xs text-muted">{Object.keys(byCategory).length} categories</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.keys(byCategory).length === 0 ? (
              <div className="text-sm text-muted" style={{ padding: '20px 0', textAlign: 'center' }}>
                No classified leads yet.
              </div>
            ) : (
              Object.entries(byCategory).map(([cat, count]) => {
                const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <CategoryBadge category={cat} />
                      <span className="text-xs" style={{ fontWeight: 600 }}>{count} leads <span className="text-dim">({pct}%)</span></span>
                    </div>
                    <div style={{ height: 6, width: '100%', backgroundColor: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--primary)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* By Intent Label */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Leads by Intent Level</h3>
            <span className="text-xs text-muted">NLP Scoring</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'high', label: 'High Intent', color: 'var(--success)', count: byIntent['high'] || 0 },
              { key: 'medium', label: 'Medium Intent', color: 'var(--warning)', count: byIntent['medium'] || 0 },
              { key: 'low', label: 'Low Intent', color: 'var(--text-muted)', count: byIntent['low'] || 0 },
              { key: 'not_a_lead', label: 'Not a Lead', color: 'var(--danger)', count: byIntent['not_a_lead'] || 0 },
            ].map((item) => {
              const pct = totalLeads > 0 ? Math.round((item.count / totalLeads) * 100) : 0;
              return (
                <div key={item.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    <span style={{ fontWeight: 600 }}>{item.count} <span className="text-dim">({pct}%)</span></span>
                  </div>
                  <div style={{ height: 6, width: '100%', backgroundColor: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: item.color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Import Runs Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <History size={18} color="var(--primary)" />
              Recent Collection & Import Runs
            </h3>
            <p className="card-description">Audit logs of assisted captures, CSV uploads, and deduplication results</p>
          </div>
          <button onClick={() => onNavigate('runs')} className="btn btn-ghost btn-sm">
            <span>View All Runs</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {!data?.recent_runs || data.recent_runs.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            No import runs recorded yet.
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Duplicates</th>
                  <th>Near-Dups</th>
                  <th>Failed</th>
                  <th>Started At</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_runs.map((run) => (
                  <tr key={run.id}>
                    <td className="font-mono text-xs" style={{ fontWeight: 600 }}>#{run.id}</td>
                    <td style={{ textTransform: 'capitalize' }}>
                      <span className="badge badge-slate">{run.source}</span>
                    </td>
                    <td>
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td style={{ color: run.created > 0 ? 'var(--success-text)' : 'inherit', fontWeight: 600 }}>
                      +{run.created}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{run.duplicates}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{run.near_duplicates}</td>
                    <td style={{ color: run.failed > 0 ? 'var(--danger-text)' : 'var(--text-muted)', fontWeight: run.failed > 0 ? 600 : 400 }}>
                      {run.failed}
                    </td>
                    <td className="text-xs text-muted">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
