import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type UserRole = "admin" | "sesmt" | "almoxarifado" | "rh" | "leitor";
export const USER_ROLES: readonly UserRole[] = ["admin", "sesmt", "almoxarifado", "rh", "leitor"];

/** Papel válido para entrar nos módulos; qualquer outro valor (vazio, "pendente") aguarda aprovação. */
export function asUserRole(value: unknown): UserRole | null {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
    ? (value as UserRole)
    : null;
}

/**
 * Explicit, exhaustive states. There is no implicit "still waiting" state:
 * every branch below ends in one of these five, so the UI never spins forever.
 *   not_configured -> auth backend missing
 *   loading        -> checking session or profile (always has a timeout)
 *   unauthenticated-> no session, show login/signup
 *   profile_error  -> session exists but the profile could not be loaded
 *   pending_approval -> account exists but an administrator has not granted a role yet
 *   ready          -> session + role confirmed, modules may render
 */
export type AuthStatus =
  "not_configured" | "loading" | "unauthenticated" | "profile_error" | "pending_approval" | "ready";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  error: string | null;
  retry: () => void;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  // kept for backward compatibility with existing module pages
  isConfigured: boolean;
  loading: boolean;
  roleLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PROFILE_TIMEOUT_MS = 10000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? "loading" : "not_configured",
  );
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  // Step 1: find out if there is a session at all. This runs once and always resolves,
  // success or failure, because the timeout forces a terminal state either way.
  useEffect(() => {
    if (!supabase) return;
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setStatus("profile_error");
      setError("A verificação da sessão demorou demais. Verifique sua conexão e tente novamente.");
    }, PROFILE_TIMEOUT_MS);
    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (sessionError) {
          setStatus("profile_error");
          setError("Não foi possível verificar sua sessão.");
          return;
        }
        setSession(data.session);
        if (!data.session) setStatus("unauthenticated");
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        setStatus("profile_error");
        setError("Não foi possível verificar sua sessão. Tente novamente.");
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setRole(null);
        setStatus("unauthenticated");
        setError(null);
      }
    });
    return () => {
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  // Step 2: once a session exists, resolve exactly one role lookup. Any outcome —
  // found, created, or failed — reaches a terminal status. No branch re-enters "loading"
  // on its own; only an explicit user retry (incrementing `generation`) does that.
  const resolveProfile = useCallback(async (uid: string, attempt: number) => {
    if (!supabase) return;
    try {
      // Servidor primeiro: a RPC (security definer) devolve o papel atual sem depender de RLS.
      // Contas novas não recebem papel automaticamente: ficam aguardando um administrador.
      let papel: UserRole | null = null;
      let semPapel = false;
      let detail = "";
      const provisioned = await supabase.rpc("garantir_meu_perfil");
      if (attempt !== generation.current) return;
      if (!provisioned.error) {
        papel = asUserRole(provisioned.data);
        semPapel = !papel;
      } else {
        detail = provisioned.error.message ?? "";
        const existing = await supabase
          .from("user_roles")
          .select("papel")
          .eq("user_id", uid)
          .maybeSingle();
        if (attempt !== generation.current) return;
        if (!existing.error) {
          papel = asUserRole(existing.data?.papel);
          semPapel = !papel;
        } else detail = `${detail} | ${existing.error.message}`;
      }
      if (semPapel) {
        setRole(null);
        setStatus("pending_approval");
        setError(null);
        return;
      }
      if (!papel) {
        console.error("[auth] profile resolution failed:", detail);
        throw new Error(
          `Não foi possível carregar seu perfil. Verifique as migrations de acesso no banco. Detalhe: ${detail || "perfil inexistente"}`,
        );
      }
      setRole(papel);
      setStatus("ready");
      setError(null);
      void supabase.rpc("registrar_evento", { p_action: "LOGIN", p_module: "AUTENTICACAO" });
    } catch (cause) {
      if (attempt !== generation.current) return;
      setStatus("profile_error");
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar seu acesso.");
    }
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const attempt = ++generation.current;
    setStatus("loading");
    setError(null);
    const timeout = window.setTimeout(() => {
      if (attempt !== generation.current) return;
      setStatus("profile_error");
      setError("A verificação do seu perfil demorou demais. Tente novamente.");
    }, PROFILE_TIMEOUT_MS);
    void resolveProfile(uid, attempt).finally(() => window.clearTimeout(timeout));
  }, [session?.user?.id, resolveProfile]);

  const retry = useCallback(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const attempt = ++generation.current;
    setStatus("loading");
    setError(null);
    const timeout = window.setTimeout(() => {
      if (attempt !== generation.current) return;
      setStatus("profile_error");
      setError("A verificação do seu perfil demorou demais. Tente novamente.");
    }, PROFILE_TIMEOUT_MS);
    void resolveProfile(uid, attempt).finally(() => window.clearTimeout(timeout));
  }, [session?.user?.id, resolveProfile]);

  async function signInWithPassword(email: string, password: string) {
    if (!supabase) return { error: "Login indisponível." };
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    return { error: signInError ? "E-mail ou senha incorretos." : null };
  }
  async function signUpWithPassword(email: string, password: string) {
    if (!supabase) return { error: "Cadastro indisponível." };
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    return { error: signUpError ? signUpError.message : null };
  }
  async function signOut() {
    if (!supabase) return;
    try {
      await supabase.rpc("registrar_evento", { p_action: "LOGOUT", p_module: "AUTENTICACAO" });
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    setRole(null);
    setStatus("unauthenticated");
    setError(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      role,
      error,
      retry,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      isConfigured: isSupabaseConfigured,
      loading: status === "loading" || status === "not_configured",
      roleLoading: status === "loading",
    }),
    [status, session, role, error, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
