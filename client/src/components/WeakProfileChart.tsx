import { trpc } from "@/lib/trpc";
import { AlertTriangle, TrendingDown, Target, BarChart2 } from "lucide-react";

const VOLATILITY_LABEL = { low: "Estável", medium: "Moderada", high: "Alta" };
const VOLATILITY_COLOR = {
  low: "var(--success-fg, #1a7f37)",
  medium: "#f59e0b",
  high: "var(--danger-fg, #c0392b)",
};

interface WeakProfileChartProps {
  onSelectTopic?: (
    disciplineId: number,
    topicId: number,
    topicName: string,
    discName: string,
  ) => void;
}

export function WeakProfileChart({ onSelectTopic }: WeakProfileChartProps) {
  const { data, isLoading } = trpc.mentor.getWeakProfile.useQuery();

  if (isLoading) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          opacity: 0.5,
          fontSize: 13,
        }}
      >
        Analisando pontos fracos...
      </div>
    );
  }

  if (!data || data.weakTopics.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          opacity: 0.5,
          fontSize: 13,
        }}
      >
        <BarChart2
          size={32}
          style={{ margin: "0 auto 0.5rem", display: "block", opacity: 0.3 }}
        />
        Resolva questões e faça revisões para o mentor mapear seus pontos
        fracos.
      </div>
    );
  }

  const maxScore = Math.max(
    ...data.weakTopics.map((t: any) => t.vulnerabilityScore),
    1,
  );

  return (
    <div>
      {/* Discipline overview */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            marginBottom: "0.75rem",
            opacity: 0.7,
          }}
        >
          Vulnerabilidade por disciplina
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.weakDisciplines.slice(0, 6).map((d: any) => {
            const fv = d.forgettingVolatility as keyof typeof VOLATILITY_COLOR;
            const barWidth = Math.max(
              4,
              Math.round((d.avgVulnerabilityScore / 100) * 100),
            );
            return (
              <div
                key={d.disciplineId}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: d.color || "#888",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.name}
                    </span>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {d.accuracy !== null && (
                        <span style={{ fontSize: 11, opacity: 0.65 }}>
                          {d.accuracy}% acerto
                        </span>
                      )}
                      <span
                        style={{ fontSize: 11, color: VOLATILITY_COLOR[fv] }}
                      >
                        {VOLATILITY_LABEL[fv]}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      height: 5,
                      borderRadius: 3,
                      background: "var(--card-border-color, rgba(0,0,0,0.1))",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 3,
                        width: `${barWidth}%`,
                        background:
                          d.avgVulnerabilityScore > 60
                            ? "var(--danger-fg, #c0392b)"
                            : d.avgVulnerabilityScore > 30
                              ? "#f59e0b"
                              : "var(--success-fg, #1a7f37)",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Worst topics */}
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            marginBottom: "0.75rem",
            opacity: 0.7,
          }}
        >
          Tópicos mais críticos
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.weakTopics.slice(0, 8).map((t: any, i: any) => {
            const barW = Math.round((t.vulnerabilityScore / maxScore) * 100);
            return (
              <div
                key={t.topicId}
                onClick={() =>
                  onSelectTopic?.(
                    t.disciplineId,
                    t.topicId,
                    t.topicName,
                    t.disciplineName,
                  )
                }
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--card-border)",
                  cursor: onSelectTopic ? "pointer" : "default",
                  background: i === 0 ? "rgba(192,57,43,0.04)" : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (onSelectTopic)
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--card-bg-secondary, rgba(0,0,0,0.04))";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    i === 0 ? "rgba(192,57,43,0.04)" : "transparent";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {i === 0 && (
                      <AlertTriangle
                        size={12}
                        color="var(--danger-fg, #c0392b)"
                      />
                    )}
                    {i > 0 && i < 3 && (
                      <TrendingDown size={12} color="#f59e0b" />
                    )}
                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                      {t.topicName}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, opacity: 0.55 }}>
                    {t.disciplineName}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: "var(--card-border-color, rgba(0,0,0,0.1))",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${barW}%`,
                        borderRadius: 2,
                        background:
                          t.vulnerabilityScore > 60
                            ? "var(--danger-fg, #c0392b)"
                            : t.vulnerabilityScore > 30
                              ? "#f59e0b"
                              : "var(--success-fg, #1a7f37)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.55,
                      display: "flex",
                      gap: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.accuracy !== null && <span>{t.accuracy}% acerto</span>}
                    {t.avgRecall !== null && (
                      <span>recall {t.avgRecall}/5</span>
                    )}
                    {t.errorCount > 0 && <span>{t.errorCount} erros</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {onSelectTopic && data.weakTopics.length > 0 && (
        <div
          style={{
            fontSize: 11,
            opacity: 0.5,
            marginTop: "0.75rem",
            textAlign: "center",
          }}
        >
          Clique em um tópico para iniciar sessão adaptativa nele
        </div>
      )}
    </div>
  );
}
