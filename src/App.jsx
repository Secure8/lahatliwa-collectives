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
import { loadAbout, loadContact, loadCreativeDetails, loadCreatives, loadInquiryConfirmation, loadPrivacy, loadProjectDetails, loadProjects, loadServices, loadStartProject } from './lib/publicRoutePreload';
import NotFound from './pages/NotFound';
import { applyPublicMetadata } from './lib/publicMetadata';
import ThemeToggle from './components/ThemeToggle';
import BrandWordmark from './components/BrandWordmark';
import { publicAppBarMode } from './lib/mobileAppShell';
import MobileBottomNavigation from './components/MobileBottomNavigation';

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
const Privacy = lazy(loadPrivacy);
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
const Storage = lazy(() => import('./pages/admin/Storage'));

const routeMetadata = {
  '/': ['Lahat Liwa Collectives', 'Practical services, published work, credited contributions, and creative profiles across four Liwa branches.'],
  '/about': ['About | Lahat Liwa Collectives', 'Learn how this independently operated platform supports client inquiries, published creative profiles, and clear contributor credit.'],
  '/projects': ['Projects | Lahat Liwa Collectives', 'Explore complete project records, visible outputs, and credited contributions across visual, digital, social, and technical work.'],
  '/services': ['Services | Lahat Liwa Collectives', 'Explore focused support across Liwa Studio, Liwa Digital, Liwa Social, and Liwa Tech.'],
  '/creatives': ['Creatives | Lahat Liwa Collectives', 'Discover published creative profiles, skills, portfolio work, and credited project contributions.'],
  '/start-a-project': ['Send an Inquiry | Lahat Liwa Collectives', 'Share your requirements, context, timeline, and creative preference for review before availability or arrangements are confirmed.'],
  '/inquiry': ['Send an Inquiry | Lahat Liwa Collectives', 'Share your requirements, context, timeline, and creative preference for review before availability or arrangements are confirmed.'],
  '/contact': ['Contact | Lahat Liwa Collectives', 'Start a service inquiry, collaboration conversation, profile or credit question, opportunity, or general platform conversation.'],
  '/privacy': ['Privacy Policy | Lahat Liwa Collectives', 'Learn how Lahat Liwa Collectives collects, uses, stores, and protects information, including data used by the Google Drive integration.'],
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
        ? [`Project | ${brand}`, 'View the complete output and contributor credits for a published project.']
        : isCreative
          ? [`Creative Profile | ${brand}`, 'View a published creative profile, portfolio work, and credited project contributions.']
          : [brand, content.tagline || routeMetadata['/'][1]]);
    const title = pathname === '/' ? brand : configuredTitle;
    applyPublicMetadata({ title, description, pathname, type: isProject || isCreative ? 'article' : 'website' });
  }, [content.displayName, content.tagline, pathname]);

  return null;
}

function PublicSiteFrame() {
  const location = useLocation();
  const { content, loading, resolved, error } = usePublicContent([]);
  const appBarMode = publicAppBarMode(location.pathname);

  useEffect(() => {
    document.documentElement.classList.add('public-mode');
    return () => document.documentElement.classList.remove('public-mode');
  }, []);

  if (!resolved) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="page-shell flex min-h-screen items-center justify-center py-20">
          <div className="w-full max-w-xl">
            <BrandWordmark name={content.displayName} variant="auth" to="/" />
            <div className="mt-8">{loading ? <LoadingState label="Loading site content" /> : <p className="max-w-md text-sm leading-6 text-zinc-400">{error || 'Live site content is temporarily unavailable. Please try again.'}</p>}</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <SiteDocumentMetadata />
      <PublicScrollRestoration />
      <Navbar />
      <main data-public-app-content data-app-bar-mode={appBarMode} className={`public-app-content public-app-content--${appBarMode} min-h-[60vh] overflow-x-hidden`}><PublicErrorBoundary key={publicRouteBoundaryKey(location)}><Suspense fallback={<div className="page-shell py-20"><LoadingState label="Loading page" /></div>}><Outlet /></Suspense></PublicErrorBoundary></main>
      <Footer />
      <MobileBottomNavigation />
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
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-12 text-white"><section className="w-full max-w-lg"><BrandWordmark variant="auth" to="/" /><div className="mt-8"><LoadingState label="Loading admin" /></div></section></main>}>
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <><Routes>
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
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
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
        <Route path="/admin/storage" element={<AdminSuspense><AdminRouteGuard allow={['super_admin', 'creative']}><Storage /></AdminRouteGuard></AdminSuspense>} />
      </Route>
    </Routes><ThemeToggle /></>
  );
}
