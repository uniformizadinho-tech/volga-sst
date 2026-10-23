import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { InspectionOverview, TrainingQueue } from "./operational-details";
import { montarPainelGeral } from "@/lib/painel-geral";
import { resumirInspecoesPainel } from "@/lib/inspecoes-dashboard";
import type { InspecoesDB } from "@/lib/inspecoes";
import type { HistoryEntry } from "@/lib/history-store";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
afterEach(cleanup);
const hoje = new Date(2026, 9, 10);
const base = { janelaDias: 30, armarios: [], estoqueItens: [], lancamentos: [], hoje };

describe("dashboard operational details", () => {
  it("shows expired people first and switches to upcoming expiry", () => {
    const historico = [
      {
        id: "old",
        createdAt: 1,
        shared: {
          data: "01/01/2025",
          validadeMeses: 12,
          normaRef: "NR 35",
          treinamento: "Trabalho em altura",
        },
        cols: [{ nome: "Pessoa vencida", cpf: "" }],
      },
      {
        id: "soon",
        createdAt: 2,
        shared: {
          data: "20/10/2025",
          validadeMeses: 12,
          normaRef: "NR 35",
          treinamento: "Trabalho em altura",
        },
        cols: [{ nome: "Pessoa a vencer", cpf: "" }],
      },
    ] as unknown as HistoryEntry[];
    render(<TrainingQueue painel={montarPainelGeral({ ...base, historico })} />);
    expect(screen.getByText("Pessoa vencida")).toBeInTheDocument();
    expect(screen.queryByText("Pessoa a vencer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Próximos 30 dias/ }));
    expect(screen.getByText("Pessoa a vencer")).toBeInTheDocument();
    expect(screen.getByText("Em 10 dias")).toBeInTheDocument();
    expect(screen.queryByText("Pessoa vencida")).not.toBeInTheDocument();
  });
  it("does not claim compliance for an empty base", () => {
    render(<TrainingQueue painel={montarPainelGeral({ ...base, historico: [] })} />);
    expect(screen.getByText("Nenhum certificado acompanhado ainda.")).toBeInTheDocument();
  });
  it("separates survey issues from monthly inspection history and ignores inactive equipment", () => {
    const db: InspecoesDB = {
      equipamentos: [
        {
          id: "a",
          codigo: "EXT01",
          tipo: "extintor",
          setor: "Produção",
          local: "Entrada",
          ativo: true,
          vencRecarga: "2026-10-01",
          pendencias: [
            {
              id: "p",
              descricao: "Reparar",
              nivel: "critico",
              situacao: "aberta",
              origem: "planilha",
              acao: "Trocar",
              prazo: "2026-10-05",
            },
            {
              id: "r",
              descricao: "Resolvido",
              nivel: "critico",
              situacao: "resolvida",
              origem: "cadastro",
              acao: "",
            },
          ],
        },
        {
          id: "b",
          codigo: "EXT02",
          tipo: "extintor",
          setor: "Produção",
          local: "Saída",
          ativo: false,
        },
      ],
      inspecoes: [],
    };
    render(<InspectionOverview hoje={hoje} db={db} />);
    expect(screen.getByText("0/1")).toBeInTheDocument();
    expect(screen.getByText("1 ainda não inspecionados")).toBeInTheDocument();
    expect(screen.getByText("1 pendências abertas · 1 com prazo atrasado")).toBeInTheDocument();
    expect(resumirInspecoesPainel(db, hoje)).toMatchObject({
      ativos: 1,
      feitos: 0,
      pendentes: 1,
      cobertura: 0,
      totalPendencias: 1,
      criticas: 1,
      atrasadas: 1,
      vencidos: 1,
    });
  });
});
