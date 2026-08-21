import { usePublicContent } from '../lib/contentApi';
import PublicPageHeader, { AccentEyebrow } from '../components/PublicPageHeader';
import InlineWebsiteText from '../components/InlineWebsiteText';

export default function About() {
  const { content } = usePublicContent(['about']);
  const page = content.websitePages?.about || content.about || {};

  return (
    <div className="page-shell py-20">
      <PublicPageHeader eyebrow={page.eyebrow || 'About'} title={page.title || content.about.title} description={page.intro || content.about.intro} accentColor={content.about.accentColor || content.accentColor} titleColor={content.about.headingColor || content.primaryTextColor} bodyColor={content.about.bodyTextColor || content.secondaryTextColor} edit={{ section: 'page.about', eyebrowField: 'eyebrow', titleField: 'title', descriptionField: 'intro' }} />

      <section className="grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}><InlineWebsiteText section="page.about" field="purposeEyebrow" value={page.purposeEyebrow || 'Purpose'} label="Edit purpose eyebrow" /></AccentEyebrow>
          <InlineWebsiteText as="h2" className="mt-4 text-2xl font-medium" section="page.about" field="purposeTitle" value={page.purposeTitle || 'Why it was built'} label="Edit purpose heading" />
        </div>
        <InlineWebsiteText as="p" className="max-w-4xl border-l border-white/[0.09] pl-5 text-lg leading-8 sm:pl-7" style={{ color: 'var(--site-secondary-text)' }} section="page.about" field="journey" type="textarea" value={page.journey || content.about.journey} label="Edit purpose description" />
      </section>

      <section className="grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}><InlineWebsiteText section="page.about" field="findEyebrow" value={page.findEyebrow || 'What you can find'} label="Edit overview eyebrow" /></AccentEyebrow>
          <InlineWebsiteText as="h2" className="mt-4 text-2xl font-medium" section="page.about" field="findTitle" value={page.findTitle || 'One connected record of the work'} label="Edit overview heading" />
        </div>
        <div className="grid gap-5 border-l border-[var(--site-divider)] pl-5 sm:grid-cols-2 sm:pl-7">
          <AboutCard page={page} titleKey="workTitle" descriptionKey="workDescription" title="Current work" description="Follow active client projects, content production, event coverage, and milestones while the work is developing." />
          <AboutCard page={page} titleKey="portfolioTitle" descriptionKey="portfolioDescription" title="Completed portfolio" description="Explore finished projects, their outcomes, and the contributors credited for their roles." />
          <AboutCard page={page} titleKey="creativesTitle" descriptionKey="creativesDescription" title="Creative profiles" description="Meet published creatives and collaborators through their skills, selected work, and contribution history." />
          <AboutCard page={page} titleKey="inquiriesTitle" descriptionKey="inquiriesDescription" title="Open inquiries" description="Describe a project, idea, collaboration, or opportunity in your own words without choosing from a fixed service menu." />
        </div>
      </section>

      <section className="grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}><InlineWebsiteText section="page.about" field="collaborationEyebrow" value={page.collaborationEyebrow || 'Collaboration'} label="Edit collaboration eyebrow" /></AccentEyebrow>
          <InlineWebsiteText as="h2" className="mt-4 text-2xl font-medium" section="page.about" field="collaborationTitle" value={page.collaborationTitle || 'Clear credit, honest relationships'} label="Edit collaboration heading" />
        </div>
        <div className="max-w-4xl border-l border-white/[0.09] pl-5 sm:pl-7">
          <InlineWebsiteText as="p" className="text-lg leading-8" style={{ color: 'var(--site-secondary-text)' }} section="page.about" field="collaborationDescription" type="textarea" value={page.collaborationDescription || `${content.displayName} publishes its own work and gives collaborators clear, visible credit for the projects they help create.`} label="Edit collaboration description" />
          <InlineWebsiteText as="p" className="mt-5 text-sm leading-7" style={{ color: 'var(--site-muted-text)' }} section="page.about" field="collaborationNote" type="textarea" value={page.collaborationNote || 'A published profile or project credit records a contribution. It does not automatically mean employment, permanent membership, endorsement, or guaranteed availability for future work.'} label="Edit collaboration note" />
        </div>
      </section>

      <section className="py-12 md:py-16">
        <AccentEyebrow color={content.about.accentColor || content.accentColor}><InlineWebsiteText section="page.about" field="directionEyebrow" value={page.directionEyebrow || 'Direction'} label="Edit direction eyebrow" /></AccentEyebrow>
        <InlineWebsiteText as="h2" className="mt-4 max-w-3xl text-3xl font-medium leading-tight" section="page.about" field="directionTitle" value={page.directionTitle || 'Built from Aklan, open to ideas, work, and connections beyond it.'} label="Edit direction heading" />
        <InlineWebsiteText as="p" className="mt-5 max-w-3xl text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }} section="page.about" field="directionDescription" type="textarea" value={page.directionDescription || `${content.displayName} is rooted in Aklan and open to relevant work, events, collaborations, and connections beyond it. The focus remains the same: useful creative work, transparent progress, and clear credit.`} label="Edit direction description" />
      </section>
    </div>
  );
}

function AboutCard({ page, titleKey, descriptionKey, title, description }) {
  return <div className="public-card p-5"><InlineWebsiteText as="h3" className="text-lg font-medium" section="page.about" field={titleKey} value={page[titleKey] || title} label={`Edit ${title} heading`} /><InlineWebsiteText as="p" className="mt-3 text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }} section="page.about" field={descriptionKey} type="textarea" value={page[descriptionKey] || description} label={`Edit ${title} description`} /></div>;
}
