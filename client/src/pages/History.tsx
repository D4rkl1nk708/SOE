import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  History as HistoryIcon, 
  Search, 
  Filter, 
  Download, 
  BookOpen, 
  ClipboardCheck,
  Calendar,
  CheckCircle2,
  Circle,
  X,
  FileText
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function History() {
  const [filters, setFilters] = useState({
    disciplineId: undefined as number | undefined,
    search: "",
    type: undefined as "revision" | "test" | undefined,
    completed: undefined as boolean | undefined,
    startDate: "",
    endDate: "",
  });
  const [activeTab, setActiveTab] = useState<"all" | "completed" | "pending">("all");

  const utils = trpc.useUtils();
  const { data: disciplines } = trpc.discipline.list.useQuery();
  
  const queryFilters = useMemo(() => {
    const f: typeof filters = { ...filters };
    if (activeTab === "completed") f.completed = true;
    if (activeTab === "pending") f.completed = false;
    return f;
  }, [filters, activeTab]);

  const { data: historyData, isLoading } = trpc.history.get.useQuery(queryFilters);
  const { data: exportData } = trpc.export.getSchedule.useQuery({
    disciplineId: filters.disciplineId,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const markCompletedMutation = trpc.revision.markCompleted.useMutation({
    onSuccess: () => {
      utils.history.get.invalidate();
      utils.dashboard.getStats.invalidate();
      toast.success("Status atualizado!");
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    }
  });

  const getDiscipline = (disciplineId: number) => {
    return disciplines?.find(d => d.id === disciplineId);
  };

  const getTopic = (topicId: number) => {
    return historyData?.topics.find((t: any) => t.id === topicId);
  };

  const clearFilters = () => {
    setFilters({
      disciplineId: undefined,
      search: "",
      type: undefined,
      completed: undefined,
      startDate: "",
      endDate: "",
    });
  };

  const hasFilters = filters.disciplineId || filters.search || filters.type || filters.startDate || filters.endDate;

  const handleExport = () => {
    if (!exportData?.schedule.length) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    // Create CSV content
    const headers = ["Data", "Tipo", "Número", "Tema", "Disciplina", "Status"];
    const rows = exportData.schedule.map((item: any) => [
      item.date,
      item.type === "revision" ? "Revisão" : "Teste",
      item.revisionNumber.toString(),
      item.topicName,
      item.disciplineName,
      item.completed ? "Concluído" : "Pendente"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any) => row.map((cell: any) => `"${cell}"`).join(","))
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `cronograma-estudos-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();

    toast.success("Cronograma exportado com sucesso!");
  };

  const handleExportPrintable = () => {
    if (!exportData?.schedule.length) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    // Group by date
    const groupedByDate = exportData.schedule.reduce((acc: any, item: any) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {} as Record<string, typeof exportData.schedule>);

    // Create printable HTML
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cronograma de Estudos - SOE</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
          h2 { color: #666; margin-top: 30px; }
          .date-group { margin-bottom: 20px; page-break-inside: avoid; }
          .date-header { background: #f5f5f5; padding: 8px 12px; font-weight: bold; border-radius: 4px; }
          .activity { padding: 8px 12px; border-left: 3px solid; margin: 4px 0; }
          .revision { border-color: #3B82F6; background: #EFF6FF; }
          .test { border-color: #F59E0B; background: #FFFBEB; }
          .completed { opacity: 0.6; text-decoration: line-through; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 8px; }
          .badge-revision { background: #DBEAFE; color: #1E40AF; }
          .badge-test { background: #FEF3C7; color: #92400E; }
          .legend { margin-bottom: 20px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Cronograma de Estudos</h1>
        <p>SOE — Sistema de Otimização de Estudos</p>
        <p><strong>Gerado em:</strong> ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}</p>
        
        <div class="legend">
          <span class="badge badge-revision">Revisão</span> Revisão programada (SOE)
          &nbsp;&nbsp;
          <span class="badge badge-test">Teste</span> Teste aleatório (a cada 3+ dias)
        </div>

        ${Object.entries(groupedByDate).map(([date, activities]: any) => `
          <div class="date-group">
            <div class="date-header">${format(parseISO(date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</div>
            ${activities.map((a: any) => `
              <div class="activity ${a.type} ${a.completed ? 'completed' : ''}">
                <span class="badge badge-${a.type}">${a.type === 'revision' ? 'Revisão' : 'Teste'} #${a.revisionNumber}</span>
                <strong>${a.topicName}</strong>
                <span style="color: ${a.disciplineColor}; margin-left: 8px;">● ${a.disciplineName}</span>
                ${a.completed ? ' (feito)' : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </body>
      </html>
    `;

    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2.5" style={{ color: "var(--app-fg)" }}>
            <HistoryIcon className="h-7 w-7 text-[var(--primary)]" />
            Histórico
          </h1>
          <p className="text-sm opacity-60">Linha do tempo de todas as suas atividades.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase tracking-widest">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" onClick={handleExportPrintable} className="flex-1 sm:flex-none h-11 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase tracking-widest">
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 opacity-30" />
            <Input
              placeholder="Buscar..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-11 h-11 rounded-2xl bg-white/5 border-white/5"
            />
        </div>
        
        <Select
          value={filters.disciplineId ? String(filters.disciplineId) : "all"}
          onValueChange={(value) => setFilters({ ...filters, disciplineId: value === "all" ? undefined : Number(value) })}
        >
          <SelectTrigger className="h-11 rounded-2xl bg-white/5 border-white/5">
            <SelectValue placeholder="Matéria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {disciplines?.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.type || "all"}
          onValueChange={(value) => setFilters({ ...filters, type: value === "all" ? undefined : value as "revision" | "test" })}
        >
          <SelectTrigger className="h-11 rounded-2xl bg-white/5 border-white/5">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="revision">Revisões</SelectItem>
            <SelectItem value="test">Testes</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          className="h-11 rounded-2xl bg-white/5 border-white/5 text-[10px]"
        />

        <div className="flex gap-2">
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="flex-1 h-11 rounded-2xl bg-white/5 border-white/5 text-[10px]"
          />
          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} className="h-11 w-11 rounded-2xl bg-white/5 border border-white/5">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">
            Todas
            {historyData?.revisions && (
              <Badge variant="secondary" className="ml-2">{historyData.revisions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Concluídas
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Circle className="h-4 w-4 mr-1" />
            Pendentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-6 bg-muted rounded w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !historyData?.revisions.length ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <HistoryIcon className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma atividade encontrada</h3>
                <p className="text-muted-foreground text-center">
                  {hasFilters 
                    ? "Tente ajustar os filtros de busca"
                    : "Registre temas de estudo para ver o histórico de atividades"}
                </p>
                {hasFilters && (
                  <Button variant="outline" className="mt-4" onClick={clearFilters}>
                    Limpar Filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {historyData.revisions.map((revision: any) => {
                const topic = getTopic(revision.topicId);
                const discipline = topic ? getDiscipline(topic.disciplineId) : null;

                return (
                  <Card key={revision.id} className={revision.completed ? "opacity-70" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={revision.completed}
                          onCheckedChange={() => markCompletedMutation.mutate({
                            id: revision.id,
                            completed: !revision.completed
                          })}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className={revision.type === "test" ? "badge-test" : "badge-revision"}
                            >
                              {revision.type === "test" ? (
                                <><ClipboardCheck className="h-3 w-3 mr-1" />Teste #{revision.revisionNumber}</>
                              ) : (
                                <><BookOpen className="h-3 w-3 mr-1" />Revisão #{revision.revisionNumber}</>
                              )}
                            </Badge>
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(parseISO(revision.scheduledDate), "dd/MM/yyyy")}
                            </span>
                            {revision.completed && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Concluído
                              </Badge>
                            )}
                          </div>
                          <p className={`font-medium ${revision.completed ? "line-through" : ""}`}>
                            {topic?.name || "Tema desconhecido"}
                          </p>
                          {discipline && (
                            <div className="flex items-center gap-1 mt-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: discipline.color }}
                              />
                              <span className="text-sm text-muted-foreground">{discipline.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
