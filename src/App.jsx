import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingState from './components/LoadingState';
import Home from './pages/Home';
import AdminRouteGuard from './components/admin/AdminRouteGuard';
import CreativeRouteGuard from './components/CreativeRouteGuard';
import { PublicContentProvider, usePublicContent } from './lib/contentApi';
import PublicScrollRestoration from './components/PublicScrollRestoration';
import PublicErrorBoundary from './components/PublicErrorBoundary';
import { publicRouteBoundaryKey } from './lib/navigationHistory';
import { loadCreativeDetails, loadCreatives, loadInquiryConfirmation, loadPrivacy, loadProjectDetails, loadStartProject } from './lib/publicRoutePreload';
import NotFound from './pages/NotFound';
import { applyPublicMetadata } from './lib/publicMetadata';
import { publicAppBarMode } from './lib/mobileAppShell';
import PublicAdminToolbar from './components/PublicAdminToolbar';

const Login = lazy(() => import('./pages/admin/Login'));
const JoinCreative = lazy(() => import('./pages/JoinCreative'));
const SetPassword = lazy(() => import('./pages/SetPassword'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ProjectDetails = lazy(loadProjectDetails);
const Creatives = lazy(loadCreatives);
const CreativeDetails = lazy(loadCreativeDetails);
const StartProject = lazy(loadStartProject);
const InquiryConfirmation = lazy(loadInquiryConfirmation);
const Privacy = lazy(loadPrivacy);
const AdminProjects = lazy(() => import('./pages/admin/AdminProjects'));
const AdminFeaturedWork = lazy(() => import('./pages/admin/AdminFeaturedWork'));
const NewProject = lazy(() => import('./pages/admin/NewProject'));
const EditProject = lazy(() => import('./pages/admin/EditProject'));
const AdminInquiries = lazy(() => import('./pages/admin/AdminInquiries'));
const CreativeJoinRequests = lazy(() => import('./pages/admin/CreativeJoinRequests'));
const WebsiteStudio = lazy(() => import('./pages/admin/WebsiteStudio'));
const CreativePostDetails = lazy(() => import('./pages/CreativePostDetails'));
const CreativePostEditor = lazy(() => import('./pages/CreativePostEditor'));
const AccountRedirect = lazy(() => import('./components/AccountRedirect'));
const AdminPostModeration = lazy(() => import('./pages/admin/AdminPostModeration'));
const AdminTaxonomy = lazy(() => import('./pages/admin/AdminTaxonomy'));
const CreativeNotifications = lazy(() => import('./pages/CreativeNotifications'));
const Discover = lazy(() => import('./pages/Discover'));
const PlatformTools = lazy(() => import('./pages/admin/PlatformTools'));

function LegacyWebsiteEditorRedirect() {
  const { pageKey = '' } = useParams();
  const section = { home: 'page.home', about: 'page.about', services: 'page.services', contact: 'page.inquiries' }[pageKey] || 'overview';
  return <Navigate to={`/admin/website${section === 'overview' ? '' : `?section=${section}`}`} replace />;
}

const routeMetadata = {
  '/': ['Selected Work | Lahat Liwa Collectives', 'Discover curated photography, film, design, writing, and digital work by Creatives across Aklan.'],
  '/creatives': ['Creatives | Lahat Liwa Collectives', 'Discover published creative profiles, skills, portfolio work, and credited project contributions.'],
  '/discover': ['Discover Creative Work | Lahat Liwa Collectives', 'Browse curated Creative work from Aklan by discipline, specialty, industry, and keyword.'],
  '/start-a-project': ['Send an Inquiry | Lahat Liwa Collectives', 'Share your requirements, context, timeline, and creative preference for review before availability or arrangements are confirmed.'],
  '/inquiry': ['Send an Inquiry | Lahat Liwa Collectives', 'Share your requirements, context, timeline, and creative preference for review before availability or arrangements are confirmed.'],
  '/privacy': ['Privacy Policy | Lahat Liwa Collectives', 'Learn how Lahat Liwa Collectives collects, uses, stores, and protects information.'],
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
    const title = configuredTitle.replaceAll('Lahat Liwa Collectives', brand);
    applyPublicMetadata({ title, description: description.replaceAll('Lahat Liwa Collectives', brand), pathname, type: isProject || isCreative ? 'article' : 'website', image: content.websitePages?.search?.openGraphImageUrl });
  }, [content.displayName, content.tagline, pathname]);

  return null;
}

