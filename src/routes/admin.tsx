import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  CalendarClock,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { AppFrame } from "@/components/layout/app-frame";
import { useAuth, type UserRole } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Volga SST" },
      {
        name: "description",
        content: "Gerencie acessos e acompanhe a atividade da operação Volga SST.",
      },
      { property: "og:title", content: "Administração — Volga SST" },
      { property: "og:description", content: "Acessos e atividade da operação Volga SST." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type Account = {
  id: string;
  email: string | null;
  papel: UserRole | "sem_papel";
  emissoes: number;
  certificados: number;
  acoes: number;
  created_at: string;
  last_sign_in_at: string | null;
};
type Event = {
  id: number;
  email: string | null;
  action: string;
  module: string;
  description: string | null;
  created_at: string;
};
type Stats = {
  usuarios_total: number;
  usuarios_ativos_7d: number;
  usuarios_novos_7d: number;
  certificados_total: number;
  certificados_hoje: number;
  certificados_7d: number;
  certificados_mes: number;
  acoes_hoje: number;
  usuarios_ativos_hoje: number;
};
const roles: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "sesmt", label: "SESMT" },
  { value: "almoxarifado", label: "Almoxarifado" },
  { value: "rh", label: "RH" },
  { value: "leitor", label: "Somente leitura" },
];
const formatDate = (value?: string | null) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";

