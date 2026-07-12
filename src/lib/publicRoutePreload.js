export const loadAbout = () => import('../pages/About');
export const loadProjects = () => import('../pages/Projects');
export const loadProjectDetails = () => import('../pages/ProjectDetails');
export const loadServices = () => import('../pages/Services');
export const loadContact = () => import('../pages/Contact');
export const loadCreatives = () => import('../pages/Creatives');
export const loadCreativeDetails = () => import('../pages/CreativeDetails');
export const loadStartProject = () => import('../pages/StartProject');

const publicRouteLoaders = {
  '/about': loadAbout,
  '/projects': loadProjects,
  '/projects/:slug': loadProjectDetails,
  '/services': loadServices,
  '/contact': loadContact,
  '/creatives': loadCreatives,
  '/creatives/:slug': loadCreativeDetails,
  '/start-a-project': loadStartProject,
};

export function preloadPublicRoute(route) {
  publicRouteLoaders[route]?.();
}
