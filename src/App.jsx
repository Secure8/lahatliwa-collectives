import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingState from './components/LoadingState';
import Home from './pages/Home';
import AdminRouteGuard from './components/admin/AdminRouteGuard';
import { PublicContentProvider, usePublicContent } from './lib/contentApi';
import PublicScrollRestoration from './components/PublicScrollRestoration';
import PublicErrorBoundary from './components/PublicErrorBoundary';
import { publicRouteBoundaryKey } from './lib/navigationHistory';

const Login = lazy(() => import('./pages/admin/Login'));
const About = lazy(() => import('./pages/About'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetails = lazy(() => import('./pages/ProjectDetails'));
const Services = lazy(() => import('./pages/Services'));
const Contact = lazy(() => import('./pages/Contact'));
const Creatives = lazy(() => import('./pages/Creatives'));
const CreativeDetails = lazy(() => import('./pages/CreativeDetails'));
const StartProject = lazy(() => import('./pages/StartProject'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProjects = lazy(() => import('./pages/admin/AdminProjects'));
const NewProject = lazy(() => import('./pages/admin/NewProject'));
const EditProject = lazy(() => import('./pages/admin/EditProject'));
const SiteSettings = lazy(() => import('./pages/admin/SiteSettings'));
const ContentIndex = lazy(() => import('./pages/admin/ContentIndex'));
const ContentEditor = lazy(() => import('./pages/admin/ContentEditor'));
const IconsMedia = lazy(() => import('./pages/admin/IconsMedia'));
const AdminCreatives = lazy(() => import('./pages/admin/AdminCreatives'));
const CreativeEditor = lazy(() => import('./pages/admin/CreativeEditor'));
const AdminInquiries = lazy(() => import('./pages/admin/AdminInquiries'));
const AdminServiceBranches = lazy(() => import('./pages/admin/AdminServiceBranches'));
const ServiceBranchEditor = lazy(() => import('./pages/admin/ServiceBranchEditor'));
const AdminTeam = lazy(() => import('./pages/admin/AdminTeam'));
const MyProfile = lazy(() => import('./pages/admin/MyProfile'));
const CreativeDirectory = lazy(() => import('./pages/admin/CreativeDirectory'));

function SiteDocumentTitle() {
  const { content } = usePublicContent([]);

  useEffect(() => {
    document.title = content.displayName || 'Lahat Liwa';
  }, [content.displayName]);

  return null;
}

function PublicLayout() {
  const location = useLocation();
  const { pathname } = location;
  const contentArea = pathname === '/' ? 'home' : pathname === '/about' ? 'about' : pathname === '/services' ? 'services' : pathname === '/contact' ? 'contact' : 'shared';
  const pageKeys = useMemo(() => contentArea === 'home' ? ['home', 'services'] : contentArea === 'shared' ? [] : [contentArea], [contentArea]);
  return (
    <PublicContentProvider pageKeys={pageKeys}>
      <SiteDocumentTitle />
      <PublicScrollRestoration />
      <Navbar />
      <main className="min-h-[60vh] overflow-x-hidden"><PublicErrorBoundary key={publicRouteBoundaryKey(location)}><Suspense fallback={<div className="page-shell py-20"><LoadingState label="Loading page" /></div>}><Outlet /></Suspense></PublicErrorBoundary></main>
      <Footer />
    </PublicContentProvider>
  );
}

function AdminSuspense({ children }) {
  return (
    <Suspense fallback={<div className="page-shell py-20"><LoadingState label="Loading admin" /></div>}>
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:slug" element={<ProjectDetails />} />
        <Route path="/services" element={<Services />} />
        <Route path="/creatives" element={<Creatives />} />
        <Route path="/creatives/:slug" element={<CreativeDetails />} />
        <Route path="/start-a-project" element={<StartProject />} />
        <Route path="/contact" element={<Contact />} />
      </Route>
      <Route path="/admin/login" element={<AdminSuspense><Login /></AdminSuspense>} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/admin/dashboard" element={<AdminSuspense><Dashboard /></AdminSuspense>} />
        <Route path="/admin/my-profile" element={<AdminSuspense><MyProfile /></AdminSuspense>} />
        <Route path="/admin/directory" element={<AdminSuspense><CreativeDirectory /></AdminSuspense>} />
        <Route path="/admin/projects" element={<AdminSuspense><AdminProjects /></AdminSuspense>} />
        <Route path="/admin/projects/new" element={<AdminSuspense><NewProject /></AdminSuspense>} />
        <Route path="/admin/projects/:id/edit" element={<AdminSuspense><EditProject /></AdminSuspense>} />
        <Route path="/admin/creatives" element={<AdminSuspense><AdminCreatives /></AdminSuspense>} />
        <Route path="/admin/creatives/new" element={<AdminSuspense><AdminRouteGuard allow={['super_admin', 'admin']}><CreativeEditor /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/creatives/:id/edit" element={<AdminSuspense><AdminRouteGuard allow={['super_admin', 'admin']}><CreativeEditor /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/service-branches" element={<AdminSuspense><AdminServiceBranches /></AdminSuspense>} />
        <Route path="/admin/service-branches/new" element={<AdminSuspense><AdminRouteGuard allow={['super_admin', 'admin']}><ServiceBranchEditor /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/service-branches/:id/edit" element={<AdminSuspense><AdminRouteGuard allow={['super_admin', 'admin']}><ServiceBranchEditor /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/inquiries" element={<AdminSuspense><AdminInquiries /></AdminSuspense>} />
        <Route path="/admin/team" element={<AdminSuspense><AdminRouteGuard allow={['super_admin', 'admin']}><AdminTeam /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/settings" element={<AdminSuspense><SiteSettings /></AdminSuspense>} />
        <Route path="/admin/content" element={<AdminSuspense><ContentIndex /></AdminSuspense>} />
        <Route path="/admin/content/:pageKey" element={<AdminSuspense><ContentEditor /></AdminSuspense>} />
        <Route path="/admin/media/icons" element={<AdminSuspense><IconsMedia /></AdminSuspense>} />
      </Route>
    </Routes>
  );
}
