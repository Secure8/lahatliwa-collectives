import { Search } from 'lucide-react';

export default function SearchBar({ value, onChange }) {
  return (
    <label className="flex items-center gap-3 border-b border-white/15 py-3 text-zinc-300 transition focus-within:border-amber-300/70">
      <Search size={18} />
      <input
        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search projects"
      />
    </label>
  );
}
