import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Search,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  Sparkles,
  BookmarkCheck,
  CheckCircle,
  XCircle,
  Trash2,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  Campaign,
  Lead,
  LeadFilters,
  LeadPage,
  LeadStatus,
  ServiceCategory,
  SortableField,
} from '../types/api';
import {
  LeadStatusBadge,
  IntentBadge,
  CategoryBadge,
} from '../components/common/Badge';
import { Drawer } from '../components/common/Drawer';
import { EmptyState } from '../components/common/EmptyState';
import { useToast } from '../context/ToastContext';

const VALID_CATEGORIES: { id: ServiceCategory; label: string }[] = [
  { id: 'influencer_marketing', label: 'Influencer Marketing' },
  { id: 'ad_agency', label: 'Ad Agency' },
  { id: 'production_house', label: 'Production House' },
  { id: 'brand_film', label: 'Brand Film' },
  { id: 'other', label: 'Other Services' },
];

interface LeadsViewProps {
  initialCampaignId?: number | null;
  initialRunId?: number | null;
}

export const LeadsView: React.FC<LeadsViewProps> = ({
  initialCampaignId,
  initialRunId,
}) => {
  const toast = useToast();

  // Leads and Pagination state
  const [leadPage, setLeadPage] = useState<LeadPage>({
    items: [],
    total: 0,
    page: 1,
    page_size: 25,
  });
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [intentLabelFilter, setIntentLabelFilter] = useState<string>('');
  const [minIntent, setMinIntent] = useState<number | ''>('');
  const [minRelevance, setMinRelevance] = useState<number | ''>('');
  const [campaignFilter, setCampaignFilter] = useState<number | ''>(
    initialCampaignId || ''
  );
  const [runFilter, setRunFilter] = useState<number | ''>(initialRunId || '');
  const [indiaOnly, setIndiaOnly] = useState<boolean>(false);
  const [includeDuplicates, setIncludeDuplicates] = useState<boolean>(false);
  const [includeNotLeads, setIncludeNotLeads] = useState<boolean>(true);

  // Sorting state
  const [sortBy, setSortBy] = useState<SortableField>('captured_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Lead selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  // Detail drawer edit state
  const [detailNotes, setDetailNotes] = useState('');
  const [detailCategory, setDetailCategory] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);

  // Fetch campaigns for campaign filter dropdown
  useEffect(() => {
    api.getCampaigns().then(setCampaigns).catch(console.error);
  }, []);

  const fetchLeads = useCallback(
    async (targetPage = 1) => {
      try {
        setLoading(true);
        const filters: LeadFilters = {
          q: searchQuery.trim() || undefined,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
          intent_label: (intentLabelFilter as any) || undefined,
          min_intent: minIntent !== '' ? Number(minIntent) : undefined,
          min_relevance: minRelevance !== '' ? Number(minRelevance) : undefined,
          campaign_id: campaignFilter !== '' ? Number(campaignFilter) : undefined,
          run_id: runFilter !== '' ? Number(runFilter) : undefined,
          india_only: indiaOnly || undefined,
          include_duplicates: includeDuplicates || undefined,
          include_not_leads: includeNotLeads,
          sort_by: sortBy,
          order: sortOrder,
        };

        const res = await api.getLeads(filters, targetPage, leadPage.page_size);
        setLeadPage(res);
      } catch (err: any) {
        toast.error('Failed to load leads', err.message);
      } finally {
        setLoading(false);
      }
    },
    [
      searchQuery,
      statusFilter,
      categoryFilter,
      intentLabelFilter,
      minIntent,
      minRelevance,
      campaignFilter,
      runFilter,
      indiaOnly,
      includeDuplicates,
      includeNotLeads,
      sortBy,
      sortOrder,
      leadPage.page_size,
    ]
  );

  useEffect(() => {
    fetchLeads(1);
  }, [fetchLeads]);

  const handleSort = (field: SortableField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleSelectAll = () => {
    if (selectedLeadIds.length === leadPage.items.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leadPage.items.map((l) => l.id));
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkStatus = async (status: LeadStatus) => {
    if (selectedLeadIds.length === 0) return;
    try {
      const res = await api.bulkUpdateStatus(selectedLeadIds, status);
      toast.success('Updated Status', `Updated ${res.updated} leads to "${status}".`);
      setSelectedLeadIds([]);
      fetchLeads(leadPage.page);
    } catch (err: any) {
      toast.error('Bulk update failed', err.message);
    }
  };

  const handleOpenDetail = (lead: Lead) => {
    setActiveLead(lead);
    setDetailNotes(lead.notes || '');
    setDetailCategory(lead.service_category || 'other');
  };

  const handleSaveDetail = async () => {
    if (!activeLead) return;
    try {
      setSavingDetail(true);
      const updated = await api.patchLead(activeLead.id, {
        notes: detailNotes.trim() || null,
        service_category: detailCategory || undefined,
      });
      setActiveLead(updated);
      setLeadPage((prev) => ({
        ...prev,
        items: prev.items.map((l) => (l.id === updated.id ? updated : l)),
      }));
      toast.success('Lead updated', 'Notes and category saved.');
    } catch (err: any) {
      toast.error('Failed to update lead', err.message);
    } finally {
      setSavingDetail(false);
    }
  };

  const handleUpdateLeadStatus = async (leadId: number, status: LeadStatus) => {
    try {
      const updated = await api.patchLead(leadId, { status });
      if (activeLead && activeLead.id === leadId) {
        setActiveLead(updated);
      }
      setLeadPage((prev) => ({
        ...prev,
        items: prev.items.map((l) => (l.id === updated.id ? updated : l)),
      }));
      toast.success('Lead status updated', `Marked as ${status}`);
    } catch (err: any) {
      toast.error('Failed to update status', err.message);
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await api.deleteLead(leadId);
      toast.success('Lead deleted', `Lead #${leadId} removed.`);
      if (activeLead?.id === leadId) {
        setActiveLead(null);
      }
      fetchLeads(leadPage.page);
    } catch (err: any) {
      toast.error('Failed to delete lead', err.message);
    }
  };

  const handleExportCsv = () => {
    const filters: LeadFilters = {
      q: searchQuery.trim() || undefined,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      intent_label: (intentLabelFilter as any) || undefined,
      min_intent: minIntent !== '' ? Number(minIntent) : undefined,
      min_relevance: minRelevance !== '' ? Number(minRelevance) : undefined,
      campaign_id: campaignFilter !== '' ? Number(campaignFilter) : undefined,
      run_id: runFilter !== '' ? Number(runFilter) : undefined,
      india_only: indiaOnly || undefined,
      include_duplicates: includeDuplicates || undefined,
      include_not_leads: includeNotLeads,
      sort_by: sortBy,
      order: sortOrder,
    };
    const exportUrl = api.getExportCsvUrl(filters);
    window.open(exportUrl, '_blank');
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setCategoryFilter('');
    setIntentLabelFilter('');
    setMinIntent('');
    setMinRelevance('');
    setCampaignFilter('');
    setRunFilter('');
    setIndiaOnly(false);
    setIncludeDuplicates(false);
    setIncludeNotLeads(true);
  };

  const totalPages = Math.ceil(leadPage.total / leadPage.page_size) || 1;

  const renderSortIcon = (field: SortableField) => {
    if (sortBy !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    }
    return sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Filter and Search Bar */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {/* Text Search Input */}
          <div style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              className="input text-sm"
              style={{ paddingLeft: 34 }}
              placeholder="Search in post text, author, company, headline..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <select
            className="select text-sm"
            style={{ width: 'auto', minWidth: 130 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Service Category Filter */}
          <select
            className="select text-sm"
            style={{ width: 'auto', minWidth: 160 }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {VALID_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Intent Level Filter */}
          <select
            className="select text-sm"
            style={{ width: 'auto', minWidth: 140 }}
            value={intentLabelFilter}
            onChange={(e) => setIntentLabelFilter(e.target.value)}
          >
            <option value="">All Intents</option>
            <option value="high">High Intent</option>
            <option value="medium">Medium Intent</option>
            <option value="low">Low Intent</option>
            <option value="not_a_lead">Not a Lead</option>
          </select>

          {/* Campaign Filter */}
          <select
            className="select text-sm"
            style={{ width: 'auto', minWidth: 150 }}
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Reset Filters button */}
          <button onClick={resetFilters} className="btn btn-ghost btn-sm" title="Clear all filters">
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>

        {/* Secondary Filter Row: Min scores, India toggle, Duplicates */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="text-muted">Min Intent:</span>
            <input
              type="number"
              min={0}
              max={100}
              className="input text-xs"
              style={{ width: 64, padding: '4px 6px' }}
              placeholder="0-100"
              value={minIntent}
              onChange={(e) => setMinIntent(e.target.value ? Number(e.target.value) : '')}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="text-muted">Min Relevance:</span>
            <input
              type="number"
              min={0}
              max={100}
              className="input text-xs"
              style={{ width: 64, padding: '4px 6px' }}
              placeholder="0-100"
              value={minRelevance}
              onChange={(e) => setMinRelevance(e.target.value ? Number(e.target.value) : '')}
            />
          </div>

          <label className="checkbox-label" style={{ fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              className="checkbox-input"
              checked={indiaOnly}
              onChange={(e) => setIndiaOnly(e.target.checked)}
            />
            <span>India Only</span>
          </label>

          <label className="checkbox-label" style={{ fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              className="checkbox-input"
              checked={includeDuplicates}
              onChange={(e) => setIncludeDuplicates(e.target.checked)}
            />
            <span>Include Duplicates</span>
          </label>

          <label className="checkbox-label" style={{ fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              className="checkbox-input"
              checked={includeNotLeads}
              onChange={(e) => setIncludeNotLeads(e.target.checked)}
            />
            <span>Include Non-Leads</span>
          </label>
        </div>
      </div>

      {/* Bulk Action & Export Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleSelectAll}
            className="btn btn-ghost btn-sm"
            title="Select all on this page"
          >
            {selectedLeadIds.length > 0 && selectedLeadIds.length === leadPage.items.length ? (
              <CheckSquare size={16} color="var(--primary)" />
            ) : (
              <Square size={16} />
            )}
            <span>
              {selectedLeadIds.length > 0 ? `${selectedLeadIds.length} Selected` : 'Select All'}
            </span>
          </button>

          {selectedLeadIds.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="text-dim text-xs">Mark as:</span>
              <button
                onClick={() => handleBulkStatus('shortlisted')}
                className="btn btn-success btn-sm"
              >
                <BookmarkCheck size={14} />
                <span>Shortlist</span>
              </button>
              <button
                onClick={() => handleBulkStatus('reviewed')}
                className="btn btn-secondary btn-sm"
              >
                <CheckCircle size={14} />
                <span>Reviewed</span>
              </button>
              <button
                onClick={() => handleBulkStatus('rejected')}
                className="btn btn-danger btn-sm"
              >
                <XCircle size={14} />
                <span>Reject</span>
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="text-xs text-muted">
            Found <strong>{leadPage.total}</strong> qualified leads
          </span>

          <button onClick={handleExportCsv} className="btn btn-secondary btn-sm" title="Export matching leads to CSV">
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Leads Table */}
      <div className="table-container">
        {loading && leadPage.items.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="animate-spin" style={{ display: 'inline-block', marginBottom: 8 }}>
              <Sparkles size={24} color="var(--primary)" />
            </div>
            <div className="text-sm">Fetching prospective leads...</div>
          </div>
        ) : leadPage.items.length === 0 ? (
          <div style={{ padding: 24 }}>
            <EmptyState
              icon={Users}
              title="No leads match your criteria"
              description="Try adjusting or clearing your filters, or use the Discover / Import feature to add new LinkedIn posts."
              actionLabel="Reset Filters"
              onAction={resetFilters}
            />
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th className="sortable" onClick={() => handleSort('author')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Author / Company</span>
                    {renderSortIcon('author')}
                  </div>
                </th>
                <th>Post Content Preview</th>
                <th className="sortable" onClick={() => handleSort('category')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Category</span>
                    {renderSortIcon('category')}
                  </div>
                </th>
                <th className="sortable" onClick={() => handleSort('intent')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Intent</span>
                    {renderSortIcon('intent')}
                  </div>
                </th>
                <th className="sortable" onClick={() => handleSort('relevance')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Relevance</span>
                    {renderSortIcon('relevance')}
                  </div>
                </th>
                <th className="sortable" onClick={() => handleSort('status')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th className="sortable" onClick={() => handleSort('captured_at')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Captured</span>
                    {renderSortIcon('captured_at')}
                  </div>
                </th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leadPage.items.map((lead) => {
                const isSelected = selectedLeadIds.includes(lead.id);
                return (
                  <tr
                    key={lead.id}
                    style={{
                      backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.08)' : undefined,
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox-input"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(lead.id)}
                      />
                    </td>

                    {/* Author & Company */}
                    <td style={{ minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            backgroundColor: 'var(--bg-surface-active)',
                            border: '1px solid var(--border-base)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            color: 'var(--text-primary)',
                            flexShrink: 0,
                          }}
                        >
                          {(lead.author_display || 'U')[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {lead.author_display || 'Unknown Author'}
                          </div>
                          {lead.author_headline ? (
                            <div className="text-xs text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                              {lead.author_headline}
                            </div>
                          ) : lead.company ? (
                            <div className="text-xs text-muted">{lead.company}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {/* Post Content Excerpt */}
                    <td style={{ maxWidth: 360 }}>
                      <div
                        onClick={() => handleOpenDetail(lead)}
                        style={{
                          cursor: 'pointer',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontSize: '0.825rem',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4,
                        }}
                        title="Click to view full post and details"
                      >
                        {lead.content}
                      </div>
                      {lead.matched_signals && lead.matched_signals.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {lead.matched_signals.slice(0, 2).map((sig, i) => (
                            <span key={i} className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                              {sig}
                            </span>
                          ))}
                          {lead.matched_signals.length > 2 && (
                            <span className="badge badge-slate" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                              +{lead.matched_signals.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td>
                      <CategoryBadge category={lead.service_category} />
                    </td>

                    {/* Intent */}
                    <td>
                      <IntentBadge label={lead.intent_label} score={lead.intent_score} />
                    </td>

                    {/* Relevance */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 44, height: 5, backgroundColor: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, Math.round(lead.relevance_score))}%`,
                              backgroundColor: lead.relevance_score > 60 ? 'var(--primary)' : 'var(--text-muted)',
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono">{Math.round(lead.relevance_score)}%</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <LeadStatusBadge status={lead.status} />
                    </td>

                    {/* Date */}
                    <td className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(lead.captured_at).toLocaleDateString()}
                    </td>

                    {/* Action buttons */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <a
                          href={lead.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-icon"
                          title="Open original post on LinkedIn"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => handleOpenDetail(lead)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        >
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
        <div className="text-xs text-muted">
          Showing Page <strong>{leadPage.page}</strong> of <strong>{totalPages}</strong> ({leadPage.total} total)
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => fetchLeads(leadPage.page - 1)}
            disabled={leadPage.page <= 1 || loading}
            className="btn btn-secondary btn-sm"
          >
            <ChevronLeft size={14} />
            <span>Previous</span>
          </button>
          <button
            onClick={() => fetchLeads(leadPage.page + 1)}
            disabled={leadPage.page >= totalPages || loading}
            className="btn btn-secondary btn-sm"
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Lead Review Detail Drawer */}
      <Drawer
        isOpen={Boolean(activeLead)}
        onClose={() => setActiveLead(null)}
        title={activeLead?.author_display || 'Lead Details'}
        subtitle={`Lead #${activeLead?.id} • Captured on ${activeLead ? new Date(activeLead.captured_at).toLocaleString() : ''}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <button
              onClick={() => activeLead && handleDeleteLead(activeLead.id)}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger-text)' }}
            >
              <Trash2 size={14} />
              <span>Delete Lead</span>
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setActiveLead(null)} className="btn btn-secondary btn-sm">
                Close
              </button>
              <button
                onClick={handleSaveDetail}
                disabled={savingDetail}
                className="btn btn-primary btn-sm"
              >
                {savingDetail ? 'Saving...' : 'Save Notes & Category'}
              </button>
            </div>
          </div>
        }
      >
        {activeLead && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Quick Status Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-xs text-muted">Current Status:</span>
                <LeadStatusBadge status={activeLead.status} />
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => handleUpdateLeadStatus(activeLead.id, 'shortlisted')}
                  className={`btn btn-sm ${activeLead.status === 'shortlisted' ? 'btn-success' : 'btn-secondary'}`}
                  title="Mark as Shortlisted"
                >
                  <BookmarkCheck size={14} />
                  <span>Shortlist</span>
                </button>
                <button
                  onClick={() => handleUpdateLeadStatus(activeLead.id, 'reviewed')}
                  className={`btn btn-sm ${activeLead.status === 'reviewed' ? 'btn-primary' : 'btn-secondary'}`}
                  title="Mark as Reviewed"
                >
                  <CheckCircle size={14} />
                  <span>Reviewed</span>
                </button>
                <button
                  onClick={() => handleUpdateLeadStatus(activeLead.id, 'rejected')}
                  className={`btn btn-sm ${activeLead.status === 'rejected' ? 'btn-danger' : 'btn-secondary'}`}
                  title="Mark as Rejected"
                >
                  <XCircle size={14} />
                  <span>Reject</span>
                </button>
              </div>
            </div>

            {/* Score & Category Metric Highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                <div className="text-xs text-muted">Intent Score</div>
                <div className="h3" style={{ marginTop: 4, color: activeLead.intent_score > 60 ? 'var(--success-text)' : 'inherit' }}>
                  {Math.round(activeLead.intent_score)}%
                </div>
                <div className="text-xs text-dim" style={{ textTransform: 'capitalize' }}>
                  {activeLead.intent_label.replace(/_/g, ' ')}
                </div>
              </div>

              <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                <div className="text-xs text-muted">Relevance</div>
                <div className="h3" style={{ marginTop: 4 }}>
                  {Math.round(activeLead.relevance_score)}%
                </div>
                <div className="text-xs text-dim">
                  {activeLead.is_india ? 'India Signal: Yes' : 'Global'}
                </div>
              </div>

              <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                <div className="text-xs text-muted">Duplicate Status</div>
                <div className="h3" style={{ marginTop: 4, fontSize: '0.9rem' }}>
                  {activeLead.is_duplicate ? 'Duplicate' : 'Unique Record'}
                </div>
                {activeLead.duplicate_of_id && (
                  <div className="text-xs text-dim">of Lead #{activeLead.duplicate_of_id}</div>
                )}
              </div>
            </div>

            {/* Source Post Card */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  LinkedIn Post Content
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeLead.content);
                      toast.info('Copied', 'Post content copied to clipboard.');
                    }}
                    className="btn btn-ghost btn-sm"
                    title="Copy full text"
                  >
                    <Copy size={13} />
                    <span>Copy Text</span>
                  </button>
                  <a
                    href={activeLead.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <span>Open on LinkedIn</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 16,
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.875rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-primary)',
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {activeLead.content}
              </div>
            </div>

            {/* Matched Signals */}
            {activeLead.matched_signals && activeLead.matched_signals.length > 0 && (
              <div>
                <span className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Detected Intent Signals & Keywords
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activeLead.matched_signals.map((sig, i) => (
                    <span key={i} className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                      {sig}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Author / Entity Details */}
            <div>
              <span className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Author & Company Information
              </span>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                  fontSize: '0.825rem',
                  background: 'var(--bg-subtle)',
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <span className="text-dim">Author Display:</span>
                  <div style={{ fontWeight: 500 }}>{activeLead.author_display || '—'}</div>
                </div>
                <div>
                  <span className="text-dim">Company / Brand:</span>
                  <div style={{ fontWeight: 500 }}>{activeLead.company || '—'}</div>
                </div>
                <div>
                  <span className="text-dim">Location:</span>
                  <div style={{ fontWeight: 500 }}>{activeLead.location || '—'}</div>
                </div>
                <div>
                  <span className="text-dim">Original Post Date:</span>
                  <div style={{ fontWeight: 500 }}>
                    {activeLead.posted_at ? new Date(activeLead.posted_at).toLocaleDateString() : '—'}
                  </div>
                </div>
                {activeLead.author_profile_url && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span className="text-dim">Profile Link:</span>
                    <div>
                      <a
                        href={activeLead.author_profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {activeLead.author_profile_url}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Editable Fields: Category & Review Notes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Service Category</label>
                <select
                  className="select"
                  value={detailCategory}
                  onChange={(e) => setDetailCategory(e.target.value)}
                >
                  {VALID_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Human Review Notes</label>
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="Add context on outreach status, qualification notes, DM follow-up dates..."
                  value={detailNotes}
                  onChange={(e) => setDetailNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
