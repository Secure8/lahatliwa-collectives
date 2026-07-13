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
import { loadAbout, loadContact, loadCreativeDetails, loadCreatives, loadInquiryConfirmation, loadProjectDetails, loadProjects, loadServices, loadStartProject } from './lib/publicRoutePreload';
import { applyPublicMetadata } from './lib/publicMetadata';

const Login = lazy(() => import('./pages/admin/Login'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const About = lazy(loadAbout);
const Projects = lazy(loadProjects);
const ProjectDetails = lazy(loadProjectDetails);
const Services = lazy(loadServices);
const Contact = lazy(loadContact);
const Creatives = lazy(loadCreatives);
const CreativeDetails = lazy(loadCreativeDetails);
const StartProject = lazy(loadStartProject);
const InquiryConfirmation = lazy(loadInquiryConfirmation);
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

const routeMetadata = {
  '/': ['Lahat Liwa Collectives', 'A creative digital collective building visuals, stories, and useful digital experiences.'],
  '/about': ['About | Lahat Liwa Collectives', 'Meet Lahat Liwa Collectives and learn how its creative and digital branches work together.'],
  '/projects': ['Projects | Lahat Liwa Collectives', 'Explore published photography, video, design, website, application, and digital projects.'],
  '/services': ['Services | Lahat Liwa Collectives', 'Explore flexible creative, social-media, digital, and technical service categories from Lahat Liwa Collectives.'],
  '/creatives': ['Creatives | Lahat Liwa Collectives', 'Meet the creatives shaping the work of Lahat Liwa Collectives.'],
  '/start-a-project': ['Start a Project | Lahat Liwa Collectives', 'Describe your requirements, goals, timeline, and preferred support for review by Lahat Liwa Collectives.'],
  '/inquiry': ['Send an Inquiry | Lahat Liwa Collectives', 'Describe your requirements, goals, timeline, and preferred support for review by Lahat Liwa Collectives.'],
  '/contact': ['Contact | Lahat Liwa Collectives', 'Contact Lahat Liwa Collectives about creative, digital, social-media, technical, or collaborative work.'],
};

function SiteDocumentMetadata() {
  const { content } = usePublicContent([]);
  const { pathname } = useLocation();

  useEffect(() => {
    const brand = content.displayName || 'Lahat Liwa Collectives';
    const isProject = pathname.startsWith('/projects/');
    const isCreative = pathname.startsWith('/creatives/');
    const [configuredTitle, description] = routeMetadata[pathname]
      || (isProject
        ? [`Project | ${brand}`, 'View a published project from Lahat Liwa Collectives.']
        : isCreative
          ? [`Creative Profile | ${brand}`, 'View a published creative profile from Lahat Liwa Collectives.']
          : [brand, content.tagline || routeMetadata['/'][1]]);
    const title = pathname === '/' ? brand : configuredTitle;
    applyPublicMetadata({ title, description, pathname, type: isProject || isCreative ? 'article' : 'website' });
  }, [content.displayName, content.tagline, pathname]);

  return null;
}

function PublicSiteFrame() {
  const location = useLocation();
  const { loading, resolved, error } = usePublicContent([]);

  if (!resolved) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="page-shell flex min-h-screen items-center justify-center py-20">
          {loading ? <LoadingState label="Loading site content" /> : <p className="max-w-md text-center text-sm leading-6 text-zinc-400">{error || 'Live site content is temporarily unavailable. Please try again.'}</p>}
        </div>
      </main>
    );
  }

  return (
    <>
      <SiteDocumentMetadata />
      <PublicScrollRestoration />
      <Navbar />
      <main className="min-h-[60vh] overflow-x-hidden"><PublicErrorBoundary key={publicRouteBoundaryKey(location)}><Suspense fallback={<div className="page-shell py-20"><LoadingState label="Loading page" /></div>}><Outlet /></Suspense></PublicErrorBoundary></main>
      <Footer />
    </>
  );
}

function PublicLayout() {
  const location = useLocation();
  const { pathname } = location;
  const contentArea = pathname === '/' ? 'home' : pathname === '/about' ? 'about' : pathname.startsWith('/services') ? 'services' : pathname === '/contact' ? 'contact' : 'shared';
  const pageKeys = useMemo(() => contentArea === 'home' ? ['home', 'services'] : contentArea === 'shared' ? [] : [contentArea], [contentArea]);
  return (
    <PublicContentProvider pageKeys={pageKeys}>
      <PublicSiteFrame />
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
        <Route path="/services/:branch" element={<Services />} />
        <Route path="/creatives" element={<Creatives />} />
        <Route path="/creatives/:slug" element={<CreativeDetails />} />
        <Route path="/start-a-project" element={<StartProject />} />
        <Route path="/inquiry" element={<StartProject />} />
        <Route path="/inquiry/confirmation/:reference" element={<InquiryConfirmation />} />
        <Route path="/contact" element={<Contact />} />
      </Route>
      <Route path="/set-password" element={<AdminSuspense><SetPassword /></AdminSuspense>} />
      <Route path="/forgot-password" element={<AdminSuspense><ForgotPassword /></AdminSuspense>} />
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
