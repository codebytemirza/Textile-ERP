import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Payments, Search } from "@mui/icons-material";
import { collectionApi, businessApi } from "../api";
import { useCollection } from "../lib/useCollection";
import { useToast } from "../contexts/ToastContext";
import { EmptyState, PageHeader, Loader } from "../components/PageHeader";
import type { Customer, Factory, LedgerEntry, Supplier } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";

type TabKey = "Cash" | "Factory" | "Customer" | "Supplier";

interface PaymentForm {
  type: "Factory" | "Supplier" | "Customer";
  entityId: string;
  amount: string;
}

const emptyPayment: PaymentForm = { type: "Factory", entityId: "", amount: "" };

export function Ledgers() {
  const toast = useToast();
  const { data: ledgers, loading, refresh } = useCollection<LedgerEntry>(
    () => collectionApi<LedgerEntry>("ledgers").list(),
    []
  );
  const { data: factories, refresh: refreshFactories } = useCollection<Factory>(
    () => collectionApi<Factory>("factories").list(),
    []
  );
  const { data: customers, refresh: refreshCustomers } = useCollection<Customer>(
    () => collectionApi<Customer>("customers").list(),
    []
  );
  const { data: suppliers, refresh: refreshSuppliers } = useCollection<Supplier>(
    () => collectionApi<Supplier>("suppliers").list(),
    []
  );

  const [tab, setTab] = useState<TabKey>("Cash");
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payment, setPayment] = useState<PaymentForm>(emptyPayment);
  const [saving, setSaving] = useState(false);

  const entityName = (l: LedgerEntry): string => {
    if (!l.referenceId) return "";
    if (l.type === "Factory") return (factories ?? []).find((f) => f.id === l.referenceId)?.name ?? "";
    if (l.type === "Customer") return (customers ?? []).find((c) => c.id === l.referenceId)?.name ?? "";
    if (l.type === "Supplier") return (suppliers ?? []).find((s) => s.id === l.referenceId)?.name ?? "";
    return "";
  };

  const rows = useMemo(() => {
    const list = (ledgers ?? []).filter((l) => l.type === tab);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((l) => {
      const name = entityName(l);
      return (
        l.description.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        (l.transactionId ?? "").toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgers, tab, search, factories, customers, suppliers]);

  const balance = useMemo(() => {
    const cash = (ledgers ?? []).filter((l) => l.type === "Cash").reduce((s, l) => s + l.amount, 0);
    const factory = (factories ?? []).reduce((s, f) => s + f.balance, 0);
    const supplier = (suppliers ?? []).reduce((s, sp) => s + sp.balanceOwed, 0);
    const customer = (customers ?? []).reduce((s, c) => s + c.balance, 0);
    return { cash, factory, supplier, customer };
  }, [ledgers, factories, suppliers, customers]);

  const totalCredit = rows.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalDebit = rows.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

  const entityOptions =
    tab === "Factory"
      ? (factories ?? []).map((f) => ({ id: f.id, name: f.name, due: f.balance }))
      : tab === "Supplier"
        ? (suppliers ?? []).map((s) => ({ id: s.id, name: s.name, due: s.balanceOwed }))
        : (customers ?? []).map((c) => ({ id: c.id, name: c.name, due: c.balance }));

  const recordPayment = async () => {
    if (!payment.entityId || Number(payment.amount) <= 0) {
      toast.error("Select an account and enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await businessApi.payment({ type: payment.type, entityId: payment.entityId, amount: Number(payment.amount) });
      toast.success("Payment recorded");
      setPayOpen(false);
      setPayment(emptyPayment);
      refresh();
      refreshFactories();
      refreshCustomers();
      refreshSuppliers();
    } catch (e: any) {
      toast.error(e?.message ?? "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  const tabLabel: Record<TabKey, string> = {
    Cash: `Cash Book (${formatCurrency(balance.cash)})`,
    Factory: `Factory Ledgers (${formatCurrency(balance.factory)})`,
    Customer: `Customer Ledgers (${formatCurrency(balance.customer)})`,
    Supplier: `Supplier Ledgers (${formatCurrency(balance.supplier)})`,
  };

  return (
    <Box>
      <PageHeader
        title="Ledgers & Accounts"
        subtitle="Cash book and running balances for factories, customers and suppliers"
        actionLabel="Record Payment"
        onAction={() => setPayOpen(true)}
      />

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          {(["Cash", "Factory", "Customer", "Supplier"] as TabKey[]).map((t) => (
            <Tab key={t} label={tabLabel[t]} value={t} />
          ))}
        </Tabs>
      </Paper>

      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Stack direction="row" spacing={1}>
          <Chip label={`In (+): ${formatCurrency(totalCredit)}`} color="success" variant="outlined" />
          <Chip label={`Out (−): ${formatCurrency(totalDebit)}`} color="error" variant="outlined" />
        </Stack>
        <TextField
          placeholder="Search description or name..."
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 280 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>

      <Paper variant="outlined">
        <TableContainer sx={{ maxHeight: 560 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                {tab !== "Cash" && <TableCell>Entity</TableCell>}
                <TableCell>Description</TableCell>
                <TableCell>Ref</TableCell>
                {tab === "Cash" ? (
                  <>
                    <TableCell align="right">In (+)</TableCell>
                    <TableCell align="right">Out (−)</TableCell>
                  </>
                ) : (
                  <TableCell align="right">Amount</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 2 }}>
                    <Loader loading rows={4} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(l.date, true)}</TableCell>
                  {tab !== "Cash" && <TableCell sx={{ fontWeight: 500 }}>{entityName(l) || "Unknown"}</TableCell>}
                  <TableCell>{l.description}</TableCell>
                  <TableCell>{l.transactionId ? <Chip label={l.transactionId} size="small" variant="outlined" /> : "—"}</TableCell>
                  {tab === "Cash" ? (
                    <>
                      <TableCell align="right" sx={{ color: "success.main", fontWeight: 600 }}>
                        {l.amount > 0 ? formatCurrency(l.amount) : ""}
                      </TableCell>
                      <TableCell align="right" sx={{ color: "error.main", fontWeight: 600 }}>
                        {l.amount < 0 ? formatCurrency(Math.abs(l.amount)) : ""}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell align="right" sx={{ fontWeight: 600, color: l.amount > 0 ? "error.main" : "success.main" }}>
                      {l.amount > 0 ? "+" : "-"}{formatCurrency(Math.abs(l.amount))}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 6, textAlign: "center", color: "text.secondary" }}>
                    No {tab.toLowerCase()} ledger entries found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && (ledgers ?? []).length === 0 && (
          <EmptyState message="No ledger entries yet — purchases, sales and payments create them automatically." />
        )}
      </Paper>

      <Dialog open={payOpen} onClose={() => setPayOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <TextField
              select
              label="Payment Type"
              value={payment.type}
              onChange={(e) => setPayment({ ...payment, type: e.target.value as any, entityId: "" })}
              fullWidth
            >
              <MenuItem value="Factory">Pay Factory</MenuItem>
              <MenuItem value="Supplier">Pay Supplier</MenuItem>
              <MenuItem value="Customer">Receive from Customer</MenuItem>
            </TextField>
            <TextField
              select
              label={payment.type === "Customer" ? "Customer" : payment.type === "Factory" ? "Factory" : "Supplier"}
              value={payment.entityId}
              onChange={(e) => setPayment({ ...payment, entityId: e.target.value })}
              fullWidth
            >
              <MenuItem value="">-- Select --</MenuItem>
              {entityOptions.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name} ({formatCurrency(e.due)})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Amount (₨)"
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              value={payment.amount}
              onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              Customer payments are allocated to unpaid invoices oldest-first (FIFO). Factory and supplier payments reduce their balances.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={recordPayment} variant="contained" startIcon={<Payments />} disabled={saving}>
            {saving ? "Processing..." : "Record Payment"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}