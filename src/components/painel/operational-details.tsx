import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, FireExtinguisher } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PainelGeral } from "@/lib/painel-geral";
import type { InspecoesDB } from "@/lib/inspecoes";
import { resumirInspecoesPainel } from "@/lib/inspecoes-dashboard";

export function TrainingQueue({ painel }: { painel: PainelGeral }) {
  const [view, setView] = useState<"vencido" | "atencao">("vencido");
  const rows = painel.validades.rows.filter((r) => r.status === view);
  return (
    <section className="sst-training-queue" aria-label="Colaboradores com prazos em atenção">
      <div className="sst-dashboard-section-heading">
        <h2>Fila de reciclagem</h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/validades" search={{ status: view }}>
            Ver todos <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
      <div className="sst-dashboard-tabs" role="group" aria-label="Prazo do treinamento">
        {(["vencido", "atencao"] as const).map((status) => (
          <Button
            key={status}
            variant="ghost"
            size="sm"
            aria-pressed={view === status}
            onClick={() => setView(status)}
          >
            {status === "vencido" ? "Vencidos" : `Próximos ${painel.janelaDias} dias`}
            <span>{painel.validades.rows.filter((r) => r.status === status).length}</span>
          </Button>
        ))}
      </div>
      {rows.length ? (
        <div className="sst-dashboard-table-wrap">
          <table className="sst-dashboard-table">
            <thead>
              <tr>
                <th>Colaborador / treinamento</th>
                <th>Validade</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((r) => (
                <tr key={r.key}>
                  <td>
                    <strong>{r.nome}</strong>
                    <small>{r.treinamento || r.normaRef}</small>
                  </td>
                  <td>{r.dataValidade?.toLocaleDateString("pt-BR") ?? "—"}</td>
                  <td>
                    <span
                      className={
                        view === "vencido"
                          ? "sst-dashboard-tag is-danger"
                          : "sst-dashboard-tag is-warning"
                      }
                    >
                      {view === "vencido"
                        ? `${Math.abs(r.diasRestantes ?? 0)} dias em atraso`
                        : r.diasRestantes === 0
                          ? "Vence hoje"
                          : `Em ${r.diasRestantes} dias`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 6 && (
            <p className="sst-dashboard-list-note">Mostrando 6 de {rows.length} treinamentos</p>
          )}
        </div>
      ) : (
        <div className="sst-dashboard-empty">
          <CheckCircle2 size={20} />
          <p>
            {painel.validades.rows.length
              ? "Nenhum treinamento neste prazo."
              : "Nenhum certificado acompanhado ainda."}
          </p>
        </div>
      )}
    </section>
  );
}

export function InspectionOverview({ db, hoje }: { db: InspecoesDB; hoje: Date }) {
  const resumo = resumirInspecoesPainel(db, hoje);
  return (
    <section className="sst-inspection-overview" aria-label="Combate a incêndio">
      <div className="sst-dashboard-section-heading">
        <h2>
          <FireExtinguisher size={18} /> Combate a incêndio
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/inspecoes">
            Inspeções <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
      <div className="sst-inspection-numbers">
        <div>
          <strong>{resumo.ativos ? `${resumo.feitos}/${resumo.ativos}` : "—"}</strong>
          <span>Inspecionados no mês</span>
        </div>
        <div>
          <strong className={resumo.criticas ? "text-destructive" : ""}>
            {resumo.ativos ? resumo.criticas : "—"}
          </strong>
          <span>Pendências críticas</span>
        </div>
        <div>
          <strong className={resumo.vencidos ? "text-destructive" : ""}>
            {resumo.ativos ? resumo.vencidos : "—"}
          </strong>
          <span>Equipamentos vencidos</span>
        </div>
      </div>
      {resumo.ativos > 0 && (
        <div className="sst-inspection-progress">
          <span style={{ width: `${resumo.cobertura}%` }} />
          <span className="sr-only">
            {resumo.cobertura}% dos equipamentos inspecionados neste mês
          </span>
        </div>
      )}
      <div className="sst-inspection-footer">
        {resumo.ativos ? (
          <>
            <span>{resumo.pendentes} ainda não inspecionados</span>
            <span>
              {resumo.totalPendencias} pendências abertas · {resumo.atrasadas} com prazo atrasado
            </span>
          </>
        ) : (
          <span>Nenhum equipamento disponível na base consultada.</span>
        )}
      </div>
    </section>
  );
}
