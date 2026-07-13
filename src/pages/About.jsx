import { usePublicContent } from '../lib/contentApi';
import PublicPageHeader, { AccentEyebrow } from '../components/PublicPageHeader';

export default function About() {
  const { content } = usePublicContent(['about']);

  return (
    <div className="page-shell py-20">
      <PublicPageHeader eyebrow="About" title={content.about.title} description={content.about.intro} accentColor={content.about.accentColor || content.accentColor} titleColor={content.about.headingColor || content.primaryTextColor} bodyColor={content.about.bodyTextColor || content.secondaryTextColor} />

      <section className="grid gap-8 py-12 md:grid-cols-[0.38fr_1fr] md:py-16">
        <div>
          <AccentEyebrow color={content.about.accentColor || content.accentColor}>01 / Story</AccentEyebrow>
          <h2 className="mt-4 text-2xl font-medium">Creative Journey</h2>
        </div>
        <p className="max-w-4xl border-l border-white/[0.09] pl-5 text-lg leading-8 sm:pl-7" style={{ color: content.about.bodyTextColor || content.secondaryTextColor }}>{content.about.journey}</p>
      </section>
    </div>
  );
}
