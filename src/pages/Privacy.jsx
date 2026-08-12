import PublicPageHeader, { AccentEyebrow } from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';

const policySections = [
  {
    title: 'Information we collect',
    content: (
      <>
        <p>Depending on how you use the site, we may collect contact and inquiry details, Team account information, project and profile content, and technical information needed to operate, secure, and troubleshoot the service.</p>
        <p>For uploaded website media, we store the file and the limited metadata needed to publish, replace, and remove it safely.</p>
      </>
    ),
  },
  {
    title: 'Public website media',
    content: (
      <>
        <p>Images selected for publication may be resized and converted into website-ready copies. New website media is stored and delivered through Cloudflare R2.</p>
        <p>Some previously published images may continue to use their existing Supabase URLs while they are safely migrated. Public media URLs are intended to be accessible without signing in, and private storage credentials are never included in public website records.</p>
      </>
    ),
  },
  {
    title: 'How we use information',
    content: (
      <>
        <p>We use collected information only to provide and maintain the site, authenticate and support Team members, respond to inquiries, publish approved profiles and projects, protect the service, and meet applicable legal obligations.</p>
        <p>We do not sell personal information or use it for advertising, credit decisions, or to train general-purpose artificial intelligence or machine-learning models.</p>
      </>
    ),
  },
  {
    title: 'Sharing and service providers',
    content: (
      <>
        <p>We may share information with service providers that help us host, secure, and operate Lahat Liwa, including Cloudflare for public website media delivery and Supabase for authentication, database, and server functions. These providers process information under their own terms and privacy commitments.</p>
        <p>We may also disclose information when required by law, to protect rights and safety, or as part of an organizational transaction with appropriate safeguards. We do not transfer personal information to data brokers, advertising platforms, or information resellers.</p>
      </>
    ),
  },
  {
    title: 'Retention and deletion',
    content: (
      <>
        <p>We retain information only for as long as it is needed for the purposes described above, to maintain project and contribution records, to resolve security or operational issues, or to meet legal obligations.</p>
        <p>To request access to, correction of, or deletion of your personal information, contact us using the address below. We may need to verify your identity and may retain limited records where required for security, legal, or legitimate operational purposes.</p>
      </>
    ),
  },
  {
    title: 'Security and your choices',
    content: (
      <>
        <p>We use access controls, owner-bound records, private server operations, and protected credential storage to reduce unauthorized access. No method of online storage or transmission is completely secure, so we cannot guarantee absolute security.</p>
      </>
    ),
  },
  {
    title: 'Updates to this policy',
    content: (
      <p>We may update this policy as the service or its data practices change. The revised version will be posted on this page with a new effective date, and we will provide appropriate notice where required.</p>
    ),
  },
];

export default function Privacy() {
  const { content } = usePublicContent([]);
  const contactEmail = content.email || 'lahatliwa.collectives@gmail.com';

  return (
    <div className="page-shell py-20">
      <PublicPageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        description="How Lahat Liwa Collectives collects, uses, stores, and protects information."
      />

      <div className="grid gap-10 py-12 md:grid-cols-[0.32fr_1fr] md:py-16">
        <aside>
          <AccentEyebrow>Effective date</AccentEyebrow>
          <p className="mt-4 text-sm text-[var(--site-secondary-text)]">August 13, 2026</p>
        </aside>
        <div className="max-w-3xl space-y-12 border-l border-white/[0.09] pl-5 sm:pl-7">
          <section>
            <h2 className="text-2xl font-medium text-[var(--site-primary-text)]">Overview</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--site-secondary-text)]">
              <p>Lahat Liwa Collectives ("Lahat Liwa," "we," "us," or "our") operates lahatliwa.studio. This policy explains our data practices for public visitors, people who send inquiries, published creatives, and approved Team members.</p>
              <p>By using the site, you acknowledge the practices described here. If you do not agree, please do not provide personal information.</p>
            </div>
          </section>

          {policySections.map((section) => (
            <section key={section.title} className="major-border-top pt-10">
              <h2 className="text-2xl font-medium text-[var(--site-primary-text)]">{section.title}</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--site-secondary-text)] [&_a]:text-[var(--site-accent-text)] [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[var(--site-primary-text)]">
                {section.content}
              </div>
            </section>
          ))}

          <section className="major-border-top pt-10">
            <AccentEyebrow>Contact</AccentEyebrow>
            <h2 className="mt-4 text-2xl font-medium text-[var(--site-primary-text)]">Privacy questions or requests</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--site-secondary-text)]">Email us at <a className="text-[var(--site-accent-text)] underline underline-offset-4" href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
