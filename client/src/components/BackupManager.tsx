import React from "react";
import { Button } from "./ui/button";
import { Download, Upload, Database } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function BackupManager() {
  const utils = trpc.useUtils();
  const exportMutation = trpc.import.exportBackup.useQuery(undefined, { enabled: false });
  const importMutation = trpc.import.importBackup.useMutation({
    onSuccess: () => {
      toast.success("Dados importados com sucesso!");
      utils.invalidate();
      window.location.reload();
    },
    onError: (err) => toast.error("Erro ao importar: " + err.message)
  });

  const handleExport = async () => {
    const { data } = await exportMutation.refetch();
    if (data) {
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estudo_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado!");
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const json = event.target?.result as string;
      importMutation.mutate({ json });
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
        <Download className="h-4 w-4" /> Exportar Banco
      </Button>
      <label className="cursor-pointer">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <span><Upload className="h-4 w-4" /> Importar Banco</span>
        </Button>
        <input type="file" className="hidden" accept=".json" onChange={handleImport} />
      </label>
    </div>
  );
}
