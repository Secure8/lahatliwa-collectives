import { ArrowRight, Check } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import PublicPageHeader from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';
import { allServiceCategories } from '../lib/serviceCatalog.js';

function publicServices(content) {
  const configured = (content.websiteServices || [])
    .filter((service) => service?.status !== 'inactive' && service?.publicVisibility !== false)
    .map((service) => ({
      key: service.key || service.serviceKey,
      name: service.name,
      description: service.fullDescription || service.shortDescription || '',
      legacyBranch: service.branchKey || '',
    }))
    .filter((service) => service.key && service.name);

  return configured.length
    ? configured
    : allServiceCategories().filter((service) => service.legacyBranch !== 'general');
}

function inquiryLink(service) {
  const params = new URLSearchParams({ path: 'service', service: service.key });
  return `/inquiry?${params}`;
}

export default function Services() {
  const { content, loading } = usePublicContent(['services']);
  const services = useMemo(() => publicServices(content), [content.websiteServices]);

  return (
    <div className="page-shell py-16 sm:py-20">
      <PublicPageHeader
        eyebrow="Client services"
        title={content.servicesPage.title || 'Practical support for your next project.'}
        description={content.servicesPage.intro || 'Choose the service closest to your need, then tell us about the outcome, context, and timeline that matter to you.'}
        accentColor={content.accentColor}
        titleColor={content.servicesPage.headingColor || content.primaryTextColor}
        bodyColor={content.servicesPage.bodyTextColor || content.secondaryTextColor}
      />

      {loading ? <div className="py-12"><LoadingState label="Loading services" /></div> : (
        <>
          <section className="mt-12 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3" aria-label="Available services">
            {services.map((service) => (
              <article key={`${service.legacyBranch}:${service.key}`} className="mobile-service-card group grid min-h-48 content-between border border-white/[0.09] bg-white/[0.012] p-5 transition hover:border-orange-300/45 hover:bg-orange-300/[0.025]">
                <div>
                  <div className="flex items-start gap-3"><Check size={16} className="mt-1 shrink-0 text-orange-300" /><h2 className="text-xl font-medium text-white">{service.name}</h2></div>
                  {service.description && <p className="mt-4 text-sm leading-7 text-zinc-400">{service.description}</p>}
                </div>
                <Link
                  to={inquiryLink(service)}
                  state={{ inquirySelection: { path: 'service', service: service.key, legacyBranch: service.legacyBranch } }}
                  aria-label={`Ask about ${service.name}`}
                  className="mt-7 inline-flex min-h-11 items-center gap-2 border-b border-white/[0.16] text-sm text-zinc-300 transition group-hover:border-orange-300/55 group-hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  Ask about {service.name}<ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </section>

          <section className="mt-12 grid gap-6 border-t border-white/[0.09] py-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div><p className="text-xs uppercase tracking-[0.19em] text-orange-300">Not sure where to begin?</p><h2 className="mt-3 text-2xl font-medium text-white">Describe what you need in your own words.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Share the result you want, your preferred timeline, and any useful context. The team will review the request and identify the right next step.</p></div>
            <Link to="/inquiry?path=general" className="inline-flex min-h-11 w-fit items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">Describe what you need<ArrowRight size={16} /></Link>
          </section>
        </>
      )}
    </div>
  );
}
