import { Navigate } from 'react-router-dom';
import { useAdminAccess } from '../lib/adminAccess';
import usePublicAccount from '../lib/usePublicAccount';
import LoadingState from './LoadingState';

export default function CreativeRouteGuard({ children }) {
  const { role, adminUser } = useAdminAccess();
  const publicAccess = usePublicAccount();
  const resolvedRole = role || publicAccess.account?.role;
  const creativeMemberId = adminUser?.creative_member_id || publicAccess.account?.creative_member_id;
  if (!role && publicAccess.loading) return <div className="page-shell py-20"><LoadingState label="Checking Creative access" /></div>;
  if (resolvedRole !== 'creative' || !creativeMemberId) return <Navigate to="/account" replace />;
  return children;
}
