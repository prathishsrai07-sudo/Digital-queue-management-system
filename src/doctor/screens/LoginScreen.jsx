/**
 * LoginScreen.jsx  (Doctor/Clinic Side)
 * ----------------------------------------
 * Professional login form for clinic staff / doctors.
 * Features:
 *   - Glowing stethoscope emblem
 *   - Clean multi-color medical aesthetic
 *   - Username + Password authentication
 */
import { useState, useEffect } from 'react';
import { Stethoscope, Eye, EyeOff, LogIn, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { doctorLogin } from '../../services/dbService';

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPw,   setShowPw]     = useState(false);
  const [error,    setError]      = useState('');
  const [loading,  setLoading]    = useState(false);

  useEffect(() => {
    setUsername('');
    setPassword('');
    setError('');
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !password) return;

    setError('');
    setLoading(true);

    const { data, error: loginErr } = await doctorLogin(cleanUser, password);

    setLoading(false);

    if (loginErr) {
      setError(loginErr.message || 'Invalid username or password.');
      return;
    }

    setUsername('');
    setPassword('');
    onLoginSuccess(data);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-50/60 via-slate-50 to-indigo-50/50 flex flex-col items-center justify-center px-4 py-12 font-sans selection:bg-teal-100 selection:text-teal-900">

      {/* Logo + title with glowing badge */}
      <div className="flex flex-col items-center gap-3 mb-8 text-center">
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-teal-400 to-indigo-500 blur-lg opacity-40 animate-pulse" />
          <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-500 via-teal-600 to-indigo-600 text-white shadow-xl shadow-teal-500/25 ring-4 ring-white">
            <Stethoscope size={36} />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Smart Digital Queue</h1>
          <p className="text-slate-500 text-xs font-medium">Healthcare Queue Management System</p>
        </div>

        <span className="inline-flex items-center gap-1.5 bg-teal-100/90 text-teal-800 border border-teal-200/80 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-2xs">
          <ShieldCheck size={14} className="text-teal-600" />
          Doctor & Staff Portal
        </span>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl shadow-slate-200/70 border border-slate-200/80 p-8">
        <h2 className="text-xl font-extrabold text-slate-900 mb-1 tracking-tight">Doctor Sign In</h2>
        <p className="text-xs text-slate-500 mb-6">Enter your doctor username and assigned password.</p>

        <form onSubmit={handleLogin} autoComplete="off" className="flex flex-col gap-4">
          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="off"
              placeholder="e.g. arun.kumar"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition-all font-mono"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Enter assigned password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-rose-500" />
              <p>{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 via-teal-500 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-teal-600/25 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {loading ? 'Verifying Credentials…' : 'Sign In to Portal'}
          </button>
        </form>
      </div>

      {/* Access hint notice */}
      <div className="mt-6 w-full max-w-sm bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-900 shadow-xs">
        <p className="font-bold mb-1 flex items-center gap-1.5 text-amber-950">
          <ShieldCheck size={14} className="text-amber-600" />
          Doctor Credentials
        </p>
        <p className="text-slate-600">Doctors log in with their unique username and clinic password.</p>
        <p className="mt-1 text-slate-700"><span className="font-semibold text-slate-900">Sample Username:</span> <code className="bg-white/80 px-1.5 py-0.5 rounded border border-amber-200 font-mono">arun.kumar</code></p>
      </div>

      {/* Back to patient portal */}
      <a
        href="/"
        className="mt-6 text-xs font-semibold text-slate-500 hover:text-teal-700 transition-colors"
      >
        ← Return to Patient Website
      </a>
    </div>
  );
}
