import React from "react";
import { Link, useNavigate, useRouteError } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TriangleAlert, RotateCcw, PackageSearch, House } from "lucide-react";

/* Route-level error boundary: an unexpected render failure shows a
 * recoverable screen instead of React Router's developer error page. */
export function RouteErrorScreen() {
  const navigate = useNavigate();
  const error = useRouteError();
  const message =
    (error instanceof Error ? error.message : String(error ?? "")) || "";

  const retry = () => {
    if (typeof window !== "undefined") window.location.reload();
    else navigate(0);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <TriangleAlert className="h-8 w-8 text-destructive" />
          </span>
          <div>
            <p className="text-lg font-semibold">Something went wrong</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This section hit an unexpected error. Your cart and orders are
              safe — try again or head back.
            </p>
            {import.meta.env.DEV && message && (
              <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
                {message}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
            <Button variant="outline" asChild>
              <Link to="/order">
                <PackageSearch className="h-4 w-4" />
                My orders
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/">
                <House className="h-4 w-4" />
                Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* Class boundary for deep subtree failures (same UX, manual reset). */
export class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error("[boundary]", error);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="mx-auto w-full max-w-lg px-4 py-12">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <TriangleAlert className="h-8 w-8 text-destructive" />
              <p className="font-semibold">This section failed to load</p>
              <Button
                variant="outline"
                onClick={() => this.setState({ failed: false })}
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

export default RouteErrorScreen;
