import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }
    navigate('/admin/dashboard');
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <form onSubmit={handleLogin} className="w-full max-w-md rounded-lg border border-white/10 bg-zinc-900/80 p-6">
        <Link to="/" className="text-sm text-zinc-400 hover:text-amber-200">Back to site</Link>
        <div className="mt-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-amber-300 text-zinc-950"><Lock size={20} /></span>
          <div>
            <h1 className="text-2xl font-semibold">Admin Login</h1>
            <p className="text-sm text-zinc-400">Use your Supabase admin user.</p>
          </div>
        </div>

        {error && <div className="mt-5 rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

        <label className="mt-6 grid gap-2 text-sm text-zinc-300">
          Email
          <input className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="mt-4 grid gap-2 text-sm text-zinc-300">
          Password
          <input className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button disabled={loading} className="mt-6 w-full rounded-md bg-amber-300 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-60">
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </main>
  );
}
