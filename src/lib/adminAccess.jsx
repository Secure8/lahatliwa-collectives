import { createContext, useContext } from 'react';
import { useOutletContext } from 'react-router-dom';

export const roles = ['super_admin', 'admin', 'editor', 'writer', 'creative', 'viewer'];
export const privilegedRoles = ['super_admin', 'admin'];
export const contentRoles = ['super_admin', 'admin', 'editor', 'creative'];

const AdminAccessContext = createContext(null);

export function normalizeRole(role = '') {
  return role === 'owner' ? 'super_admin' : role || 'viewer';
}

export function roleLabel(role = '') {
  return normalizeRole(role).replace('_', ' ');
}

export function isPrivilegedRole(role) {
  return privilegedRoles.includes(normalizeRole(role));
}

export function canCreateProjects(role) {
  return contentRoles.includes(normalizeRole(role));
}

export function canManageTeam(role) {
  return isPrivilegedRole(role);
}

export function canManageSettings(role) {
  return isPrivilegedRole(role);
}

export function canManageAllProjects(role) {
  return isPrivilegedRole(role);
}

export function canApproveProjects(role) {
  return isPrivilegedRole(role);
}

export function canDeleteProject(role, project = {}) {
  return isPrivilegedRole(role) && project.status !== 'published';
}

export function canEditProject(role, project = {}, userId = '') {
  const normalized = normalizeRole(role);
  if (isPrivilegedRole(normalized)) return true;
  if (!['editor', 'creative'].includes(normalized)) return false;
  const ownsProject = project.owner_user_id === userId || project.created_by === userId;
  return ownsProject;
}

export function AdminAccessProvider({ value, children }) {
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess() {
  const context = useContext(AdminAccessContext);
  const outletContext = useOutletContext?.();
  return context || outletContext || {
    session: null,
    user: null,
    role: 'viewer',
    adminUser: null,
    isPrivileged: false,
  };
}
