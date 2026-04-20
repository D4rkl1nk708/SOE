import React, { useState } from "react";
import { Button } from "./ui/button";
import { Download, Upload, Database, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DataManager() {
  const utils = trpc.useUtils();
  const [showImportWarning, setShowImportWarning] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const exportMutation = trpc.import.exportBackup.useQuery(undefined, { enabled: false });
  const importMutation = trpc.import.importBackup.useMutation({
    onSuccess: () => {
      toast.success("Dados e configurações importados com sucesso!");
      utils.invalidate();
      setTimeout(() => window.location.reload(), 1000);
    },
    onError: (err) => toast.error("Erro ao importar: " + err.message)
  });

  const handleExport = async () => {
    try {
      const { data } = await exportMutation.refetch();
      if (data) {
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `soe_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Backup exportado com sucesso!");
      }
    } catch (error) {
      toast.error("Erro ao exportar dados");
    }
  };

  const handleImportClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.name.endsWith('.json')) {
      toast.error("Por favor, selecione um arquivo JSON válido");
      return;
    }

    setPendingImportFile(file);
    setShowImportWarning(true);
  };

  const confirmImport = () => {
    if (!pendingImportFile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        // Validate JSON
        JSON.parse(json);
        importMutation.mutate({ json });
        setShowImportWarning(false);
        setPendingImportFile(null);
      } catch (error) {
        toast.error("Arquivo JSON inválido");
        setShowImportWarning(false);
        setPendingImportFile(null);
      }
    };
    reader.readAsText(pendingImportFile);
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="gap-2"
          disabled={exportMutation.isLoading}
        >
          <Download className="h-4 w-4" />
          Exportar Dados
        </Button>
        <label className="cursor-pointer">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            asChild
            disabled={importMutation.isPending}
          >
            <span>
              <Upload className="h-4 w-4" />
              Importar Dados
            </span>
          </Button>
          <input
            type="file"
            className="hidden"
            accept=".json"
            onChange={handleImportClick}
          />
        </label>
      </div>

      <AlertDialog open={showImportWarning} onOpenChange={setShowImportWarning}>
        <AlertDialogContent>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            Importar Dados
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ao importar um backup, todos os seus dados atuais (disciplinas, temas, simulados, configurações, etc.) serão substituídos pelos dados do arquivo.
            <br />
            <br />
            <strong>Esta ação não pode ser desfeita!</strong> Certifique-se de que deseja continuar.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmImport}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Importar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
