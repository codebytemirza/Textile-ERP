import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Package, Factory as FactoryIcon, Layers, TrendingUp, Coins } from "lucide-react";
import { dashboardApi, type DashboardData } from "../api";
import { formatCurrency, formatDate } from "../lib/utils";

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi
      .get()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  const metrics = [
    { label: "Yarn Stock Value", value: formatCurrency(data?.yarnValue), icon: <Package />, color: "#2563eb" },
    { label: "Lots in Production", value: String(data?.activeLots ?? 0), icon: <FactoryIcon />, color: "#9333ea" },
    { label: "Finished Goods Value", value: formatCurrency(data?.fgValue), icon: <Layers />, color: "#f97316" },
    { label: "This Month Sales", value: formatCurrency(data?.totalSales), icon: <TrendingUp />, color: "#16a34a" },
  ];

  const chartData = (data?.sales7d ?? []).map((d) => ({
    day: formatDate(new Date(d.date).getTime()),
    Retail: d.retail,
    Wholesale: d.wholesale,
  }));

  const lotStages = Object.entries(data?.lotStages ?? {});

  return (
    <Box>
      <Typography variant="h1" sx={{ mb: 3 }}>Dashboard</Typography>

      <Grid container spacing={2.5}>
        {metrics.map((m) => (
          <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={m.label}>
            <Card variant="outlined">
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: m.color,
                    bgcolor: `${m.color}1a`,
                  }}
                >
                  {m.icon}
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">{m.label}</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{m.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h3">Sales — Last 7 Days</Typography>
                <Coins color="#a3a3a3" />
              </Stack>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="Retail" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Wholesale" fill="#9333ea" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>Financial Overview (This Month)</Typography>
              <Stack spacing={1.5}>
                {[
                  { label: "Retail Sales", value: formatCurrency(data?.retailSalesTotal), color: "text.secondary" },
                  { label: "Wholesale Sales", value: formatCurrency(data?.wholesaleSalesTotal), color: "text.secondary" },
                  { label: "Estimated Profit", value: formatCurrency(data?.estimatedProfit), color: "#16a34a", bold: true },
                  { label: "Cash Balance", value: formatCurrency(data?.cashBalance), color: data?.cashBalance && data.cashBalance < 0 ? "#dc2626" : "text.secondary" },
                ].map((r) => (
                  <Stack
                    key={r.label}
                    direction="row"
                    sx={{ justifyContent: "space-between", alignItems: "center", p: 1.5, bgcolor: "grey.50", borderRadius: 1, border: "1px solid", borderColor: "divider" }}
                  >
                    <Typography sx={{ color: r.color, fontWeight: r.bold ? 700 : 400 }}>{r.label}</Typography>
                    <Typography sx={{ fontWeight: r.bold ? 700 : 600 }}>{r.value}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h3" sx={{ mb: 2 }}>Production Pipeline</Typography>
              {lotStages.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
                  No lots currently in production.
                </Paper>
              ) : (
                <Stack spacing={1}>
                  {lotStages.map(([stage, count]) => (
                    <Box
                      key={stage}
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        bgcolor: "grey.900",
                        color: "white",
                        px: 2,
                        py: 1.5,
                        borderRadius: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ color: "grey.400", textTransform: "uppercase", fontSize: 12 }}>
                        {stage}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{count}</Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={2.5}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h3" sx={{ mb: 1.5, fontSize: 14, color: "text.secondary", textTransform: "uppercase" }}>
                  Top Receivables
                </Typography>
                {data?.topReceivables.length ? (
                  data.topReceivables.map((c) => (
                    <Stack key={c.id} direction="row" sx={{ justifyContent: "space-between", py: 0.75 }}>
                      <Typography>{c.name}</Typography>
                      <Typography sx={{ color: "success.main", fontWeight: 600 }}>{formatCurrency(c.balance)}</Typography>
                    </Stack>
                  ))
                ) : (
                  <Typography color="text.secondary" variant="body2">All customer accounts settled.</Typography>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="h3" sx={{ mb: 1.5, fontSize: 14, color: "text.secondary", textTransform: "uppercase" }}>
                  Top Payables — Factories & Suppliers
                </Typography>
                {data?.topFactoryPayables.map((f) => (
                  <Stack key={f.id} direction="row" sx={{ justifyContent: "space-between", py: 0.75 }}>
                    <Typography>{f.name}</Typography>
                    <Typography sx={{ color: "error.main", fontWeight: 600 }}>{formatCurrency(f.balance)}</Typography>
                  </Stack>
                ))}
                {data?.topSupplierPayables.map((s) => (
                  <Stack key={s.id} direction="row" sx={{ justifyContent: "space-between", py: 0.75 }}>
                    <Typography>{s.name}</Typography>
                    <Typography sx={{ color: "error.main", fontWeight: 600 }}>{formatCurrency(s.balanceOwed)}</Typography>
                  </Stack>
                ))}
                {!data?.topFactoryPayables.length && !data?.topSupplierPayables.length && (
                  <Typography color="text.secondary" variant="body2">No outstanding payables.</Typography>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
