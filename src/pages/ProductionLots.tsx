import { Fragment, useEffect, useMemo, useState } from "react";
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { ArrowForward, Delete, Edit, Factory as FactoryIcon, Inventory2, Add as AddIcon, Straighten, LocalShipping, Palette, Payments } from "@mui/icons-material";
import { collectionApi, businessApi } from "../api";
import { useCollection } from "../lib/useCollection";
import { useToast } from "../contexts/ToastContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader, EmptyState, Loader } from "../components/PageHeader";
import type { Factory, FinishedFabric, ProductionLot, ProductionStatus, YarnInventory } from "../types";
import { formatCurrency, formatDate, KG_PER_LBS, lbsToKg, round } from "../lib/utils";

const STATUSES: ProductionStatus[] = [
  "Yarn Issued",
  "At Weaving",
  "Weaving Complete",
  "Sent for Dyeing",
  "Dyeing Complete",
  "Received in Stock",
];

interface LotForm {
  yarnId: string;
  factoryId: string;
  quantityIssuedKg: string;
  unit: "kg" | "lbs";
  expectedFabricMeters: string;
  weavingCharges: string;
  dyeingCharges: string;
}

const emptyForm: LotForm = {
  yarnId: "",
  factoryId: "",
  quantityIssuedKg: "",
  unit: "kg",
  expectedFabricMeters: "",
  weavingCharges: "0",
  dyeingCharges: "0",
};

