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

export function formatStudyTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Topics() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<{ id: number; name: string; disciplineId: number; notes: string; studyTimeSeconds: number } | null>(null);
  const [formData, setFormData] = useState({ name: "", disciplineId: 0, studyDate: "", notes: "" });
  const [filters, setFilters] = useState({ disciplineId: undefined as number | undefined, search: "" });
  const [questionsDialog, setQuestionsDialog] = useState<{ topicId: number; topicName: string; correctCount: number; errorCount: number } | null>(null);
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
      toast.success(`Tema registrado! ${data.revisionsCreated} revisões agendadas.`);
    },
    onError: (error) => toast.error("Erro ao registrar tema: " + error.message)
  });

  const updateMutation = trpc.topic.update.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      setEditingTopic(null);
      toast.success("Tema atualizado!");
    },
    onError: (error) => toast.error("Erro ao atualizar tema: " + error.message)
  });

  const deleteMutation = trpc.topic.delete.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success("Tema excluído!");
    },
    onError: (error) => toast.error("Erro ao excluir tema: " + error.message)
  });

  const setPerformanceMutation = trpc.topic.setPerformance.useMutation({
    onSuccess: () => {
      utils.topic.list.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success("Questões registradas!");
      setQuestionsDialog(null);
    },
    onError: (error) => toast.error("Erro ao salvar: " + error.message)
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
      notes: formData.notes || undefined
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
      studyTimeSeconds: editingTopic.studyTimeSeconds || undefined
    });
  };

  const getDiscipline = (id: number) => disciplinesData?.find(d => d.id === id);
  const clearFilters = () => setFilters({ disciplineId: undefined, search: "" });
  const hasFilters = !!(filters.disciplineId || filters.search);

  return (
    <div className="space-y-6">
      <Dialog open={!!preTestDialog?.open} onOpenChange={o => !o && setPreTestDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pré-Teste</DialogTitle></DialogHeader>
          <Textarea placeholder="O que você já sabe sobre isso?" value={preTestText} onChange={e => setPreTestText(e.target.value)} rows={5} />
          <DialogFooter><Button onClick={doCreate}>Cadastrar tema</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black">Temas</h1>
        <Button onClick={() => setIsCreateOpen(true)} className="rounded-2xl h-12 font-black uppercase text-xs tracking-widest"><Plus className="mr-2 h-4 w-4" /> Registrar Tema</Button>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Buscar..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} className="rounded-2xl h-12 bg-white/5 border-white/5" />
      </div>

      <div className="space-y-3">
        {topicsData?.topics.map(topic => {
          const discipline = getDiscipline(topic.disciplineId);
          return (
            <Card key={topic.id} className="rounded-[2rem] border-white/5 bg-white/[0.02]">
              <CardHeader className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="outline" className="mb-2" style={{ color: discipline?.color, borderColor: `${discipline?.color}40` }}>{discipline?.name}</Badge>
                    <CardTitle className="text-lg font-black">{topic.name}</CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-[var(--primary-bg-subtle)] text-[var(--primary)]" onClick={() => setQuestionsDialog({ topicId: topic.id, topicName: topic.name, correctCount: (topic as any).performance?.correctCount || 0, errorCount: (topic as any).performance?.errorCount || 0 })}>
                      <BarChart2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-white/5 border border-white/5" onClick={() => setEditingTopic({ id: topic.id, name: topic.name, disciplineId: topic.disciplineId, notes: topic.notes || "", studyTimeSeconds: (topic as any).studyTimeSeconds || 0 })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Excluir Tema?</AlertDialogTitle><AlertDialogDescription>Permanente.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate({ id: topic.id })} className="bg-rose-500">Excluir</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Tema</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
             <Select onValueChange={val => setFormData({...formData, disciplineId: Number(val)})}>
               <SelectTrigger><SelectValue placeholder="Disciplina" /></SelectTrigger>
               <SelectContent>{disciplinesData?.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
             </Select>
             <Input placeholder="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
             <Button onClick={handleCreate} className="w-full">Registrar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTopic} onOpenChange={o => !o && setEditingTopic(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar</DialogTitle></DialogHeader>
          {editingTopic && (
            <div className="space-y-4">
              <Input value={editingTopic.name} onChange={e => setEditingTopic({...editingTopic, name: e.target.value})} />
              <Button onClick={handleUpdate} className="w-full">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
