import clsx from 'clsx';
import { categories } from '../lib/helpers';

export default function CategoryFilter({ value, onChange }) {
  const options = ['All', ...categories];
  return (
    <div className="flex max-w-full flex-wrap gap-x-4 gap-y-1 pb-2">
      {options.map((category) => (
        <button
          key={category}
          onClick={() => onChange(category)}
          className={clsx(
            'shrink-0 border-b px-1 py-2 text-sm transition',
            value === category ? 'border-amber-300 text-amber-100' : 'border-transparent text-zinc-500 hover:border-white/25 hover:text-zinc-200',
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
