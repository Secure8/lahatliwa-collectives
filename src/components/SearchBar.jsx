import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange, label = 'Search projects', placeholder = 'Search projects' }) {
  return (
    <label className="focus-site-border flex items-center gap-3 border-b border-white/15 py-3 text-zinc-300 transition">
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
