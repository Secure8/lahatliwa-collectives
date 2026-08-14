import { Navigate } from 'react-router-dom';
import { useAdminAccess } from '../lib/adminAccess';

export default function CreativeRouteGuard({ children }) {
  const { role, adminUser } = useAdminAccess();
  if (role !== 'creative' || !adminUser?.creative_member_id) return <Navigate to="/account" replace />;
  return children;
}