export function ProductionLots() {
  const toast = useToast();
  const { data: lots, loading, refresh } = useCollection<ProductionLot>(
    () => collectionApi<ProductionLot>("production_lots").list(),
    []
  );
  const { data: yarns } = useCollection<YarnInventory>(() => collectionApi<YarnInventory>("yarn_inventory").list(), []);
  const { data: factories, loading: factoriesLoading, refresh: refreshFactories } = useCollection<Factory>(() => collectionApi<Factory>("factories").list(), []);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LotForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [closingLot, setClosingLot] = useState<ProductionLot | null>(null);
  const [actualMeters, setActualMeters] = useState("");
  const [fabricType, setFabricType] = useState("");

  const [weavingLot, setWeavingLot] = useState<ProductionLot | null>(null);
  const [weavingMeters, setWeavingMeters] = useState("");
  const [transferLot, setTransferLot] = useState<ProductionLot | null>(null);
  const [transferFactoryId, setTransferFactoryId] = useState("");
  const [transferDyeingCharges, setTransferDyeingCharges] = useState("0");
  const [dyeingLot, setDyeingLot] = useState<ProductionLot | null>(null);
  const [dyeingMeters, setDyeingMeters] = useState("");

  const [payFactory, setPayFactory] = useState<Factory | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const [deleting, setDeleting] = useState<ProductionLot | null>(null);

  const [editLot, setEditLot] = useState<ProductionLot | null>(null);
  const [editForm, setEditForm] = useState<{ expectedFabricMeters: string; weavingCharges: string; dyeingCharges: string }>({
    expectedFabricMeters: "",
    weavingCharges: "0",
    dyeingCharges: "0",
  });

  const [factoriesOpen, setFactoriesOpen] = useState(false);
  const [factoryForm, setFactoryForm] = useState<{ name: string; contact: string; type: Factory["type"] }>({
    name: "",
    contact: "",
    type: "Both",
  });
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);
  const [deletingFactory, setDeletingFactory] = useState<Factory | null>(null);
  const [factorySaving, setFactorySaving] = useState(false);

  const yarnById = useMemo(() => new Map(yarns?.map((y) => [y.id, y])), [yarns]);
  const factoryById = useMemo(() => new Map(factories?.map((f) => [f.id, f])), [factories]);
  const availableYarns = useMemo(() => (yarns ?? []).filter((y) => y.balanceKg > 0), [yarns]);

  const createLot = async () => {
    if (!form.yarnId || !form.factoryId || !form.quantityIssuedKg) {
      toast.error("Select yarn, factory and quantity");
      return;
    }
    setSaving(true);
    try {
      await businessApi.createProductionLot({
        yarnId: form.yarnId,
        factoryId: form.factoryId,
        quantityIssuedKg: form.unit === "lbs" ? lbsToKg(Number(form.quantityIssuedKg)) : Number(form.quantityIssuedKg),
        expectedFabricMeters: Number(form.expectedFabricMeters || 0),
        weavingCharges: Number(form.weavingCharges || 0),
        dyeingCharges: Number(form.dyeingCharges || 0),
      });
      toast.success("Production lot created");
      setOpen(false);
      setForm(emptyForm);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create lot");
    } finally {
      setSaving(false);
    }
  };

  const advance = async (lot: ProductionLot) => {
    try {
      const res = await businessApi.advanceLot(lot.id);
      toast.success(`Lot ${lot.lotNumber} → ${res.status}`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Cannot advance lot");
    }
  };

  const receiveStock = async () => {
    if (!closingLot || !actualMeters || !fabricType) {
      toast.error("Enter actual meters and fabric type");
      return;
    }
    setSaving(true);
    try {
      await businessApi.receiveLotStock(closingLot.id, {
        actualMeters: Number(actualMeters),
        fabricType,
      });
      toast.success(`Lot ${closingLot.lotNumber} received in stock`);
      setClosingLot(null);
      setActualMeters("");
      setFabricType("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to receive stock");
    } finally {
      setSaving(false);
    }
  };

  const removeLot = async () => {
    if (!deleting) return;
    try {
      await businessApi.deleteProductionLot(deleting.id);
      toast.success("Lot deleted; factory balances and ledgers reversed");
      setDeleting(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  };

  const openEditLot = (lot: ProductionLot) => {
    setEditLot(lot);
    setEditForm({
      expectedFabricMeters: String(lot.expectedFabricMeters ?? ""),
      weavingCharges: String(lot.weavingCharges ?? 0),
      dyeingCharges: String(lot.dyeingCharges ?? 0),
    });
  };

  const saveLotEdit = async () => {
    if (!editLot) return;
    setSaving(true);
    try {
      await collectionApi<ProductionLot>("production_lots").update(editLot.id, {
        expectedFabricMeters: Number(editForm.expectedFabricMeters || 0),
        weavingCharges: Number(editForm.weavingCharges || 0),
        dyeingCharges: Number(editForm.dyeingCharges || 0),
      });
      toast.success(`Lot ${editLot.lotNumber} updated`);
      setEditLot(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update lot");
    } finally {
      setSaving(false);
    }
  };

  const recordWeaving = async () => {
    if (!weavingLot || !weavingMeters || Number(weavingMeters) <= 0) {
      toast.error("Enter a valid weaving output in meters");
      return;
    }
    setSaving(true);
    try {
      await businessApi.recordWeavingOutput(weavingLot.id, Number(weavingMeters));
      toast.success(`Weaving output recorded for ${weavingLot.lotNumber}`);
      setWeavingLot(null);
      setWeavingMeters("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to record weaving output");
    } finally {
      setSaving(false);
    }
  };

  const transferToDyeing = async () => {
    if (!transferLot) return;
    setSaving(true);
    try {
      await businessApi.transferToDyeing(transferLot.id, {
        dyeingFactoryId: transferFactoryId || undefined,
        dyeingCharges: Number(transferDyeingCharges),
      });
      toast.success(`${transferLot.lotNumber} sent for dyeing`);
      setTransferLot(null);
      setTransferFactoryId("");
      setTransferDyeingCharges("0");
      refresh();
      refreshFactories();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to transfer to dyeing");
    } finally {
      setSaving(false);
    }
  };

  const recordDyeing = async () => {
    if (!dyeingLot || !dyeingMeters || Number(dyeingMeters) <= 0) {
      toast.error("Enter a valid dyeing output in meters");
      return;
    }
    setSaving(true);
    try {
      await businessApi.recordDyeingOutput(dyeingLot.id, Number(dyeingMeters));
      toast.success(`Dyeing output recorded for ${dyeingLot.lotNumber}`);
      setDyeingLot(null);
      setDyeingMeters("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to record dyeing output");
    } finally {
      setSaving(false);
    }
  };

  const saveFactoryPayment = async () => {
    if (!payFactory || !payAmount || Number(payAmount) <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setSaving(true);
    try {
      await businessApi.payment({ type: "Factory", entityId: payFactory.id, amount: Number(payAmount) });
      toast.success(`Payment of ${formatCurrency(Number(payAmount))} recorded to ${payFactory.name}`);
      setPayFactory(null);
      setPayAmount("");
      refreshFactories();
    } catch (e: any) {
      toast.error(e?.message ?? "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedYarn = form.yarnId ? yarnById.get(form.yarnId) : null;

  const openAddFactory = () => {
    setEditingFactory(null);
    setFactoryForm({ name: "", contact: "", type: "Both" });
    setFactoriesOpen(true);
  };

  const openEditFactory = (f: Factory) => {
    setEditingFactory(f);
    setFactoryForm({ name: f.name, contact: f.contact, type: f.type });
    setFactoriesOpen(true);
  };

  const saveFactory = async () => {
    if (!factoryForm.name.trim()) {
      toast.error("Factory name is required");
      return;
    }
    setFactorySaving(true);
    try {
      if (editingFactory) {
        await collectionApi<Factory>("factories").update(editingFactory.id, {
          name: factoryForm.name.trim(),
          contact: factoryForm.contact,
          type: factoryForm.type,
        });
        toast.success("Factory updated");
      } else {
        await collectionApi<Factory>("factories").create({
          name: factoryForm.name.trim(),
          contact: factoryForm.contact,
          type: factoryForm.type,
          balance: 0,
        });
        toast.success("Factory added");
      }
      setFactoriesOpen(false);
      refreshFactories();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save factory");
    } finally {
      setFactorySaving(false);
    }
  };

  const removeFactory = async () => {
    if (!deletingFactory) return;
    try {
      await collectionApi<Factory>("factories").remove(deletingFactory.id);
      toast.success("Factory deleted");
      setDeletingFactory(null);
      refreshFactories();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete factory");
    }
  };

  return (
    <Box>
      <PageHeader
        title="Production Lots"
        subtitle={`${(lots ?? []).filter((l) => l.status !== "Received in Stock").length} lots in production`}
        actionLabel="New Lot"
        onAction={() => setOpen(true)}
      >
        <Button variant="outlined" startIcon={<FactoryIcon />} onClick={openAddFactory}>
          Factories
        </Button>
      </PageHeader>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2}>Lot #</TableCell>
                <TableCell rowSpan={2}>Date</TableCell>
                <TableCell rowSpan={2}>Yarn</TableCell>
                <TableCell rowSpan={2} align="right">Issued (kg)</TableCell>
                <TableCell rowSpan={2} align="right">Expected (m)</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell>Factory</TableCell>
                <TableCell align="right">Charges</TableCell>
                <TableCell align="right">Output (m)</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ color: "text.secondary" }} colSpan={6}>
                  Weaving → Dyeing pipeline, managed at each stage
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={11} sx={{ py: 2 }}>
                    <Loader loading rows={4} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && (lots ?? []).map((lot) => {
                const factory = factoryById.get(lot.factoryId);
                const dyeingFactory = lot.dyeingFactoryId ? factoryById.get(lot.dyeingFactoryId) : undefined;
                const yarn = yarnById.get(lot.yarnId);

                const weavingStageStatus =
                  lot.status === "Yarn Issued" ? "Pending"
                  : lot.status === "At Weaving" ? "In Progress"
                  : lot.status === "Weaving Complete" ? "Complete"
                  : "Done";
                const dyeingStageStatus =
                  lot.status === "Yarn Issued" || lot.status === "At Weaving" || lot.status === "Weaving Complete" ? "Pending"
                  : lot.status === "Sent for Dyeing" ? "In Progress"
                  : lot.status === "Dyeing Complete" ? "Complete"
                  : "Done";

                const stageChipColor: Record<string, "default" | "info" | "success"> = {
                  Pending: "default",
                  "In Progress": "info",
                  Complete: "success",
                  Done: "success",
                };

                return (
                  <Fragment key={lot.id}>
                    {/* ---------------- Weaving row ---------------- */}
                    <TableRow hover>
                      <TableCell rowSpan={2} sx={{ fontWeight: 600 }}>{lot.lotNumber}</TableCell>
                      <TableCell rowSpan={2}>{formatDate(lot.dateSent)}</TableCell>
                      <TableCell rowSpan={2}>
                        <Typography variant="body2">{yarn?.yarnType ?? "Unknown"}</Typography>
                        <Typography variant="caption" color="text.secondary">{yarn ? `${yarn.quantityKg} kg` : ""}</Typography>
                      </TableCell>
                      <TableCell rowSpan={2} align="right">{lot.quantityIssuedKg} kg ({round(lot.quantityIssuedKg * KG_PER_LBS)} lbs)</TableCell>
                      <TableCell rowSpan={2} align="right">{lot.expectedFabricMeters} m</TableCell>
                      <TableCell>
                        <Chip label="Weaving" size="small" color="primary" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{factory?.name ?? "Unknown"}</Typography>
                        <Typography variant="caption" color="text.secondary">{factory?.type ?? ""}</Typography>
                      </TableCell>
                      <TableCell align="right">{formatCurrency(Number(lot.weavingCharges))}</TableCell>
                      <TableCell align="right">{lot.weavingMeters != null ? `${lot.weavingMeters} m` : "—"}</TableCell>
                      <TableCell>
                        <Chip label={weavingStageStatus} size="small" color={stageChipColor[weavingStageStatus]} />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          {lot.status === "Yarn Issued" && (
                            <Tooltip title="Send to weaving">
                              <IconButton size="small" onClick={() => advance(lot)}>
                                <ArrowForward fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {(lot.status === "At Weaving" || lot.status === "Weaving Complete") && (
                            <Tooltip title={lot.weavingMeters != null ? "Edit weaving output" : "Record weaving output"}>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => {
                                  setWeavingLot(lot);
                                  setWeavingMeters(String(lot.weavingMeters ?? lot.expectedFabricMeters));
                                }}
                              >
                                <Straighten fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit lot details & charges">
                            <IconButton size="small" onClick={() => openEditLot(lot)}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete lot">
                            <IconButton size="small" color="error" onClick={() => setDeleting(lot)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                    {/* ---------------- Dyeing row ---------------- */}
                    <TableRow hover>
                      <TableCell>
                        <Chip label="Dyeing" size="small" color="secondary" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{dyeingFactory?.name ?? (factory?.type !== "Weaving" ? factory?.name : "—")}</Typography>
                        <Typography variant="caption" color="text.secondary">{dyeingFactory?.type ?? ""}</Typography>
                      </TableCell>
                      <TableCell align="right">{formatCurrency(Number(lot.dyeingCharges))}</TableCell>
                      <TableCell align="right">{lot.dyeingMeters != null ? `${lot.dyeingMeters} m` : "—"}</TableCell>
                      <TableCell>
                        <Chip label={dyeingStageStatus} size="small" color={stageChipColor[dyeingStageStatus]} />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          {lot.status === "Weaving Complete" && (
                            <Tooltip title="Transfer to dyeing">
                              <IconButton
                                size="small"
                                color="secondary"
                                onClick={() => {
                                  setTransferLot(lot);
                                  setTransferFactoryId(lot.dyeingFactoryId ?? lot.factoryId);
                                  setTransferDyeingCharges(String(lot.dyeingCharges ?? 0));
                                }}
                              >
                                <LocalShipping fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {(lot.status === "Sent for Dyeing" || lot.status === "Dyeing Complete") && (
                            <Tooltip title={lot.dyeingMeters != null ? "Edit dyeing output" : "Record dyeing output"}>
                              <IconButton
                                size="small"
                                color={lot.status === "Dyeing Complete" ? "success" : "warning"}
                                onClick={() => {
                                  setDyeingLot(lot);
                                  setDyeingMeters(String(lot.dyeingMeters ?? lot.weavingMeters ?? lot.expectedFabricMeters));
                                }}
                              >
                                <Palette fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {lot.status === "Dyeing Complete" && (
                            <Tooltip title="Receive in stock">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => {
                                  setClosingLot(lot);
                                  setActualMeters(String(lot.dyeingMeters ?? lot.weavingMeters ?? lot.expectedFabricMeters));
                                  setFabricType("");
                                }}
                              >
                                <Inventory2 fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && (lots ?? []).length === 0 && (
          <EmptyState message="No production lots active. Create one to begin processing." />
        )}
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Production Lot</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <TextField
              select
              label="Select Yarn"
              value={form.yarnId}
              onChange={(e) => setForm({ ...form, yarnId: e.target.value })}
              fullWidth
              required
            >
              <MenuItem value="">-- Select Yarn --</MenuItem>
              {availableYarns.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.yarnType} (Bal: {y.balanceKg} kg)
                </MenuItem>
              ))}
            </TextField>
            {selectedYarn && (
              <Typography variant="caption" color="text.secondary">
                Available: {selectedYarn.balanceKg} kg ({selectedYarn.balanceLbs ? `${selectedYarn.balanceLbs.toFixed(1)} lbs` : ""})
              </Typography>
            )}
            <TextField
              select
              label="Assign Factory"
              value={form.factoryId}
              onChange={(e) => setForm({ ...form, factoryId: e.target.value })}
              fullWidth
              required
            >
              <MenuItem value="">-- Select Factory --</MenuItem>
              {(factories ?? []).map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name} ({f.type})
                </MenuItem>
              ))}
            </TextField>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Quantity Issued"
                  type="number"
                  slotProps={{
                    htmlInput: { min: 0.1, step: 0.1 },
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
                  value={form.quantityIssuedKg}
                  onChange={(e) => setForm({ ...form, quantityIssuedKg: e.target.value })}
                  fullWidth
                  required
                />
                {form.quantityIssuedKg && Number(form.quantityIssuedKg) > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {form.unit === "kg"
                      ? `= ${round(Number(form.quantityIssuedKg) * KG_PER_LBS)} lbs`
                      : `= ${round(lbsToKg(Number(form.quantityIssuedKg)))} kg`}
                  </Typography>
                )}
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Expected Output (meters)"
                  type="number"
                  slotProps={{ htmlInput: { min: 0 } }}
                  value={form.expectedFabricMeters}
                  onChange={(e) => setForm({ ...form, expectedFabricMeters: e.target.value })}
                  fullWidth
                  required
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Weaving Charges (₨)"
                  type="number"
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  value={form.weavingCharges}
                  onChange={(e) => setForm({ ...form, weavingCharges: e.target.value })}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Dyeing Charges (₨)"
                  type="number"
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  value={form.dyeingCharges}
                  onChange={(e) => setForm({ ...form, dyeingCharges: e.target.value })}
                  fullWidth
                />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary" }}>
              <FactoryIcon fontSize="small" />
              <Typography variant="caption">
                Factory charges are applied per its type (Weaving / Dyeing / Both).
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={createLot} variant="contained" disabled={saving}>
            {saving ? "Creating..." : "Create Lot"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!closingLot} onClose={() => setClosingLot(null)}>
        <DialogTitle>Receive Lot in Stock</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Closing {closingLot?.lotNumber}. Costing will be computed from yarn rate and factory charges.
            </Typography>
            <TextField
              label="Fabric Type / Design Name"
              value={fabricType}
              onChange={(e) => setFabricType(e.target.value)}
              fullWidth
              required
              placeholder="e.g. Cotton Twill - Red"
            />
            <TextField
              label="Actual Output (meters)"
              type="number"
              slotProps={{ htmlInput: { min: 0 } }}
              value={actualMeters}
              onChange={(e) => setActualMeters(e.target.value)}
              fullWidth
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClosingLot(null)} color="inherit">Cancel</Button>
          <Button onClick={receiveStock} variant="contained" disabled={saving}>
            {saving ? "Processing..." : "Confirm & Costing"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Production Lot"
        message={`Delete lot "${deleting?.lotNumber}"? Note: issued yarn will not be returned automatically.`}
        onConfirm={removeLot}
        onClose={() => setDeleting(null)}
      />

      <Dialog open={!!weavingLot} onClose={() => setWeavingLot(null)}>
        <DialogTitle>Record Weaving Output</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Meters of grey fabric returned by the weaver for {weavingLot?.lotNumber}.
            </Typography>
            <TextField
              label="Weaving Output (meters)"
              type="number"
              slotProps={{ htmlInput: { min: 0 } }}
              value={weavingMeters}
              onChange={(e) => setWeavingMeters(e.target.value)}
              fullWidth
              required
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWeavingLot(null)} color="inherit">Cancel</Button>
          <Button onClick={recordWeaving} variant="contained" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!transferLot} onClose={() => setTransferLot(null)}>
        <DialogTitle>Transfer to Dyeing</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Send {transferLot?.lotNumber} (grey fabric) to a dyeing factory. Select the dyer and record the dyeing charges.
            </Typography>
            <TextField
              select
              label="Dyeing Factory"
              value={transferFactoryId}
              onChange={(e) => setTransferFactoryId(e.target.value)}
              fullWidth
            >
              {(factories ?? []).map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name} ({f.type})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Dyeing Charges (₨)"
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              value={transferDyeingCharges}
              onChange={(e) => setTransferDyeingCharges(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferLot(null)} color="inherit">Cancel</Button>
          <Button onClick={transferToDyeing} variant="contained" disabled={saving}>
            {saving ? "Sending..." : "Transfer"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!dyeingLot} onClose={() => setDyeingLot(null)}>
        <DialogTitle>Record Dyeing Output</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Meters of dyed fabric returned by the dyer for {dyeingLot?.lotNumber}.
            </Typography>
            <TextField
              label="Dyeing Output (meters)"
              type="number"
              slotProps={{ htmlInput: { min: 0 } }}
              value={dyeingMeters}
              onChange={(e) => setDyeingMeters(e.target.value)}
              fullWidth
              required
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDyeingLot(null)} color="inherit">Cancel</Button>
          <Button onClick={recordDyeing} variant="contained" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editLot} onClose={() => setEditLot(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Lot — {editLot?.lotNumber}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Correct expected output or factory charges. These feed into costing when the lot is received in stock.
            </Typography>
            <TextField
              label="Expected Output (meters)"
              type="number"
              slotProps={{ htmlInput: { min: 0 } }}
              value={editForm.expectedFabricMeters}
              onChange={(e) => setEditForm({ ...editForm, expectedFabricMeters: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Weaving Charges (₨)"
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              value={editForm.weavingCharges}
              onChange={(e) => setEditForm({ ...editForm, weavingCharges: e.target.value })}
              fullWidth
            />
            <TextField
              label="Dyeing Charges (₨)"
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              value={editForm.dyeingCharges}
              onChange={(e) => setEditForm({ ...editForm, dyeingCharges: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditLot(null)} color="inherit">Cancel</Button>
          <Button onClick={saveLotEdit} variant="contained" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!payFactory} onClose={() => setPayFactory(null)}>
        <DialogTitle>Pay Factory</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Record a payment to {payFactory?.name}. Current balance:{" "}
              <strong>{payFactory ? formatCurrency(payFactory.balance) : ""}</strong>
            </Typography>
            <TextField
              label="Amount (₨)"
              type="number"
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              fullWidth
              required
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayFactory(null)} color="inherit">Cancel</Button>
          <Button onClick={saveFactoryPayment} variant="contained" disabled={saving}>
            {saving ? "Processing..." : "Record Payment"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={factoriesOpen} onClose={() => setFactoriesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingFactory ? "Edit Factory" : "Add Factory"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mb: 3 }}>
            <TextField
              label="Factory Name"
              value={factoryForm.name}
              onChange={(e) => setFactoryForm({ ...factoryForm, name: e.target.value })}
              fullWidth
              required
              placeholder="e.g. Punjab Weaving Mills"
            />
            <TextField
              label="Contact"
              value={factoryForm.contact}
              onChange={(e) => setFactoryForm({ ...factoryForm, contact: e.target.value })}
              fullWidth
              placeholder="Phone / address"
            />
            <TextField
              select
              label="Type"
              value={factoryForm.type}
              onChange={(e) => setFactoryForm({ ...factoryForm, type: e.target.value as Factory["type"] })}
              fullWidth
            >
              <MenuItem value="Weaving">Weaving</MenuItem>
              <MenuItem value="Dyeing">Dyeing</MenuItem>
              <MenuItem value="Both">Both (Composite)</MenuItem>
            </TextField>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Saved Factories</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={openAddFactory}>New</Button>
          </Stack>
          <Paper variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Balance</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {factoriesLoading && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 2 }}>
                        <Loader loading rows={2} />
                      </TableCell>
                    </TableRow>
                  )}
                  {!factoriesLoading && (factories ?? []).map((f) => (
                    <TableRow key={f.id} hover>
                      <TableCell>
                        <Typography variant="body2">{f.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{f.contact}</Typography>
                      </TableCell>
                      <TableCell><Chip label={f.type} size="small" /></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(f.balance)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          <Tooltip title="Record payment to factory">
                            <IconButton size="small" color="success" onClick={() => { setPayFactory(f); setPayAmount(""); }}>
                              <Payments fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <IconButton size="small" onClick={() => openEditFactory(f)}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => setDeletingFactory(f)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(factories ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 3, textAlign: "center", color: "text.secondary" }}>
                        No factories yet. Add one above.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFactoriesOpen(false)} color="inherit">Done</Button>
          <Button onClick={saveFactory} variant="contained" disabled={factorySaving}>
            {factorySaving ? "Saving..." : editingFactory ? "Save Changes" : "Add Factory"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deletingFactory}
        title="Delete Factory"
        message={`Delete "${deletingFactory?.name}"? Lots referencing it may show unknown factory.`}
        onConfirm={removeFactory}
        onClose={() => setDeletingFactory(null)}
      />
    </Box>
  );
}
