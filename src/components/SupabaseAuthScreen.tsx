import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Moon,
  Sun,
} from 'lucide-react';
import {
  initSupabaseRuntimeConfig,
  isSupabaseConfigured,
  LocalFallbackUser,
  signInLocalFallback,
  signUpLocalFallback,
  supabase,
} from '../supabaseClient';

interface SupabaseAuthScreenProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onLocalAuthenticated: (user: LocalFallbackUser) => void;
}

export const SupabaseAuthScreen: React.FC<SupabaseAuthScreenProps> = ({
  isDark,
  onToggleTheme,
  onLocalAuthenticated,
}) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await initSupabaseRuntimeConfig();

      if (isSupabaseConfigured) {
        if (authMode === 'signin') {
          const { error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (error) throw error;
        } else {
          const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
          });
          if (error) throw error;
          if (!data.session) {
            setInfoMsg(
              'Account created! Check your email inbox to confirm your address, then sign in.'
            );
            setAuthMode('signin');
          }
        }
      } else {
        // Seamless local account fallback in preview before Supabase env vars are set
        const localUser =
          authMode === 'signin'
            ? await signInLocalFallback(cleanEmail, password)
            : await signUpLocalFallback(cleanEmail, password);
        onLocalAuthenticated(localUser);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please check your credentials and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1320] text-[#0F172A] dark:text-[#E6ECF5] transition-colors">
      {/* TOP STITCH RIBBON & HEADER */}
      <header className="bg-white dark:bg-[#131F33] border-b border-slate-200/90 dark:border-[#22324D] transition-colors">
        <div aria-hidden="true" className="h-1 w-full grid grid-cols-3">
          <div className="bg-[#0D254C] dark:bg-[#234B82]" />
          <div className="bg-[#2E7978] dark:bg-[#2E7978]" />
          <div className="bg-[#D9822B] dark:bg-[#D9822B]" />
        </div>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <span className="text-lg sm:text-xl font-display font-bold tracking-tight text-[#0D254C] dark:text-[#F8FAFC]">
            BLEPPIFY
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:p-2 rounded-lg border border-[#D9822B]/55 dark:border-[#9A5B1E] bg-[#FDF3E7] dark:bg-[#2C1D10] hover:bg-[#FAE6CE] dark:hover:bg-[#3A2615] text-[#3B2006] dark:text-[#F2AE63] transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* CENTERED LOGIN CARD */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[420px] bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-2xl shadow-sm overflow-hidden transition-colors">
          <div className="px-6 pt-6 pb-5 bg-[#EDF2FA]/65 dark:bg-[#172844] border-b border-slate-200/80 dark:border-[#22324D]">
            <h1 className="text-2xl font-display font-bold text-[#0D254C] dark:text-[#F8FAFC] tracking-tight">
              BLEPPIFY
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9FB0C7] mt-1">
              Psychometrician Board Review · Sign in or create an account to save your syllabus goals, quizzes, and mock exams.
            </p>
          </div>

          <div className="p-6 space-y-5">
            {/* SIGN IN / SIGN UP SWITCHER */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 gap-1 p-1 bg-[#ECEFF3] dark:bg-[#0B1320] rounded-lg border border-slate-200/80 dark:border-[#22324D]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signin'}
                onClick={() => {
                  setAuthMode('signin');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`min-h-[38px] text-xs font-semibold rounded-md transition-colors ${
                  authMode === 'signin'
                    ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-slate-600 dark:text-[#9FB0C7]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signup'}
                onClick={() => {
                  setAuthMode('signup');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`min-h-[38px] text-xs font-semibold rounded-md transition-colors ${
                  authMode === 'signup'
                    ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#F8FAFC] shadow-xs'
                    : 'text-slate-600 dark:text-[#9FB0C7]'
                }`}
              >
                Create Account
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/45 border border-rose-200 dark:border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {infoMsg && (
              <div className="p-3 rounded-lg bg-[#EAF4F4] dark:bg-[#112A2D] border border-[#2E7978]/40 dark:border-[#2E7978]/70 flex items-start gap-2.5 text-xs text-[#143D3C] dark:text-[#D5F2F1]">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#2E7978] dark:text-[#68C7C5]" />
                <span>{infoMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="bleppify-email"
                  className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-[#9FB0C7] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="bleppify-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-base sm:text-sm bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="bleppify-password"
                  className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-[#9FB0C7] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="bleppify-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[44px] pl-10 pr-10 py-2 text-base sm:text-sm bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:text-[#9FB0C7] dark:hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#2E7978] dark:hover:bg-[#378C8B] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <span>
                  {isSubmitting
                    ? authMode === 'signin'
                      ? 'Signing In...'
                      : 'Creating Account...'
                    : authMode === 'signin'
                    ? 'Sign In to BLEPPIFY'
                    : 'Create BLEPPIFY Account'}
                </span>
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};
