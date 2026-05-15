import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  BookMarked,
  Search,
  X,
  BarChart2,
  Brain,
  BookOpen,
  Clock,
} from "lucide-react";

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
        studyDate: new Date().toISOString().split("T")[0],
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
    disciplinesData?.find((d) => d.id === id);
  const clearFilters = () =>
    setFilters({ disciplineId: undefined, search: "" });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Temas
          </h2>
          <p className="text-sm text-muted-foreground">
            Organize o conteúdo programático do seu edital.
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          className="rounded-md font-bold text-[10px] uppercase tracking-wider h-10 px-6"
        >
          <Plus size={16} className="mr-2" />
          <span>Registrar Novo Tema</span>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 group">
          <Search
            size={14}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50"
          />
          <input
            type="text"
            placeholder="Pesquisar por nome do tema..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-10 pr-4 h-10 rounded-md bg-secondary/30 border border-border focus:border-primary outline-none transition-all font-semibold text-xs"
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
          className="h-10 px-4 rounded-md bg-secondary/30 border border-border text-[10px] font-bold uppercase tracking-wider outline-none focus:border-primary transition-all text-muted-foreground"
        >
          <option value="">Todas as Disciplinas</option>
          {disciplinesData?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {(filters.search || filters.disciplineId) && (
          <button
            onClick={clearFilters}
            className="h-10 px-4 rounded-md bg-destructive/5 text-destructive border border-destructive/10 hover:bg-destructive hover:text-white transition-all"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Topics List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground font-bold uppercase text-[10px] tracking-widest animate-pulse">
            Carregando temas...
          </div>
        ) : topicsData?.topics.length === 0 ? (
          <div className="soe-card py-20 flex flex-col items-center justify-center border-dashed opacity-40">
            <BookMarked size={48} className="mb-4 text-muted-foreground" />
            <p className="text-lg font-bold uppercase tracking-widest text-foreground">
              Nenhum tema encontrado
            </p>
            <p className="text-xs mt-2 text-muted-foreground">
              Use a barra de pesquisa ou mude os filtros.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {topicsData?.topics.map((topic) => {
              const discipline = getDiscipline(topic.disciplineId);
              const accuracy = (topic as any).performance?.accuracy || 0;

              return (
                <div
                  key={topic.id}
                  className="soe-card group hover:border-primary/50 transition-all overflow-hidden relative"
                >
                  <div
                    className="absolute top-0 left-0 w-1 h-full opacity-30"
                    style={{ backgroundColor: discipline?.color }}
                  />

                  <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-md bg-secondary border border-border flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                        <BookOpen size={16} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider"
                            style={{ color: discipline?.color }}
                          >
                            {discipline?.name}
                          </span>
                          <div className="w-1 h-1 rounded-full bg-border" />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-50">
                            #{topic.id}
                          </span>
                        </div>
                        <h4 className="text-base font-bold tracking-tight text-foreground">
                          {topic.name}
                        </h4>

                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1.5 text-muted-foreground/60">
                            <Clock size={12} />
                            <span className="text-[10px] font-bold">
                              {formatStudyTime(
                                (topic as any).studyTimeSeconds || 0,
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground/60">
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

                    <div className="flex items-center justify-between md:justify-end gap-6">
                      {accuracy > 0 && (
                        <div className="text-right">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-50 mb-0.5">
                            Acerto
                          </p>
                          <p
                            className="text-lg font-bold tabular-nums"
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
                          className="w-8 h-8 rounded-md bg-secondary border border-border flex items-center justify-center hover:bg-secondary/80 transition-all text-muted-foreground"
                        >
                          <Pencil size={14} />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="w-8 h-8 rounded-md bg-destructive/5 border border-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all">
                              <Trash2 size={14} />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-lg border-border bg-card p-6">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-xl font-bold text-foreground">
                                Excluir Tema?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-sm text-muted-foreground mt-2">
                                Removerá permanentemente o tema "{topic.name}" e
                                todo o histórico vinculado.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-6 gap-2">
                              <AlertDialogCancel className="rounded-md font-bold uppercase text-[10px] tracking-widest px-6 h-10">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  deleteMutation.mutate({ id: topic.id })
                                }
                                className="rounded-md bg-destructive text-destructive-foreground font-bold uppercase text-[10px] tracking-widest px-6 h-10"
                              >
                                Excluir
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
        <DialogContent className="rounded-lg border-border bg-card p-8 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">
              Novo Tema de Estudo
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Registre um novo assunto no seu cronograma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Disciplina
              </Label>
              <Select
                onValueChange={(val) =>
                  setFormData({ ...formData, disciplineId: Number(val) })
                }
              >
                <SelectTrigger className="h-10 rounded-md bg-secondary border-border text-sm font-semibold">
                  <SelectValue placeholder="Selecione a matéria..." />
                </SelectTrigger>
                <SelectContent className="rounded-md border-border bg-card">
                  {disciplinesData?.map((d) => (
                    <SelectItem
                      key={d.id}
                      value={String(d.id)}
                      className="rounded-md focus:bg-primary focus:text-primary-foreground"
                    >
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Título
              </Label>
              <Input
                placeholder="Ex: Controle de Constitucionalidade"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="bg-secondary border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Data
                </Label>
                <Input
                  type="date"
                  value={formData.studyDate}
                  onChange={(e) =>
                    setFormData({ ...formData, studyDate: e.target.value })
                  }
                  className="bg-secondary border-border [color-scheme:dark]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Minutos
                </Label>
                <Input
                  type="number"
                  placeholder="Ex: 60"
                  value={formData.studyTimeMinutes}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      studyTimeMinutes: Number(e.target.value),
                    })
                  }
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <Button
              onClick={handleCreate}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-widest mt-2"
            >
              Salvar no Edital
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingTopic}
        onOpenChange={(o) => !o && setEditingTopic(null)}
      >
        <DialogContent className="rounded-lg border-border bg-card p-8 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">
              Editar Tema
            </DialogTitle>
          </DialogHeader>
          {editingTopic && (
            <div className="space-y-5 py-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Nome do Tema
                </Label>
                <Input
                  value={editingTopic.name}
                  onChange={(e) =>
                    setEditingTopic({ ...editingTopic, name: e.target.value })
                  }
                  className="bg-secondary border-border"
                />
              </div>
              <Button
                onClick={handleUpdate}
                className="w-full h-10 rounded-md bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-widest mt-2"
              >
                Salvar Alterações
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!preTestDialog?.open}
        onOpenChange={(o) => !o && setPreTestDialog(null)}
      >
        <DialogContent className="rounded-lg border-border bg-card p-8 max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <Brain className="text-primary" size={24} />
              <DialogTitle className="text-xl font-bold text-foreground">
                Briefing de Pré-Estudo
              </DialogTitle>
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              Escreva em 2 ou 3 frases o que você já sabe sobre este tema antes
              de começar.
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Seja breve... (Ex: 'É o controle feito pelo STF sobre as leis...')"
            value={preTestText}
            onChange={(e) => setPreTestText(e.target.value)}
            rows={5}
            className="w-full p-4 rounded-md bg-secondary border border-border text-sm font-medium outline-none focus:border-primary transition-all resize-none mt-4 text-foreground"
          />
          <DialogFooter className="mt-6">
            <Button
              onClick={doCreate}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-widest"
            >
              Finalizar e Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