function AdminPage() {
  const { user, role, loading: authLoading, roleLoading, retry: refreshRole } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const pendentes = accounts.filter((a) => a.papel === "sem_papel").length;
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("todos");
  const [selected, setSelected] = useState("");
  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState("");

  const refresh = useCallback(
    async (position: number) => {
      if (!supabase || role !== "admin") return;
      setLoading(true);
      setError("");
      const [statsResult, usersResult, eventsResult] = await Promise.all([
        supabase.rpc("admin_dashboard_stats"),
        supabase.rpc("admin_resumo_usuarios"),
        supabase.rpc("admin_atividade_recente", {
          p_limit: 50,
          p_offset: position,
          p_user_id: selected || null,
        }),
      ]);
      if (statsResult.error || usersResult.error || eventsResult.error) {
        setError(
          "Não foi possível carregar o painel. Confira se as atualizações de acesso (migration 0010) foram aplicadas.",
        );
      } else {
        setStats(statsResult.data as Stats);
        setAccounts(Array.isArray(usersResult.data) ? (usersResult.data as Account[]) : []);
        setEvents(Array.isArray(eventsResult.data) ? (eventsResult.data as Event[]) : []);
      }
      setLoading(false);
    },
    [role, selected],
  );
  useEffect(() => {
    if (role === "admin") void refresh(offset);
  }, [role, refresh, offset]);
  const visibleAccounts = useMemo(
    () => accounts.filter((a) => (a.email ?? "").toLowerCase().includes(query.toLowerCase())),
    [accounts, query],
  );
  const visibleEvents = useMemo(
    () =>
      moduleFilter === "todos" ? events : events.filter((event) => event.module === moduleFilter),
    [events, moduleFilter],
  );

  async function changeRole(account: Account, nextRole: UserRole) {
    if (!supabase || nextRole === account.papel || saving) return;
    if (
      !window.confirm(
        `Alterar o perfil de ${account.email ?? "usuário"} para ${roles.find((r) => r.value === nextRole)?.label}?`,
      )
    )
      return;
    setSaving(account.id);
    setError("");
    const { error: changeError } = await supabase.rpc("admin_definir_papel", {
      p_user_id: account.id,
      p_papel: nextRole,
    });
    if (changeError)
      setError(
        "Não foi possível alterar este perfil. Confirme que a conta existe e que permanece ao menos um administrador.",
      );
    else {
      refreshRole();
      await refresh(offset);
    }
    setSaving("");
  }

  return (
    <AppFrame active="/admin" userEmail={user?.email}>
      <main className="sst-main sst-admin">
        <div className="sst-page-heading">
          <div>
            <p className="sst-eyebrow">Gestão / Acesso</p>
            <h1>Administração</h1>
            <p>Usuários, certificados e atividade real registrada no banco de dados.</p>
          </div>
          {role === "admin" && (
            <Button variant="outline" onClick={() => void refresh(offset)} disabled={loading}>
              <RefreshCcw size={16} /> Atualizar
            </Button>
          )}
        </div>
        {authLoading || roleLoading ? (
          <Card className="p-6">Verificando acesso...</Card>
        ) : !user ? (
          <Card className="p-6">
            Entre com uma conta de administrador para acessar este painel.
          </Card>
        ) : role !== "admin" ? (
          <Card className="p-6">
            Acesso restrito a administradores. Solicite a atribuição do perfil ao responsável pelo
            sistema.
          </Card>
        ) : (
          <>
            {error && (
              <p role="alert" className="sst-admin-error">
                {error}
              </p>
            )}
            <div className="sst-admin-stats">
              <Card className="sst-admin-stat">
                <span>
                  <Users size={19} />
                </span>
                <small>Usuários (total)</small>
                <strong>{stats?.usuarios_total ?? "—"}</strong>
              </Card>
              <Card className="sst-admin-stat">
                <span>
                  <UserPlus size={19} />
                </span>
                <small>Novos (7 dias)</small>
                <strong>{stats?.usuarios_novos_7d ?? "—"}</strong>
              </Card>
              <Card className="sst-admin-stat">
                <span>
                  <Activity size={19} />
                </span>
                <small>Ativos hoje</small>
                <strong>{stats?.usuarios_ativos_hoje ?? "—"}</strong>
              </Card>
              <Card className="sst-admin-stat">
                <span>
                  <BadgeCheck size={19} />
                </span>
                <small>Certificados (total)</small>
                <strong>{stats?.certificados_total ?? "—"}</strong>
              </Card>
              <Card className="sst-admin-stat">
                <span>
                  <CalendarClock size={19} />
                </span>
                <small>Certificados hoje</small>
                <strong>{stats?.certificados_hoje ?? "—"}</strong>
              </Card>
              <Card className="sst-admin-stat">
                <span>
                  <ShieldCheck size={19} />
                </span>
                <small>Certificados (mês)</small>
                <strong>{stats?.certificados_mes ?? "—"}</strong>
              </Card>
            </div>
            <p className="sst-admin-note">
              Certificados contam cada participante incluído em uma emissão confirmada. Ações =
              eventos persistidos em audit_logs; não incluem cliques ou leituras de tela.
            </p>
            <Card className="sst-admin-section">
              <div className="sst-admin-section-heading">
                <h2>Usuários</h2>
                <div className="sst-admin-search">
                  <Search size={16} />
                  <Input
                    aria-label="Buscar usuário por e-mail"
                    placeholder="Buscar por e-mail"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              {pendentes > 0 && (
                <p className="sst-admin-pending" role="status">
                  {pendentes === 1
                    ? "1 conta aguardando liberação."
                    : `${pendentes} contas aguardando liberação.`}{" "}
                  Escolha um perfil na coluna ao lado do e-mail para liberar o acesso.
                </p>
              )}
              <div className="sst-admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Perfil</th>
                      <th>Emissões</th>
                      <th>Certificados</th>
                      <th>Ações</th>
                      <th>Último acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAccounts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button
                            type="button"
                            className="sst-admin-user"
                            onClick={() => {
                              setOffset(0);
                              setSelected(selected === a.id ? "" : a.id);
                            }}
                            aria-pressed={selected === a.id}
                          >
                            {a.email || "Conta sem e-mail"}
                          </button>
                        </td>
                        <td>
                          <select
                            aria-label={`Perfil de ${a.email ?? "usuário"}`}
                            value={a.papel}
                            disabled={saving === a.id}
                            onChange={(e) => void changeRole(a, e.target.value as UserRole)}
                          >
                            {a.papel === "sem_papel" && (
                              <option value="sem_papel">Aguardando liberação</option>
                            )}
                            {roles.map((x) => (
                              <option key={x.value} value={x.value}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{a.emissoes}</td>
                        <td>
                          <strong>{a.certificados}</strong>
                        </td>
                        <td>{a.acoes}</td>
                        <td>{formatDate(a.last_sign_in_at)}</td>
                      </tr>
                    ))}
                    {!visibleAccounts.length && (
                      <tr>
                        <td colSpan={6}>
                          {loading ? "Carregando..." : "Nenhum usuário encontrado."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="sst-admin-section">
              <div className="sst-admin-section-heading">
                <h2>Atividade recente {selected && "· usuário selecionado"}</h2>
                <div className="flex items-center gap-2">
                  {" "}
                  <label className="sr-only" htmlFor="admin-module-filter">
                    Filtrar atividade por módulo
                  </label>
                  <select
                    id="admin-module-filter"
                    value={moduleFilter}
                    onChange={(event) => setModuleFilter(event.target.value)}
                  >
                    <option value="todos">Todos os módulos</option>
                    <option value="ESTOQUE">Estoque</option>
                    <option value="ARMARIOS">Armários</option>
                    <option value="INSPECOES">Inspeções</option>
                    <option value="TREINAMENTOS">Treinamentos</option>
                    <option value="CERTIFICADOS">Certificados</option>
                    <option value="AUTENTICACAO">Autenticação</option>
                  </select>
                  {selected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOffset(0);
                        setSelected("");
                      }}
                    >
                      Limpar filtro
                    </Button>
                  )}
                </div>
              </div>
              <div className="sst-admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Responsável</th>
                      <th>Módulo</th>
                      <th>Evento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEvents.map((e) => (
                      <tr key={e.id}>
                        <td>{formatDate(e.created_at)}</td>
                        <td>{e.email || "Sistema"}</td>
                        <td>{e.module}</td>
                        <td>{e.description || e.action}</td>
                      </tr>
                    ))}
                    {!visibleEvents.length && (
                      <tr>
                        <td colSpan={4}>
                          {loading
                            ? "Carregando..."
                            : "Nenhuma ação registrada nesta página para o filtro selecionado."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="sst-admin-pager">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                  disabled={offset === 0 || loading}
                >
                  Anterior
                </Button>
                <span>
                  {offset + 1}–{offset + events.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(offset + 50)}
                  disabled={events.length < 50 || loading}
                >
                  Próxima
                </Button>
              </div>
            </Card>
          </>
        )}
      </main>
    </AppFrame>
  );
}
