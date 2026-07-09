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
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,rgba(246,213,139,0.12),transparent_34%),linear-gradient(180deg,#101012,#09090b)] px-4 py-12">
      <form onSubmit={handleLogin} className="w-full max-w-md rounded-lg bg-white/[0.045] p-6  ring-1 ring-white/[0.08] backdrop-blur">
        <Link to="/" className="text-sm text-zinc-400 transition hover:text-amber-200">Back to site</Link>
        <div className="mt-6 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-amber-300 text-zinc-950 "><Lock size={20} /></span>
          <div>
            <h1 className="text-2xl font-semibold">Admin Login</h1>
            <p className="text-sm text-zinc-400">Use your Supabase admin user.</p>
          </div>
        </div>

        {error && <div className="mt-5 rounded-md bg-red-300/10 p-3 text-sm text-red-100 ring-1 ring-red-300/20">{error}</div>}

        <label className="mt-6 grid gap-2 text-sm text-zinc-300">
          Email
          <input className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="mt-4 grid gap-2 text-sm text-zinc-300">
          Password
          <input className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button disabled={loading} className="mt-6 w-full rounded-md bg-amber-300 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:opacity-60">
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </main>
  );
}

