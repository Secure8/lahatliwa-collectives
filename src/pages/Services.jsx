import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';

export default function Services() {
  const { content } = usePublicContent(['services']);
  const page = content.websitePages?.inquiries || {};
  const details = String(page.servicesDetails || 'Your goal or the problem you want to solve\nWhat you already have and what still needs to be done\nYour preferred date, timeline, or event schedule\nLinks, references, location, audience, or other helpful context\nHow you would like us to contact you').split('\n').map((item) => item.trim()).filter(Boolean);
  return <div className="page-shell py-16 sm:py-20">
    <PublicPageHeader eyebrow={page.servicesEyebrow || 'Work with us'} title={page.servicesTitle || 'Start with the outcome—not a service category.'} description={page.servicesIntro || 'Tell us what you are trying to make, improve, document, promote, solve, or explore. Your message will guide the review.'} />
    <section className="public-panel mt-12 grid gap-8 py-10 lg:grid-cols-[1fr_0.8fr]">
      <div><h2 className="text-3xl font-semibold text-[var(--site-primary-text)]">{page.servicesBodyTitle || 'Your request can be as specific or as open as it needs to be.'}</h2><p className="mt-5 max-w-2xl text-base leading-8 text-[var(--site-secondary-text)]">{page.servicesBody || 'You can ask about photography, video, event coverage, social media, content production, websites, digital systems, campaigns, creative collaboration, or something not named here. The message itself—not a predefined category—will guide the review.'}</p><Link to="/inquiry" className="public-button public-button--primary mt-8">{page.servicesCta || 'Describe what you need'} <ArrowRight size={17} /></Link></div>
      <div className="border-l border-[var(--site-accent-border)] pl-6"><p className="public-eyebrow">{page.servicesDetailsTitle || 'Useful details'}</p><ul className="mt-5 grid gap-4 text-sm leading-6 text-[var(--site-secondary-text)]">{details.map((item) => <li key={item}>{item}</li>)}</ul></div>
    </section>
  </div>;
}
