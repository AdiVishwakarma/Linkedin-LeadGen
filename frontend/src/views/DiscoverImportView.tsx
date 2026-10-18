import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  FileText,
  CheckCircle2,
  Upload,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import type { Campaign, ImportRun, SearchTask } from '../types/api';
import { RunStatusBadge } from '../components/common/Badge';
import { useToast } from '../context/ToastContext';
import type { NavTab } from '../components/layout/Sidebar';

interface DiscoverImportViewProps {
  onNavigate: (tab: NavTab, params?: any) => void;
  preselectedCampaignId?: number | null;
  preselectedSearchTaskId?: number | null;
}

export const DiscoverImportView: React.FC<DiscoverImportViewProps> = ({
  onNavigate,
  preselectedCampaignId,
  preselectedSearchTaskId,
}) => {
  const toast = useToast();

  // Mode: manual single post | bulk paste text | csv file
  const [activeMode, setActiveMode] = useState<'single' | 'bulk' | 'csv'>('single');

  // Campaigns & Search Tasks dropdown state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | ''>(
    preselectedCampaignId || ''
  );
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | ''>(
    preselectedSearchTaskId || ''
  );

  // Single post form state
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorHeadline, setAuthorHeadline] = useState('');
  const [authorProfileUrl, setAuthorProfileUrl] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [postedAt, setPostedAt] = useState('');

  // Bulk paste text state
  const [rawText, setRawText] = useState('');

  // CSV file state
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Submission & Result state
  const [submitting, setSubmitting] = useState(false);
  const [lastRun, setLastRun] = useState<ImportRun | null>(null);

  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        const list = await api.getCampaigns();
        setCampaigns(list);
        if (preselectedCampaignId && list.some((c) => c.id === preselectedCampaignId)) {
          setSelectedCampaignId(preselectedCampaignId);
        }
      } catch (err: any) {
        console.error('Failed to load campaigns for import dropdown', err);
      }
    };
    loadCampaigns();
  }, [preselectedCampaignId]);

  useEffect(() => {
    if (selectedCampaignId) {
      const loadTasks = async () => {
        try {
          const t = await api.getSearchTasks(Number(selectedCampaignId));
          setTasks(t);
          if (preselectedSearchTaskId && t.some((item) => item.id === preselectedSearchTaskId)) {
            setSelectedTaskId(preselectedSearchTaskId);
          } else {
            setSelectedTaskId('');
          }
        } catch (err) {
          console.error('Failed to load tasks', err);
          setTasks([]);
        }
      };
      loadTasks();
    } else {
      setTasks([]);
      setSelectedTaskId('');
    }
  }, [selectedCampaignId, preselectedSearchTaskId]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error('URL Required', 'Please enter a valid LinkedIn post URL.');
      return;
    }
    if (!text.trim() || text.trim().length < 20) {
      toast.error(
        'Post Content Required',
        'Post text must be at least 20 characters for the classifier to evaluate intent.'
      );
      return;
    }

    try {
      setSubmitting(true);
      const run = await api.importItems({
        campaign_id: selectedCampaignId ? Number(selectedCampaignId) : undefined,
        search_task_id: selectedTaskId ? Number(selectedTaskId) : undefined,
        items: [
          {
            url: url.trim(),
            text: text.trim(),
            author_name: authorName.trim() || undefined,
            author_headline: authorHeadline.trim() || undefined,
            author_profile_url: authorProfileUrl.trim() || undefined,
            company: company.trim() || undefined,
            location: location.trim() || undefined,
            posted_at: postedAt.trim() || undefined,
          },
        ],
      });

      setLastRun(run);

      if (run.created > 0) {
        toast.success('Lead Discovered!', 'Successfully classified, scored, and stored.');
        // Reset form inputs
        setUrl('');
        setText('');
        setAuthorName('');
        setAuthorHeadline('');
        setAuthorProfileUrl('');
        setCompany('');
        setLocation('');
        setPostedAt('');
      } else if (run.duplicates > 0) {
        toast.info('Existing Post Recognized', 'This LinkedIn post is already in your database. Details refreshed.');
      } else if (run.near_duplicates > 0) {
        toast.info('Near-Duplicate Post', 'A nearly identical post text was previously captured.');
      } else if (run.failed > 0) {
        toast.error('Validation or Parse Failure', 'Check the error message or Import History.');
      }
    } catch (err: any) {
      toast.error('Import Failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) {
      toast.error('Missing Content', 'Paste at least one post block.');
      return;
    }

    try {
      setSubmitting(true);
      const run = await api.importBulkText({
        campaign_id: selectedCampaignId ? Number(selectedCampaignId) : undefined,
        search_task_id: selectedTaskId ? Number(selectedTaskId) : undefined,
        raw_text: rawText,
      });

      setLastRun(run);
      toast.success('Bulk Import Processed', `Created: ${run.created}, Duplicates: ${run.duplicates}, Failed: ${run.failed}`);
      setRawText('');
    } catch (err: any) {
      toast.error('Bulk Import Failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCsvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error('File Required', 'Please select a CSV file.');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append('file', csvFile);
      if (selectedCampaignId) {
        formData.append('campaign_id', String(selectedCampaignId));
      }
      if (selectedTaskId) {
        formData.append('search_task_id', String(selectedTaskId));
      }

      const run = await api.importCsv(formData);
      setLastRun(run);
      toast.success('CSV Processed', `Batch #${run.id}: Created ${run.created} new leads.`);
      setCsvFile(null);
    } catch (err: any) {
      toast.error('CSV Import Failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Workflow Explanation Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.7) 100%)',
          border: '1px solid var(--border-base)',
          borderRadius: 'var(--radius-xl)',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div
          style={{
            padding: 10,
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary-subtle)',
            color: 'var(--primary)',
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={22} />
        </div>
        <div>
          <h3 className="h3" style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            Assisted Discovery & Import Workflow
            <span className="badge badge-emerald" style={{ fontSize: '0.675rem' }}>No LinkedIn Scraping</span>
          </h3>
          <p className="text-xs text-secondary" style={{ marginTop: 4, lineHeight: 1.6 }}>
            In strict compliance with professional terms of service, this platform <strong>does not automate login or execute unauthorized scraping</strong>.
            Instead, you perform targeted manual searches via our campaign links, copy public post URLs and text, and our backend performs
            real-time <strong>semantic classification, lead intent scoring (0–100%), signal detection, and multi-layer deduplication</strong>.
          </p>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="tabs">
        <button
          onClick={() => setActiveMode('single')}
          className={`tab ${activeMode === 'single' ? 'active' : ''}`}
        >
          <Sparkles size={16} />
          <span>Manual Single Post</span>
        </button>
        <button
          onClick={() => setActiveMode('bulk')}
          className={`tab ${activeMode === 'bulk' ? 'active' : ''}`}
        >
          <FileText size={16} />
          <span>Paste Multiple (Bulk Text)</span>
        </button>
        <button
          onClick={() => setActiveMode('csv')}
          className={`tab ${activeMode === 'csv' ? 'active' : ''}`}
        >
          <Upload size={16} />
          <span>Upload CSV File</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: lastRun ? '1fr 340px' : '1fr', gap: 20 }}>
        {/* Main Import Form Container */}
        <div className="card">
          {/* Campaign & Task Association (Shared across modes) */}
          <div
            style={{
              paddingBottom: 16,
              marginBottom: 16,
              borderBottom: '1px solid var(--border-subtle)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Associate with Campaign (Optional)</label>
              <select
                className="select"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">-- No Campaign Attached --</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.service_categories.join(', ')})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Link to Search Task
                {selectedCampaignId && tasks.length > 0 && (
                  <span className="text-dim text-xs">({tasks.length} available)</span>
                )}
              </label>
              <select
                className="select"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : '')}
                disabled={!selectedCampaignId || tasks.length === 0}
              >
                <option value="">-- No Specific Task --</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.id}: {t.query_text} ({t.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* MODE 1: Single Post Form */}
          {activeMode === 'single' && (
            <form onSubmit={handleSingleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">
                  LinkedIn Post URL <span className="required">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://www.linkedin.com/feed/update/urn:li:activity:7509162054189056000/ or /posts/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
                <span className="text-xs text-muted" style={{ marginTop: 2 }}>
                  Supports standard activity links, direct post links, and update URNs.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Post Content / Text <span className="required">*</span>
                  <span className={`text-xs ${text.length < 20 ? 'text-dim' : 'text-muted'}`}>
                    {text.length} chars (min 20)
                  </span>
                </label>
                <textarea
                  className="textarea"
                  placeholder="Paste the full text of the LinkedIn post here so our pipeline can classify intent, extract hiring signals, and calculate relevance..."
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                />
              </div>

              {/* Optional Fields Accordion / Grid */}
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Optional Metadata (Paste what you see on the post):
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Author Name</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Ushnish Mondal"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Author Headline</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Brand Marketing Director @ Acme"
                      value={authorHeadline}
                      onChange={(e) => setAuthorHeadline(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Company / Brand</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. D2C Home Essentials"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Location</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Mumbai, India"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Author Profile URL</label>
                    <input
                      type="url"
                      className="input"
                      placeholder="https://www.linkedin.com/in/username"
                      value={authorProfileUrl}
                      onChange={(e) => setAuthorProfileUrl(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Posted Date / Age</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. 2d, 1w, or 2026-10-15"
                      value={postedAt}
                      onChange={(e) => setPostedAt(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || text.length < 20 || !url.trim()}
                >
                  <Sparkles size={16} />
                  <span>{submitting ? 'Classifying & Scoring...' : 'Analyze & Capture Lead'}</span>
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: Bulk Text Import */}
          {activeMode === 'bulk' && (
            <form onSubmit={handleBulkTextSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p className="text-xs text-muted">
                Paste multiple posts separated by a line of <code>---</code>. Include the post URL, optional Author/Company headers, and the post text.
              </p>

              <div className="form-group">
                <label className="form-label">Raw Posts Text Block</label>
                <textarea
                  className="textarea font-mono"
                  rows={10}
                  placeholder={`https://www.linkedin.com/feed/update/urn:li:activity:7509162054189056000/\nAuthor: Ushnish Mondal\nCompany: Acme Media\nLooking for an influencer marketing agency to manage our brand campaigns...\n---\nhttps://www.linkedin.com/posts/acme-brand_update-7238472938\nLooking for ad agency partners in Mumbai for upcoming product launch...`}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting || !rawText.trim()}>
                  <Sparkles size={16} />
                  <span>{submitting ? 'Parsing & Ingesting...' : 'Ingest Bulk Posts'}</span>
                </button>
              </div>
            </form>
          )}

          {/* MODE 3: CSV File Upload */}
          {activeMode === 'csv' && (
            <form onSubmit={handleCsvSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p className="text-xs text-muted">
                Upload a CSV file containing your collected posts. Supported headers: <code>url</code>, <code>text</code>, <code>author_name</code>, <code>author_headline</code>, <code>company</code>, <code>location</code>, <code>posted_at</code>.
              </p>

              <div
                style={{
                  border: '2px dashed var(--border-base)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 32,
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-subtle)',
                }}
                onClick={() => {
                  const input = document.getElementById('csv-file-input');
                  if (input) input.click();
                }}
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCsvFile(e.target.files[0]);
                    }
                  }}
                />
                <Upload size={32} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
                {csvFile ? (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{csvFile.name}</div>
                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                      {(csvFile.size / 1024).toFixed(1)} KB - Ready to upload
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Click to select CSV file</div>
                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                      or drag and drop your file here
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting || !csvFile}>
                  <Upload size={16} />
                  <span>{submitting ? 'Uploading & Processing...' : 'Upload & Process CSV'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column: Last Import Run Summary Card */}
        {lastRun && (
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header">
              <h3 className="card-title">
                <CheckCircle2 size={18} color="var(--success-text)" />
                Batch Result (#{lastRun.id})
              </h3>
              <RunStatusBadge status={lastRun.status} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-muted">Total Posts:</span>
                <span style={{ fontWeight: 600 }}>{lastRun.total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-muted">New Leads Created:</span>
                <span style={{ fontWeight: 600, color: 'var(--success-text)' }}>+{lastRun.created}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-muted">Duplicates Recognized:</span>
                <span style={{ fontWeight: 600 }}>{lastRun.duplicates}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-muted">Near-Duplicates:</span>
                <span style={{ fontWeight: 600 }}>{lastRun.near_duplicates}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-muted">Failed Items:</span>
                <span style={{ fontWeight: 600, color: lastRun.failed > 0 ? 'var(--danger-text)' : 'inherit' }}>
                  {lastRun.failed}
                </span>
              </div>

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => onNavigate('leads', { runId: lastRun.id })}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                >
                  <span>View Leads From This Run</span>
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => onNavigate('runs')}
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%' }}
                >
                  <span>Open Run Logs</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
