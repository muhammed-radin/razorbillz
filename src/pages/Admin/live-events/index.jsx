import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserSession } from "@/contexts/user-session-context";
import { liveEventsApi } from "@/services/shop";
import {
  useStrictEffect,
  useStrictFetchEffect,
} from "@/utils/hooks/useStrictEffect";
import { useLiveEventsStream } from "@/utils/hooks/useLiveEventsStream";

const SECTORS = [
  "product",
  "user",
  "session",
  "order",
  "payment",
  "shipment",
  "support",
  "wishlist",
  "cart",
  "search",
  "analytics",
  "error",
  "site",
  "global",
];

const chartConfig = {
  requests: { label: "API requests", color: "#3b82f6" },
  events: { label: "Events", color: "#8b5cf6" },
  dbRead: { label: "Read", color: "#0ea5e9" },
  dbCreate: { label: "Create", color: "#22c55e" },
  dbUpdate: { label: "Update", color: "#f59e0b" },
  dbDelete: { label: "Delete", color: "#ef4444" },
};

const numberFmt = new Intl.NumberFormat();
const compactFmt = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatNumber(value) {
  return numberFmt.format(Number(value) || 0);
}

function formatCompact(value) {
  return compactFmt.format(Number(value) || 0);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : timeFmt.format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFmt.format(date);
}

function formatUptime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function mergeNewest(previous, incoming, max = 300) {
  if (!Array.isArray(incoming) || !incoming.length) return previous;

  const seen = new Set(previous.map((item) => item.id));
  const fresh = incoming
    .filter((item) => item && !seen.has(item.id))
    .reverse();

  if (!fresh.length) return previous;
  return [...fresh, ...previous].slice(0, max);
}

