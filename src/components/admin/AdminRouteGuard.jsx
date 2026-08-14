import { Navigate } from 'react-router-dom';
import { useAdminAccess } from '../../lib/adminAccess';

export default function AdminRouteGuard({ allow = [], children }) {
  const { role } = useAdminAccess();

  if (!allow.includes(role)) {
    return <Navigate to="/account" replace />;
  }

  if (!children) return <Navigate to="/admin/dashboard" replace />;
  return children;
}

