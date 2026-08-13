import { useEffect, useMemo, useState } from "react";
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
  InputAdornment,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { Delete, Edit, Add, Straighten, LocalShipping } from "@mui/icons-material";
import { collectionApi, businessApi } from "../api";
import { useCollection } from "../lib/useCollection";
import { useToast } from "../contexts/ToastContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader, EmptyState, Loader } from "../components/PageHeader";
import type { Supplier, WeightUnit, YarnInventory } from "../types";
import { formatCurrency, formatDate, KG_PER_LBS, kgToLbs, lbsToKg, round } from "../lib/utils";

interface PurchaseForm {
  supplierId: string;
  yarnType: string;
  quantity: string;
  unit: WeightUnit;
  ratePerKg: string;
  paymentStatus: string;
  paidAmount: string;
}

const emptyForm: PurchaseForm = {
  supplierId: "",
  yarnType: "",
  quantity: "",
  unit: "kg",
  ratePerKg: "",
  paymentStatus: "Unpaid",
  paidAmount: "0",
};

export function YarnInventoryPage() {
  const toast = useToast();
  const { data: inventory, loading, refresh } = useCollection<YarnInventory>(
    () => collectionApi<YarnInventory>("yarn_inventory").list(),
    []
  );
  const { data: suppliers, loading: suppliersLoading, refresh: refreshSuppliers } = useCollection<Supplier>(() => collectionApi<Supplier>("suppliers").list(), []);

  const [displayUnit, setDisplayUnit] = useState<WeightUnit>("kg");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<YarnInventory | null>(null);
  const [form, setForm] = useState<PurchaseForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<YarnInventory | null>(null);

  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState<{ name: string; contact: string }>({ name: "", contact: "" });
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [supplierSaving, setSupplierSaving] = useState(false);

  useEffect(() => {
    if (open && !editing) setForm(emptyForm);
  }, [open, editing]);

  const totals = useMemo(() => {
    const totalKg = (inventory ?? []).reduce((s, y) => s + (y.quantityKg ?? 0), 0);
    const totalLbs = (inventory ?? []).reduce((s, y) => s + (y.quantityLbs ?? 0), 0);
    const balanceKg = (inventory ?? []).reduce((s, y) => s + (y.balanceKg ?? 0), 0);
    const balanceLbs = (inventory ?? []).reduce((s, y) => s + (y.balanceLbs ?? 0), 0);
    const value = (inventory ?? []).reduce((s, y) => s + (y.balanceKg ?? 0) * (y.ratePerKg ?? 0), 0);
    return { totalKg, totalLbs, balanceKg, balanceLbs, value };
  }, [inventory]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: YarnInventory) => {
    setEditing(row);
    setForm({
      supplierId: row.supplierId ?? "",
      yarnType: row.yarnType,
      quantity: String(row.unit === "lbs" ? row.quantityLbs : row.quantityKg),
      unit: row.unit ?? "kg",
      ratePerKg: String(row.unit === "lbs" ? row.ratePerKg / KG_PER_LBS : row.ratePerKg),
      paymentStatus: row.paymentStatus,
      paidAmount: "0",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.supplierId || !form.yarnType || !form.quantity || !form.ratePerKg) {
      toast.error("Please fill all required fields");
      return;
    }
    if (Number(form.quantity) <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const quantityKg = form.unit === "lbs" ? lbsToKg(Number(form.quantity)) : Number(form.quantity);
        const ratePerKg = form.unit === "lbs" ? Number(form.ratePerKg) * KG_PER_LBS : Number(form.ratePerKg);
        await collectionApi<YarnInventory>("yarn_inventory").update(editing.id, {
          supplierId: form.supplierId,
          supplierName: suppliers?.find((s) => s.id === form.supplierId)?.name ?? editing.supplierName,
          yarnType: form.yarnType,
          ratePerKg: round(ratePerKg),
          totalCost: round(quantityKg * ratePerKg),
          unit: form.unit,
        });
        toast.success("Yarn entry updated");
      } else {
        await businessApi.yarnPurchase({
          supplierId: form.supplierId,
          yarnType: form.yarnType,
          quantity: Number(form.quantity),
          unit: form.unit,
          ratePerKg: form.unit === "lbs" ? Number(form.ratePerKg) * KG_PER_LBS : Number(form.ratePerKg),
          paymentStatus: form.paymentStatus,
          paidAmount: Number(form.paidAmount || 0),
        });
        toast.success("Yarn purchase recorded");
      }
      setOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await collectionApi<YarnInventory>("yarn_inventory").remove(deleting.id);
      toast.success("Yarn entry deleted");
      setDeleting(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  };

  const openAddSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({ name: "", contact: "" });
    setSuppliersOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupplierForm({ name: s.name, contact: s.contact });
    setSuppliersOpen(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    setSupplierSaving(true);
    try {
      if (editingSupplier) {
        await collectionApi<Supplier>("suppliers").update(editingSupplier.id, {
          name: supplierForm.name.trim(),
          contact: supplierForm.contact,
        });
        toast.success("Supplier updated");
      } else {
        await collectionApi<Supplier>("suppliers").create({
          name: supplierForm.name.trim(),
          contact: supplierForm.contact,
          balanceOwed: 0,
        });
        toast.success("Supplier added");
      }
      setSuppliersOpen(false);
      refreshSuppliers();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save supplier");
    } finally {
      setSupplierSaving(false);
    }
  };

  const removeSupplier = async () => {
    if (!deletingSupplier) return;
    try {
      await collectionApi<Supplier>("suppliers").remove(deletingSupplier.id);
      toast.success("Supplier deleted");
      setDeletingSupplier(null);
      refreshSuppliers();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete supplier");
    }
  };

  const unitLabel = displayUnit === "kg" ? "kg" : "lbs";
  const qtyOf = (y: YarnInventory) => (displayUnit === "kg" ? y.quantityKg : y.quantityLbs);
  const balOf = (y: YarnInventory) => (displayUnit === "kg" ? y.balanceKg : y.balanceLbs);
  const rateOf = (y: YarnInventory) => (displayUnit === "kg" ? y.ratePerKg : y.ratePerKg / KG_PER_LBS);

  const calcTotalCost = useMemo(() => {
    const qty = Number(form.quantity);
    const rate =
      form.unit === "lbs"
        ? Number(form.ratePerKg) * KG_PER_LBS
        : Number(form.ratePerKg);
    if (!qty || qty <= 0 || !rate || rate <= 0) return 0;
    const quantityKg = form.unit === "lbs" ? lbsToKg(qty) : qty;
    return round(quantityKg * rate);
  }, [form.quantity, form.ratePerKg, form.unit]);

  const calcPaid = Math.min(calcTotalCost, Math.max(0, Number(form.paidAmount) || 0));

  const derivedStatus = calcTotalCost === 0
    ? "Pending"
    : calcPaid >= calcTotalCost
      ? "Paid"
      : calcPaid > 0
        ? "Partial"
        : "Unpaid";

  const statusChip = (s: string) => {
    const color =
      s === "Paid" ? "success" : s === "Partial" ? "warning" : "error";
    return <Chip label={s} color={color} size="small" />;
  };

  return (
    <Box>
      <PageHeader
        title="Yarn Inventory"
        subtitle={`Stock value: ${formatCurrency(totals.value)}`}
        actionLabel="Add Purchase"
        onAction={openCreate}
      >
        <Button variant="outlined" startIcon={<LocalShipping />} onClick={openAddSupplier}>
          Suppliers
        </Button>
        <ToggleButtonGroup
          value={displayUnit}
          exclusive
          onChange={(_, v) => v && setDisplayUnit(v)}
          size="small"
        >
          <ToggleButton value="kg">kg</ToggleButton>
          <ToggleButton value="lbs">lbs</ToggleButton>
        </ToggleButtonGroup>
      </PageHeader>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Total Purchased</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {displayUnit === "kg" ? round(totals.totalKg) : round(totals.totalLbs)} {unitLabel}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">Balance Available</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "primary" }}>
              {displayUnit === "kg" ? round(totals.balanceKg) : round(totals.balanceLbs)} {unitLabel}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell>Yarn Type</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell align="right">Rate/{unitLabel}</TableCell>
                <TableCell align="right">Total Cost</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} sx={{ py: 2 }}>
                    <Loader loading rows={3} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && (inventory ?? []).map((y) => (
                <TableRow key={y.id} hover>
                  <TableCell>{formatDate(y.purchaseDate)}</TableCell>
                  <TableCell>{y.supplierName}</TableCell>
                  <TableCell>{y.yarnType}</TableCell>
                  <TableCell align="right">{round(qtyOf(y))} {unitLabel}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "primary.main" }}>
                    {round(balOf(y))} {unitLabel}
                  </TableCell>                  <TableCell align="right">{formatCurrency(rateOf(y))}</TableCell>
                  <TableCell align="right">{formatCurrency(y.totalCost)}</TableCell>
                  <TableCell>{statusChip(y.paymentStatus)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(y)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleting(y)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && (inventory ?? []).length === 0 && (
          <EmptyState message="No yarn inventory found. Add a purchase to get started." />
        )}
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit Yarn Entry" : "New Yarn Purchase"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <TextField
              select
              label="Supplier"
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              required
              fullWidth
            >
              <MenuItem value="">-- Select Supplier --</MenuItem>
              {(suppliers ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </TextField>

            <TextField
              label="Yarn Type / Quality"
              value={form.yarnType}
              onChange={(e) => setForm({ ...form, yarnType: e.target.value })}
              required
              fullWidth
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 7 }}>
                <TextField
                  label={`Quantity (${unitLabel})`}
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  required
                  fullWidth
                  slotProps={{
                    htmlInput: { min: 0, step: 0.1 },
                    input: {
                      endAdornment: (
                        <ToggleButtonGroup
                          size="small"
                          exclusive
                          value={form.unit}
                          onChange={(_, v) => v && setForm({ ...form, unit: v })}
                        >
                          <ToggleButton value="kg">kg</ToggleButton>
                          <ToggleButton value="lbs">lbs</ToggleButton>
                        </ToggleButtonGroup>
                      ),
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 5 }}>
                <TextField
                  label={`Rate per ${form.unit} (₨)`}
                  type="number"
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  value={form.ratePerKg}
                  onChange={(e) => setForm({ ...form, ratePerKg: e.target.value })}
                  required
                  fullWidth
                />
              </Grid>
            </Grid>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
              <Straighten fontSize="small" />
              <Typography variant="caption">
                {form.quantity
                  ? form.unit === "kg"
                    ? `= ${round(kgToLbs(Number(form.quantity)))} lbs`
                    : `= ${round(lbsToKg(Number(form.quantity)))} kg`
                  : "Enter quantity to see conversion"}
              </Typography>
            </Box>

            {!editing && (
              <>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50" }}>
                  <Stack spacing={1}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="body2" color="text.secondary">Total Cost</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>{formatCurrency(calcTotalCost)}</Typography>
                    </Stack>
                    <Grid container spacing={1.5}>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="Amount Paid Now (₨)"
                          type="number"
                          value={form.paidAmount}
                          onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
                          fullWidth
                          size="small"
                          slotProps={{
                            htmlInput: { min: 0, step: 0.01 },
                            input: { startAdornment: <InputAdornment position="start">₨</InputAdornment> },
                          }}
                        />
                        <Button
                          size="small"
                          sx={{ mt: 1 }}
                          onClick={() => setForm({ ...form, paidAmount: String(calcTotalCost) })}
                          disabled={calcTotalCost <= 0}
                        >
                          Pay full amount
                        </Button>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <Stack spacing={0.5}>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Balance Owed</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(Math.max(0, calcTotalCost - calcPaid))}</Typography>
                          </Stack>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Status</Typography>
                            {derivedStatus === "Paid" ? statusChip("Paid") : derivedStatus === "Partial" ? statusChip("Partial") : statusChip("Unpaid")}
                          </Stack>
                        </Stack>
                      </Grid>
                    </Grid>
                  </Stack>
                </Paper>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Yarn Entry"
        message={`Delete "${deleting?.yarnType}" purchase? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />

      <Dialog open={suppliersOpen} onClose={() => setSuppliersOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mb: 3 }}>
            <TextField
              label="Supplier Name"
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              fullWidth
              required
              placeholder="e.g. Crescent Textile Mills"
            />
            <TextField
              label="Contact"
              value={supplierForm.contact}
              onChange={(e) => setSupplierForm({ ...supplierForm, contact: e.target.value })}
              fullWidth
              placeholder="Phone / address"
            />
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Saved Suppliers</Typography>
            <Button size="small" startIcon={<Add />} onClick={openAddSupplier}>New</Button>
          </Stack>
          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Balance Owed</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {suppliersLoading && (
                    <TableRow>
                      <TableCell colSpan={3} sx={{ py: 2 }}>
                        <Loader loading rows={2} />
                      </TableCell>
                    </TableRow>
                  )}
                  {!suppliersLoading && (suppliers ?? []).map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>
                        <Typography variant="body2">{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.contact}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(s.balanceOwed)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          <IconButton size="small" onClick={() => openEditSupplier(s)}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => setDeletingSupplier(s)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(suppliers ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
                        No suppliers yet. Add one above.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuppliersOpen(false)} color="inherit">Done</Button>
          <Button onClick={saveSupplier} variant="contained" disabled={supplierSaving}>
            {supplierSaving ? "Saving..." : editingSupplier ? "Save Changes" : "Add Supplier"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deletingSupplier}
        title="Delete Supplier"
        message={`Delete "${deletingSupplier?.name}"? Existing yarn entries will retain the supplier name.`}
        onConfirm={removeSupplier}
        onClose={() => setDeletingSupplier(null)}
      />
    </Box>
  );
}
