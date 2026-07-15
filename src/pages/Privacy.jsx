import PublicPageHeader, { AccentEyebrow } from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';

const policySections = [
  {
    title: 'Information we collect',
    content: (
      <>
        <p>Depending on how you use the site, we may collect contact and inquiry details, Team account information, project and profile content, and technical information needed to operate, secure, and troubleshoot the service.</p>
        <p>When an approved Team member connects a Google account, and depending on the permissions requested and granted, we may receive the account identifier, name, email address, and profile image associated with that account. We also store limited connection and file metadata needed to manage the integration, such as connection status, file names, file types, file sizes, and app-created file identifiers.</p>
      </>
    ),
  },
  {
    title: 'How Google Drive access works',
    content: (
      <>
        <p>Lahat Liwa requests the Google Drive <code>drive.file</code> permission. This allows Lahat Liwa to create new Drive files and to access files that you create, select, or open specifically through Lahat Liwa. It does not provide general access to every file in your Google Drive.</p>
        <p>We use this access to connect your chosen Google account, create and verify app-managed folders, upload files you select through Lahat Liwa, check the availability of those files, and delete app-managed files when you request an authorized removal.</p>
        <p>Google OAuth access and refresh credentials are handled on the server and are not returned to the browser. Refresh credentials are stored in a protected secrets vault.</p>
        <p>When an authorized Team member chooses media for publication, Lahat Liwa creates and stores a separate preview copy in its website media storage. That preview may be publicly accessible as part of a published project. The private original in the Team member's Google Drive is not made public automatically.</p>
      </>
    ),
  },
  {
    title: 'How we use information',
    content: (
      <>
        <p>We use collected information only to provide and maintain the site, authenticate and support Team members, respond to inquiries, publish approved profiles and projects, operate requested storage features, protect the service, and meet applicable legal obligations.</p>
        <p>We do not sell Google user data. We do not use Google user data for advertising, credit decisions, or to train general-purpose artificial intelligence or machine-learning models.</p>
      </>
    ),
  },
  {
    title: 'Sharing and service providers',
    content: (
      <>
        <p>We may share information with service providers that help us host, secure, and operate Lahat Liwa, including Google for Google Drive functionality and Supabase for authentication, database, server functions, secrets management, and media storage. These providers process information under their own terms and privacy commitments.</p>
        <p>We may also disclose information when required by law, to protect rights and safety, or as part of an organizational transaction with appropriate safeguards. We do not transfer Google user data to data brokers, advertising platforms, or information resellers.</p>
        <p>Lahat Liwa personnel do not access the contents of private Google Drive files except when you give explicit permission for support, when access is necessary to investigate security or abuse, when required by law, or when you intentionally publish or share the content through the service.</p>
      </>
    ),
  },
  {
    title: 'Google API Limited Use',
    content: (
      <p>Lahat Liwa's use and transfer of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
    ),
  },
  {
    title: 'Retention, disconnection, and deletion',
    content: (
      <>
        <p>We retain information only for as long as it is needed for the purposes described above, to maintain project and contribution records, to resolve security or operational issues, or to meet legal obligations.</p>
        <p>Eligible Team members can disconnect Google Drive from the Storage page. Disconnecting attempts to revoke Lahat Liwa's authorization with Google and removes the stored OAuth credential from Lahat Liwa even if Google cannot confirm revocation. Lahat Liwa may retain a limited connection record, such as its status and disconnection time, for security and operational purposes.</p>
        <p>Disconnecting does not automatically delete files already created in your Google Drive. Those files remain there until you delete them or request an authorized cleanup. When an authorized cleanup is completed through Lahat Liwa, the corresponding private Drive file and its website preview are deleted.</p>
        <p>You may also revoke access from your Google Account permissions. To request access to, correction of, or deletion of your personal information, contact us using the address below. We may need to verify your identity and may retain limited records where required for security, legal, or legitimate operational purposes.</p>
      </>
    ),
  },
  {
    title: 'Security and your choices',
    content: (
      <>
        <p>We use access controls, owner-bound records, private server operations, and protected credential storage to reduce unauthorized access. No method of online storage or transmission is completely secure, so we cannot guarantee absolute security.</p>
        <p>Connecting Google Drive is optional. You can choose not to authorize Google access, although features that depend on your Drive connection will not be available.</p>
      </>
    ),
  },
  {
    title: 'Updates to this policy',
    content: (
      <p>We may update this policy as the service or its data practices change. The revised version will be posted on this page with a new effective date. If a material change affects how we use Google user data, we will provide appropriate notice and request consent where required.</p>
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
        description="How Lahat Liwa Collectives collects, uses, stores, and protects information, including data used by the Google Drive integration."
      />

      <div className="grid gap-10 py-12 md:grid-cols-[0.32fr_1fr] md:py-16">
        <aside>
          <AccentEyebrow>Effective date</AccentEyebrow>
          <p className="mt-4 text-sm text-[var(--site-secondary-text)]">July 16, 2026</p>
        </aside>
        <div className="max-w-3xl space-y-12 border-l border-white/[0.09] pl-5 sm:pl-7">
          <section>
            <h2 className="text-2xl font-medium text-[var(--site-primary-text)]">Overview</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--site-secondary-text)]">
              <p>Lahat Liwa Collectives ("Lahat Liwa," "we," "us," or "our") operates lahatliwa.studio. This policy explains our data practices for public visitors, people who send inquiries, published creatives, and approved Team members.</p>
              <p>By using the site, you acknowledge the practices described here. If you do not agree, please do not provide personal information or connect an external storage account.</p>
            </div>
          </section>

          {policySections.map((section, index) => (
            <section key={section.title} className="major-border-top pt-10">
              <AccentEyebrow>{String(index + 1).padStart(2, '0')}</AccentEyebrow>
              <h2 className="mt-4 text-2xl font-medium text-[var(--site-primary-text)]">{section.title}</h2>
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
