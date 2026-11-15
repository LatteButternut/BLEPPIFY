import { createClient, SupabaseClient } from '@supabase/supabase-js';

function isValidSupabasePair(url: string, key: string): boolean {
  return Boolean(
    url &&
      key &&
      url.startsWith('http') &&
      !url.includes('your-project-id') &&
      !url.includes('placeholder-project.supabase.co') &&
      key !== 'placeholder-anon-key'
  );
}

const buildTimeUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const buildTimeKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export let isSupabaseConfigured: boolean = isValidSupabasePair(buildTimeUrl, buildTimeKey);

export let supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? buildTimeUrl : 'https://placeholder-project.supabase.co',
  isSupabaseConfigured ? buildTimeKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

let runtimeConfigPromise: Promise<boolean> | null = null;

/**
 * Checks runtime /api/public-config if build-time VITE_SUPABASE_* variables were empty,
 * allowing secrets configured in AI Studio Secrets or Vercel runtime env vars to connect automatically.
 */
export function initSupabaseRuntimeConfig(): Promise<boolean> {
  if (isSupabaseConfigured) {
    return Promise.resolve(true);
  }
  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }

  runtimeConfigPromise = (async () => {
    try {
      const res = await fetch('/api/public-config');
      if (res.ok) {
        const data = (await res.json()) as {
          supabaseUrl?: string;
          supabaseAnonKey?: string;
        };
        const runtimeUrl = (data.supabaseUrl || '').trim();
        const runtimeKey = (data.supabaseAnonKey || '').trim();
        if (isValidSupabasePair(runtimeUrl, runtimeKey)) {
          supabase = createClient(runtimeUrl, runtimeKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
            },
          });
          isSupabaseConfigured = true;
          return true;
        }
      }
    } catch {
      // Ignore network errors in offline mode
    }
    return isSupabaseConfigured;
  })();

  return runtimeConfigPromise;
}

// ============================================================================
// Local Account Fallback (used seamlessly in preview before Supabase keys exist)
// ============================================================================

export interface LocalFallbackUser {
  id: string;
  email: string;
}

interface StoredLocalAccount {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

const LOCAL_USERS_KEY = 'bleppify_local_users_v1';
const LOCAL_SESSION_KEY = 'bleppify_local_session_v1';

async function hashPassword(email: string, password: string): Promise<string> {
  const raw = `${email.toLowerCase()}::${password}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback for non-secure contexts
  }
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv_${(h >>> 0).toString(16)}`;
}

function readLocalAccounts(): StoredLocalAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: StoredLocalAccount[]): void {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(accounts));
  } catch {
    // Ignore storage quota errors
  }
}

export function getLocalFallbackSession(): LocalFallbackUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalFallbackUser;
    if (parsed && typeof parsed.id === 'string' && typeof parsed.email === 'string') {
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function signOutLocalFallback(): void {
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // Ignore
  }
}

export function deleteLocalFallbackAccount(userId?: string | null): void {
  try {
    if (userId) {
      const accounts = readLocalAccounts();
      const remaining = accounts.filter((a) => a.id !== userId);
      writeLocalAccounts(remaining);
    }
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    // Ignore
  }
}

export async function signUpLocalFallback(
  email: string,
  password: string
): Promise<LocalFallbackUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = readLocalAccounts();
  const existing = accounts.find((a) => a.email === normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  const passwordHash = await hashPassword(normalizedEmail, password);
  const newUser: StoredLocalAccount = {
    id: `local_${passwordHash.slice(0, 16)}`,
    email: normalizedEmail,
    passwordHash,
    createdAt: Date.now(),
  };

  writeLocalAccounts([...accounts, newUser]);
  const sessionUser: LocalFallbackUser = { id: newUser.id, email: newUser.email };
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionUser));
  } catch {
    // Ignore
  }
  return sessionUser;
}

export async function signInLocalFallback(
  email: string,
  password: string
): Promise<LocalFallbackUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = readLocalAccounts();
  const existing = accounts.find((a) => a.email === normalizedEmail);
  if (!existing) {
    throw new Error('No account found for this email. Switch to Create Account first.');
  }

  const passwordHash = await hashPassword(normalizedEmail, password);
  if (existing.passwordHash !== passwordHash) {
    throw new Error('Incorrect password. Please try again.');
  }

  const sessionUser: LocalFallbackUser = { id: existing.id, email: existing.email };
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sessionUser));
  } catch {
    // Ignore
  }
  return sessionUser;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailAddress(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_PATTERN.test(email.trim());
}

export interface PasswordResetLinkResult {
  ok: boolean;
  mode: 'supabase' | 'local';
  email: string;
  error?: string;
}

/**
 * Sends a password reset link to the user's email via Supabase Auth
 * (`supabase.auth.resetPasswordForEmail`), with clean validation and local-preview fallback.
 */
export async function sendPasswordResetEmailLink(
  emailInput: string
): Promise<PasswordResetLinkResult> {
  const normalizedEmail = (emailInput || '').trim().toLowerCase();
  if (!isValidEmailAddress(normalizedEmail)) {
    return {
      ok: false,
      mode: isSupabaseConfigured ? 'supabase' : 'local',
      email: normalizedEmail,
      error: 'Please enter a valid account email address.',
    };
  }

  const configured = await initSupabaseRuntimeConfig();
  if (configured) {
    try {
      // Use a fixed public URL (e.g. https://bleppify.vercel.app) so the emailed link never
      // points at a Vercel deployment/alias URL that contains your account or team name.
      const configuredSiteUrl = (
        (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || ''
      )
        .trim()
        .replace(/\/+$/, '');
      const siteOrigin =
        configuredSiteUrl ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const redirectTo = siteOrigin ? `${siteOrigin}/?reset_password=1` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        redirectTo ? { redirectTo } : undefined
      );
      if (error) {
        return {
          ok: false,
          mode: 'supabase',
          email: normalizedEmail,
          error: error.message,
        };
      }
      return {
        ok: true,
        mode: 'supabase',
        email: normalizedEmail,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        mode: 'supabase',
        email: normalizedEmail,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to send password reset email right now.',
      };
    }
  }

  try {
    localStorage.setItem(
      'bleppify_local_pw_reset_v1',
      JSON.stringify({
        email: normalizedEmail,
        requestedAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage quota errors
  }

  return {
    ok: true,
    mode: 'local',
    email: normalizedEmail,
  };
}

/**
 * Updates the signed-in user's password when arriving from a Supabase PASSWORD_RECOVERY email link
 * (or updates the stored local-fallback account password hash in preview mode).
 */
export async function updateAccountPassword(
  newPassword: string,
  fallbackEmail?: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return {
      ok: false,
      error: 'New password must be at least 6 characters long.',
    };
  }

  const configured = await initSupabaseRuntimeConfig();
  if (configured) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : 'Could not update password.',
      };
    }
  }

  const normalizedEmail = (fallbackEmail || '').trim().toLowerCase();
  if (normalizedEmail) {
    const accounts = readLocalAccounts();
    const idx = accounts.findIndex((a) => a.email === normalizedEmail);
    if (idx >= 0) {
      const passwordHash = await hashPassword(normalizedEmail, newPassword);
      const updated = [...accounts];
      updated[idx] = { ...updated[idx], passwordHash };
      writeLocalAccounts(updated);
    }
  }
  return { ok: true };
}

