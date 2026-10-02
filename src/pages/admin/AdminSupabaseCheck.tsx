import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Database, Search, RefreshCw } from "lucide-react";
import { Button, Card, Input } from "@/components/shared";
import { supabase } from "@/lib/supabase";

interface TableInfo {
  name: string;
  rowCount: number | null;
  connected: boolean;
  error?: string;
}

export default function AdminSupabaseCheck() {
  const [tableInfo, setTableInfo] = useState<TableInfo>({ name: "MAPOLY STUDENT", rowCount: null, connected: false });
  const [queryMatric, setQueryMatric] = useState("21/69/0056");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState("");
  const [querying, setQuerying] = useState(false);

  // Test connection on mount
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      const { count, error } = await supabase
        .from("MAPOLY STUDENT")
        .select("*", { count: "exact", head: true });

      if (error) {
        setTableInfo({ name: "MAPOLY STUDENT", rowCount: null, connected: false, error: error.message });
        return;
      }
      setTableInfo({ name: "MAPOLY STUDENT", rowCount: count ?? null, connected: true });
    } catch (err: any) {
      setTableInfo({ name: "MAPOLY STUDENT", rowCount: null, connected: false, error: err.message });
    }
  };

  const searchTest = async () => {
    setQuerying(true);
    setQueryError("");
    setQueryResult(null);
    try {
      const { data, error } = await supabase
        .from("MAPOLY STUDENT")
        .select("*")
        .eq("Matric Number", queryMatric)
        .maybeSingle();
      if (error) {
        setQueryError(error.message);
      } else if (!data) {
        setQueryError("No student found with that matric number.");
      } else {
        setQueryResult(data);
      }
    } catch (err: any) {
      setQueryError(err.message);
    }
    setQuerying(false);
  };

  // Fetch 5 sample rows to show the column structure
  const { data: sampleRows, isLoading: samplesLoading, refetch: refetchSamples } = useQuery({
    queryKey: ["supabase-samples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("MAPOLY STUDENT")
        .select("*")
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: tableInfo.connected,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <Database className="h-7 w-7 text-primary" /> Supabase Connection
        </h1>
        <p className="text-muted-foreground mt-1">
          Diagnostic tool — verify that the MAPOLY STUDENT table is reachable and queryable.
        </p>
      </div>

      {/* Connection status */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tableInfo.connected ? (
              <div className="rounded-full bg-success/15 p-2 text-success"><CheckCircle2 className="h-6 w-6" /></div>
            ) : (
              <div className="rounded-full bg-warning/15 p-2 text-warning"><XCircle className="h-6 w-6" /></div>
            )}
            <div>
              <div className="font-heading font-semibold text-lg">
                {tableInfo.connected ? "Connected ✓" : "Connection issue"}
              </div>
              <div className="text-sm text-muted-foreground">
                Table: <span className="font-mono text-foreground">MAPOLY STUDENT</span>
                {tableInfo.rowCount !== null && <> • <span className="font-semibold text-primary">{tableInfo.rowCount.toLocaleString()} records</span></>}
              </div>
            </div>
          </div>
          <Button onClick={testConnection} variant="outline">
            <RefreshCw className="h-4 w-4" /> Re-test
          </Button>
        </div>
        {tableInfo.error && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <strong>Supabase returned an error:</strong> {tableInfo.error}
          </div>
        )}
        {!tableInfo.connected && (
          <div className="mt-3 rounded-lg border border-secondary/30 bg-secondary/5 p-3 text-sm text-muted-foreground">
            <div className="font-semibold text-foreground mb-1">Common causes:</div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Check that your <strong>Publishable key</strong> is correct in <code>.env</code>: <code>VITE_SUPABASE_ANON_KEY</code> or <code>VITE_SUPABASE_PUBLISHABLE_KEY</code></li>
              <li>Your Supabase project URL must be <code>https://dzzixnldfqnzjhnddpgn.supabase.co</code></li>
              <li>The table name <strong>MAPOLY STUDENT</strong> must match exactly — check for leading/trailing spaces in Supabase Table Editor</li>
              <li>If Row Level Security (RLS) is ON, add a <code>SELECT</code> policy so your publishable key can read the rows</li>
              <li>Check browser Network tab (F12) for a <strong>401</strong> (wrong key) or <strong>404</strong> (wrong table name)</li>
            </ul>
          </div>
        )}
      </Card>

      {/* Quick lookup test */}
      <Card className="p-5">
        <h2 className="font-heading font-semibold mb-3 flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" /> Test Lookup
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Query by <code className="rounded bg-muted px-1 py-0.5">Matric Number</code> to verify the data is readable.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Matric Number (e.g. 21/69/0056)"
            value={queryMatric}
            onChange={e => setQueryMatric(e.target.value)}
            className="flex-1"
          />
          <Button onClick={searchTest} disabled={querying}>
            {querying ? "Searching…" : "Search"}
          </Button>
        </div>
        {queryError && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {queryError}
          </div>
        )}
        {queryResult && (
          <div className="mt-3 rounded-lg border border-success/30 bg-success/5 p-4">
            <div className="flex items-center gap-2 text-success font-semibold mb-2">
              <CheckCircle2 className="h-4 w-4" /> Student Found 👍
            </div>
            <div className="grid gap-2 md:grid-cols-2 text-sm">
              {Object.entries(queryResult).map(([key, value]) => (
                <div key={key} className="flex justify-between rounded bg-muted/40 px-3 py-1.5">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="font-medium break-all text-right">{String(value ?? "")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Sample rows */}
      {tableInfo.connected && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold">Sample records (first 5)</h2>
            <Button variant="ghost" size="sm" onClick={() => refetchSamples()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
          {samplesLoading ? (
            <div className="text-sm text-muted-foreground">Fetching sample records…</div>
          ) : sampleRows && sampleRows.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/40 p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Columns confirmed: {Object.keys(sampleRows[0]).join(", ")} — composite key: First Name · Last Name · School · Department · Level · Email
              </div>
              {sampleRows.map((row: any, i: number) => (
                <div key={i} className="rounded-lg border border-border p-3 text-sm">
                  <div className="grid gap-1.5 md:grid-cols-2">
                    <div><span className="text-muted-foreground">Matric: </span><strong>{row["Matric Number"]}</strong></div>
                    <div><span className="text-muted-foreground">Name: </span>{row["First Name"]} {row["Last Name"]}</div>
                    <div><span className="text-muted-foreground">Dept: </span>{row["Department"]}</div>
                    <div><span className="text-muted-foreground">Level: </span>{row["Level"]}</div>
                    <div><span className="text-muted-foreground">Status: </span><StatusBadge status={row["Status"]} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No rows returned.</div>
          )}
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="inline-flex items-center rounded-full border border-success/30 bg-success/15 text-success px-2 py-0.5 text-xs font-medium">{status}</span>;
}
