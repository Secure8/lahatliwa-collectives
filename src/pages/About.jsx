import { usePublicContent } from '../lib/contentApi';
import PublicPageHeader, { AccentEyebrow } from '../components/PublicPageHeader';

export default function About() {
  const { content } = usePublicContent(['about']);

  return (
    <div className="page-shell py-20">
      <PublicPageHeader eyebrow="About" title={content.about.title} description={content.about.intro} accentColor={content.about.accentColor || content.accentColor} titleColor={content.about.headingColor || content.primaryTextColor} bodyColor={content.about.bodyTextColor || content.secondaryTextColor} />

      <section className="grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}>Purpose</AccentEyebrow>
          <h2 className="mt-4 text-2xl font-medium">Why it was built</h2>
        </div>
        <p className="max-w-4xl border-l border-white/[0.09] pl-5 text-lg leading-8 sm:pl-7" style={{ color: 'var(--site-secondary-text)' }}>{content.about.journey}</p>
      </section>

      <section className="grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}>What you can find</AccentEyebrow>
          <h2 className="mt-4 text-2xl font-medium">One connected record of the work</h2>
        </div>
        <div className="grid gap-5 border-l border-[var(--site-divider)] pl-5 sm:grid-cols-2 sm:pl-7">
          <div className="public-card p-5"><h3 className="text-lg font-medium">Current work</h3><p className="mt-3 text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>Follow active client projects, content production, event coverage, and milestones while the work is developing.</p></div>
          <div className="public-card p-5"><h3 className="text-lg font-medium">Completed portfolio</h3><p className="mt-3 text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>Explore finished projects, their outcomes, and the contributors credited for their roles.</p></div>
          <div className="public-card p-5"><h3 className="text-lg font-medium">Creative profiles</h3><p className="mt-3 text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>Meet published creatives and collaborators through their skills, selected work, and contribution history.</p></div>
          <div className="public-card p-5"><h3 className="text-lg font-medium">Open inquiries</h3><p className="mt-3 text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>Describe a project, idea, collaboration, or opportunity in your own words without choosing from a fixed service menu.</p></div>
        </div>
      </section>

      <section className="grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}>Collaboration</AccentEyebrow>
          <h2 className="mt-4 text-2xl font-medium">Clear credit, honest relationships</h2>
        </div>
        <div className="max-w-4xl border-l border-white/[0.09] pl-5 sm:pl-7">
          <p className="text-lg leading-8" style={{ color: 'var(--site-secondary-text)' }}>{content.displayName} publishes its own work and gives collaborators clear, visible credit for the projects they help create.</p>
          <p className="mt-5 text-sm leading-7" style={{ color: 'var(--site-muted-text)' }}>A published profile or project credit records a contribution. It does not automatically mean employment, permanent membership, endorsement, or guaranteed availability for future work.</p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <AccentEyebrow color={content.about.accentColor || content.accentColor}>Direction</AccentEyebrow>
        <h2 className="mt-4 max-w-3xl text-3xl font-medium leading-tight">Built from Aklan, open to ideas, work, and connections beyond it.</h2>
        <p className="mt-5 max-w-3xl text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>Lahat Liwa is rooted in Aklan and open to relevant work, events, collaborations, and connections beyond it. The focus remains the same: useful creative work, transparent progress, and clear credit.</p>
      </section>
    </div>
  );
}
