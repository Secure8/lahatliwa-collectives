export const loadProjectDetails = () => import('../pages/ProjectDetails');
export const loadContact = () => import('../pages/Contact');
export const loadCreatives = () => import('../pages/Creatives');
export const loadCreativeDetails = () => import('../pages/CreativeDetails');
export const loadStartProject = () => import('../pages/StartProject');
export const loadInquiryConfirmation = () => import('../pages/InquiryConfirmation');
export const loadPrivacy = () => import('../pages/Privacy');
export const loadDiscover = () => import('../pages/Discover');

const publicRouteLoaders = {
  '/projects/:slug': loadProjectDetails,
  '/contact': loadContact,
  '/creatives': loadCreatives,
  '/creatives/:slug': loadCreativeDetails,
  '/start-a-project': loadStartProject,
  '/inquiry': loadStartProject,
  '/inquiry/confirmation/:reference': loadInquiryConfirmation,
  '/privacy': loadPrivacy,
  '/discover': loadDiscover,
};

export function preloadPublicRoute(route) {
  publicRouteLoaders[route]?.();
}
