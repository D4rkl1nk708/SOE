import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testInterval: string;
  setTestInterval: (val: string) => void;
  revisionInterval: string;
  setRevisionInterval: (val: string) => void;
  revisionSecondPhase: string;
  setRevisionSecondPhase: (val: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

export function ScheduleDialog({
  open, onOpenChange,
  testInterval, setTestInterval,
  revisionInterval, setRevisionInterval,
  revisionSecondPhase, setRevisionSecondPhase,
  onSave, isSaving
}: ScheduleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md !bg-[var(--app-bg)] !border-white/10 rounded-[2.5rem]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Configurar Ciclo</DialogTitle>
          <DialogDescription className="text-xs opacity-60">Intervalos para revisões e simulados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Simulados (dias)</Label>
            <Input type="number" min={1} max={30} placeholder="3" value={testInterval} onChange={e => setTestInterval(e.target.value)} 
              className="rounded-xl bg-white/5 border-white/5 focus:border-[var(--primary-border)]" />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Revisão - Fase 1 (dias)</Label>
            <Input type="number" min={0} max={365} placeholder="25" value={revisionInterval} onChange={e => setRevisionInterval(e.target.value)}
              className="rounded-xl bg-white/5 border-white/5 focus:border-[var(--primary-border)]" />
            <p className="text-[10px] opacity-30 font-medium">0 = desativar revisões</p>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-1">Revisão - Fase 2 (dias)</Label>
            <Input type="number" min={1} max={365} placeholder="50" value={revisionSecondPhase} onChange={e => setRevisionSecondPhase(e.target.value)}
              className="rounded-xl bg-white/5 border-white/5 focus:border-[var(--primary-border)]" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border-white/5 text-[10px] font-black uppercase tracking-widest opacity-60">Cancelar</Button>
          <Button onClick={onSave} disabled={isSaving} className="rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-shadow)] text-[10px] font-black uppercase tracking-widest">
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
