import { ArrowRight, Facebook, Github, Globe, Instagram, Linkedin, Mail, Music2, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePublicContent } from '../lib/contentApi';
import PublicPageHeader from '../components/PublicPageHeader';
import InlineWebsiteText from '../components/InlineWebsiteText';

const socialIconMap = {
  Facebook,
  GitHub: Github,
  Instagram,
  LinkedIn: Linkedin,
  TikTok: Music2,
  YouTube: Youtube,
};

export default function Contact() {
  const { content } = usePublicContent(['contact']);
  const socialLinks = content.socialLinks || [];
  const page = content.websitePages?.inquiries || content.contactPage || {};
  const hasEmail = Boolean(content.email);
  const hasLinks = hasEmail || socialLinks.length > 0;

  return (
    <div className="page-shell py-20">
      <PublicPageHeader eyebrow={page.eyebrow || 'Contact'} title={page.heading || content.contactPage.heading} description={page.description || content.contactPage.description} accentColor={content.contactPage.accentColor || content.accentColor} titleColor={content.contactPage.headingColor || content.primaryTextColor} bodyColor={content.contactPage.bodyTextColor || content.secondaryTextColor} edit={{ section: 'page.inquiries', eyebrowField: 'eyebrow', titleField: 'heading', descriptionField: 'description' }} />
      <section className="grid gap-12 pt-10 lg:grid-cols-[1fr_0.72fr] lg:pt-12">
        <div>
          <InlineWebsiteText as="p" className="max-w-lg text-sm leading-7 text-[var(--site-secondary-text)]" section="page.inquiries" field="contactIntro" type="textarea" value={page.contactIntro || 'Contact the people behind Lahat Liwa about the platform, profile or credit questions, partnerships, or general concerns. To hire a Creative, open that Creative’s profile instead.'} label="Edit contact introduction" />
          <div className="mt-7 flex flex-wrap gap-4"><Link to="/inquiry?kind=platform" className="public-button public-button--primary">Message Lahat Liwa <ArrowRight size={17} /></Link>{hasEmail && <a href={`mailto:${content.email}`} className="public-button public-button--secondary"><Mail size={17} /> {page.ctaText || content.contactPage.ctaText}</a>}</div>
          {content.contactPage.notes && <p className="mt-5 max-w-xl text-sm leading-6 text-zinc-500">{content.contactPage.notes}</p>}
        </div>
        {hasLinks && <div className="py-6">
          <h2 className="text-xl font-medium">Direct links</h2>
          <div className="mt-6 grid gap-4">
            {hasEmail && <a href={`mailto:${content.email}`} className="site-hover-accent group inline-flex min-h-11 items-center gap-3 pb-4 text-zinc-200 transition"><span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-black/20 transition group-hover:border-orange-300/35 group-hover:shadow-[0_0_16px_rgba(251,146,60,0.22)]"><Mail size={17} /></span> {content.email}</a>}
            {socialLinks.map((link) => {
              const Icon = socialIconMap[link.label] || Globe;
              return (
                <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noopener noreferrer" className="site-hover-accent group inline-flex min-h-11 items-center gap-3 pb-4 text-zinc-200 transition">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-black/20 transition group-hover:border-orange-300/35 group-hover:shadow-[0_0_16px_rgba(251,146,60,0.22)]"><Icon size={17} /></span> {link.label}
                </a>
              );
            })}
          </div>
        </div>}
      </section>
    </div>
  );
}
