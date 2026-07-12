import { Component } from 'react';
export default class PublicErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[public-page] render failed', { name: error?.name || 'Error' }); }
  render() { if (!this.state.failed) return this.props.children; return <section className="page-shell py-20"><div className="major-border-y py-10"><h1 className="text-2xl font-medium text-white">This page could not be displayed.</h1><p className="mt-3 text-sm leading-6 text-zinc-400">Refresh the page or return to the previous page and try again.</p><div className="mt-6 flex gap-4"><button type="button" onClick={() => this.setState({ failed: false })} className="fine-link text-sm text-zinc-200">Try again</button><button type="button" onClick={() => window.history.back()} className="fine-link text-sm text-zinc-400">Go back</button></div></div></section>; }
}
