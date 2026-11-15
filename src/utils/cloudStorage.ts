import { BoardQuestionItem, FlashcardItem } from '../data/tosData';
import {
  QuestionAttemptLog,
  SubjectGrades,
  SubjectId,
  SubjectSessionProgress,
} from './bleppLogic';
import { UploadedPdfFile } from '../components/SubjectWorkspace';
import {
  deleteLocalFallbackAccount,
  isSupabaseConfigured,
  supabase,
} from '../supabaseClient';

export interface CloudAppState {
  theme?: 'light' | 'dark';
  examDate?: string | null;
  profileName?: string;
  profileAvatar?: string | null;
  dailyQuestionGoal?: number;
  topnotcherMode?: boolean;
  topnotcherThreshold?: number;
  grades: SubjectGrades;
  masteredCompetencies: Record<string, boolean>;
  pomodoroCompletedToday: number;
  flashcardsBySubject: Record<SubjectId, FlashcardItem[]>;
  questionsBySubject: Record<SubjectId, BoardQuestionItem[]>;
  pdfsBySubject: Record<SubjectId, UploadedPdfFile[]>;
  sessionsBySubject?: Record<SubjectId, SubjectSessionProgress>;
  seenStemsBySubject?: Record<SubjectId, string[]>;
  seenTermsBySubject?: Record<SubjectId, string[]>;
  attemptLogs: QuestionAttemptLog[];
  updatedAt: number;
}

const LEGACY_IDB_NAMES = [
  'bleppify_cloud_db_v1',
  'blepp_rpm_cloud_db_v3',
  'blepp_rpm_cloud_db_v2',
  'blepp_rpm_cloud_db',
];
const LEGACY_LS_KEYS = [
  'bleppify_state_v1_local',
  'blepp_rpm_studio_state_v3',
  'blepp_rpm_studio_state_v2',
  'blepp_rpm_studio_state',
];

const IDB_NAME = 'bleppify_cloud_db_v2';
const IDB_STORE = 'workspace_state';
const IDB_BASE_KEY = 'active_workspace';

let legacyCleaned = false;

