import { ImagePlus } from 'lucide-react';

export default function ImageUploader({ label, hint = '', multiple = false, accept = 'image/*', onChange }) {
  return (
    <label className="group flex min-h-28 cursor-pointer flex-col items-center justify-center gap-3 border-y border-white/[0.09] bg-transparent px-5 py-5 text-center text-sm text-zinc-300 transition hover:border-amber-200/30 hover:bg-white/[0.02]">
      <span className="grid h-10 w-10 place-items-center text-amber-100 transition group-hover:text-amber-200">
        <ImagePlus size={19} />
      </span>
      <span>{label}</span>
      {hint && <span className="text-xs leading-5 text-zinc-500">{hint}</span>}
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

