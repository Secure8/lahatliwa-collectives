import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

globalThis.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new JsonWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });

export default function AdvancedJsonEditor({ value, onChange }) {
  return (
    <Editor
      height="620px"
      defaultLanguage="json"
      theme="vs-dark"
      value={value}
      onChange={(nextValue) => onChange(nextValue || '')}
      loading={<div className="grid h-[620px] place-items-center text-sm text-zinc-500">Preparing advanced editor...</div>}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: 'on',
        tabSize: 2,
        formatOnPaste: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}
