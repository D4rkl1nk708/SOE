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
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  GraduationCap,
  Target,
  Weight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
      toast.success("Disciplina criada!");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.discipline.update.useMutation({
    onSuccess: () => {
      utils.discipline.list.invalidate();
      setEditingDiscipline(null);
      toast.success("Disciplina atualizada!");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.discipline.delete.useMutation({
    onSuccess: () => {
      utils.discipline.list.invalidate();
      toast.success("Disciplina excluída.");
    },
    onError: (error) => toast.error(error.message),
  });

  const handleCreate = () => {
    if (!formData.name.trim()) return toast.error("Nome obrigatório");
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingDiscipline) return;
    updateMutation.mutate(editingDiscipline);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-md bg-primary/10 border border-primary/20">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Minhas Disciplinas
            </h1>
            <p className="text-[11px] font-bold text-muted-foreground opacity-60 uppercase tracking-widest">
              Gestão de Matérias e Prioridades
            </p>
          </div>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-10 px-6 rounded-md font-bold text-[10px] uppercase tracking-widest">
              <Plus size={14} className="mr-2" /> Nova Disciplina
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-md border-border bg-card max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                Criar Disciplina
              </DialogTitle>
              <DialogDescription className="text-xs">
                Defina o nome e a importância estratégica da matéria.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                  Nome da Disciplina
                </Label>
                <Input
                  placeholder="Ex: Direito Administrativo"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="h-11 bg-secondary/50 border-border text-sm font-bold"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                  Cor de Identificação
                </Label>
                <div className="flex flex-wrap gap-2.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "w-6 h-6 rounded-md border-2 transition-all hover:scale-110",
                        formData.color === color
                          ? "border-primary"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                    Peso Estratégico
                  </Label>
                  <span className="text-xs font-bold text-primary">
                    {formData.weight}
                  </span>
                </div>
                <Slider
                  value={[formData.weight]}
                  onValueChange={([value]) =>
                    setFormData({ ...formData, weight: value })
                  }
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-md h-10 font-bold text-[10px] uppercase tracking-widest"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="rounded-md h-10 font-bold text-[10px] uppercase tracking-widest"
              >
                {createMutation.isPending ? "Criando..." : "Confirmar Criação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-md bg-secondary/20 animate-pulse border border-border/50"
            />
          ))}
        </div>
      ) : disciplines?.length === 0 ? (
        <div className="soe-card flex flex-col items-center justify-center py-32 px-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-md bg-secondary/50 border border-border flex items-center justify-center text-muted-foreground/30">
            <BookOpen size={28} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Início do Edital</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Você ainda não cadastrou nenhuma disciplina. Comece agora para
              organizar seus temas e ciclos de estudo.
            </p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="h-11 px-10 rounded-md font-bold text-[10px] uppercase tracking-widest"
          >
            Nova Disciplina
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {disciplines?.map((discipline) => {
            const acc = (discipline as any).performance?.accuracy || 0;
            const q = (discipline as any).performance?.questionsResolved || 0;

            return (
              <div
                key={discipline.id}
                className="soe-card group relative overflow-hidden flex flex-col"
              >
                <div className="h-1 w-full bg-secondary/30 relative">
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-1000"
                    style={{
                      backgroundColor: discipline.color,
                      width: `${acc}%`,
                    }}
                  />
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-6">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: discipline.color }}
                        />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                          Disciplina Estratégica
                        </span>
                      </div>
                      <h3 className="text-base font-bold tracking-tight text-foreground leading-tight">
                        {discipline.name}
                      </h3>
                    </div>

                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          setEditingDiscipline({
                            id: discipline.id,
                            name: discipline.name,
                            color: discipline.color,
                            weight: discipline.weight,
                          })
                        }
                        className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-all"
                      >
                        <Pencil size={14} />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-all">
                            <Trash2 size={14} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-md border-border bg-card p-6">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-bold">
                              Excluir Disciplina?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-sm mt-2">
                              Todos os dados, temas e ciclos vinculados a{" "}
                              <span className="font-bold text-foreground">
                                "{discipline.name}"
                              </span>{" "}
                              serão apagados permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="mt-8">
                            <AlertDialogCancel className="h-10 rounded-md font-bold uppercase text-[10px] tracking-widest px-6">
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                deleteMutation.mutate({ id: discipline.id })
                              }
                              className="h-10 rounded-md bg-destructive text-destructive-foreground font-bold uppercase text-[10px] tracking-widest px-8"
                            >
                              Confirmar Exclusão
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="p-3 rounded-md bg-secondary/20 border border-border/50">
                      <div className="flex items-center gap-2 mb-1 opacity-40">
                        <Target size={10} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">
                          Precisão
                        </span>
                      </div>
                      <p
                        className="text-lg font-bold tabular-nums"
                        style={{
                          color:
                            acc >= 70
                              ? "var(--accent-green)"
                              : acc >= 50
                                ? "var(--accent-amber)"
                                : "var(--accent-red)",
                        }}
                      >
                        {acc}%
                      </p>
                    </div>
                    <div className="p-3 rounded-md bg-secondary/20 border border-border/50">
                      <div className="flex items-center gap-2 mb-1 opacity-40">
                        <Weight size={10} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">
                          Prioridade
                        </span>
                      </div>
                      <p className="text-lg font-bold text-foreground/80 tabular-nums">
                        {discipline.weight}
                        <span className="text-[10px] opacity-20 ml-1">
                          / 10
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-border/30 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                    <span>{q} Questões</span>
                    <div className="flex gap-3">
                      <span className="text-accent-green">
                        {(discipline as any).performance?.correctCount || 0}
                      </span>
                      <span className="text-destructive">
                        {(discipline as any).performance?.errorCount || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={!!editingDiscipline}
        onOpenChange={(open) => !open && setEditingDiscipline(null)}
      >
        <DialogContent className="rounded-md border-border bg-card max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Editar Disciplina
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ajuste os parâmetros estratégicos da matéria.
            </DialogDescription>
          </DialogHeader>
          {editingDiscipline && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                  Nome
                </Label>
                <Input
                  value={editingDiscipline.name}
                  onChange={(e) =>
                    setEditingDiscipline({
                      ...editingDiscipline,
                      name: e.target.value,
                    })
                  }
                  className="h-11 bg-secondary/50 border-border font-bold text-sm"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                  Cor
                </Label>
                <div className="flex flex-wrap gap-2.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "w-6 h-6 rounded-md border-2 transition-all",
                        editingDiscipline.color === color
                          ? "border-primary"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() =>
                        setEditingDiscipline({ ...editingDiscipline, color })
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-60">
                    Peso: {editingDiscipline.weight}
                  </Label>
                </div>
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
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingDiscipline(null)}
              className="h-10 rounded-md font-bold text-[10px] uppercase tracking-widest"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              className="h-10 rounded-md font-bold text-[10px] uppercase tracking-widest"
            >
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
