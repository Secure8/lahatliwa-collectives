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

      <section className="major-border-top grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}>How it works</AccentEyebrow>
          <h2 className="mt-4 text-2xl font-medium">Clear paths for both audiences</h2>
        </div>
        <div className="grid gap-8 border-l border-white/[0.09] pl-5 sm:grid-cols-2 sm:pl-7">
          <div><h3 className="text-lg font-medium">For clients</h3><p className="mt-3 text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>Explore four service branches, review published work, and send a guided inquiry with the context needed for a practical first review.</p></div>
          <div><h3 className="text-lg font-medium">For creatives</h3><p className="mt-3 text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>Selected creatives can publish profiles, portfolio work, and credited contributions so their roles remain visible and easier to discover.</p></div>
        </div>
      </section>

      <section className="major-border-top grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}>Relationship</AccentEyebrow>
          <h2 className="mt-4 text-2xl font-medium">Publication with clear credit</h2>
        </div>
        <div className="max-w-4xl border-l border-white/[0.09] pl-5 sm:pl-7">
          <p className="text-lg leading-8" style={{ color: 'var(--site-secondary-text)' }}>{content.displayName} is independently operated while providing selected creatives with space to publish profiles, projects, and credited contributions.</p>
          <p className="mt-5 text-sm leading-7" style={{ color: 'var(--site-muted-text)' }}>Being published on the platform does not automatically mean being employed by or permanently affiliated with the brand. Availability and involvement can vary by inquiry and project.</p>
        </div>
      </section>

      <section className="major-border-top py-12 md:py-16">
        <AccentEyebrow color={content.about.accentColor || content.accentColor}>Direction</AccentEyebrow>
        <h2 className="mt-4 max-w-3xl text-3xl font-medium leading-tight">Built from Aklan, open to ideas, work, and connections beyond it.</h2>
        <p className="mt-5 max-w-3xl text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>The platform will continue to grow through useful work, thoughtful collaboration, clearer creative records, and opportunities that make sense for the people involved.</p>
      </section>
    </div>
  );
}
