import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  BookMarked,
  Calendar,
  Search,
  Filter,
  X,
  BarChart2,
  Brain,
  BookOpen,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatStudyTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Topics() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<{
    id: number;
    name: string;
    disciplineId: number;
    notes: string;
    studyTimeSeconds: number;
  } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    disciplineId: 0,
    studyDate: new Date().toISOString().split("T")[0],
    studyTimeMinutes: 60,
    notes: "",
  });
  const [filters, setFilters] = useState({
    disciplineId: undefined as number | undefined,
    search: "",
  });
  const [questionsDialog, setQuestionsDialog] = useState<{
    topicId: number;
    topicName: string;
    correctCount: number;
    errorCount: number;
  } | null>(null);
  const [preTestDialog, setPreTestDialog] = useState<{
    open: boolean;
    pendingCreate: boolean;
  } | null>(null);
  const [preTestText, setPreTestText] = useState("");

  const utils = trpc.useUtils();
  const { data: disciplinesData } = trpc.discipline.list.useQuery();
  const { data: topicsData, isLoading } = trpc.topic.list.useQuery(
    filters.disciplineId || filters.search
      ? { disciplineId: filters.disciplineId, search: filters.search }
      : undefined,
  );

  const createMutation = trpc.topic.create.useMutation({
    onSuccess: (data) => {
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
      setIsCreateOpen(false);
      setFormData({
        name: "",
        disciplineId: 0,
        studyDate: "",
        studyTimeMinutes: 60,
        notes: "",
      });
      toast.success(
        `Tema registrado! ${data.revisionsCreated} revisões agendadas.`,
      );
    },
    onError: (error) => toast.error("Erro ao registrar tema: " + error.message),
  });

  const updateMutation = trpc.topic.update.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      setEditingTopic(null);
      toast.success("Tema atualizado!");
    },
    onError: (error) => toast.error("Erro ao atualizar tema: " + error.message),
  });

  const deleteMutation = trpc.topic.delete.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success("Tema excluído!");
    },
    onError: (error) => toast.error("Erro ao excluir tema: " + error.message),
  });

  const handleCreate = () => {
    if (!formData.name.trim() || !formData.disciplineId) {
      toast.error("Nome e disciplina são obrigatórios");
      return;
    }
    setPreTestText("");
    setPreTestDialog({ open: true, pendingCreate: true });
  };

  const doCreate = () => {
    createMutation.mutate({
      name: formData.name,
      disciplineId: formData.disciplineId,
      studyDate: formData.studyDate || undefined,
      studyTimeSeconds: formData.studyTimeMinutes * 60,
      notes: formData.notes || undefined,
    });
    setPreTestDialog(null);
  };

  const handleUpdate = () => {
    if (!editingTopic) return;
    updateMutation.mutate({
      id: editingTopic.id,
      name: editingTopic.name,
      disciplineId: editingTopic.disciplineId,
      notes: editingTopic.notes || undefined,
      studyTimeSeconds: editingTopic.studyTimeSeconds || undefined,
    });
  };

  const getDiscipline = (id: number) =>
    disciplinesData?.find((d: any) => d.id === id);
  const clearFilters = () =>
    setFilters({ disciplineId: undefined, search: "" });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2
            className="text-3xl font-black tracking-tight flex items-center gap-2.5"
            style={{ color: "var(--app-fg)" }}
          >
            Temas
          </h2>
          <p className="text-sm opacity-60">
            Organize o conteúdo programático do seu edital.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="h-14 px-8 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <Plus size={18} />
          <span>Registrar Novo Tema</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none opacity-20 group-focus-within:opacity-100 transition-opacity">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Pesquisar por nome do tema..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-12 pr-4 h-14 rounded-2xl bg-white/[0.02] border border-white/5 focus:border-[var(--primary)] outline-none transition-all font-bold text-sm"
          />
        </div>

        <select
          value={filters.disciplineId || ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              disciplineId: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="h-14 px-6 rounded-2xl bg-white/[0.02] border border-white/5 text-[10px] font-black uppercase tracking-widest outline-none focus:border-[var(--primary)] transition-all"
        >
          <option value="">Todas as Disciplinas</option>
          {disciplinesData?.map((d: any) => (
            <option key={d.id} value={d.id} className="bg-slate-900">
              {d.name}
            </option>
          ))}
        </select>

        {(filters.search || filters.disciplineId) && (
          <button
            onClick={clearFilters}
            className="h-14 px-6 rounded-2xl bg-rose-500/5 text-rose-500 border border-rose-500/10 hover:bg-rose-500 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Topics List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-20 text-center opacity-30 font-black uppercase text-[10px] tracking-widest animate-pulse">
            Carregando seus temas...
          </div>
        ) : topicsData?.topics.length === 0 ? (
          <div className="soe-card py-20 flex flex-col items-center justify-center border-dashed opacity-40">
            <BookMarked size={48} className="mb-4" />
            <p className="text-xl font-black uppercase tracking-widest">
              Nenhum tema encontrado
            </p>
            <p className="text-xs mt-2">
              Use a barra de pesquisa ou mude os filtros.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {topicsData?.topics.map((topic: any) => {
              const discipline = getDiscipline(topic.disciplineId);
              const accuracy = (topic as any).performance?.accuracy || 0;

              return (
                <div
                  key={topic.id}
                  className="soe-card group hover:border-[var(--primary-border)] transition-all overflow-hidden relative"
                >
                  <div
                    className="absolute top-0 left-0 w-1 h-full opacity-20"
                    style={{ backgroundColor: discipline?.color }}
                  />

                  <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-[var(--primary)] group-hover:scale-110 transition-transform">
                        <BookOpen size={20} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[9px] font-black uppercase tracking-widest"
                            style={{ color: discipline?.color }}
                          >
                            {discipline?.name}
                          </span>
                          <div className="w-1 h-1 rounded-full bg-white/10" />
                          <span className="text-[9px] font-black uppercase tracking-widest opacity-30">
                            Tema #{topic.id}
                          </span>
                        </div>
                        <h4
                          className="text-lg font-black tracking-tight leading-tight"
                          style={{ color: "var(--app-fg)" }}
                        >
                          {topic.name}
                        </h4>

                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1.5 opacity-40">
                            <Clock size={12} />
                            <span className="text-[10px] font-bold">
                              {formatStudyTime(
                                (topic as any).studyTimeSeconds || 0,
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-40">
                            <BarChart2 size={12} />
                            <span className="text-[10px] font-bold">
                              {(topic as any).performance?.questionsResolved ||
                                0}{" "}
                              questões
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-4 md:pt-0 border-white/5">
                      {accuracy > 0 && (
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-1">
                            Aproveitamento
                          </p>
                          <p
                            className="text-xl font-black"
                            style={{
                              color:
                                accuracy >= 70
                                  ? "var(--accent-green)"
                                  : accuracy >= 50
                                    ? "var(--accent-amber)"
                                    : "var(--accent-red)",
                            }}
                          >
                            {accuracy}%
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setEditingTopic({
                              id: topic.id,
                              name: topic.name,
                              disciplineId: topic.disciplineId,
                              notes: topic.notes || "",
                              studyTimeSeconds:
                                (topic as any).studyTimeSeconds || 0,
                            })
                          }
                          className="p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all opacity-40 hover:opacity-100"
                        >
                          <Pencil size={16} />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all opacity-40 hover:opacity-100">
                              <Trash2 size={16} />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[2.5rem] border-white/10 bg-[var(--app-bg)] p-8">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-2xl font-black">
                                Excluir Tema?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-sm opacity-60 mt-2">
                                Isto removerá permanentemente o tema "
                                {topic.name}" e todo o histórico de questões
                                vinculado a ele.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-8 gap-3">
                              <AlertDialogCancel className="h-12 rounded-2xl border-white/5 font-black uppercase text-[10px] tracking-widest px-8">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  deleteMutation.mutate({ id: topic.id })
                                }
                                className="h-12 rounded-2xl bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest px-8 shadow-xl shadow-rose-500/20"
                              >
                                Excluir Tema
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-[2.5rem] border-white/10 bg-[var(--app-bg)] p-8 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              Novo Tema de Estudo
            </DialogTitle>
            <DialogDescription className="text-sm opacity-60">
              Registre um novo assunto no seu cronograma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">
                Disciplina Relacionada
              </label>
              <Select
                onValueChange={(val) =>
                  setFormData({ ...formData, disciplineId: Number(val) })
                }
              >
                <SelectTrigger className="h-14 rounded-2xl bg-white/5 border-white/5 text-sm font-bold focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder="Selecione a matéria..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-white/10 bg-[var(--app-bg)]">
                  {disciplinesData?.map((d: any) => (
                    <SelectItem
                      key={d.id}
                      value={String(d.id)}
                      className="rounded-xl focus:bg-[var(--primary)] focus:text-white"
                    >
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">
                Título do Assunto
              </label>
              <input
                placeholder="Ex: Controle de Constitucionalidade"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-5 h-14 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold outline-none focus:border-[var(--primary)] transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">
                  Data do Estudo
                </label>
                <input
                  type="date"
                  value={formData.studyDate}
                  onChange={(e) =>
                    setFormData({ ...formData, studyDate: e.target.value })
                  }
                  className="w-full px-5 h-14 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold outline-none focus:border-[var(--primary)] transition-all [color-scheme:dark]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">
                  Tempo (Minutos)
                </label>
                <input
                  type="number"
                  placeholder="Ex: 60"
                  value={formData.studyTimeMinutes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      studyTimeMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full px-5 h-14 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold outline-none focus:border-[var(--primary)] transition-all"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              className="w-full h-14 rounded-2xl bg-[var(--primary)] text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-[var(--primary-shadow)] active:scale-[0.98] transition-all"
            >
              Salvar no Edital
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingTopic}
        onOpenChange={(o) => !o && setEditingTopic(null)}
      >
        <DialogContent className="rounded-[2.5rem] border-white/10 bg-[var(--app-bg)] p-8 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              Editar Tema
            </DialogTitle>
          </DialogHeader>
          {editingTopic && (
            <div className="space-y-6 py-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">
                  Nome do Tema
                </label>
                <input
                  value={editingTopic.name}
                  onChange={(e) =>
                    setEditingTopic({ ...editingTopic, name: e.target.value })
                  }
                  className="w-full px-5 h-14 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold outline-none focus:border-[var(--primary)] transition-all"
                />
              </div>
              <button
                onClick={handleUpdate}
                className="w-full h-14 rounded-2xl bg-[var(--primary)] text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-[var(--primary-shadow)]"
              >
                Salvar Alterações
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!preTestDialog?.open}
        onOpenChange={(o) => !o && setPreTestDialog(null)}
      >
        <DialogContent className="rounded-[2.5rem] border-white/10 bg-[var(--app-bg)] p-8 max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <Brain className="text-[var(--primary)]" size={24} />
              <DialogTitle className="text-2xl font-black">
                Briefing de Pré-Estudo
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm opacity-60">
              Para otimizar sua retenção, escreva em 2 ou 3 frases o que você já
              sabe sobre este tema antes de começar.
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Seja breve... (Ex: 'É o controle feito pelo STF sobre as leis...')"
            value={preTestText}
            onChange={(e) => setPreTestText(e.target.value)}
            rows={6}
            className="w-full p-6 rounded-3xl bg-white/5 border border-white/5 text-sm font-medium outline-none focus:border-[var(--primary)] transition-all resize-none mt-4"
          />
          <DialogFooter className="mt-8">
            <button
              onClick={doCreate}
              className="w-full h-14 rounded-2xl bg-[var(--primary)] text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-[var(--primary-shadow)]"
            >
              Finalizar e Cadastrar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
