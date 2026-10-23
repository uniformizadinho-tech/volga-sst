# Volga SST

Plataforma interna de Segurança e Saúde do Trabalho da Volga: certificados de treinamento,
validades, exames ocupacionais, inspeções de incêndio, estoque de EPI e armários.

Construída com TanStack Start (React 19 + Vite), Tailwind e Supabase (login e dados da equipe).
Projeto conectado ao [Lovable](https://lovable.dev/projects/88f60b6d-92c8-4972-83ad-d670bb1f4a8b):
commits na branch conectada voltam para o editor.

## Módulos

| Rota | Módulo | Quem pode alterar |
| --- | --- | --- |
| `/` | Visão geral (indicadores e fila de ação) | — |
| `/certificados` | Emissão de certificados a partir de modelos PPTX | admin, sesmt |
| `/treinamentos` | Matriz de treinamentos e validades | admin, sesmt, rh |
| `/exames` | Exames ocupacionais | admin, sesmt, rh |
| `/inspecoes` | Equipamentos de incêndio e pendências | admin, sesmt |
| `/estoque` | Contagem de estoque (restaurar backup: só admin) | admin, almoxarifado, sesmt |
| `/armarios` | Controle de armários | admin, sesmt, rh |
| `/admin` | Usuários e perfis | admin |

As permissões da interface estão em `src/lib/permissions.ts`. Elas só escondem/bloqueiam
botões: a proteção real dos dados precisa estar nas políticas RLS do Supabase.

## Acesso de novos usuários

Quem clica em **Solicitar acesso** cria o login, mas entra **sem perfil** e vê a tela
"Aguardando liberação". Um administrador libera em **Administração › Usuários**, escolhendo o
perfil na linha marcada como "Aguardando liberação".

As migrations 0012–0015 já foram aplicadas no Supabase de produção (23/10/2026). Para um banco novo, aplique `supabase/migrations/0012_cadastro_com_aprovacao.sql` e as seguintes
no SQL Editor do Supabase (o arquivo explica como conferir e como desfazer). Se preferir que
ninguém consiga nem pedir acesso, desligue também o cadastro em
*Supabase › Authentication › Sign In / Providers › Allow new users to sign up* e convide as
pessoas pelo painel do Supabase.

## Rodando localmente

```sh
bun install        # ou npm install
bun run dev        # http://localhost:8080 (ou a porta indicada no terminal)
```

> O `bun.lock` aponta para o registro de pacotes interno do Lovable. Fora do Lovable, se a
> instalação falhar com erro 403, instale a partir do registro público:
> `BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun install --no-save`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento |
| `bun run build` | Build de produção |
| `bun run test` | Testes (Vitest) |
| `bun run lint` | ESLint + Prettier |
| `bun run format` | Formata o código |

## Dados compartilhados

- Tabelas próprias: `exames_ocupacionais`, `estoque_itens`, `estoque_lancamentos`, `lockers`,
  `lockers_historico`, `templates`, `user_roles`.
- Configurações e listas menores ficam na tabela `app_shared_state` (chave/valor), com cache
  no `localStorage`. O histórico de certificados é gravado com mescla e verificação de versão
  (`updateSharedWithRetry`), e as alterações feitas sem conexão ficam numa fila que é reenviada
  automaticamente.
- A auditoria (`registrar_evento`) guarda localmente apenas os eventos que falharam ao enviar
  e os reenvia quando uma página é aberta.
