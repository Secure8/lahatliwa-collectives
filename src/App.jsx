import { Route, Routes } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingState from './components/LoadingState';
import Home from './pages/Home';
import About from './pages/About';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';
import Services from './pages/Services';
import Contact from './pages/Contact';
import Creatives from './pages/Creatives';
import CreativeDetails from './pages/CreativeDetails';
import StartProject from './pages/StartProject';
import AdminRouteGuard from './components/admin/AdminRouteGuard';
import { PublicContentProvider, usePublicContent } from './lib/contentApi';

const Login = lazy(() => import('./pages/admin/Login'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProjects = lazy(() => import('./pages/admin/AdminProjects'));
const NewProject = lazy(() => import('./pages/admin/NewProject'));
const EditProject = lazy(() => import('./pages/admin/EditProject'));
const SiteSettings = lazy(() => import('./pages/admin/SiteSettings'));
const ContentIndex = lazy(() => import('./pages/admin/ContentIndex'));
const ContentEditor = lazy(() => import('./pages/admin/ContentEditor'));
const IconsMedia = lazy(() => import('./pages/admin/IconsMedia'));
const AdminCreatives = lazy(() => import('./pages/admin/AdminCreatives'));
const AdminInquiries = lazy(() => import('./pages/admin/AdminInquiries'));
const AdminServiceBranches = lazy(() => import('./pages/admin/AdminServiceBranches'));
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

function PublicLayout({ children }) {
  return (
    <PublicContentProvider>
      <SiteDocumentTitle />
      <Navbar />
      <main className="overflow-x-hidden">{children}</main>
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
      <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
      <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
      <Route path="/projects" element={<PublicLayout><Projects /></PublicLayout>} />
      <Route path="/projects/:slug" element={<PublicLayout><ProjectDetails /></PublicLayout>} />
      <Route path="/services" element={<PublicLayout><Services /></PublicLayout>} />
      <Route path="/creatives" element={<PublicLayout><Creatives /></PublicLayout>} />
      <Route path="/creatives/:slug" element={<PublicLayout><CreativeDetails /></PublicLayout>} />
      <Route path="/start-a-project" element={<PublicLayout><StartProject /></PublicLayout>} />
      <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
      <Route path="/admin/login" element={<AdminSuspense><Login /></AdminSuspense>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/admin/dashboard" element={<AdminSuspense><Dashboard /></AdminSuspense>} />
        <Route path="/admin/my-profile" element={<AdminSuspense><MyProfile /></AdminSuspense>} />
        <Route path="/admin/directory" element={<AdminSuspense><CreativeDirectory /></AdminSuspense>} />
        <Route path="/admin/projects" element={<AdminSuspense><AdminProjects /></AdminSuspense>} />
        <Route path="/admin/projects/new" element={<AdminSuspense><NewProject /></AdminSuspense>} />
        <Route path="/admin/projects/:id/edit" element={<AdminSuspense><EditProject /></AdminSuspense>} />
        <Route path="/admin/creatives" element={<AdminSuspense><AdminCreatives /></AdminSuspense>} />
        <Route path="/admin/service-branches" element={<AdminSuspense><AdminServiceBranches /></AdminSuspense>} />
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
