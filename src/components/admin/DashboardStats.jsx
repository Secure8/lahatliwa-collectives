import { CheckCircle2, FolderKanban, Inbox, Star, Users, Workflow } from 'lucide-react';
import { AdminMetricCard } from './AdminUI';

const metrics = [
  ['total', 'Total Projects', FolderKanban],
  ['featured', 'Featured Projects', Star],
  ['published', 'Published Projects', CheckCircle2],
  ['creatives', 'Creative Members', Users],
  ['newInquiries', 'New Inquiries', Inbox],
  ['serviceBranches', 'Service Branches', Workflow],
];

export default function DashboardStats({ stats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map(([key, label, Icon]) => (
        <AdminMetricCard key={key} label={label} value={stats[key] ?? 0} icon={Icon} />
      ))}
    </div>
  );
}

