import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Delete, Payments, Print } from "@mui/icons-material";
import { collectionApi, businessApi } from "../api";
import { useCollection } from "../lib/useCollection";
import { useToast } from "../contexts/ToastContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, PageHeader, Loader } from "../components/PageHeader";
import { printReceipt, type ReceiptData } from "../components/ReceiptPrint";
import type { Customer, FinishedFabric, WholesaleInvoice } from "../types";
import { formatCurrency, formatDate, round } from "../lib/utils";

interface InvoiceForm {
  customerId: string;
  fabricId: string;
  quantity: string;
  price: string;
  paidAmount: string;
  dueDate: string;
}

const emptyForm: InvoiceForm = {
  customerId: "",
  fabricId: "",
  quantity: "",
  price: "",
  paidAmount: "",
  dueDate: "",
};

const STATUS_COLORS: Record<string, "success" | "warning" | "error"> = {
  Paid: "success",
  Partial: "warning",
  Unpaid: "error",
};

export function WholesaleSales() {
  const toast = useToast();
  const { data: invoices, loading, refresh } = useCollection<WholesaleInvoice>(
    () => collectionApi<WholesaleInvoice>("wholesale_invoices").list(),
    []
  );
  const { data: customers, refresh: refreshCustomers } = useCollection<Customer>(
    () => collectionApi<Customer>("customers").list(),
    []
  );
  const { data: fabrics, refresh: refreshFabrics } = useCollection<FinishedFabric>(
    () => collectionApi<FinishedFabric>("finished_fabrics").list(),
    []
  );

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickContact, setQuickContact] = useState("");

  const [paying, setPaying] = useState<WholesaleInvoice | null>(null);
  const [payAmount, setPayAmount] = useState("0");
  const [deleting, setDeleting] = useState<WholesaleInvoice | null>(null);

  const customerById = useMemo(() => new Map((customers ?? []).map((c) => [c.id, c])), [customers]);
  const fabricById = useMemo(() => new Map((fabrics ?? []).map((f) => [f.id, f])), [fabrics]);
  const available = useMemo(() => (fabrics ?? []).filter((f) => f.quantityMeters > 0), [fabrics]);

  const totals = useMemo(() => {
    const outstanding = (invoices ?? []).reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
    return outstanding;
  }, [invoices]);

  const quickAddCustomer = async () => {
    if (!quickName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    try {
      const created = await collectionApi<Customer>("customers").create({
        name: quickName,
        contact: quickContact,
        balance: 0,
      });
      toast.success("Customer added");
      setForm((f) => ({ ...f, customerId: created.id }));
      setQuickOpen(false);
      setQuickName("");
      setQuickContact("");
      refreshCustomers();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add customer");
    }
  };

  const handleCreateInvoice = async () => {
    if (!form.customerId || !form.fabricId || !form.quantity || !form.price) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const created = await businessApi.wholesaleInvoice({
        customerId: form.customerId,
        fabricId: form.fabricId,
        quantity: Number(form.quantity),
        price: Number(form.price),
        paidAmount: Number(form.paidAmount || 0),
        dueDate: form.dueDate || undefined,
      });
      toast.success("Invoice created");
      const fabric = fabricById.get(form.fabricId);
      const qty = Number(form.quantity);
      const price = Number(form.price);
      const paid = Number(form.paidAmount || 0);
      const total = round(qty * price);
      const customer = customerById.get(form.customerId);
      printReceipt({
        title: "Invoice",
        reference: (created as any).id ?? String(Date.now()),
        date: Date.now(),
        customerName: customer?.name,
        customerContact: customer?.contact,
        items: [
          {
            name: fabric?.fabricType ?? "Fabric",
            qty,
            price,
            amount: total,
          },
        ],
        total,
        paid,
        balance: round(total - paid),
      });
      setShowForm(false);
      setForm(emptyForm);
      refresh();
      refreshCustomers();
      refreshFabrics();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const printInvoice = (inv: WholesaleInvoice) => {
    const customer = customerById.get(inv.customerId);
    const items = (inv.items ?? []).map((i) => ({
      name: fabricById.get(i.fabricId)?.fabricType ?? "Fabric",
      qty: i.quantity,
      price: i.price,
      amount: round(i.quantity * i.price),
    }));
    const receipt: ReceiptData = {
      title: "Invoice",
      reference: inv.id,
      date: inv.date,
      customerName: customer?.name,
      customerContact: customer?.contact,
      items,
      total: round(inv.totalAmount),
      paid: round(inv.paidAmount),
      balance: round(inv.totalAmount - inv.paidAmount),
    };
    printReceipt(receipt);
  };

  const recordPayment = async () => {
    if (!paying || Number(payAmount) <= 0) return;
    setSaving(true);
    try {
      await businessApi.payment({ type: "Customer", entityId: paying.customerId, amount: Number(payAmount) });
      toast.success("Payment received and allocated (FIFO)");
      setPaying(null);
      refresh();
      refreshCustomers();
    } catch (e: any) {
      toast.error(e?.message ?? "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await collectionApi<WholesaleInvoice>("wholesale_invoices").remove(deleting.id);
      toast.success("Invoice deleted");
      setDeleting(null);
      refresh();
      refreshCustomers();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Wholesale Invoices"
        subtitle={`Total outstanding: ${formatCurrency(totals)}`}
        actionLabel="New Invoice"
        onAction={() => setShowForm((v) => !v)}
      />

      {showForm && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h3" sx={{ mb: 2 }}>Create Invoice</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "flex-end" }}>
                <TextField
                  select
                  label="Customer"
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                  fullWidth
                  required
                >
                  <MenuItem value="">-- Select Customer --</MenuItem>
                  {(customers ?? []).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>
                <Button variant="outlined" startIcon={<Add fontSize="small" />} onClick={() => setQuickOpen(true)}>
                  New
                </Button>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                select
                label="Select Fabric"
                value={form.fabricId}
                onChange={(e) => {
                  const f = fabricById.get(e.target.value);
                  setForm({ ...form, fabricId: e.target.value, price: f ? String(round(f.costPerMeter * 1.3)) : form.price });
                }}
                fullWidth
                required
              >
                <MenuItem value="">-- Select Fabric --</MenuItem>
                {available.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.fabricType} (Cost: {formatCurrency(f.costPerMeter)}/m | Stock: {f.quantityMeters}m)
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="Quantity (Meters)"
                type="number"
                slotProps={{ htmlInput: { min: 0.1, step: 0.1 } }}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="Selling Rate (₨/m)"
                type="number"
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="Amount Paid Now (₨)"
                type="number"
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                value={form.paidAmount}
                onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="Due Date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Total: {formatCurrency(round(Number(form.quantity || 0) * Number(form.price || 0)))}
                </Typography>
                <Button variant="contained" onClick={handleCreateInvoice} disabled={saving}>
                  {saving ? "Creating..." : "Generate Invoice"}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Items</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Balance Due</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ py: 2 }}>
                    <Loader loading rows={4} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && (invoices ?? []).map((inv) => {
                const customer = customerById.get(inv.customerId);
                const balance = round(inv.totalAmount - inv.paidAmount);
                return (
                  <TableRow key={inv.id} hover>
                    <TableCell>{formatDate(inv.date)}</TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{customer?.name ?? "Unknown"}</TableCell>
                    <TableCell>
                      {inv.items.map((i) => `${fabricById.get(i.fabricId)?.fabricType ?? "fabric"} (${i.quantity}m @ ${formatCurrency(i.price)})`).join(", ")}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(inv.totalAmount)}</TableCell>
                    <TableCell align="right" sx={{ color: "success.main" }}>{formatCurrency(inv.paidAmount)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: balance > 0 ? "error.main" : "success.main" }}>
                      {formatCurrency(balance)}
                    </TableCell>
                    <TableCell>
                      <Chip label={inv.status} color={STATUS_COLORS[inv.status] ?? "default"} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                        <Tooltip title="Print Invoice">
                          <IconButton size="small" onClick={() => printInvoice(inv)}>
                            <Print fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {balance > 0 && (
                          <Tooltip title="Record Payment">
                            <IconButton size="small" color="success" onClick={() => { setPaying(inv); setPayAmount(String(balance)); }}>
                              <Payments fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleting(inv)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && (invoices ?? []).length === 0 && <EmptyState message="No wholesale invoices found." />}
      </Paper>

      <Dialog open={quickOpen} onClose={() => setQuickOpen(false)}>
        <DialogTitle>Quick Add Customer</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Business Name"
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Contact"
              value={quickContact}
              onChange={(e) => setQuickContact(e.target.value)}
              fullWidth
              placeholder="Phone / address"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuickOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={quickAddCustomer} variant="contained">Add Customer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!paying} onClose={() => setPaying(null)}>
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Allocate payment to unpaid invoices (oldest first) for{" "}
            <b>{paying ? customerById.get(paying.customerId)?.name ?? "customer" : ""}</b>.
          </Typography>
          <TextField
            label="Amount (₨)"
            type="number"
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaying(null)} color="inherit">Cancel</Button>
          <Button onClick={recordPayment} variant="contained" disabled={saving}>
            {saving ? "Processing..." : "Receive Payment"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Invoice"
        message={`Delete the invoice for "${deleting ? customerById.get(deleting.customerId)?.name ?? "customer" : ""}"? This cannot be undone.`}
        onConfirm={deleteInvoice}
        onClose={() => setDeleting(null)}
      />
    </Box>
  );
}