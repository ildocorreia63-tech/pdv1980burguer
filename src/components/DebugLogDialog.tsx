import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Bug } from "lucide-react";
import { toast } from "sonner";
import { clearLog, getLog, logAsText, subscribeLog, type LogEntry } from "@/lib/debugLog";

export function DebugLogDialog({
  open, onOpenChange, filterTraceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filterTraceId?: string;
}) {
  const [list, setList] = useState<LogEntry[]>(getLog());
  useEffect(() => subscribeLog(setList), []);
  const shown = filterTraceId ? list.filter((e) => e.trace_id === filterTraceId) : list;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(logAsText());
      toast.success("Logs copiados");
    } catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4" /> Logs de diagnóstico
            {filterTraceId && <span className="text-xs font-mono text-muted-foreground">({filterTraceId})</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copy}><Copy className="h-3 w-3 mr-1" />Copiar</Button>
          <Button size="sm" variant="outline" onClick={() => clearLog()}><Trash2 className="h-3 w-3 mr-1" />Limpar</Button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded border border-border bg-muted/30 p-2 text-[11px] font-mono whitespace-pre-wrap">
          {shown.length === 0 ? (
            <div className="text-muted-foreground">Sem eventos ainda.</div>
          ) : shown.map((e, i) => (
            <div key={i} className={
              e.level === "error" ? "text-destructive"
              : e.level === "warn" ? "text-yellow-600"
              : "text-foreground"
            }>
              [{e.ts.slice(11, 19)}] {e.level.toUpperCase()} {e.scope}:{e.stage} — {e.message}
              {e.data ? <div className="pl-4 opacity-70">{JSON.stringify(e.data)}</div> : null}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
