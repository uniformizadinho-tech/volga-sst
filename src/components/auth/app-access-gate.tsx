import { useEffect, useState, type ReactNode } from "react";
import { pullSharedState } from "@/lib/shared-kv";
import { reconcileHistoryAfterPull } from "@/lib/history-store";
import { Clock, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import factoryImage from "@/assets/volga-factory.jpg";
import { VolgaLogo } from "@/components/brand/volga-logo";
import { Label } from "@/components/ui/label";

/** Global application gate. No module and no cached data renders before status === "ready". */
export function AppAccessGate({ children }: { children: ReactNode }) {
  const { status, user, error, retry, signInWithPassword, signUpWithPassword, signOut } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [sharedReady, setSharedReady] = useState(false);
  useEffect(() => {
    if (status !== "ready") {
      setSharedReady(false);
      return;
    }
    let alive = true;
    void pullSharedState().finally(() => {
      reconcileHistoryAfterPull();
      if (alive) setSharedReady(true);
    });
    return () => {
      alive = false;
    };
  }, [status]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 6) {
      setFormError("Informe um e-mail válido e uma senha com ao menos 6 caracteres.");
      return;
    }
    setSending(true);
    setFormError("");
    const result =
      mode === "signin"
        ? await signInWithPassword(email.trim(), password)
        : await signUpWithPassword(email.trim(), password);
    setSending(false);
    if (result.error) setFormError(result.error);
    else if (mode === "signup")
      setFormError(
        "Pedido enviado. Se for solicitado, confirme seu e-mail. Depois que um administrador liberar seu perfil, entre com este e-mail e senha.",
      );
  }

  switch (status) {
    case "not_configured":
      return (
        <Shell>
          <Mark>
            <ShieldCheck size={30} />
          </Mark>
          <h1>Login indisponível</h1>
          <p>
            A autenticação não está configurada neste ambiente. A plataforma não pode ser aberta sem
            login.
          </p>
        </Shell>
      );
    case "loading":
      return (
        <Shell>
          <Loader2 className="h-7 w-7 animate-spin text-accent" />
          <p>Verificando acesso seguro...</p>
        </Shell>
      );
    case "unauthenticated":
      return (
        <Shell>
          <Mark>
            <ShieldCheck size={30} />
          </Mark>
          <Kicker>Volga SST</Kicker>
          <h1>{mode === "signin" ? "Acessar plataforma" : "Solicitar acesso"}</h1>
          <p>
            {mode === "signin"
              ? "Acesse sua área de trabalho."
              : "Crie seu login. O acesso aos módulos é liberado por um administrador do SST."}
          </p>
          <div className="sst-login-tabs">
            <Button
              variant="ghost"
              type="button"
              className={mode === "signin" ? "is-active" : ""}
              onClick={() => {
                setMode("signin");
                setFormError("");
              }}
            >
              Entrar
            </Button>
            <Button
              variant="ghost"
              type="button"
              className={mode === "signup" ? "is-active" : ""}
              onClick={() => {
                setMode("signup");
                setFormError("");
              }}
            >
              Solicitar acesso
            </Button>
          </div>
          <form
            className="sst-login-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div>
              <Label htmlFor="gate-email">E-mail</Label>
              <Input
                id="gate-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
            <div>
              <Label htmlFor="gate-password">Senha</Label>
              <Input
                id="gate-password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
              />
            </div>
            {formError && (
              <p className="sst-login-error" role="alert">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={sending} className="w-full">
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Entrar na plataforma" : "Enviar pedido de acesso"}
            </Button>
          </form>
        </Shell>
      );
    case "profile_error":
      return (
        <Shell>
          <Mark>
            <UserRound size={28} />
          </Mark>
          <Kicker>Conta autenticada</Kicker>
          <h1>Não foi possível confirmar seu acesso</h1>
          <p role="alert" className="sst-login-error">
            {error || "Falha desconhecida ao carregar seu perfil."}
          </p>
          <p>
            A conta <strong>{user?.email}</strong> está autenticada. Isso não é um problema de
            layout: a verificação do perfil no servidor falhou ou a migration de acesso ainda não
            foi aplicada no ambiente.
          </p>
          <div className="sst-access-actions">
            <Button variant="outline" onClick={retry}>
              Tentar novamente
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sair da conta
            </Button>
          </div>
        </Shell>
      );
    case "pending_approval":
      return (
        <Shell>
          <Mark>
            <Clock size={28} />
          </Mark>
          <Kicker>Acesso solicitado</Kicker>
          <h1>Aguardando liberação</h1>
          <p>
            A conta <strong>{user?.email}</strong> foi criada, mas ainda não tem um perfil de
            acesso. Peça a um administrador do SST para liberar seu perfil na área de Administração.
          </p>
          <div className="sst-access-actions">
            <Button variant="outline" onClick={retry}>
              Verificar novamente
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sair da conta
            </Button>
          </div>
        </Shell>
      );
    case "ready":
      if (!sharedReady)
        return (
          <Shell>
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
            <p>Carregando dados da equipe...</p>
          </Shell>
        );
      return <>{children}</>;
  }
}
function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="sst-access-shell">
      <img
        className="sst-access-image"
        src={factoryImage}
        width={1920}
        height={1088}
        alt="Ambiente industrial organizado"
      />
      <div className="sst-access-brand">
        <VolgaLogo width={140} height={46} />
        <span className="sst-brand-product">SST</span>
      </div>
      <section className="sst-access-card">
        {children}
        <div className="sst-login-security">
          <ShieldCheck size={14} /> Ambiente de acesso protegido
        </div>
      </section>
      <footer className="sst-access-footer">Volga · Segurança e saúde do trabalho</footer>
    </main>
  );
}
function Mark({ children }: { children: ReactNode }) {
  return <div className="sst-login-mark">{children}</div>;
}
function Kicker({ children }: { children: ReactNode }) {
  return <p className="sst-login-kicker">{children}</p>;
}
