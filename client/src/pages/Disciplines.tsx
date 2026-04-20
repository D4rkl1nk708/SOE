import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, BookOpen, GraduationCap } from "lucide-react";

const PRESET_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

export default function Disciplines() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDiscipline, setEditingDiscipline] = useState<{ id: number; name: string; color: string; weight: number } | null>(null);
  const [formData, setFormData] = useState({ name: "", color: "#3B82F6", weight: 5 });

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
    }
  });

  const updateMutation = trpc.discipline.update.useMutation({
    onSuccess: () => {
      utils.discipline.list.invalidate();
      setEditingDiscipline(null);
      toast.success("Disciplina atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar disciplina: " + error.message);
    }
  });

  const deleteMutation = trpc.discipline.delete.useMutation({
    onSuccess: () => {
      utils.discipline.list.invalidate();
      toast.success("Disciplina excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir disciplina: " + error.message);
    }
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
      weight: editingDiscipline.weight
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            Disciplinas
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas disciplinas de estudo com cores e prioridades
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor de Identificação</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        formData.color === color ? "border-foreground scale-110" : "border-transparent"
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
                  onValueChange={([value]) => setFormData({ ...formData, weight: value })}
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
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar Disciplina"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : disciplines?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma disciplina cadastrada</h3>
            <p className="text-muted-foreground text-center mb-4">
              Comece criando sua primeira disciplina para organizar seus estudos
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Disciplina
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {disciplines?.map((discipline) => (
            <Card key={discipline.id} className="group relative overflow-hidden">
              <div
                className="absolute top-0 left-0 w-full h-1"
                style={{ backgroundColor: discipline.color }}
              />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: discipline.color }}
                    />
                    <CardTitle className="text-lg">{discipline.name}</CardTitle>
                  </div>
                  <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingDiscipline({
                        id: discipline.id,
                        name: discipline.name,
                        color: discipline.color,
                        weight: discipline.weight
                      })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Disciplina</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir "{discipline.name}"? Todos os temas e revisões associados também serão excluídos. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate({ id: discipline.id })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Prioridade: {discipline.weight}/10
                </CardDescription>
                {(discipline as any).performance && (
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="font-bold" style={{
                      color: (discipline as any).performance.accuracy >= 70 ? '#16a34a'
                           : (discipline as any).performance.accuracy >= 50 ? '#d97706'
                           : '#dc2626'
                    }}>
                      {(discipline as any).performance.accuracy}%
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {(discipline as any).performance.questionsResolved} questões ({(discipline as any).performance.correctCount} acertos / {(discipline as any).performance.errorCount} erros)
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingDiscipline} onOpenChange={(open) => !open && setEditingDiscipline(null)}>
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
                  onChange={(e) => setEditingDiscipline({ ...editingDiscipline, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor de Identificação</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        editingDiscipline.color === color ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setEditingDiscipline({ ...editingDiscipline, color })}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Peso/Prioridade: {editingDiscipline.weight}</Label>
                <Slider
                  value={[editingDiscipline.weight]}
                  onValueChange={([value]) => setEditingDiscipline({ ...editingDiscipline, weight: value })}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDiscipline(null)}>
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