function PublicSiteFrame() {
  const location = useLocation();
  const { content, loading, error } = usePublicContent([]);
  const appBarMode = publicAppBarMode(location.pathname);

  useEffect(() => {
    document.documentElement.classList.add('public-mode');
    return () => document.documentElement.classList.remove('public-mode');
  }, []);

  return (
    <>
      <SiteDocumentMetadata />
      <PublicScrollRestoration />
      <a href="#public-main-content" className="skip-link">Skip to main content</a>
      <Navbar />
      <PublicAdminToolbar />
      {loading && <p className="sr-only" role="status">Refreshing website content</p>}
      {error && <p className="sr-only" role="alert">{error}</p>}
      <main id="public-main-content" tabIndex={-1} data-public-app-content data-app-bar-mode={appBarMode} className={`public-app-content public-app-content--${appBarMode} min-h-[60vh] overflow-x-hidden`}><PublicErrorBoundary key={publicRouteBoundaryKey(location)}><Suspense fallback={<div className="page-shell py-20"><LoadingState label="Loading page" /></div>}><Outlet /></Suspense></PublicErrorBoundary></main>
      <Footer />
    </>
  );
}

function PublicLayout() {
  const location = useLocation();
  const { pathname } = location;
  const contentArea = pathname === '/' ? 'home' : pathname === '/creatives' ? 'creatives' : 'shared';
  const pageKeys = useMemo(() => contentArea === 'home' ? ['home', 'services'] : contentArea === 'creatives' ? ['home'] : contentArea === 'shared' ? [] : [contentArea], [contentArea]);
  return (
    <PublicContentProvider pageKeys={pageKeys}>
      <PublicSiteFrame />
    </PublicContentProvider>
  );
}

function AdminSuspense({ children }) {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-zinc-950 text-white"><LoadingState label="Loading admin" /></main>}>
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <><Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="/about" element={<Navigate to="/" replace />} />
        <Route path="/projects" element={<Navigate to="/" replace />} />
        <Route path="/projects/:slug" element={<ProjectDetails />} />
        <Route path="/work" element={<Navigate to="/" replace />} />
        <Route path="/services" element={<Navigate to="/inquiry" replace />} />
        <Route path="/creatives" element={<Creatives />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/creatives/:slug" element={<CreativeDetails />} />
        <Route path="/posts/:slug" element={<CreativePostDetails />} />
        <Route path="/work/:slug" element={<CreativePostDetails />} />
        <Route path="/notifications" element={<CreativeRouteGuard><CreativeNotifications /></CreativeRouteGuard>} />
        <Route path="/start-a-project" element={<StartProject />} />
        <Route path="/inquiry" element={<StartProject />} />
        <Route path="/inquiry/confirmation/:reference" element={<InquiryConfirmation />} />
        <Route path="/contact" element={<Navigate to="/inquiry?kind=platform" replace />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/explore" element={<Navigate to="/discover" replace />} />
        {['/journal','/journal/:slug','/events','/events/:slug','/places','/places/:slug','/activities','/activities/:slug','/local-products','/local-products/:slug'].map((path) => <Route key={path} path={path} element={<Navigate to="/" replace />} />)}
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/set-password" element={<AdminSuspense><SetPassword /></AdminSuspense>} />
      <Route path="/forgot-password" element={<AdminSuspense><ForgotPassword /></AdminSuspense>} />
      <Route path="/admin/login" element={<AdminSuspense><Login /></AdminSuspense>} />
      <Route path="/join" element={<AdminSuspense><JoinCreative /></AdminSuspense>} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/account" element={<AdminSuspense><AccountRedirect /></AdminSuspense>} />
        <Route path="/create" element={<CreativeRouteGuard><CreativePostEditor create /></CreativeRouteGuard>} />
        <Route path="/posts/:id/edit" element={<CreativeRouteGuard><CreativePostEditor /></CreativeRouteGuard>} />
        <Route path="/admin/dashboard" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><PlatformTools /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/my-profile" element={<Navigate to="/account" replace />} />
        <Route path="/admin/directory" element={<Navigate to="/creatives" replace />} />
        <Route path="/admin/projects" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><AdminProjects /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/featured" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><AdminFeaturedWork /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/projects/new" element={<AdminSuspense><AdminRouteGuard allow={['creative']}><NewProject /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/projects/:id/edit" element={<AdminSuspense><AdminRouteGuard allow={['creative']}><EditProject /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/creatives" element={<Navigate to="/creatives" replace />} />
        <Route path="/admin/creatives/new" element={<Navigate to="/admin/team" replace />} />
        <Route path="/admin/creatives/:id/edit" element={<Navigate to="/creatives" replace />} />
        <Route path="/admin/website" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><WebsiteStudio /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/inquiries" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><AdminInquiries /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/moderation" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><AdminPostModeration /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/taxonomy" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><AdminTaxonomy /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/team" element={<AdminSuspense><AdminRouteGuard allow={['super_admin']}><CreativeJoinRequests /></AdminRouteGuard></AdminSuspense>} />
        <Route path="/admin/settings" element={<Navigate to="/admin/website?section=global.appearance" replace />} />
        <Route path="/admin/content" element={<Navigate to="/admin/website" replace />} />
        <Route path="/admin/content/:pageKey" element={<LegacyWebsiteEditorRedirect />} />
      </Route>
    </Routes></>
  );
}
