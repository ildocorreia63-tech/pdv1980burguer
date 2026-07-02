import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  goHome = () => {
    this.setState({ error: null });
    window.location.href = "/";
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-4 gradient-paper">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-retro text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="font-display text-2xl text-primary">Algo deu errado</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O app encontrou um erro inesperado. Nada foi perdido — seus dados salvos continuam a salvo.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-muted/60 p-2 text-left text-[11px] text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={this.reset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar de novo
            </Button>
            <Button className="flex-1" onClick={this.goHome}>
              <Home className="mr-2 h-4 w-4" />
              Início
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
