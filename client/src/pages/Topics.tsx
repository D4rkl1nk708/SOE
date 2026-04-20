import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, BookMarked, Calendar, Search, Filter, X, BarChart2, Brain } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Topics() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<{ id: number; name: string; disciplineId: number; notes: string; studyTimeSeconds: number } | null>(null);
  const [formData, setFormData] = useState({ name: "", disciplineId: 0, studyDate: "", notes: "" });
  const [filters, setFilters] = useState({ disciplineId: undefined as number | undefined, search: "" });
  const [questionsDialog, setQuestionsDialog] = useState<{ topicId: number; topicName: string; correctCount: number; errorCount: number } | null>(null);
  // F02 - Pré-Teste state
  const [preTestDialog, setPreTestDialog] = useState<{ open: boolean; pendingCreate: boolean } | null>(null);
  const [preTestText, setPreTestText] = useState("");

  const utils = trpc.useUtils();
  const { data: disciplinesData } = trpc.discipline.list.useQuery();
  const { data: topicsData, isLoading } = trpc.topic.list.useQuery(
    filters.disciplineId || filters.search ? { disciplineId: filters.disciplineId, search: filters.search } : undefined
  );

  const createMutation = trpc.topic.create.useMutation({
    onSuccess: (data) => {
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
      setIsCreateOpen(false);
      setFormData({ name: "", disciplineId: 0, studyDate: "", notes: "" });
      toast.success(`Tema registrado! ${data.revisionsCreated} revisões e testes agendados automaticamente.`);
    },
    onError: (error) => {
      toast.error("Erro ao registrar tema: " + error.message);
    }
  });

  const updateMutation = trpc.topic.update.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      setEditingTopic(null);
      toast.success("Tema atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar tema: " + error.message);
    }
  });

  const deleteMutation = trpc.topic.delete.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success("Tema excluído com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir tema: " + error.message);
    }
  });

  const setPerformanceMutation = trpc.topic.setPerformance.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success("Questões registradas!");
      setQuestionsDialog(null);
    },
    onError: (error) => {
      toast.error("Erro ao salvar questões: " + error.message);
    }
  });

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("Nome do tema é obrigatório");
      return;
    }
    if (!formData.disciplineId) {
      toast.error("Selecione uma disciplina");
      return;
    }
    // F02 - Show pre-test dialog before creating topic
    setPreTestText("");
    setPreTestDialog({ open: true, pendingCreate: true });
  };

  const doCreate = () => {
    createMutation.mutate({
      name: formData.name,
      disciplineId: formData.disciplineId,
      studyDate: formData.studyDate || undefined,
      notes: formData.notes || undefined
    });
    setPreTestDialog(null);
    setPreTestText("");
  };

  const handleUpdate = () => {
    if (!editingTopic) return;
    updateMutation.mutate({
      id: editingTopic.id,
      name: editingTopic.name,
      disciplineId: editingTopic.disciplineId,
      notes: editingTopic.notes || undefined,
      studyTimeSeconds: editingTopic.studyTimeSeconds || undefined
    });
  };

  const getDiscipline = (id: number) => {
    return disciplinesData?.find(d => d.id === id);
  };

  const clearFilters = () => {
    setFilters({ disciplineId: undefined, search: "" });
  };

  const hasFilters = filters.disciplineId || filters.search;

  return (
    <div className="space-y-6">
      {/* F02 - Pré-Teste Dialog */}
      <Dialog open={!!preTestDialog?.open} onOpenChange={(o) => { if (!o) setPreTestDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" style={{ color: "var(--primary)" }} />
              Pré-Teste — {formData.name}
            </DialogTitle>
            <DialogDescription>
              <strong>Antes de estudar</strong>, escreva tudo que você já sabe sobre esse tema.
              Pesquisas mostram que o pré-teste melhora a retenção posterior em até 50%,
              mesmo quando você não sabe nada! (Carpenter et al., 2018 · Cap. 5.9)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Escreva o que você já sabe sobre esse tema... (pode ser pouco ou nada — isso já ativa o cérebro)"
              value={preTestText}
              onChange={e => setPreTestText(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs" style={{ color: "var(--muted-text)" }}>
              💡 <em>"O cérebro fica mais curioso após um pré-teste. Quando você encontrar a resposta
              durante o estudo, a fixação será muito maior."</em> — Chaves, 2022
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setPreTestDialog(null); }}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={doCreate}>
              Pular pré-teste
            </Button>
            <Button onClick={doCreate} style={{ background: "var(--primary)", color: "white" }}>
              {preTestText.trim() ? "Registrei! Cadastrar tema" : "Cadastrar tema"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookMarked className="h-7 w-7 text-primary" />
            Temas Estudados
          </h1>
          <p className="text-muted-foreground mt-1">
            Registre os temas estudados e acompanhe as revisões automáticas
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={!disciplinesData?.length}>
              <Plus className="h-4 w-4 mr-2" />
              Registrar Tema
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Registrar Novo Tema</DialogTitle>
              <DialogDescription>
                Ao registrar um tema, o sistema criará automaticamente as revisões seguindo o método 25/50 dias e os testes aleatórios a cada 3+ dias.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="discipline">Disciplina *</Label>
                <Select
                  value={formData.disciplineId ? String(formData.disciplineId) : ""}
                  onValueChange={(value) => setFormData({ ...formData, disciplineId: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    {disciplinesData?.map((discipline) => (
                      <SelectItem key={discipline.id} value={String(discipline.id)}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: discipline.color }}
                          />
                          {discipline.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Tema *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Princípios Fundamentais"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="studyDate">Data do Estudo</Label>
                <Input
                  id="studyDate"
                  type="date"
                  value={formData.studyDate}
                  onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe em branco para usar a data de hoje
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Anotações (opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Observações sobre o tema estudado..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Registrando..." : "Registrar Tema"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar temas..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full sm:w-64">
              <Select
                value={filters.disciplineId ? String(filters.disciplineId) : "all"}
                onValueChange={(value) => setFilters({ ...filters, disciplineId: value === "all" ? undefined : Number(value) })}
              >
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por disciplina" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as disciplinas</SelectItem>
                  {disciplinesData?.map((discipline) => (
                    <SelectItem key={discipline.id} value={String(discipline.id)}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: discipline.color }}
                        />
                        {discipline.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Topics List */}
      {isLoading ? (
        <div className="space-y-4">
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
      ) : !disciplinesData?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookMarked className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Crie uma disciplina primeiro</h3>
            <p className="text-muted-foreground text-center mb-4">
              Você precisa criar pelo menos uma disciplina antes de registrar temas
            </p>
            <Button asChild>
              <a href="/disciplines">Ir para Disciplinas</a>
            </Button>
          </CardContent>
        </Card>
      ) : topicsData?.topics.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookMarked className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {hasFilters ? "Nenhum tema encontrado" : "Nenhum tema registrado"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {hasFilters
                ? "Tente ajustar os filtros de busca"
                : "Comece registrando seu primeiro tema de estudo"}
            </p>
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Limpar Filtros
              </Button>
            ) : (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Registrar Primeiro Tema
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {topicsData?.topics.map((topic) => {
            const discipline = getDiscipline(topic.disciplineId);
            return (
              <Card key={topic.id} className="group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: `${discipline?.color}20`,
                            borderColor: discipline?.color,
                            color: discipline?.color
                          }}
                        >
                          {discipline?.name || "Sem disciplina"}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{topic.name}</CardTitle>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-600 hover:text-blue-700"
                        title="Registrar questões"
                        onClick={() => setQuestionsDialog({
                          topicId: topic.id,
                          topicName: topic.name,
                          correctCount: (topic as any).performance?.correctCount || 0,
                          errorCount: (topic as any).performance?.errorCount || 0,
                        })}
                      >
                        <BarChart2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingTopic({
                          id: topic.id,
                          name: topic.name,
                          disciplineId: topic.disciplineId,
                          notes: topic.notes || "",
                          studyTimeSeconds: (topic as any).studyTimeSeconds || 0,
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
                            <AlertDialogTitle>Excluir Tema</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir "{topic.name}"? Todas as revisões e testes associados também serão excluídos. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate({ id: topic.id })}
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
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Estudado em {format(new Date(topic.studyDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </div>
                    {(topic as any).studyTimeSeconds > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: "var(--muted-text)" }}>
                          {Math.floor((topic as any).studyTimeSeconds / 3600) > 0
                            ? `${Math.floor((topic as any).studyTimeSeconds / 3600)}h ${Math.floor(((topic as any).studyTimeSeconds % 3600) / 60)}m`
                            : `${Math.floor(((topic as any).studyTimeSeconds % 3600) / 60)}min`}
                        </span>
                      </div>
                    )}
                    {(topic as any).performance && (
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs font-medium" style={{
                          color: (topic as any).performance.accuracy >= 70 ? '#16a34a'
                               : (topic as any).performance.accuracy >= 50 ? '#d97706'
                               : '#dc2626'
                        }}>
                          {(topic as any).performance.accuracy}% acerto
                        </span>
                        <span className="text-xs text-green-600">{(topic as any).performance.correctCount} ac.</span>
                        <span className="text-xs text-red-600">{(topic as any).performance.errorCount} err.</span>
                      </div>
                    )}
                  </div>
                  {topic.notes && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {topic.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTopic} onOpenChange={(open) => !open && setEditingTopic(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Tema</DialogTitle>
            <DialogDescription>
              Atualize as informações do tema
            </DialogDescription>
          </DialogHeader>
          {editingTopic && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-discipline">Disciplina</Label>
                <Select
                  value={String(editingTopic.disciplineId)}
                  onValueChange={(value) => setEditingTopic({ ...editingTopic, disciplineId: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {disciplinesData?.map((discipline) => (
                      <SelectItem key={discipline.id} value={String(discipline.id)}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: discipline.color }}
                          />
                          {discipline.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome do Tema</Label>
                <Input
                  id="edit-name"
                  value={editingTopic.name}
                  onChange={(e) => setEditingTopic({ ...editingTopic, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Anotações</Label>
                <Textarea
                  id="edit-notes"
                  value={editingTopic.notes}
                  onChange={(e) => setEditingTopic({ ...editingTopic, notes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time">Tempo de Estudo</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Horas</p>
                    <Input
                      id="edit-time-h"
                      type="number"
                      min={0}
                      max={999}
                      placeholder="0"
                      value={Math.floor(editingTopic.studyTimeSeconds / 3600) || ""}
                      onChange={(e) => {
                        const h = parseInt(e.target.value) || 0;
                        const m = Math.floor((editingTopic.studyTimeSeconds % 3600) / 60);
                        setEditingTopic({ ...editingTopic, studyTimeSeconds: h * 3600 + m * 60 });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Minutos</p>
                    <Input
                      id="edit-time-m"
                      type="number"
                      min={0}
                      max={59}
                      placeholder="0"
                      value={Math.floor((editingTopic.studyTimeSeconds % 3600) / 60) || ""}
                      onChange={(e) => {
                        const m = Math.min(59, parseInt(e.target.value) || 0);
                        const h = Math.floor(editingTopic.studyTimeSeconds / 3600);
                        setEditingTopic({ ...editingTopic, studyTimeSeconds: h * 3600 + m * 60 });
                      }}
                    />
                  </div>
                </div>
                {editingTopic.studyTimeSeconds > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total: {Math.floor(editingTopic.studyTimeSeconds / 3600)}h {Math.floor((editingTopic.studyTimeSeconds % 3600) / 60)}min
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTopic(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Questions Performance Dialog */}
      <Dialog open={!!questionsDialog} onOpenChange={(open) => !open && setQuestionsDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Questões — {questionsDialog?.topicName}</DialogTitle>
            <DialogDescription>
              Registre os acertos e erros de questões neste tema. Os valores substituem os atuais.
            </DialogDescription>
          </DialogHeader>
          {questionsDialog && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-green-600 font-medium">Acertos</Label>
                  <Input
                    type="number"
                    min={0}
                    value={questionsDialog.correctCount}
                    onChange={e => setQuestionsDialog({ ...questionsDialog, correctCount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-red-600 font-medium">Erros</Label>
                  <Input
                    type="number"
                    min={0}
                    value={questionsDialog.errorCount}
                    onChange={e => setQuestionsDialog({ ...questionsDialog, errorCount: Number(e.target.value) })}
                  />
                </div>
              </div>
              {(questionsDialog.correctCount + questionsDialog.errorCount) > 0 && (
                <div className="p-3 bg-muted rounded-lg text-sm text-center">
                  Total: {questionsDialog.correctCount + questionsDialog.errorCount} questões — 
                  {" "}<span className="font-bold" style={{
                    color: Math.round((questionsDialog.correctCount / (questionsDialog.correctCount + questionsDialog.errorCount)) * 100) >= 70 ? '#16a34a' : '#dc2626'
                  }}>
                    {Math.round((questionsDialog.correctCount / (questionsDialog.correctCount + questionsDialog.errorCount)) * 100)}% acerto
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionsDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => questionsDialog && setPerformanceMutation.mutate({
                topicId: questionsDialog.topicId,
                correctCount: questionsDialog.correctCount,
                errorCount: questionsDialog.errorCount,
              })}
              disabled={setPerformanceMutation.isPending}
            >
              {setPerformanceMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
