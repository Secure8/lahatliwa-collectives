import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';

export default function Services() {
  const { content } = usePublicContent(['services']);
  const page = content.websitePages?.services || {};
  return <div className="page-shell py-16 sm:py-20">
    <PublicPageHeader eyebrow="Work with us" title={page.title || 'Start with the outcome—not a service category.'} description={page.intro || 'Tell us what you are trying to make, improve, document, promote, solve, or explore. Your message will guide the review.'} />
    <section className="public-panel mt-12 grid gap-8 py-10 lg:grid-cols-[1fr_0.8fr]">
      <div><h2 className="text-3xl font-semibold text-[var(--site-primary-text)]">Your request can be as specific or as open as it needs to be.</h2><p className="mt-5 max-w-2xl text-base leading-8 text-[var(--site-secondary-text)]">You can ask about photography, video, event coverage, social media, content production, websites, digital systems, campaigns, creative collaboration, or something not named here. The message itself—not a predefined category—will guide the review.</p><Link to="/inquiry" className="public-button public-button--primary mt-8">Describe what you need <ArrowRight size={17} /></Link></div>
      <div className="border-l border-[var(--site-accent-border)] pl-6"><p className="public-eyebrow">Useful details</p><ul className="mt-5 grid gap-4 text-sm leading-6 text-[var(--site-secondary-text)]"><li>Your goal or the problem you want to solve</li><li>What you already have and what still needs to be done</li><li>Your preferred date, timeline, or event schedule</li><li>Links, references, location, audience, or other helpful context</li><li>How you would like us to contact you</li></ul></div>
    </section>
  </div>;
}
