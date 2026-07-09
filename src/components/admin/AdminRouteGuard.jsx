import { Navigate } from 'react-router-dom';
import { useAdminAccess } from '../../lib/adminAccess';
import { AdminNotice, AdminPageHeader } from './AdminUI';
import AdminLayout from './AdminLayout';

export default function AdminRouteGuard({ allow = [], children }) {
  const { role } = useAdminAccess();

  if (!allow.includes(role)) {
    return (
      <AdminLayout>
        <AdminPageHeader eyebrow="Restricted" title="Not authorized" description="Your account does not have access to this admin area." />
        <AdminNotice>This route is limited to {allow.join(', ')} users.</AdminNotice>
      </AdminLayout>
    );
  }

  if (!children) return <Navigate to="/admin/dashboard" replace />;
  return children;
}
