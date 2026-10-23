import { Link } from "@tanstack/react-router";
import {
  Barcode,
  BookOpenCheck,
  CalendarClock,
  FireExtinguisher,
  FileText,
  Home,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Stethoscope,
  UserRound,
  ChevronRight,
  Menu,
  X,
  Users,
  Search,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VolgaLogo } from "@/components/brand/volga-logo";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import { flushPendingAudit, pendingAuditEvents } from "@/lib/operation-audit";

const operations = [
  { to: "/" as const, label: "Visão geral", icon: Home, group: "overview" },
  { to: "/armarios" as const, group: "Operação", label: "Armários", icon: LockKeyhole },
  { to: "/certificados" as const, group: "Pessoas e saúde", label: "Certificados", icon: FileText },
  {
    to: "/treinamentos" as const,
    group: "Pessoas e saúde",
    label: "Treinamentos e validades",
    icon: BookOpenCheck,
  },
  { to: "/exames" as const, group: "Pessoas e saúde", label: "Exames", icon: Stethoscope },
  { to: "/estoque" as const, group: "Operação", label: "Estoque", icon: Barcode },
  { to: "/inspecoes" as const, group: "Operação", label: "Inspeções", icon: FireExtinguisher },
];
const roleNames = {
  admin: "Administrador",
  sesmt: "SESMT",
  almoxarifado: "Almoxarifado",
  rh: "Recursos Humanos",
  leitor: "Consulta",
} as const;

export function AppFrame({
  active,
  search,
  userEmail,
  actions,
  children,
}: {
  active:
    | "/"
    | "/armarios"
    | "/certificados"
    | "/treinamentos"
    | "/validades"
    | "/exames"
    | "/estoque"
    | "/inspecoes"
    | "/admin";
  search?: ReactNode;
  userEmail?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { role, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moduleQuery, setModuleQuery] = useState("");
  const [pendingAudit, setPendingAudit] = useState(() => pendingAuditEvents().length);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  useEffect(() => {
    let active = true;
    void flushPendingAudit().finally(() => {
      if (active) setPendingAudit(pendingAuditEvents().length);
    });
    return () => {
      active = false;
    };
  }, []);
  const adminLinks =
    role === "admin"
      ? [{ to: "/admin" as const, label: "Administração", icon: Users, group: "Sistema" }]
      : [];
  const visibleOperations = operations.filter(
    (item) => item.to !== "/exames" || can(role, "exames.read"),
  );
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const matchedOperations = visibleOperations.filter((item) =>
    normalize(`${item.label} ${item.group}`).includes(normalize(moduleQuery.trim())),
  );
  const matchedAdminLinks = adminLinks.filter((item) =>
    normalize(`${item.label} ${item.group}`).includes(normalize(moduleQuery.trim())),
  );
  const displayEmail = userEmail || "Equipe Volga";
  const pageLabel =
    [...operations, ...adminLinks].find((item) => item.to === active)?.label || "Volga SST";
  return (
    <div className={`sst-frame min-h-screen text-foreground ${menuOpen ? "sst-menu-open" : ""}`}>
      <aside className="sst-sidebar" aria-label="Navegação principal">
        <Link to="/" className="sst-brand" aria-label="Volga SST — início">
          <VolgaLogo className="sst-brand-logo" width={120} height={36} />
          <span className="sst-brand-product">SST</span>
        </Link>
        <div className="sst-module-search">
          <Search size={16} aria-hidden="true" />
          <Input
            value={moduleQuery}
            onChange={(event) => setModuleQuery(event.target.value)}
            placeholder="Buscar módulo"
            aria-label="Buscar módulo"
          />
          {moduleQuery && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Limpar busca de módulos"
              onClick={() => setModuleQuery("")}
            >
              <X size={14} />
            </Button>
          )}
        </div>
        <nav className="sst-navigation" aria-label="Módulos">
          {["overview", "Pessoas e saúde", "Operação"].map(
            (group) =>
              matchedOperations.some((item) => item.group === group) && (
                <div className="sst-nav-section" key={group}>
                  {group !== "overview" && <p className="sst-nav-group">{group}</p>}
                  {matchedOperations
                    .filter((item) => item.group === group)
                    .map(({ to, label, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        aria-current={active === to ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={`sst-nav-link ${active === to ? "is-active" : ""}`}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{label}</span>
                      </Link>
                    ))}
                </div>
              ),
          )}
          {matchedOperations.length === 0 && matchedAdminLinks.length === 0 && (
            <p className="sst-nav-empty" role="status">
              Nenhum módulo encontrado.
            </p>
          )}
          {matchedAdminLinks.length > 0 && (
            <>
              <p className="sst-nav-group sst-nav-group-system">Sistema</p>
              {matchedAdminLinks.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  aria-current={active === to ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`sst-nav-link ${active === to ? "is-active" : ""}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="sst-sidebar-bottom">
          <Button
            type="button"
            variant="ghost"
            className="sst-sidebar-user"
            onClick={() => void signOut()}
            title="Sair da plataforma"
          >
            <span>
              <UserRound size={18} />
            </span>
            <div>
              <strong>{displayEmail}</strong>
              <small>{role ? roleNames[role] : "Sem perfil"}</small>
            </div>
            <LogOut size={16} />
          </Button>
        </div>
      </aside>
      {menuOpen && (
        <Button
          variant="ghost"
          className="sst-menu-backdrop"
          aria-label="Fechar navegação"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="sst-workspace">
        <header className="sst-topbar">
          <Button
            variant="ghost"
            size="icon"
            className="sst-menu-toggle"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
          <div className="sst-topbar-search">
            {search ?? (
              <div className="sst-breadcrumb">
                <span>Volga</span>
                <ChevronRight size={14} />
                <strong>{pageLabel}</strong>
              </div>
            )}
          </div>
          <div className="sst-account">
            <span className="sst-account-status" role="status">
              <i /> {pendingAudit ? `${pendingAudit} auditoria(s) pendente(s)` : "Sessão protegida"}
            </span>
            <span className="sst-topbar-user">
              <span className="sst-avatar">
                <UserRound size={17} />
              </span>
              <span>
                <strong>{displayEmail}</strong>
                <small>{role ? roleNames[role] : ""}</small>
              </span>
            </span>
            {actions}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
