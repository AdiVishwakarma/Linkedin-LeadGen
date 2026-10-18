import React, { useEffect, useState } from 'react';
import {
  Plus,
  Target,
  Search,
  ExternalLink,
  Clock,
  Sparkles,
  Edit2,
  Trash2,
  Check,
  MapPin,
  Tag,
  Ban,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  Campaign,
  CampaignIn,
  SearchTask,
  SearchTaskStatus,
  ServiceCategory,
} from '../types/api';
import { TaskStatusBadge, CategoryBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { TagInput } from '../components/common/TagInput';
import { EmptyState } from '../components/common/EmptyState';
import { useToast } from '../context/ToastContext';
import type { NavTab } from '../components/layout/Sidebar';

const AVAILABLE_CATEGORIES: { id: ServiceCategory; label: string }[] = [
  { id: 'influencer_marketing', label: 'Influencer Marketing' },
  { id: 'ad_agency', label: 'Ad Agency' },
  { id: 'production_house', label: 'Production House' },
  { id: 'brand_film', label: 'Brand Film' },
  { id: 'other', label: 'Other Services' },
];

interface CampaignsViewProps {
  onNavigate: (tab: NavTab, params?: any) => void;
  selectedCampaignId?: number | null;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  onNavigate,
  selectedCampaignId: initialSelectedId,
}) => {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  // Search tasks state for selected campaign
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskFilter, setTaskFilter] = useState<SearchTaskStatus | 'all'>('all');

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState<CampaignIn>({
    name: '',
    description: '',
    service_categories: ['influencer_marketing'],
    keywords: [],
    exclude_keywords: [],
    locations: [],
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  // Generate searches modal state
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [datePosted, setDatePosted] = useState<'past-24h' | 'past-week' | 'past-month'>('past-week');
  const [maxQueries, setMaxQueries] = useState<number>(30);
  const [generating, setGenerating] = useState(false);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const list = await api.getCampaigns();
      setCampaigns(list);

      // Select first or previously selected
      if (list.length > 0) {
        const found = initialSelectedId
          ? list.find((c) => c.id === initialSelectedId) || list[0]
          : selectedCampaign
          ? list.find((c) => c.id === selectedCampaign.id) || list[0]
          : list[0];
        setSelectedCampaign(found);
      } else {
        setSelectedCampaign(null);
      }
    } catch (err: any) {
      toast.error('Failed to load campaigns', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async (campaignId: number, status?: SearchTaskStatus | 'all') => {
    try {
      setTasksLoading(true);
      const statusParam = status === 'all' ? undefined : status;
      const taskList = await api.getSearchTasks(campaignId, statusParam);
      setTasks(taskList);
    } catch (err: any) {
      toast.error('Failed to load search tasks', err.message);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      fetchTasks(selectedCampaign.id, taskFilter);
    } else {
      setTasks([]);
    }
  }, [selectedCampaign, taskFilter]);

  const handleOpenCreateModal = () => {
    setEditingCampaign(null);
    setFormData({
      name: '',
      description: '',
      service_categories: ['influencer_marketing'],
      keywords: [],
      exclude_keywords: [],
      locations: [],
      is_active: true,
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description || '',
      service_categories: campaign.service_categories || [],
      keywords: campaign.keywords || [],
      exclude_keywords: campaign.exclude_keywords || [],
      locations: campaign.locations || [],
      is_active: campaign.is_active,
    });
    setModalOpen(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Validation Error', 'Campaign name is required.');
      return;
    }
    if (formData.service_categories.length === 0 && formData.keywords.length === 0) {
      toast.error('Validation Error', 'Add at least one service category or keyword.');
      return;
    }

    try {
      setSaving(true);
      if (editingCampaign) {
        const updated = await api.updateCampaign(editingCampaign.id, formData);
        toast.success('Campaign updated', `"${updated.name}" has been updated.`);
        setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        if (selectedCampaign?.id === updated.id) {
          setSelectedCampaign(updated);
        }
      } else {
        const created = await api.createCampaign(formData);
        toast.success('Campaign created', `"${created.name}" is now ready.`);
        setCampaigns((prev) => [created, ...prev]);
        setSelectedCampaign(created);
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error('Failed to save campaign', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (!confirm(`Are you sure you want to delete campaign "${campaign.name}"? Associated leads will remain intact.`)) {
      return;
    }
    try {
      await api.deleteCampaign(campaign.id);
      toast.success('Campaign deleted', `Campaign #${campaign.id} removed.`);
      fetchCampaigns();
    } catch (err: any) {
      toast.error('Failed to delete campaign', err.message);
    }
  };

  const handleGenerateSearches = async () => {
    if (!selectedCampaign) return;
    try {
      setGenerating(true);
      const created = await api.generateSearches(selectedCampaign.id, {
        date_posted: datePosted,
        max_queries: maxQueries,
      });
      toast.success('Search tasks generated', `Generated ${created.length} new LinkedIn search queries.`);
      setGenerateModalOpen(false);
      fetchTasks(selectedCampaign.id, taskFilter);
      fetchCampaigns();
    } catch (err: any) {
      toast.error('Failed to generate search tasks', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handlePatchTaskStatus = async (task: SearchTask, newStatus: SearchTaskStatus) => {
    try {
      const updated = await api.patchSearchTask(task.id, newStatus);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      toast.success('Task status updated', `Marked as ${newStatus}`);
    } catch (err: any) {
      toast.error('Failed to update task', err.message);
    }
  };

  const toggleCategory = (catId: ServiceCategory) => {
    setFormData((prev) => {
      const exists = prev.service_categories.includes(catId);
      return {
        ...prev,
        service_categories: exists
          ? prev.service_categories.filter((c) => c !== catId)
          : [...prev.service_categories, catId],
      };
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="h2" style={{ fontSize: '1.25rem' }}>Campaign Management</h2>
          <p className="text-xs text-muted">
            Configure niche target markets, customize keywords, and execute structured LinkedIn search workflows.
          </p>
        </div>
        <button onClick={handleOpenCreateModal} className="btn btn-primary btn-sm">
          <Plus size={16} />
          <span>New Campaign</span>
        </button>
      </div>

      {/* Main Split Layout: Left Campaign list, Right Search tasks & details */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left Column: Campaigns List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className="text-xs text-muted" style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                All Campaigns ({campaigns.length})
              </span>
            </div>

            {loading && campaigns.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }} className="text-xs">
                Loading campaigns...
              </div>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: '20px 10px', textAlign: 'center' }}>
                <p className="text-xs text-muted" style={{ marginBottom: 12 }}>No campaigns created yet.</p>
                <button onClick={handleOpenCreateModal} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                  Create First Campaign
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {campaigns.map((c) => {
                  const isSelected = selectedCampaign?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCampaign(c)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isSelected ? 'var(--bg-surface-active)' : 'var(--bg-subtle)',
                        border: `1px solid ${isSelected ? 'var(--primary-border)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: isSelected ? 'var(--text-white)' : 'var(--text-primary)' }}>
                          {c.name}
                        </span>
                        <span className={`badge ${c.is_active ? 'badge-emerald' : 'badge-slate'}`} style={{ fontSize: '0.65rem' }}>
                          {c.is_active ? 'Active' : 'Paused'}
                        </span>
                      </div>

                      {c.description && (
                        <p className="text-xs text-muted" style={{ marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.725rem', color: 'var(--text-dim)' }}>
                        <span>{c.lead_count} leads</span>
                        <span style={{ color: c.pending_searches > 0 ? 'var(--warning-text)' : 'inherit' }}>
                          {c.pending_searches} pending searches
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Campaign Detail & Search Checklist */}
        {selectedCampaign ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Campaign Summary Card */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 className="h2" style={{ fontSize: '1.2rem' }}>{selectedCampaign.name}</h3>
                    <span className={`badge ${selectedCampaign.is_active ? 'badge-emerald' : 'badge-slate'}`}>
                      {selectedCampaign.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {selectedCampaign.description && (
                    <p className="text-sm text-muted" style={{ marginTop: 4, maxWidth: 640 }}>
                      {selectedCampaign.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleOpenEditModal(selectedCampaign)} className="btn btn-secondary btn-sm">
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                  <button onClick={() => handleDeleteCampaign(selectedCampaign)} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-text)' }}>
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                  <button onClick={() => setGenerateModalOpen(true)} className="btn btn-primary btn-sm">
                    <Sparkles size={14} />
                    <span>Generate Searches</span>
                  </button>
                </div>
              </div>

              {/* Tag Breakdown */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Layers size={12} /> Target Categories:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {selectedCampaign.service_categories.map((cat) => (
                      <CategoryBadge key={cat} category={cat} />
                    ))}
                  </div>
                </div>

                {selectedCampaign.keywords.length > 0 && (
                  <div>
                    <div className="text-xs text-muted" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag size={12} /> Keywords:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {selectedCampaign.keywords.map((k) => (
                        <span key={k} className="badge badge-slate" style={{ fontSize: '0.725rem' }}>{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCampaign.locations.length > 0 && (
                  <div>
                    <div className="text-xs text-muted" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} /> Locations:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {selectedCampaign.locations.map((loc) => (
                        <span key={loc} className="badge badge-slate" style={{ fontSize: '0.725rem' }}>{loc}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCampaign.exclude_keywords.length > 0 && (
                  <div>
                    <div className="text-xs text-muted" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Ban size={12} /> Excluded:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {selectedCampaign.exclude_keywords.map((ek) => (
                        <span key={ek} className="badge badge-rose" style={{ fontSize: '0.725rem' }}>{ek}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Generated Search Tasks Checklist */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">
                    <Search size={18} color="var(--primary)" />
                    Assisted LinkedIn Searches ({tasks.length})
                  </h3>
                  <p className="card-description">
                    Open each search link to review live LinkedIn posts, then capture high-relevance leads back into the platform.
                  </p>
                </div>

                {/* Filter Tabs for tasks */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['all', 'pending', 'done', 'skipped'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setTaskFilter(status)}
                      className={`btn btn-sm ${taskFilter === status ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {tasksLoading ? (
                <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)' }} className="text-xs">
                  Loading search tasks...
                </div>
              ) : tasks.length === 0 ? (
                <div style={{ padding: 20 }}>
                  <EmptyState
                    icon={Search}
                    title="No search tasks generated"
                    description="Click 'Generate Searches' to create tailored LinkedIn search queries based on your campaign's keywords and categories."
                    actionLabel="Generate Searches Now"
                    onAction={() => setGenerateModalOpen(true)}
                  />
                </div>
              ) : (
                <div className="table-container" style={{ border: 'none' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Query String</th>
                        <th>Category</th>
                        <th>Posts Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr key={task.id}>
                          <td>
                            <TaskStatusBadge status={task.status} />
                          </td>
                          <td style={{ maxWidth: 360 }}>
                            <div className="font-mono text-xs" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                              {task.query_text}
                            </div>
                            <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                              Created {new Date(task.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td>
                            {task.service_category ? (
                              <CategoryBadge category={task.service_category} />
                            ) : (
                              <span className="text-xs text-dim">—</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600, color: task.posts_added > 0 ? 'var(--success-text)' : 'inherit' }}>
                            {task.posts_added}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {/* Open LinkedIn Search Link */}
                              <a
                                href={task.search_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary btn-sm"
                                title="Open search results on LinkedIn"
                                style={{ textDecoration: 'none' }}
                              >
                                <span>Open Search</span>
                                <ExternalLink size={12} />
                              </a>

                              {/* Capture Lead for this task */}
                              <button
                                onClick={() =>
                                  onNavigate('import', {
                                    campaignId: selectedCampaign.id,
                                    searchTaskId: task.id,
                                  })
                                }
                                className="btn btn-primary btn-sm"
                                title="Import post found from this search"
                              >
                                <Sparkles size={12} />
                                <span>Capture Post</span>
                              </button>

                              {/* Toggle Done / Pending */}
                              {task.status !== 'done' ? (
                                <button
                                  onClick={() => handlePatchTaskStatus(task, 'done')}
                                  className="btn btn-ghost btn-sm"
                                  title="Mark as Done"
                                >
                                  <Check size={14} color="var(--success-text)" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handlePatchTaskStatus(task, 'pending')}
                                  className="btn btn-ghost btn-sm"
                                  title="Reopen as Pending"
                                >
                                  <Clock size={14} color="var(--warning-text)" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Target}
            title="Select or create a campaign"
            description="Choose a campaign from the list on the left or create a new one to start generating targeted LinkedIn search queries."
            actionLabel="Create Campaign"
            onAction={handleOpenCreateModal}
          />
        )}
      </div>

      {/* Create / Edit Campaign Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCampaign ? `Edit Campaign: ${editingCampaign.name}` : 'Create New Campaign'}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCampaign}
              className="btn btn-primary btn-sm"
              disabled={saving}
            >
              {saving ? 'Saving...' : editingCampaign ? 'Save Changes' : 'Create Campaign'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSaveCampaign} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">
              Campaign Name <span className="required">*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g. D2C Influencer Marketing Q4"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description (Optional)</label>
            <textarea
              className="textarea"
              placeholder="Describe the campaign objectives or ideal client profiles..."
              rows={2}
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Service Categories Target <span className="required">*</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {AVAILABLE_CATEGORIES.map((cat) => {
                const isSelected = formData.service_categories.includes(cat.id);
                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`badge ${isSelected ? 'badge-purple' : 'badge-slate'}`}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--purple)' : '1px solid var(--border-subtle)',
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Keywords (Search query building & relevance score boost)
            </label>
            <TagInput
              value={formData.keywords}
              onChange={(tags) => setFormData({ ...formData, keywords: tags })}
              placeholder="Type keyword and press Enter (e.g. influencer agency, creator marketing)..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Locations (Optional filters)</label>
            <TagInput
              value={formData.locations}
              onChange={(tags) => setFormData({ ...formData, locations: tags })}
              placeholder="Type location and press Enter (e.g. Mumbai, Bengaluru, India)..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Exclude Keywords (Noise reduction)</label>
            <TagInput
              value={formData.exclude_keywords}
              onChange={(tags) => setFormData({ ...formData, exclude_keywords: tags })}
              placeholder="Exclude terms (e.g. hiring intern, job opening)..."
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox-input"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              <span>Campaign is Active</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Generate Searches Modal */}
      <Modal
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title="Generate LinkedIn Search Tasks"
        footer={
          <>
            <button onClick={() => setGenerateModalOpen(false)} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              onClick={handleGenerateSearches}
              className="btn btn-primary btn-sm"
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate Checklist'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="text-sm text-muted">
            The platform combines your campaign categories, keywords, and locations with high-intent search operators
            (e.g. <code>"looking for"</code>, <code>"recommend"</code>, <code>"any suggestions"</code>) to create targeted LinkedIn content search links.
          </p>

          <div className="form-group">
            <label className="form-label">Date Posted Filter</label>
            <select
              className="select"
              value={datePosted}
              onChange={(e) => setDatePosted(e.target.value as any)}
            >
              <option value="past-24h">Past 24 Hours (Hottest / Most Immediate)</option>
              <option value="past-week">Past Week (Recommended)</option>
              <option value="past-month">Past Month</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Max Queries to Generate</label>
            <input
              type="number"
              className="input"
              min={1}
              max={200}
              value={maxQueries}
              onChange={(e) => setMaxQueries(parseInt(e.target.value, 10) || 20)}
            />
            <span className="text-xs text-muted" style={{ marginTop: 2 }}>
              Existing queries are automatically skipped to prevent duplicates.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
