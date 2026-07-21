import clsx from 'clsx';

export default function TourismStoryFallback({ className = '' }) {
  return (
    <div data-tourism-story-fallback aria-hidden="true" className={clsx('relative isolate overflow-hidden bg-[#17130f]', className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(251,146,60,0.28),transparent_34%),radial-gradient(circle_at_18%_82%,rgba(246,213,139,0.14),transparent_28%),linear-gradient(145deg,#2b2017,#0b0b0d_68%)]" />
      <div className="absolute -right-[12%] top-[10%] h-[70%] w-[55%] rotate-12 rounded-[48%] border border-orange-200/15" />
      <div className="absolute -right-[4%] top-[18%] h-[54%] w-[42%] rotate-12 rounded-[48%] border border-orange-200/10" />
      <div className="absolute bottom-[12%] left-[8%] h-px w-[38%] bg-gradient-to-r from-orange-200/45 to-transparent" />
    </div>
  );
}
