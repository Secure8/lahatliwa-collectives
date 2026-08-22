import PublicPageHeader, { AccentEyebrow } from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';
import InlineWebsiteText from '../components/InlineWebsiteText';

const defaultPolicySections = [
  {
    titleKey: 'informationTitle', bodyKey: 'informationBody',
    title: 'Information we collect',
    body: 'Depending on how you use the site, we may collect contact and inquiry details, administrator account information, project updates, creative profile content, and technical information needed to operate, secure, and troubleshoot the website.\n\nFor uploaded website media, we store the file and the limited metadata needed to publish, replace, and remove it safely.',
  },
  {
    titleKey: 'mediaTitle', bodyKey: 'mediaBody',
    title: 'Public website media',
    body: 'Images selected for publication may be resized and converted into website-ready copies. New website media is stored and delivered through Cloudflare R2.\n\nSome older published files may remain at existing public URLs until they can be safely replaced. Public media is intended to be viewable without signing in, while private storage credentials are never included in public website records.',
  },
  {
    titleKey: 'useTitle', bodyKey: 'useBody',
    title: 'How we use information',
    body: 'We use collected information only to provide and maintain the site, authenticate authorized members, respond to inquiries, publish approved project updates and creative profiles, protect the service, and meet applicable legal obligations.\n\nWe do not sell personal information or use it for advertising, credit decisions, or unrelated profiling.',
  },
  {
    titleKey: 'sharingTitle', bodyKey: 'sharingBody',
    title: 'Sharing and service providers',
    body: 'We may share information with service providers that help us host, secure, and operate the website, including Cloudflare for public website media delivery and Supabase for authentication, database, and server functions. These providers process information under their own terms and privacy commitments.\n\nWe may also disclose information when required by law, to protect rights and safety, or as part of an organizational transaction with appropriate safeguards. We do not transfer personal information to data brokers, advertising platforms, or information resellers.',
  },
  {
    titleKey: 'retentionTitle', bodyKey: 'retentionBody',
    title: 'Retention and deletion',
    body: 'We retain information only for as long as it is needed for the purposes described above, to maintain project and contribution records, to resolve security or operational issues, or to meet legal obligations.\n\nTo request access to, correction of, or deletion of your personal information, contact us using the address below. We may need to verify your identity and may retain limited records where required for security, legal, or legitimate operational purposes.',
  },
  {
    titleKey: 'securityTitle', bodyKey: 'securityBody',
    title: 'Security and your choices',
    body: 'We use access controls, owner-bound records, private server operations, and protected credential storage to reduce unauthorized access. No method of online storage or transmission is completely secure, so we cannot guarantee absolute security.',
  },
  {
    titleKey: 'updatesTitle', bodyKey: 'updatesBody',
    title: 'Updates to this policy',
    body: 'We may update this policy as the service or its data practices change. The revised version will be posted on this page with a new effective date, and we will provide appropriate notice where required.',
  },
];

function Paragraphs({ text }) {
  return String(text || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>);
}

export default function Privacy() {
  const { content } = usePublicContent([]);
  const contactEmail = content.email || 'lahatliwa.collectives@gmail.com';
  const page = content.websitePages?.privacy || {};
  const overview = page.overviewBody || `${content.displayName} ("Lahat Liwa," "we," "us," or "our") operates lahatliwa.studio, an Aklan-based creative work platform. This policy explains our data practices for visitors, people who send inquiries, published contributors, and authorized administrators.\n\nBy using the site, you acknowledge the practices described here. If you do not agree, please do not provide personal information.`;

  return (
    <div className="page-shell">
      <PublicPageHeader
        eyebrow={page.eyebrow || 'Legal'}
        title={page.title || 'Privacy Policy'}
        description={page.description || `How ${content.displayName} collects, uses, stores, and protects information.`}
        backgroundImage={page.heroBackgroundImageUrl}
        backgroundPosition={page.heroBackgroundPosition || 'center'}
        backgroundCredit={page.heroBackgroundCredit || ''}
        edit={{ section: 'page.privacy', eyebrowField: 'eyebrow', titleField: 'title', descriptionField: 'description', backgroundField: 'heroBackgroundImageUrl', creditField: 'heroBackgroundCredit' }}
      />

      <div className="grid gap-10 py-12 md:grid-cols-[0.32fr_1fr] md:py-16">
        <aside>
          <AccentEyebrow>Effective date</AccentEyebrow>
          <InlineWebsiteText as="p" className="mt-4 text-sm text-[var(--site-secondary-text)]" section="page.privacy" field="effectiveDate" value={page.effectiveDate || 'August 13, 2026'} label="Edit effective date" />
        </aside>
        <div className="max-w-3xl space-y-12 border-l border-white/[0.09] pl-5 sm:pl-7">
          <section>
            <InlineWebsiteText as="h2" className="text-2xl font-medium text-[var(--site-primary-text)]" section="page.privacy" field="overviewTitle" value={page.overviewTitle || 'Overview'} label="Edit overview heading" />
            <InlineWebsiteText as="div" className="mt-4 space-y-4 text-sm leading-7 text-[var(--site-secondary-text)]" section="page.privacy" field="overviewBody" type="textarea" value={overview} label="Edit overview"><Paragraphs text={overview} /></InlineWebsiteText>
          </section>

          {defaultPolicySections.map((section) => (
            <section key={section.title} className="major-border-top pt-10">
              <InlineWebsiteText as="h2" className="text-2xl font-medium text-[var(--site-primary-text)]" section="page.privacy" field={section.titleKey} value={page[section.titleKey] || section.title} label={`Edit ${section.title} heading`} />
              <InlineWebsiteText as="div" className="mt-4 space-y-4 text-sm leading-7 text-[var(--site-secondary-text)] [&_a]:text-[var(--site-accent-text)] [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[var(--site-primary-text)]" section="page.privacy" field={section.bodyKey} type="textarea" value={page[section.bodyKey] || section.body} label={`Edit ${section.title}`}><Paragraphs text={page[section.bodyKey] || section.body} /></InlineWebsiteText>
            </section>
          ))}

          <section className="major-border-top pt-10">
            <AccentEyebrow>Contact</AccentEyebrow>
            <InlineWebsiteText as="h2" className="mt-4 text-2xl font-medium text-[var(--site-primary-text)]" section="page.privacy" field="contactTitle" value={page.contactTitle || 'Privacy questions or requests'} label="Edit privacy contact heading" />
            <p className="mt-4 text-sm leading-7 text-[var(--site-secondary-text)]"><InlineWebsiteText section="page.privacy" field="contactBody" type="textarea" value={page.contactBody || 'Email us with privacy questions, access requests, corrections, or deletion requests.'} label="Edit privacy contact description" /> <a className="text-[var(--site-accent-text)] underline underline-offset-4" href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
