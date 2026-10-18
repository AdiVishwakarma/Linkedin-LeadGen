import React from 'react';
import type { IntentLabel, LeadStatus, RunStatus, SearchTaskStatus } from '../../types/api';

export const LeadStatusBadge: React.FC<{ status: LeadStatus | string }> = ({ status }) => {
  switch (status) {
    case 'shortlisted':
      return (
        <span className="badge badge-emerald">
          <span className="badge-dot" />
          Shortlisted
        </span>
      );
    case 'reviewed':
      return (
        <span className="badge badge-blue">
          <span className="badge-dot" />
          Reviewed
        </span>
      );
    case 'rejected':
      return (
        <span className="badge badge-rose">
          <span className="badge-dot" />
          Rejected
        </span>
      );
    case 'new':
    default:
      return (
        <span className="badge badge-purple">
          <span className="badge-dot" />
          New
        </span>
      );
  }
};

export const IntentBadge: React.FC<{ label: IntentLabel | string; score?: number }> = ({
  label,
  score,
}) => {
  const formattedScore = score !== undefined ? ` (${Math.round(score)}%)` : '';
  switch (label) {
    case 'high':
      return (
        <span className="badge badge-emerald" title={`Intent Score: ${score ?? 'High'}`}>
          <span className="badge-dot" />
          High Intent{formattedScore}
        </span>
      );
    case 'medium':
      return (
        <span className="badge badge-amber" title={`Intent Score: ${score ?? 'Medium'}`}>
          <span className="badge-dot" />
          Medium{formattedScore}
        </span>
      );
    case 'low':
      return (
        <span className="badge badge-slate" title={`Intent Score: ${score ?? 'Low'}`}>
          <span className="badge-dot" />
          Low{formattedScore}
        </span>
      );
    case 'not_a_lead':
    default:
      return (
        <span className="badge badge-rose" title={`Intent Score: ${score ?? 'Not a Lead'}`}>
          <span className="badge-dot" />
          Not a Lead{formattedScore}
        </span>
      );
  }
};

export const CategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const formatName = (cat: string) => {
    switch (cat) {
      case 'influencer_marketing':
        return 'Influencer Marketing';
      case 'ad_agency':
        return 'Ad Agency';
      case 'production_house':
        return 'Production House';
      case 'brand_film':
        return 'Brand Film';
      case 'other':
      default:
        return cat.replace(/_/g, ' ');
    }
  };

  return (
    <span className="badge badge-slate" style={{ textTransform: 'capitalize' }}>
      {formatName(category)}
    </span>
  );
};

export const RunStatusBadge: React.FC<{ status: RunStatus | string }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return (
        <span className="badge badge-emerald">
          <span className="badge-dot" />
          Completed
        </span>
      );
    case 'partial':
      return (
        <span className="badge badge-amber">
          <span className="badge-dot" />
          Partial
        </span>
      );
    case 'failed':
      return (
        <span className="badge badge-rose">
          <span className="badge-dot" />
          Failed
        </span>
      );
    case 'running':
      return (
        <span className="badge badge-blue">
          <span className="badge-dot" />
          Running
        </span>
      );
    case 'queued':
      return (
        <span className="badge badge-purple">
          <span className="badge-dot" />
          Queued
        </span>
      );
    case 'interrupted':
    default:
      return (
        <span className="badge badge-amber">
          <span className="badge-dot" />
          Interrupted
        </span>
      );
  }
};

export const TaskStatusBadge: React.FC<{ status: SearchTaskStatus | string }> = ({ status }) => {
  switch (status) {
    case 'done':
      return (
        <span className="badge badge-emerald">
          <span className="badge-dot" />
          Done
        </span>
      );
    case 'skipped':
      return (
        <span className="badge badge-slate">
          <span className="badge-dot" />
          Skipped
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="badge badge-amber">
          <span className="badge-dot" />
          Pending
        </span>
      );
  }
};
