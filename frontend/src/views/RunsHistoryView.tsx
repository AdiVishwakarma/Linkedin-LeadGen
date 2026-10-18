import React, { useEffect, useState } from 'react';
import {
  History,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  ChevronRight,
  Code,
  ArrowRight,
} from 'lucide-react';
import { api } from '../services/api';
import type { ErrorLog, ImportRun, RunDetail, RunStatus } from '../types/api';
import { RunStatusBadge } from '../components/common/Badge';
import { Drawer } from '../components/common/Drawer';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { useToast } from '../context/ToastContext';
import type { NavTab } from '../components/layout/Sidebar';

interface RunsHistoryViewProps {
  onNavigate: (tab: NavTab, params?: any) => void;
}

export const RunsHistoryView: React.FC<RunsHistoryViewProps> = ({ onNavigate }) => {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'runs' | 'errors'>('runs');

  // Runs state
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RunStatus | ''>('');

  // Selected Run Detail
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Errors state
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [unresolvedOnly, setUnresolvedOnly] = useState<boolean>(false);
  const [payloadModalItem, setPayloadModalItem] = useState<ErrorLog | null>(null);

  const fetchRuns = async () => {
    try {
      setRunsLoading(true);
      const list = await api.getRuns(statusFilter || undefined);
      setRuns(list);
    } catch (err: any) {
      toast.error('Failed to load runs', err.message);
    } finally {
      setRunsLoading(false);
    }
  };

  const fetchErrors = async () => {
    try {
      setErrorsLoading(true);
      const list = await api.getErrors(
        undefined,
        levelFilter || undefined,
        unresolvedOnly,
        100
      );
      setErrors(list);
    } catch (err: any) {
      toast.error('Failed to load error logs', err.message);
    } finally {
      setErrorsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'runs') {
      fetchRuns();
    } else {
      fetchErrors();
    }
  }, [activeTab, statusFilter, levelFilter, unresolvedOnly]);

  const handleOpenRunDetail = async (runId: number) => {
    try {
      setActiveRunId(runId);
      setDetailLoading(true);
      const detail = await api.getRun(runId);
      setRunDetail(detail);
    } catch (err: any) {
      toast.error('Failed to load run details', err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRetryRun = async (runId: number) => {
    try {
      setRetrying(true);
      const updated = await api.retryRun(runId);
      setRunDetail(updated);
      toast.success(
        'Batch Retried',
        `Re-processed failed items. Created: ${updated.created}, Duplicates: ${updated.duplicates}, Failed: ${updated.failed}`
      );
      fetchRuns();
    } catch (err: any) {
      toast.error('Retry failed', err.message);
    } finally {
      setRetrying(false);
    }
  };

  const formatDuration = (start: string, finish?: string | null) => {
    if (!finish) return 'In Progress / Pending';
    const s = new Date(start).getTime();
    const f = new Date(finish).getTime();
    const diffMs = Math.max(0, f - s);
    if (diffMs < 1000) return `${diffMs}ms`;
    return `${(diffMs / 1000).toFixed(2)}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* View Header Tabs */}
      <div className="tabs">
        <button
          onClick={() => setActiveTab('runs')}
          className={`tab ${activeTab === 'runs' ? 'active' : ''}`}
        >
          <History size={16} />
          <span>Import Batches & Runs</span>
        </button>
        <button
          onClick={() => setActiveTab('errors')}
          className={`tab ${activeTab === 'errors' ? 'active' : ''}`}
        >
          <AlertTriangle size={16} />
          <span>System Error Logs</span>
        </button>
      </div>

      {/* TAB 1: Runs List */}
      {activeTab === 'runs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filter Bar */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="text-xs text-muted" style={{ fontWeight: 600 }}>Filter by Status:</span>
                <select
                  className="select text-sm"
                  style={{ width: 'auto', minWidth: 140 }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                  <option value="running">Running</option>
                  <option value="queued">Queued</option>
                  <option value="interrupted">Interrupted</option>
                </select>
              </div>

              <span className="text-xs text-muted">
                Showing <strong>{runs.length}</strong> collection runs
              </span>
            </div>
          </div>

          {/* Runs Table */}
          <div className="table-container">
            {runsLoading && runs.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="animate-spin" style={{ display: 'inline-block', marginBottom: 8 }}>
                  <RotateCw size={24} color="var(--primary)" />
                </div>
                <div className="text-sm">Loading import runs...</div>
              </div>
            ) : runs.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState
                  icon={History}
                  title="No import runs found"
                  description="Capture LinkedIn posts through the Discover / Import view to generate collection batches."
                  actionLabel="Go to Discover / Import"
                  onAction={() => onNavigate('import')}
                />
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Created</th>
                    <th>Duplicates</th>
                    <th>Near-Dups</th>
                    <th>Failed</th>
                    <th>Duration</th>
                    <th>Started At</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="font-mono text-xs" style={{ fontWeight: 600 }}>
                        #{run.id}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>
                        <span className="badge badge-slate">{run.source}</span>
                      </td>
                      <td>
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td style={{ fontWeight: 500 }}>{run.total}</td>
                      <td style={{ color: run.created > 0 ? 'var(--success-text)' : 'inherit', fontWeight: 600 }}>
                        +{run.created}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{run.duplicates}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{run.near_duplicates}</td>
                      <td style={{ color: run.failed > 0 ? 'var(--danger-text)' : 'var(--text-muted)', fontWeight: run.failed > 0 ? 600 : 400 }}>
                        {run.failed}
                      </td>
                      <td className="text-xs text-dim">
                        {formatDuration(run.started_at, run.finished_at)}
                      </td>
                      <td className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenRunDetail(run.id)}
                          className="btn btn-secondary btn-sm"
                        >
                          <span>Inspect</span>
                          <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: System Error Logs */}
      {activeTab === 'errors' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filters Bar */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="text-xs text-muted" style={{ fontWeight: 600 }}>Filter by Level:</span>
                <select
                  className="select text-sm"
                  style={{ width: 'auto', minWidth: 120 }}
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                >
                  <option value="">All Levels</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>

                <label className="checkbox-label" style={{ fontSize: '0.8rem' }}>
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={unresolvedOnly}
                    onChange={(e) => setUnresolvedOnly(e.target.checked)}
                  />
                  <span>Unresolved Only</span>
                </label>
              </div>

              <span className="text-xs text-muted">
                Showing <strong>{errors.length}</strong> logged incidents
              </span>
            </div>
          </div>

          {/* Errors Table */}
          <div className="table-container">
            {errorsLoading && errors.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="animate-spin" style={{ display: 'inline-block', marginBottom: 8 }}>
                  <RotateCw size={24} color="var(--primary)" />
                </div>
                <div className="text-sm">Loading diagnostic logs...</div>
              </div>
            ) : errors.length === 0 ? (
              <div style={{ padding: 24 }}>
                <EmptyState
                  icon={CheckCircle2}
                  title="No errors recorded"
                  description="Your system logs are completely clean. All validations, parsing, and classifications ran smoothly."
                />
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Log ID</th>
                    <th>Run</th>
                    <th>Level</th>
                    <th>Pipeline Stage</th>
                    <th>Message</th>
                    <th>Payload</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((err) => (
                    <tr key={err.id}>
                      <td className="font-mono text-xs">#{err.id}</td>
                      <td>
                        {err.run_id ? (
                          <button
                            onClick={() => handleOpenRunDetail(err.run_id!)}
                            className="btn btn-ghost btn-sm font-mono text-xs"
                            style={{ padding: '2px 6px' }}
                          >
                            #{err.run_id}
                          </button>
                        ) : (
                          <span className="text-dim text-xs">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            err.level === 'error'
                              ? 'badge-rose'
                              : err.level === 'warning'
                              ? 'badge-amber'
                              : 'badge-blue'
                          }`}
                          style={{ textTransform: 'capitalize' }}
                        >
                          {err.level}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-slate" style={{ textTransform: 'uppercase', fontSize: '0.675rem' }}>
                          {err.stage}
                        </span>
                      </td>
                      <td style={{ maxWidth: 420 }}>
                        <div style={{ fontSize: '0.825rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          {err.message}
                        </div>
                      </td>
                      <td>
                        {err.payload ? (
                          <button
                            onClick={() => setPayloadModalItem(err)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                          >
                            <Code size={12} />
                            <span>Inspect</span>
                          </button>
                        ) : (
                          <span className="text-dim text-xs">—</span>
                        )}
                      </td>
                      <td className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(err.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Run Detail Drawer */}
      <Drawer
        isOpen={Boolean(activeRunId)}
        onClose={() => {
          setActiveRunId(null);
          setRunDetail(null);
        }}
        title={`Import Run #${activeRunId}`}
        subtitle={`Audit breakdown and raw failure logs`}
        footer={
          runDetail && (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <button
                onClick={() => {
                  setActiveRunId(null);
                  onNavigate('leads', { runId: runDetail.id });
                }}
                className="btn btn-secondary btn-sm"
              >
                <span>View Leads ({runDetail.created})</span>
                <ArrowRight size={13} />
              </button>

              {runDetail.failed > 0 && (
                <button
                  onClick={() => handleRetryRun(runDetail.id)}
                  disabled={retrying}
                  className="btn btn-primary btn-sm"
                >
                  <RotateCw size={14} className={retrying ? 'animate-spin' : ''} />
                  <span>{retrying ? 'Retrying...' : 'Retry Failed Items'}</span>
                </button>
              )}
            </div>
          )
        }
      >
        {detailLoading || !runDetail ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="animate-spin" style={{ display: 'inline-block', marginBottom: 8 }}>
              <RotateCw size={24} color="var(--primary)" />
            </div>
            <div>Loading run audit...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header info */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-subtle)',
              }}
            >
              <div>
                <span className="text-xs text-muted">Run Status:</span>
                <div style={{ marginTop: 4 }}>
                  <RunStatusBadge status={runDetail.status} />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted">Source:</span>
                <div style={{ fontWeight: 600, textTransform: 'capitalize', marginTop: 4 }}>
                  {runDetail.source}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted">Duration:</span>
                <div style={{ fontWeight: 600, marginTop: 4 }}>
                  {formatDuration(runDetail.started_at, runDetail.finished_at)}
                </div>
              </div>
            </div>

            {/* Counts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div className="text-xs text-muted">Total</div>
                <div className="h3" style={{ marginTop: 2 }}>{runDetail.total}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div className="text-xs text-muted">Created</div>
                <div className="h3" style={{ marginTop: 2, color: 'var(--success-text)' }}>+{runDetail.created}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div className="text-xs text-muted">Dups</div>
                <div className="h3" style={{ marginTop: 2 }}>{runDetail.duplicates + runDetail.near_duplicates}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div className="text-xs text-muted">Failed</div>
                <div className="h3" style={{ marginTop: 2, color: runDetail.failed > 0 ? 'var(--danger-text)' : 'inherit' }}>
                  {runDetail.failed}
                </div>
              </div>
            </div>

            {/* Attached Errors */}
            <div>
              <h4 className="h3" style={{ fontSize: '0.95rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} color="var(--danger-text)" />
                Error Logs for This Run ({runDetail.errors.length})
              </h4>

              {runDetail.errors.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No errors logged for this collection run.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {runDetail.errors.map((err) => (
                    <div
                      key={err.id}
                      style={{
                        padding: 12,
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-subtle)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span className="badge badge-rose" style={{ textTransform: 'uppercase', fontSize: '0.675rem' }}>
                          Stage: {err.stage}
                        </span>
                        <span className="text-xs text-muted">
                          {new Date(err.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.825rem', color: 'var(--danger-text)', marginTop: 4 }}>
                        {err.message}
                      </div>

                      {err.payload && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            onClick={() => setPayloadModalItem(err)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.725rem' }}
                          >
                            <Code size={11} />
                            <span>View Raw Payload</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Raw Payload Inspection Modal */}
      <Modal
        isOpen={Boolean(payloadModalItem)}
        onClose={() => setPayloadModalItem(null)}
        title={`Error Payload (Log #${payloadModalItem?.id})`}
        footer={
          <button onClick={() => setPayloadModalItem(null)} className="btn btn-secondary btn-sm">
            Close
          </button>
        }
      >
        {payloadModalItem?.payload && (
          <pre
            className="font-mono text-xs"
            style={{
              padding: 16,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-base)',
              overflowX: 'auto',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            {JSON.stringify(payloadModalItem.payload, null, 2)}
          </pre>
        )}
      </Modal>
    </div>
  );
};
