const productionOrigin = 'https://www.lahatliwa.studio';
const defaultSocialImage = `${productionOrigin}/social-card.jpg`;

function updateMeta(selector, attribute, value) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute(attribute, value);
}

export function applyPublicMetadata({ title, description, pathname, type = 'website', image = defaultSocialImage }) {
  const canonicalUrl = new URL(pathname, productionOrigin).toString();
  document.title = title;
  updateMeta('meta[name="description"]', 'content', description);
  updateMeta('meta[property="og:title"]', 'content', title);
  updateMeta('meta[property="og:description"]', 'content', description);
  updateMeta('meta[property="og:url"]', 'content', canonicalUrl);
  updateMeta('meta[property="og:type"]', 'content', type);
  updateMeta('meta[property="og:image"]', 'content', image || defaultSocialImage);
  updateMeta('meta[name="twitter:title"]', 'content', title);
  updateMeta('meta[name="twitter:description"]', 'content', description);
  updateMeta('meta[name="twitter:image"]', 'content', image || defaultSocialImage);
  updateMeta('link[rel="canonical"]', 'href', canonicalUrl);
}
