import { trpc } from "@/lib/trpc";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  TrendingUp,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Trophy,
  Edit2,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function MockExams() {
  const utils = trpc.useUtils();
  const { data: exams, isLoading } = trpc.mockExam.list.useQuery();
  const createExam = trpc.mockExam.create.useMutation({
    onSuccess: () => {
      utils.mockExam.list.invalidate();
      toast.success("Simulado registrado!");
      setIsAdding(false);
      setEditingId(null);
      resetForm();
    },
    onError: (err) => {
      toast.error("Erro ao registrar: " + err.message);
    },
  });

  const updateExam = trpc.mockExam.update.useMutation({
    onSuccess: () => {
      utils.mockExam.list.invalidate();
      toast.success("Simulado atualizado!");
      setEditingId(null);
      setIsAdding(false);
      resetForm();
    },
    onError: (err) => {
      toast.error("Erro ao atualizar: " + err.message);
      setEditingId(null);
      setIsAdding(false);
      resetForm();
    },
  });

  const deleteExam = trpc.mockExam.delete.useMutation({
    onSuccess: () => {
      utils.mockExam.list.invalidate();
      toast.success("Simulado excluído!");
      setDeleteConfirmId(null);
    },
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    date: format(new Date(), "yyyy-MM-dd"),
    correct: 0,
    wrong: 0,
    blank: 0,
    totalQuestions: 0,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      date: format(new Date(), "yyyy-MM-dd"),
      correct: 0,
      wrong: 0,
      blank: 0,
      totalQuestions: 0,
    });
  };

  const handleEdit = (exam: any) => {
    setEditingId(exam.id);
    setFormData({
      name: exam.name,
      date: exam.date,
      correct: exam.correct,
      wrong: exam.wrong,
      blank: exam.blank,
      totalQuestions: exam.totalQuestions,
    });
    setIsAdding(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId !== null) {
      updateExam.mutate({ id: editingId, ...formData });
    } else {
      createExam.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    deleteExam.mutate({ id });
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  if (isLoading)
    return <div className="p-8 text-center">Carregando simulados...</div>;

  const chartData = exams
    ?.map((e) => ({
      name: format(parseISO(e.date), "dd/MM"),
      score: e.score,
      accuracy: Math.round((e.correct / e.totalQuestions) * 100),
    }))
    .reverse();

  const totalExams = exams?.length || 0;
  const totalQuestions = (exams || []).reduce(
    (sum, exam) => sum + (exam.totalQuestions || 0),
    0,
  );
  const totalCorrect = (exams || []).reduce(
    (sum, exam) => sum + (exam.correct || 0),
    0,
  );
  const avgAccuracy =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const bestScore = (exams || []).reduce(
    (best, exam) => Math.max(best, exam.score || 0),
    0,
  );

  return (
    <PageShell
      eyebrow="Desempenho"
      title="Simulados"
      description="Histórico, evolução e resultado líquido dos seus simulados."
      actions={
        !editingId ? (
          <Button
            onClick={() => setIsAdding(!isAdding)}
            className="h-9 gap-2 text-[10px]"
          >
            <Plus className="h-3.5 w-3.5" />{" "}
            {isAdding ? "Cancelar" : "Novo simulado"}
          </Button>
        ) : undefined
      }
      metrics={[
        { label: "Simulados", value: totalExams },
        { label: "Questões", value: totalQuestions },
        { label: "Acurácia média", value: `${avgAccuracy}%` },
        { label: "Melhor líquido", value: bestScore },
      ]}
    >
      {(isAdding || editingId !== null) && (
        <div className="soe-card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">
              {editingId !== null ? "Editar simulado" : "Registrar simulado"}
            </h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {editingId !== null
                ? "Atualize os dados do simulado"
                : "Preencha os dados da prova ou simulado"}
            </p>
          </div>
          <div>
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
            >
              <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                <Label className="text-xs sm:text-sm">Nome do Simulado</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ex: Simulado Estratégia - SEFAZ"
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Data</Label>
                <Input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Total de Questões</Label>
                <Input
                  type="number"
                  required
                  value={formData.totalQuestions}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      totalQuestions: Number(e.target.value),
                    })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm text-green-600">
                  Acertos
                </Label>
                <Input
                  type="number"
                  required
                  value={formData.correct}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      correct: Number(e.target.value),
                    })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm text-red-600">Erros</Label>
                <Input
                  type="number"
                  required
                  value={formData.wrong}
                  onChange={(e) =>
                    setFormData({ ...formData, wrong: Number(e.target.value) })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm text-muted-foreground">
                  Em Branco
                </Label>
                <Input
                  type="number"
                  required
                  value={formData.blank}
                  onChange={(e) =>
                    setFormData({ ...formData, blank: Number(e.target.value) })
                  }
                  className="text-sm"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  className="text-sm"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="text-sm">
                  {editingId !== null ? "Atualizar" : "Salvar"} Simulado
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {exams && exams.length > 0 && (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          <div className="soe-card p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <TrendingUp className="h-3.5 w-3.5 text-primary" /> Evolução de
              pontos líquidos
            </div>
            <div className="h-[250px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#0d9488"
                    strokeWidth={3}
                    dot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="soe-card p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Evolução de
              precisão
            </div>
            <div className="h-[250px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="accuracy"
                    fill="#0d9488"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Histórico
        </h2>
        {exams?.map((exam) => (
          <div
            key={exam.id}
            className="soe-card flex flex-col gap-4 border-l-2 border-l-primary p-4"
          >
            <div className="flex flex-col gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs sm:text-sm">
                    {format(parseISO(exam.date), "dd/MM/yyyy")}
                  </Badge>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {exam.totalQuestions} questões
                  </span>
                </div>
                <h3 className="text-base sm:text-xl font-bold truncate">
                  {exam.name}
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
                <div className="px-2 sm:px-4 py-2 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <div className="text-xs font-bold uppercase text-green-600">
                    Acertos
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-green-700">
                    {exam.correct}
                  </div>
                </div>
                <div className="px-2 sm:px-4 py-2 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <div className="text-xs font-bold uppercase text-red-600">
                    Erros
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-red-700">
                    {exam.wrong}
                  </div>
                </div>
                <div className="px-2 sm:px-4 py-2 bg-muted rounded-lg">
                  <div className="text-xs font-bold uppercase text-muted-foreground">
                    Branco
                  </div>
                  <div className="text-lg sm:text-xl font-bold">
                    {exam.blank}
                  </div>
                </div>
                <div className="px-2 sm:px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="text-xs font-bold uppercase text-primary">
                    Líquido
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-primary">
                    {exam.score}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(exam)}
                  className="gap-2 flex-1 sm:flex-none text-xs sm:text-sm"
                >
                  <Edit2 className="h-3 w-3 sm:h-4 sm:w-4" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmId(exam.id)}
                  className="gap-2 flex-1 sm:flex-none text-red-600 hover:text-red-700 text-xs sm:text-sm"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" /> Excluir
                </Button>
              </div>
            </div>
          </div>
        ))}
        {(!exams || exams.length === 0) && (
          <div className="soe-card border-dashed py-10 text-center text-muted-foreground">
            <FileText className="mx-auto mb-3 h-8 w-8 opacity-20" />
            <p className="text-xs">Nenhum simulado registrado ainda.</p>
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent className="w-[90vw] max-w-md">
          <AlertDialogTitle className="text-lg">
            Excluir Simulado
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            Tem certeza que deseja excluir este simulado? Esta ação não pode ser
            desfeita.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel className="text-sm">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700 text-sm"
            >
              Excluir
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
