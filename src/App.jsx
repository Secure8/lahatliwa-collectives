import { Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import About from './pages/About';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';
import Services from './pages/Services';
import Contact from './pages/Contact';
import Creatives from './pages/Creatives';
import CreativeDetails from './pages/CreativeDetails';
import StartProject from './pages/StartProject';
import Login from './pages/admin/Login';
import Dashboard from './pages/admin/Dashboard';
import AdminProjects from './pages/admin/AdminProjects';
import NewProject from './pages/admin/NewProject';
import EditProject from './pages/admin/EditProject';
import SiteSettings from './pages/admin/SiteSettings';
import ContentIndex from './pages/admin/ContentIndex';
import ContentEditor from './pages/admin/ContentEditor';
import IconsMedia from './pages/admin/IconsMedia';
import AdminCreatives from './pages/admin/AdminCreatives';
import AdminInquiries from './pages/admin/AdminInquiries';
import AdminServiceBranches from './pages/admin/AdminServiceBranches';
import AdminTeam from './pages/admin/AdminTeam';
import AdminRouteGuard from './components/admin/AdminRouteGuard';
import { PublicContentProvider, usePublicContent } from './lib/contentApi';

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
      <Route path="/admin/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/projects" element={<AdminProjects />} />
        <Route path="/admin/projects/new" element={<NewProject />} />
        <Route path="/admin/projects/:id/edit" element={<EditProject />} />
        <Route path="/admin/creatives" element={<AdminCreatives />} />
        <Route path="/admin/service-branches" element={<AdminServiceBranches />} />
        <Route path="/admin/inquiries" element={<AdminInquiries />} />
        <Route path="/admin/team" element={<AdminRouteGuard allow={['super_admin', 'admin']}><AdminTeam /></AdminRouteGuard>} />
        <Route path="/admin/settings" element={<SiteSettings />} />
        <Route path="/admin/content" element={<ContentIndex />} />
        <Route path="/admin/content/:pageKey" element={<ContentEditor />} />
        <Route path="/admin/media/icons" element={<IconsMedia />} />
      </Route>
    </Routes>
  );
}
