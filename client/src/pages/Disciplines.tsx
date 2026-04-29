import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, BookOpen, GraduationCap } from "lucide-react";

const PRESET_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
];

export default function Disciplines() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDiscipline, setEditingDiscipline] = useState<{
    id: number;
    name: string;
    color: string;
    weight: number;
  } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    color: "#3B82F6",
    weight: 5,
  });

  const utils = trpc.useUtils();
  const { data: disciplines, isLoading } = trpc.discipline.list.useQuery();

  const createMutation = trpc.discipline.create.useMutation({
    onSuccess: () => {
      utils.discipline.list.invalidate();
      setIsCreateOpen(false);
      setFormData({ name: "", color: "#3B82F6", weight: 5 });
      toast.success("Disciplina criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar disciplina: " + error.message);
    },
  });

  const updateMutation = trpc.discipline.update.useMutation({
    onSuccess: () => {
      utils.discipline.list.invalidate();
      setEditingDiscipline(null);
      toast.success("Disciplina atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar disciplina: " + error.message);
    },
  });

  const deleteMutation = trpc.discipline.delete.useMutation({
    onSuccess: () => {
      utils.discipline.list.invalidate();
      toast.success("Disciplina excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir disciplina: " + error.message);
    },
  });

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("Nome da disciplina é obrigatório");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingDiscipline) return;
    updateMutation.mutate({
      id: editingDiscipline.id,
      name: editingDiscipline.name,
      color: editingDiscipline.color,
      weight: editingDiscipline.weight,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1
            className="text-3xl font-black tracking-tight flex items-center gap-2.5"
            style={{ color: "var(--app-fg)" }}
          >
            <GraduationCap className="h-7 w-7 text-[var(--primary)]" />
            Disciplinas
          </h1>
          <p className="text-sm opacity-60">
            Gerencie suas matérias e prioridades.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button
              size="lg"
              className="w-full sm:w-auto h-12 rounded-2xl font-black text-xs uppercase tracking-widest"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Disciplina
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Disciplina</DialogTitle>
              <DialogDescription>
                Adicione uma nova disciplina para organizar seus estudos
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Disciplina</Label>
                <Input
                  id="name"
                  placeholder="Ex: Direito Constitucional"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Cor de Identificação</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color: any) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        formData.color === color
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Peso/Prioridade: {formData.weight}</Label>
                <Slider
                  value={[formData.weight]}
                  onValueChange={([value]) =>
                    setFormData({ ...formData, weight: value })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  1 = Menor prioridade, 10 = Maior prioridade
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Criando..." : "Criar Disciplina"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i: any) => (
            <div
              key={i}
              className="h-48 rounded-[2rem] bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : disciplines?.length === 0 ? (
        <div className="soe-card p-20 flex flex-col items-center justify-center border-dashed opacity-40">
          <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center mb-6">
            <BookOpen size={32} />
          </div>
          <h3 className="text-xl font-black uppercase tracking-widest">
            Início do Edital
          </h3>
          <p className="text-xs mt-2 text-center max-w-xs">
            Você ainda não cadastrou nenhuma disciplina. Clique em "Nova
            Disciplina" para começar.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {disciplines?.map((discipline: any) => (
            <div
              key={discipline.id}
              className="soe-card group relative overflow-hidden transition-all hover:shadow-2xl hover:shadow-[var(--primary-shadow)]/10"
            >
              {/* Performance Indicator Bar */}
              <div
                className="absolute top-0 left-0 w-full h-1.5 opacity-20"
                style={{ backgroundColor: discipline.color }}
              />
              <div
                className="absolute top-0 left-0 h-1.5 transition-all duration-1000"
                style={{
                  backgroundColor: discipline.color,
                  width: `${(discipline as any).performance?.accuracy || 0}%`,
                  boxShadow: `0 0 15px ${discipline.color}88`,
                }}
              />

              <div className="p-8 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: discipline.color }}
                      />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
                        Edital Verticalizado
                      </span>
                    </div>
                    <h3
                      className="text-2xl font-black tracking-tight"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {discipline.name}
                    </h3>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setEditingDiscipline({
                          id: discipline.id,
                          name: discipline.name,
                          color: discipline.color,
                          weight: discipline.weight,
                        })
                      }
                      className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all"
                    >
                      <Pencil size={16} className="opacity-40" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="w-10 h-10 rounded-xl bg-rose-500/5 border border-rose-500/10 flex items-center justify-center hover:bg-rose-500 text-rose-500 hover:text-white transition-all">
                          <Trash2 size={16} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2.5rem] border-white/10 bg-[var(--app-bg)] p-8">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-2xl font-black">
                            Excluir Disciplina?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-sm opacity-60 mt-2">
                            Esta ação é irreversível. Todos os temas e
                            históricos de "{discipline.name}" serão removidos
                            permanentemente do seu banco de dados local.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-8 gap-3">
                          <AlertDialogCancel className="h-12 rounded-2xl border-white/5 font-black uppercase text-[10px] tracking-widest px-8">
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              deleteMutation.mutate({ id: discipline.id })
                            }
                            className="h-12 rounded-2xl bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest px-8 shadow-xl shadow-rose-500/20"
                          >
                            Sim, Excluir Tudo
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30">
                      Precisão
                    </p>
                    <p
                      className="text-xl font-black mt-1"
                      style={{
                        color:
                          (discipline as any).performance?.accuracy >= 70
                            ? "var(--accent-green)"
                            : (discipline as any).performance?.accuracy >= 50
                              ? "var(--accent-amber)"
                              : "var(--accent-red)",
                      }}
                    >
                      {(discipline as any).performance?.accuracy || 0}%
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-30">
                      Peso
                    </p>
                    <p
                      className="text-xl font-black mt-1"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {discipline.weight}
                      <span className="text-[10px] opacity-20 ml-1">/ 10</span>
                    </p>
                  </div>
                </div>

                {(discipline as any).performance && (
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                    <div className="flex items-center gap-4">
                      <span className="opacity-40">
                        {(discipline as any).performance.questionsResolved}{" "}
                        Questões
                      </span>
                      <div className="flex gap-2">
                        <span className="text-[var(--accent-green)]">
                          {(discipline as any).performance.correctCount} Acertos
                        </span>
                        <span className="text-rose-500">
                          {(discipline as any).performance.errorCount} Erros
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={!!editingDiscipline}
        onOpenChange={(open) => !open && setEditingDiscipline(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Disciplina</DialogTitle>
            <DialogDescription>
              Atualize as informações da disciplina
            </DialogDescription>
          </DialogHeader>
          {editingDiscipline && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome da Disciplina</Label>
                <Input
                  id="edit-name"
                  value={editingDiscipline.name}
                  onChange={(e) =>
                    setEditingDiscipline({
                      ...editingDiscipline,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Cor de Identificação</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color: any) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        editingDiscipline.color === color
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setEditingDiscipline({ ...editingDiscipline, color })
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Peso/Prioridade: {editingDiscipline.weight}</Label>
                <Slider
                  value={[editingDiscipline.weight]}
                  onValueChange={([value]) =>
                    setEditingDiscipline({
                      ...editingDiscipline,
                      weight: value,
                    })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingDiscipline(null)}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
