import { ImagePlus } from 'lucide-react';

export default function ImageUploader({ label, multiple = false, accept = 'image/*', onChange }) {
  return (
    <label className="group flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-zinc-950/45 px-5 py-6 text-center text-sm text-zinc-300 ring-1 ring-white/[0.08] transition hover:bg-white/[0.055] hover:ring-amber-200/30">
      <span className="grid h-11 w-11 place-items-center rounded-md bg-amber-300/10 text-amber-100 ring-1 ring-amber-200/10 transition group-hover:bg-amber-300/15">
        <ImagePlus size={19} />
      </span>
      <span>{label}</span>
      <input
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          onChange(event.target.files);
          event.target.value = '';
        }}
      />
    </label>
  );
}

