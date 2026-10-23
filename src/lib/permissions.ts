import type { UserRole } from "@/hooks/use-auth";

export type Permission =
  | "dashboard.read"
  | "exames.read"
  | "exames.write"
  | "inspecoes.write"
  | "treinamentos.write"
  | "estoque.write"
  | "estoque.delete"
  | "armarios.write"
  | "armarios.delete"
  | "certificados.emit"
  | "backup.restore"
  | "admin.manage";

const matrix: Record<Permission, readonly UserRole[]> = {
  "dashboard.read": ["admin", "sesmt", "almoxarifado", "rh", "leitor"],
  "exames.read": ["admin", "sesmt", "rh"],
  "exames.write": ["admin", "sesmt", "rh"],
  "inspecoes.write": ["admin", "sesmt"],
  "treinamentos.write": ["admin", "sesmt", "rh"],
  "estoque.write": ["admin", "almoxarifado", "sesmt"],
  "estoque.delete": ["admin"],
  "armarios.write": ["admin", "sesmt", "rh"],
  "armarios.delete": ["admin"],
  "certificados.emit": ["admin", "sesmt"],
  "backup.restore": ["admin"],
  "admin.manage": ["admin"],
};

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  return !!role && matrix[permission].includes(role);
}

export function explainDenied(permission: Permission): string {
  const labels: Record<Permission, string> = {
    "dashboard.read": "visualizar o painel",
    "exames.read": "visualizar exames ocupacionais",
    "exames.write": "alterar exames ocupacionais",
    "inspecoes.write": "alterar inspeções",
    "treinamentos.write": "alterar treinamentos",
    "estoque.write": "alterar o estoque",
    "estoque.delete": "excluir itens do estoque",
    "armarios.write": "alterar armários",
    "armarios.delete": "excluir armários",
    "certificados.emit": "emitir certificados",
    "backup.restore": "restaurar um backup",
    "admin.manage": "gerenciar usuários",
  };
  return `Seu perfil não permite ${labels[permission]}. Solicite a autorização ao administrador.`;
}
