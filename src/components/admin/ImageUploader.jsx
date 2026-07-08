import { ImagePlus } from 'lucide-react';

export default function ImageUploader({ label, multiple = false, accept = 'image/*', onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-sm text-zinc-300 hover:border-amber-300/60">
      <ImagePlus size={18} />
      <span>{label}</span>
      <input className="sr-only" type="file" accept={accept} multiple={multiple} onChange={(event) => onChange(event.target.files)} />
    </label>
  );
}