function StatCard({ title, value, hint, icon, tone }) {
  const Icon = icon;

  return (
    <Card className="min-w-0">
      <CardContent className="p-3 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${tone}`}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground sm:text-sm">
              {title}
            </p>
            <p className="truncate text-base font-bold tabular-nums sm:text-2xl">
              {value}
            </p>
          </div>
        </div>
        {hint ? (
          <p className="mt-2 break-words text-[11px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConnectionPill({ status, attempts }) {
  const map = {
    open: {
      label: "Live",
      icon: Wifi,
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    connecting: {
      label: "Connecting",
      icon: Wifi,
      className:
        "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    },
    reconnecting: {
      label: `Reconnecting${attempts ? ` (${attempts})` : ""}`,
      icon: WifiOff,
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    forbidden: {
      label: "Access denied",
      icon: ShieldAlert,
      className:
        "border-destructive/30 bg-destructive/10 text-destructive",
    },
    idle: {
      label: "Idle",
      icon: WifiOff,
      className: "border-border bg-muted text-muted-foreground",
    },
  };

  const config = map[status] || map.idle;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

function MethodBadge({ method }) {
  const tones = {
    GET: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    POST: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    PUT: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    PATCH: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
        tones[method] || "bg-muted text-muted-foreground"
      }`}
    >
      {method}
    </span>
  );
}

function StatusBadge({ status, level }) {
  if (level === "error") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  if (level === "warn") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 text-amber-600 dark:text-amber-400"
      >
        {status}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
    >
      {status}
    </Badge>
  );
}

function OperationBadge({ operation }) {
  const tones = {
    create: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    read: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    update: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    delete: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
        tones[operation] || "bg-muted text-muted-foreground"
      }`}
    >
      {operation}
    </span>
  );
}

function EmptyRow({ colSpan, label = "No records yet." }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="py-8 text-center text-sm text-muted-foreground"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

function LiveEventsTable({ events }) {
  return (
    <Table className="min-w-[300px] sm:min-w-[520px]">
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="hidden sm:table-cell">Sector</TableHead>
          <TableHead className="hidden sm:table-cell">Level</TableHead>
          <TableHead>Detail</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.length ? (
          events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatTime(event.timestamp)}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs">{event.type || "—"}</span>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant="secondary" className="capitalize">
                  {event.sector || "global"}
                </Badge>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {event.isError ? (
                  <Badge variant="destructive">error</Badge>
                ) : event.isMajor ? (
                  <Badge>major</Badge>
                ) : (
                  <Badge variant="outline">info</Badge>
                )}
              </TableCell>
              <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground sm:max-w-[360px]">
                {event.title || event.message || event.path || "—"}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={5} label="Waiting for live events…" />
        )}
      </TableBody>
    </Table>
  );
}

function RequestsTable({ requests }) {
  return (
    <Table className="min-w-[300px] sm:min-w-[420px]">
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Path</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            Latency
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length ? (
          requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatTime(request.timestamp)}
              </TableCell>
              <TableCell>
                <MethodBadge method={request.method} />
              </TableCell>
              <TableCell className="max-w-[130px] truncate font-mono text-xs sm:max-w-[260px]">
                {request.path}
              </TableCell>
              <TableCell>
                <StatusBadge status={request.status} level={request.level} />
              </TableCell>
              <TableCell className="hidden text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                {request.durationMs}ms
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={5} label="No API requests recorded yet." />
        )}
      </TableBody>
    </Table>
  );
}

function DbStreamTable({ operations }) {
  return (
    <Table className="min-w-[280px] sm:min-w-[320px]">
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Operation</TableHead>
          <TableHead>Collection</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {operations.length ? (
          operations.map((operation) => (
            <TableRow key={operation.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatTime(operation.timestamp)}
              </TableCell>
              <TableCell>
                <OperationBadge operation={operation.operation} />
              </TableCell>
              <TableCell className="max-w-[180px] truncate font-mono text-xs">
                {operation.collection}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={3} label="No database commands recorded yet." />
        )}
      </TableBody>
    </Table>
  );
}

function TopRoutesTable({ routes }) {
  return (
    <Table className="min-w-[280px] sm:min-w-[360px]">
      <TableHeader>
        <TableRow>
          <TableHead>Method</TableHead>
          <TableHead>Route</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Avg</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            Errors
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {routes.length ? (
          routes.map((route) => (
            <TableRow key={`${route.method} ${route.path}`}>
              <TableCell>
                <MethodBadge method={route.method} />
              </TableCell>
              <TableCell className="max-w-[160px] truncate font-mono text-xs sm:max-w-[260px]">
                {route.path}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatNumber(route.count)}
              </TableCell>
              <TableCell className="hidden text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
                {route.avgMs}ms
              </TableCell>
              <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell">
                {route.errors ? (
                  <span className="text-destructive">{route.errors}</span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={5} label="No API routes recorded yet." />
        )}
      </TableBody>
    </Table>
  );
}

function CollectionsTable({ collections }) {
  return (
    <Table className="min-w-[300px] sm:min-w-[340px]">
      <TableHeader>
        <TableRow>
          <TableHead>Collection</TableHead>
          <TableHead className="text-right">C</TableHead>
          <TableHead className="text-right">R</TableHead>
          <TableHead className="text-right">U</TableHead>
          <TableHead className="text-right">D</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {collections.length ? (
          collections.slice(0, 12).map((row) => (
            <TableRow key={row.collection}>
              <TableCell className="max-w-[130px] truncate font-mono text-xs sm:max-w-[180px]">
                {row.collection}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {row.create}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {row.read}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {row.update}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {row.delete}
              </TableCell>
              <TableCell className="text-right text-xs font-semibold tabular-nums">
                {row.total}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <EmptyRow colSpan={6} label="No CRUD commands recorded yet." />
        )}
      </TableBody>
    </Table>
  );
}

function OwnerOnlyNotice() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-8">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle>Owner access required</CardTitle>
          <CardDescription>
            The live events console exposes raw server telemetry and is
            restricted to the store owner. Your account does not have the
            owner role.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          If you believe this is a mistake, ask the owner to review your role
          in the admin settings.
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminLiveEventsPage() {
  const { data: session, isPending } = useUserSession();

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verifying owner access…
      </div>
    );
  }

  if (session?.user?.role !== "owner") {
    return <OwnerOnlyNotice />;
  }

  return <LiveEventsDashboard />;
}

function LiveEventsDashboard() {
  const [activeTab, setActiveTab] = useState("live");
  const [snapshot, setSnapshot] = useState(null);
  const [initialError, setInitialError] = useState(null);

  const [liveEvents, setLiveEvents] = useState([]);
  const [liveRequests, setLiveRequests] = useState([]);
  const [liveDbOps, setLiveDbOps] = useState([]);

  const [draftFilters, setDraftFilters] = useState({
    sector: "",
    type: "",
    search: "",
    major: false,
    errors: false,
  });
  const [filters, setFilters] = useState(draftFilters);
  const [pastSkip, setPastSkip] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [past, setPast] = useState({
    events: [],
    total: 0,
    hasMore: false,
    nextSkip: 0,
  });
  const [pastLoading, setPastLoading] = useState(false);
  const [pastError, setPastError] = useState(null);
  const [pastSummary, setPastSummary] = useState(null);

  const applySnapshot = useCallback((data, replaceRecent) => {
    if (!data) return;
    setSnapshot(data);

    if (!replaceRecent) return;
    if (Array.isArray(data.events?.recent)) {
      setLiveEvents(data.events.recent);
    }
    if (Array.isArray(data.requests?.recent)) {
      setLiveRequests(data.requests.recent);
    }
    if (Array.isArray(data.db?.recent)) {
      setLiveDbOps(data.db.recent);
    }
  }, []);

  const handleStreamMessage = useCallback(
    ({ event, data }) => {
      if (event === "snapshot") {
        applySnapshot(data, true);
        return;
      }
      if (event === "metrics") {
        applySnapshot(data, false);
        return;
      }
      if (event === "events") {
        setLiveEvents((previous) => mergeNewest(previous, data));
        return;
      }
      if (event === "requests") {
        setLiveRequests((previous) => mergeNewest(previous, data));
        return;
      }
      if (event === "db") {
        setLiveDbOps((previous) => mergeNewest(previous, data));
      }
    },
    [applySnapshot],
  );

  const stream = useLiveEventsStream({
    enabled: true,
    onMessage: handleStreamMessage,
  });

  useStrictFetchEffect(
    async (signal) => {
      try {
        const data = await liveEventsApi.snapshot(
          { limit: 100, window: 60 },
          { signal },
        );
        if (signal.aborted) return;
        applySnapshot(data, true);
        setInitialError(null);
      } catch (error) {
        if (signal.aborted) return;
        setInitialError(
          error?.response?.status === 403
            ? "Owner permission is required for this console."
            : "Could not load the live telemetry snapshot.",
        );
      }
    },
    [],
  );

  useStrictEffect(() => {
    const timer = setTimeout(() => {
      setFilters(draftFilters);
      setPastSkip(0);
    }, 350);

    return () => clearTimeout(timer);
  }, [draftFilters]);

  const pastParams = useMemo(
    () => ({
      limit: 50,
      skip: pastSkip,
      sector: filters.sector || undefined,
      type: filters.type.trim() || undefined,
      search: filters.search.trim() || undefined,
      major: filters.major ? "true" : undefined,
      errors: filters.errors ? "true" : undefined,
    }),
    [filters, pastSkip],
  );

  useStrictFetchEffect(
    async (signal) => {
      if (activeTab !== "past") return;

      setPastLoading(true);
      setPastError(null);

      try {
        const data = await liveEventsApi.past(pastParams, { signal });
        if (signal.aborted) return;

        setPast((previous) => ({
          ...data,
          events:
            pastSkip === 0
              ? data.events ?? []
              : [...(previous.events ?? []), ...(data.events ?? [])],
        }));
      } catch (error) {
        if (signal.aborted) return;
        setPastError(
          error?.response?.status === 403
            ? "Owner permission is required for event history."
            : "Could not load past events.",
        );
      } finally {
        if (!signal.aborted) setPastLoading(false);
      }
    },
    [pastParams, activeTab, reloadKey],
  );

  useStrictFetchEffect(
    async (signal) => {
      if (activeTab !== "past") return;

      try {
        const data = await liveEventsApi.pastSummary(
          { days: 14 },
          { signal },
        );
        if (!signal.aborted) setPastSummary(data);
      } catch {
        if (!signal.aborted) setPastSummary(null);
      }
    },
    [activeTab],
  );

  const series = useMemo(
    () =>
      (snapshot?.series ?? []).map((row) => ({
        ...row,
        label: formatTime(row.minute).slice(0, 5),
      })),
    [snapshot],
  );

  const latest = series[series.length - 1] ?? {};
  const pastSeries = (pastSummary?.series ?? []).map((row) => ({
    ...row,
    label: row.day?.slice(5) || row.day,
  }));

  const refresh = useCallback(() => {
    setReloadKey((value) => value + 1);
    setPastSkip(0);
    liveEventsApi
      .snapshot({ limit: 100, window: 60 })
      .then((data) => applySnapshot(data, true))
      .catch(() => {});
  }, [applySnapshot]);

  const resetFilters = () => {
    const empty = {
      sector: "",
      type: "",
      search: "",
      major: false,
      errors: false,
    };
    setDraftFilters(empty);
    setFilters(empty);
    setPastSkip(0);
  };

  const loadMore = () => {
    if (past.hasMore) setPastSkip(past.nextSkip || past.events.length);
  };

  const requestSeries = snapshot?.requests ?? {};
  const dbSeries = snapshot?.db ?? {};
  const eventSeries = snapshot?.events ?? {};

  return (
    <div className="w-full min-w-0 space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 sm:space-y-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              <Radio className="h-5 w-5 shrink-0 text-primary" />
              Live Events
            </h1>
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground sm:text-sm">
              Owner-only realtime telemetry, API tallies, and MongoDB CRUD
              activity.
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ConnectionPill
              status={stream.status}
              attempts={stream.attempts}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={refresh}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {initialError ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span className="flex-1 text-destructive">{initialError}</span>
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : null}

        {stream.error ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
            {stream.error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <StatCard
            title="API requests"
            value={formatCompact(requestSeries.total)}
            hint={`${latest.requests ?? 0}/min · ${requestSeries.avgMs ?? 0}ms avg`}
            icon={Server}
            tone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          />
          <StatCard
            title="DB CRUD actions"
            value={formatCompact(dbSeries.total)}
            hint={`C ${dbSeries.byOperation?.create ?? 0} · R ${dbSeries.byOperation?.read ?? 0} · U ${dbSeries.byOperation?.update ?? 0} · D ${dbSeries.byOperation?.delete ?? 0}`}
            icon={Database}
            tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            title="Events"
            value={formatCompact(eventSeries.total)}
            hint={`${eventSeries.major ?? 0} major · ${eventSeries.errors ?? 0} errors`}
            icon={Activity}
            tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          />
          <StatCard
            title="Request errors"
            value={`${requestSeries.errorRate ?? 0}%`}
            hint={`${formatNumber(requestSeries.errors)} failed · ${formatUptime(snapshot?.uptimeMs)} uptime`}
            icon={AlertTriangle}
            tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
            <TabsTrigger value="live">
              <Radio className="mr-1.5 h-3.5 w-3.5" />
              Live
            </TabsTrigger>
            <TabsTrigger value="past">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Past
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4 sm:space-y-6">
            <div className="grid min-w-0 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
              <Card className="lg:col-span-2">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>Traffic per minute</CardTitle>
                  <CardDescription>
                    API requests and application events over the last 60
                    minutes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={chartConfig}
                    className="h-[220px] w-full min-w-0 sm:h-[260px]"
                  >
                    <AreaChart
                      data={series}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="liveRequests"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#3b82f6"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3b82f6"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                        <linearGradient
                          id="liveEvents"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        minTickGap={28}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="requests"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#liveRequests)"
                      />
                      <Area
                        type="monotone"
                        dataKey="events"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#liveEvents)"
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>MongoDB CRUD</CardTitle>
                  <CardDescription>
                    Driver commands grouped by operation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={chartConfig}
                    className="h-[220px] w-full min-w-0 sm:h-[260px]"
                  >
                    <BarChart
                      data={series}
                      margin={{ top: 10, right: 4, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10 }}
                        minTickGap={30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="dbRead"
                        stackId="db"
                        fill="#0ea5e9"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar dataKey="dbCreate" stackId="db" fill="#22c55e" />
                      <Bar dataKey="dbUpdate" stackId="db" fill="#f59e0b" />
                      <Bar
                        dataKey="dbDelete"
                        stackId="db"
                        fill="#ef4444"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-5 [&>*]:min-w-0">
              <Card className="lg:col-span-3">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>API request tally</CardTitle>
                  <CardDescription>
                    Hottest routes since the server started. Query strings and
                    identifiers are stripped.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[320px] w-full overflow-auto overscroll-contain">
                    <TopRoutesTable routes={requestSeries.topRoutes ?? []} />
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>CRUD by collection</CardTitle>
                  <CardDescription>
                    Total {formatNumber(dbSeries.total)} database commands.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[320px] w-full overflow-auto overscroll-contain">
                    <CollectionsTable
                      collections={dbSeries.byCollection ?? []}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle>Live event feed</CardTitle>
                <CardDescription>
                  {formatNumber(eventSeries.total)} events captured · newest
                  first.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[380px] w-full overflow-auto overscroll-contain">
                  <LiveEventsTable events={liveEvents.slice(0, 100)} />
                </div>
              </CardContent>
            </Card>

            <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
              <Card>
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>API request stream</CardTitle>
                  <CardDescription>
                    {formatNumber(requestSeries.total)} requests ·{" "}
                    {formatNumber(requestSeries.errors)} failed.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[320px] w-full overflow-auto overscroll-contain">
                    <RequestsTable requests={liveRequests.slice(0, 100)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>MongoDB CRUD stream</CardTitle>
                  <CardDescription>
                    Live insert, find, update, and delete commands.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[320px] w-full overflow-auto overscroll-contain">
                    <DbStreamTable operations={liveDbOps.slice(0, 100)} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="past" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle>Past activity</CardTitle>
                <CardDescription>
                  Persisted records from the activities collection, with the
                  same scrubbing applied as the live feed.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Search
                  </p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={draftFilters.search}
                      onChange={(event) =>
                        setDraftFilters((previous) => ({
                          ...previous,
                          search: event.target.value,
                        }))
                      }
                      placeholder="Search type, title, or message"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Sector
                  </p>
                  <Select
                    value={draftFilters.sector || "all"}
                    onValueChange={(value) =>
                      setDraftFilters((previous) => ({
                        ...previous,
                        sector: value === "all" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All sectors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sectors</SelectItem>
                      {SECTORS.map((sector) => (
                        <SelectItem key={sector} value={sector}>
                          {sector}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Event type
                  </p>
                  <Input
                    value={draftFilters.type}
                    onChange={(event) =>
                      setDraftFilters((previous) => ({
                        ...previous,
                        type: event.target.value,
                      }))
                    }
                    placeholder="e.g. order_placed"
                  />
                </div>

                <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
                  <Button
                    type="button"
                    size="sm"
                    variant={draftFilters.major ? "default" : "outline"}
                    onClick={() =>
                      setDraftFilters((previous) => ({
                        ...previous,
                        major: !previous.major,
                      }))
                    }
                  >
                    Major only
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={draftFilters.errors ? "default" : "outline"}
                    onClick={() =>
                      setDraftFilters((previous) => ({
                        ...previous,
                        errors: !previous.errors,
                      }))
                    }
                  >
                    Errors only
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={resetFilters}
                  >
                    Clear
                  </Button>
                  <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                    {formatNumber(past.total)} matching records
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="grid min-w-0 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
              <Card className="lg:col-span-2">
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>Past activity per day</CardTitle>
                  <CardDescription>
                    Last 14 days from persisted activity records.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={chartConfig}
                    className="h-[200px] w-full min-w-0 sm:h-[240px]"
                  >
                    <BarChart
                      data={pastSeries}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="total"
                        fill="#8b5cf6"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="errors"
                        fill="#ef4444"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-4 sm:px-6">
                  <CardTitle>Breakdown</CardTitle>
                  <CardDescription>
                    {formatNumber(pastSummary?.total)} records in the window.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold">By sector</p>
                    <div className="flex flex-wrap gap-2">
                      {(pastSummary?.bySector ?? []).length ? (
                        pastSummary.bySector.map((row) => (
                          <Badge key={row.sector} variant="secondary">
                            {row.sector}: {row.count}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No data
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">By type</p>
                    <div className="flex flex-wrap gap-2">
                      {(pastSummary?.byType ?? []).length ? (
                        pastSummary.byType.slice(0, 12).map((row) => (
                          <Badge key={row.type} variant="outline">
                            {row.type}: {row.count}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No data
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Scrubbed output
                    </div>
                    <p className="mt-1">
                      Emails, tokens, credentials, and long identifiers are
                      redacted before leaving the server.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle>Persisted events</CardTitle>
                <CardDescription>
                  {formatNumber(past.total)} records · showing{" "}
                  {formatNumber(past.events.length)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {pastError ? (
                  <div className="border-b border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                    {pastError}
                  </div>
                ) : null}

                <div className="max-h-[420px] w-full overflow-auto overscroll-contain">
                  <Table className="min-w-[300px] sm:min-w-[520px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Sector
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Level
                        </TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {past.events.length ? (
                        past.events.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDateTime(event.timestamp)}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">
                                {event.type || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge
                                variant="secondary"
                                className="capitalize"
                              >
                                {event.sector || "global"}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {event.isError ? (
                                <Badge variant="destructive">error</Badge>
                              ) : event.isMajor ? (
                                <Badge>major</Badge>
                              ) : (
                                <Badge variant="outline">info</Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground sm:max-w-[420px]">
                              {event.title ||
                                event.message ||
                                event.path ||
                                "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <EmptyRow
                          colSpan={5}
                          label={
                            pastLoading
                              ? "Loading past events…"
                              : "No persisted events match these filters."
                          }
                        />
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-3 border-t p-3">
                  <span className="text-xs text-muted-foreground">
                    {pastLoading ? "Loading…" : `${past.events.length} loaded`}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={pastLoading || !past.hasMore}
                  >
                    {pastLoading ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