export function purgeLegacyProgressOnce(): void {
  if (legacyCleaned || typeof window === 'undefined') return;
  legacyCleaned = true;
  try {
    for (const key of LEGACY_LS_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
  try {
    if (typeof indexedDB !== 'undefined') {
      for (const dbName of LEGACY_IDB_NAMES) {
        indexedDB.deleteDatabase(dbName);
      }
    }
  } catch {
    // Ignore IDB delete errors
  }
}

function getScopedIdbKey(userId?: string | null): string {
  return userId ? `${IDB_BASE_KEY}_${userId}` : `${IDB_BASE_KEY}_local`;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readFromIdb(userId?: string | null): Promise<CloudAppState | null> {
  try {
    const db = await openIdb();
    const scopedKey = getScopedIdbKey(userId);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(scopedKey);
      getReq.onsuccess = () => resolve((getReq.result as CloudAppState) || null);
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    return null;
  }
}

async function writeToIdb(state: CloudAppState, userId?: string | null): Promise<void> {
  try {
    const db = await openIdb();
    const scopedKey = getScopedIdbKey(userId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const putReq = store.put(state, scopedKey);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch {
    // Ignore IDB errors
  }
}

async function deleteFromIdb(userId?: string | null): Promise<void> {
  try {
    const db = await openIdb();
    const scopedKey = getScopedIdbKey(userId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const delReq = store.delete(scopedKey);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    });
  } catch {
    // Ignore IDB errors
  }
}

async function resolveActiveSupabaseUserId(explicitUserId?: string | null): Promise<string | null> {
  if (explicitUserId) return explicitUserId;
  if (!isSupabaseConfigured) return null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

function stripHeavyPdfBase64(state: CloudAppState): CloudAppState {
  const cleanPdfs: Record<SubjectId, UploadedPdfFile[]> = {
    dev_psych: [],
    psych_assessment: [],
    abnormal_psych: [],
    io_psych: [],
  };
  (Object.keys(cleanPdfs) as SubjectId[]).forEach((subjId) => {
    const list = state.pdfsBySubject?.[subjId] || [];
    cleanPdfs[subjId] = list.filter((f) => (f.base64Data?.length || 0) <= 3_400_000);
  });
  return {
    ...state,
    pdfsBySubject: cleanPdfs,
  };
}

async function upsertSupabaseUserData(userId: string, payloadState: CloudAppState): Promise<boolean> {
  const { error: upsertErr } = await supabase
    .from('user_data')
    .upsert({ user_id: userId, data: payloadState }, { onConflict: 'user_id' });

  if (!upsertErr) return true;

  // Fallback if user_data table does not have a UNIQUE/PK index on user_id for ON CONFLICT
  const { data: existingRow, error: selectErr } = await supabase
    .from('user_data')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectErr) return false;

  if (existingRow) {
    const { error: updateErr } = await supabase
      .from('user_data')
      .update({ data: payloadState })
      .eq('user_id', userId);
    return !updateErr;
  } else {
    const { error: insertErr } = await supabase
      .from('user_data')
      .insert({ user_id: userId, data: payloadState });
    return !insertErr;
  }
}

function isUuid(id: string | null | undefined): id is string {
  return Boolean(
    id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

export async function loadCloudAppState(userId?: string | null): Promise<CloudAppState | null> {
  purgeLegacyProgressOnce();
  const resolvedUserId = await resolveActiveSupabaseUserId(userId);

  // Supabase user_data (user_id, data)
  if (isSupabaseConfigured && isUuid(resolvedUserId)) {
    let supabaseState: CloudAppState | null = null;
    try {
      const { data: row, error } = await supabase
        .from('user_data')
        .select('data')
        .eq('user_id', resolvedUserId)
        .maybeSingle();

      if (!error && row && row.data && typeof row.data === 'object') {
        supabaseState = row.data as CloudAppState;
      }
    } catch {
      // Fall back to user-scoped IndexedDB if offline
    }

    const localState = await readFromIdb(resolvedUserId);

    if (supabaseState && localState) {
      const chosen =
        (supabaseState.updatedAt || 0) >= (localState.updatedAt || 0)
          ? supabaseState
          : localState;
      await writeToIdb(chosen, resolvedUserId);
      return chosen;
    }
    if (supabaseState) {
      await writeToIdb(supabaseState, resolvedUserId);
      return supabaseState;
    }
    return localState;
  }

  return await readFromIdb(resolvedUserId);
}

export async function saveCloudAppState(
  state: CloudAppState,
  userId?: string | null
): Promise<boolean> {
  purgeLegacyProgressOnce();
  const resolvedUserId = await resolveActiveSupabaseUserId(userId);

  await writeToIdb(state, resolvedUserId);

  // Supabase user_data (user_id, data)
  if (isSupabaseConfigured && isUuid(resolvedUserId)) {
    try {
      const ok = await upsertSupabaseUserData(resolvedUserId, state);
      if (ok) return true;
      const lighterState = stripHeavyPdfBase64(state);
      return await upsertSupabaseUserData(resolvedUserId, lighterState);
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Permanently deletes the user's user_id row from Supabase public.user_data,
 * invokes server-side /api/account/delete (plus optional self-delete RPC) to remove auth.users,
 * and purges user-scoped localStorage, IndexedDB, and fallback sessions.
 */
export async function deleteCloudAccountAndData(
  userId?: string | null,
  localStorageKey?: string
): Promise<{ ok: boolean; error?: string }> {
  const resolvedUserId = await resolveActiveSupabaseUserId(userId);

  if (isSupabaseConfigured && isUuid(resolvedUserId)) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // 1. Delete user_id from public.user_data directly via authenticated client
      await supabase.from('user_data').delete().eq('user_id', resolvedUserId);

      // 2. Call server endpoint with Bearer token to delete from user_data & auth.users (if service_role configured)
      if (session?.access_token) {
        try {
          await fetch('/api/account/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
          });
        } catch {
          // Ignore network fallback error if offline
        }
      }

      // 3. Attempt optional Supabase Postgres self-deletion RPC if configured in user's project
      try {
        await supabase.rpc('delete_user');
      } catch {
        // Ignore if RPC is not defined in user's database
      }

      // 4. Sign out active Supabase session
      await supabase.auth.signOut();
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unable to complete Supabase account deletion.',
      };
    }
  }

  // Purge local IndexedDB, localStorage, and local fallback account
  await deleteFromIdb(resolvedUserId);
  if (userId && userId !== resolvedUserId) {
    await deleteFromIdb(userId);
  }
  try {
    if (localStorageKey) {
      localStorage.removeItem(localStorageKey);
    }
    if (resolvedUserId) {
      localStorage.removeItem(`bleppify_state_v2_${resolvedUserId}`);
    }
    if (userId) {
      localStorage.removeItem(`bleppify_state_v2_${userId}`);
    }
  } catch {
    // Ignore storage access errors
  }

  deleteLocalFallbackAccount(resolvedUserId || userId);
  return { ok: true };
}

