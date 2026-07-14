import { Check } from 'lucide-react';
import { serviceCategoriesForBranch } from '../../lib/serviceRequest';

export default function ServiceTaxonomyPreview({ branchKey, className = '' }) {
  const services = serviceCategoriesForBranch(branchKey);
  if (!services.length) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-200">Public service choices</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">These six shared categories keep the Services page and inquiry form consistent.</p>
        </div>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-amber-200/70">6 categories</span>
      </div>
      <ol className="mt-4 grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <li key={service.key} className="flex min-h-11 items-center gap-2 border-b border-white/[0.07] py-2 text-sm text-zinc-300">
            <Check size={14} className="shrink-0 text-amber-200/80" aria-hidden="true" />
            <span>{service.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
