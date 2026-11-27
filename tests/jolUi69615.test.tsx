import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CalibrationCard } from "@/components/apple/CalibrationCard";
import { ExperimentCard } from "@/components/apple/ExperimentCard";
import type { CalibrationSummary } from "@shared/calibration";
import type { ThreeWayCalibration } from "@shared/prediction";
import type { ExperimentSummary } from "@shared/experiment";

afterEach(() => cleanup());

const SUMMARY: CalibrationSummary = {
  total: 20,
  answered: 20,
  skipped: 0,
  declared: 20,
  undeclaredPct: 0,
  buckets: [
    { level: "certeza", label: "Certeza", total: 10, correct: 8, accuracy: 80 },
    { level: "duvida", label: "Dúvida", total: 8, correct: 4, accuracy: 50 },
    { level: "chute", label: "Chute", total: 2, correct: 0, accuracy: 0 },
    {
      level: "nao_declarado",
      label: "Não declarado",
      total: 0,
      correct: 0,
      accuracy: 0,
    },
  ],
  chutesAcertados: 0,
  chutesErrados: 2,
  taxaChute: 10,
  indiceConfianca: 80,
  overallAccuracy: 60,
  calibrated: true,
};

const THREE_WAY: ThreeWayCalibration = {
  forecast: {
    kind: "forecast",
    sample: 4,
    predictedAvg: 85,
    actualAvg: 60,
    errorPoints: -25,
    brier: 0.72,
    available: true,
  },
  jol: {
    kind: "jol",
    sample: 3,
    predictedAvg: 68,
    actualAvg: 60,
    errorPoints: -8,
    brier: 0.1,
    available: true,
  },
  actual: { sample: 4, avg: 60 },
  improved: true,
  note: "O julgamento depois é mais preciso porque a tarefa já está resolvida.",
};

const EXPERIMENT: ExperimentSummary = {
  key: "feedback-block-vs-immediate",
  name: "Gabarito em bloco × imediato",
  variants: [
    {
      variant: "A",
      label: "Gabarito em bloco",
      n: 24,
      correct: 18,
      accuracy: 75,
      retentionN: 6,
      retentionAccuracy: 67,
      overrides: 2,
      overrideRate: 8,
    },
    {
      variant: "B",
      label: "Gabarito imediato",
      n: 22,
      correct: 14,
      accuracy: 64,
      retentionN: 5,
      retentionAccuracy: 40,
      overrides: 1,
      overrideRate: 5,
    },
  ],
  n: 46,
  minN: 22,
  minSample: 20,
  retentionDays: 7,
  insufficient: false,
  message: "Amostra suficiente para comparar as duas políticas.",
};

describe("card de calibração em três números (v6.9.15)", () => {
  it("mostra previsto antes, estimado depois e real com o erro de cada um", () => {
    render(
      <CalibrationCard
        summary={SUMMARY}
        predictions={THREE_WAY.forecast as any}
        threeWay={THREE_WAY}
      />,
    );

    expect(screen.getByText("Previsto antes")).toBeTruthy();
    expect(screen.getByText("Estimado depois")).toBeTruthy();
    expect(screen.getByText("Real")).toBeTruthy();
    expect(screen.getByTestId("three-way-forecast").textContent).toContain(
      "85%",
    );
    expect(screen.getByTestId("three-way-forecast").textContent).toContain(
      "-25",
    );
    expect(screen.getByTestId("three-way-jol").textContent).toContain("68%");
    expect(screen.getByTestId("three-way-jol").textContent).toContain("-8");
    expect(screen.getByTestId("three-way-actual").textContent).toContain("60%");
    expect(screen.getByText(/julgamento depois/i)).toBeTruthy();
  });
});

describe("card do experimento interno (v6.9.15)", () => {
  it("mostra nome, n por variante e acerto em questão nova", () => {
    render(<ExperimentCard summary={EXPERIMENT} />);

    expect(screen.getByText("Gabarito em bloco × imediato")).toBeTruthy();
    expect(screen.getByTestId("experiment-variant-A").textContent).toContain(
      "n=24",
    );
    expect(screen.getByTestId("experiment-variant-A").textContent).toContain(
      "75%",
    );
    expect(screen.getByTestId("experiment-variant-A").textContent).toContain(
      "67%",
    );
    expect(screen.getByTestId("experiment-variant-B").textContent).toContain(
      "n=22",
    );
  });

  it("com amostra pequena diz que não dá para concluir", () => {
    render(
      <ExperimentCard
        summary={{ ...EXPERIMENT, insufficient: true, minN: 6 }}
      />,
    );
    expect(screen.getByText(/amostra insuficiente \(n=6\)/i)).toBeTruthy();
  });
});
