import { Component } from 'react';
import { recoverDynamicImportError } from '../lib/releaseRecovery';
export default class PublicErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { recoverDynamicImportError(error); }
  render() { if (!this.state.failed) return this.props.children; return <section className="page-shell py-20"><div className="major-border-y py-10"><h1 className="text-2xl font-medium text-white">This page could not be displayed.</h1><p className="mt-3 text-sm leading-6 text-zinc-400">The page did not finish loading. Refresh it to get the latest site version, or return to the previous page.</p><div className="mt-6 flex gap-4"><button type="button" onClick={() => window.location.reload()} className="fine-link text-sm text-zinc-200">Refresh page</button><button type="button" onClick={() => window.history.back()} className="fine-link text-sm text-zinc-400">Go back</button></div></div></section>; }
}
