import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
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
import { Delete, Edit, Inventory2 } from "@mui/icons-material";
import { collectionApi } from "../api";
import { useCollection } from "../lib/useCollection";
import { useToast } from "../contexts/ToastContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader, EmptyState, Loader } from "../components/PageHeader";
import type { FinishedFabric, ProductionLot } from "../types";
import { formatCurrency } from "../lib/utils";

export function FinishedInventory() {
  const toast = useToast();
  const { data: inventory, loading, refresh } = useCollection<FinishedFabric>(
    () => collectionApi<FinishedFabric>("finished_fabrics").list(),
    []
  );
  const { data: lots } = useCollection<ProductionLot>(
    () => collectionApi<ProductionLot>("production_lots").list(),
    []
  );

  const [editing, setEditing] = useState<FinishedFabric | null>(null);
  const [qty, setQty] = useState("");
  const [deleting, setDeleting] = useState<FinishedFabric | null>(null);

  const lotByNo = useMemo(() => new Map((lots ?? []).map((l) => [l.id, l.lotNumber])), [lots]);

  // Only show fabrics whose lot has finished dyeing AND been received in stock.
  const receivedLotIds = useMemo(() => new Set((lots ?? []).filter((l) => l.status === "Received in Stock").map((l) => l.id)), [lots]);
  const visible = useMemo(() => (inventory ?? []).filter((i) => receivedLotIds.has(i.lotId)), [inventory, receivedLotIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, { totalMeters: number; items: FinishedFabric[] }>();
    for (const item of visible) {
      const g = map.get(item.fabricType) ?? { totalMeters: 0, items: [] };
      g.totalMeters += item.quantityMeters;
      g.items.push(item);
      map.set(item.fabricType, g);
    }
    return Array.from(map.entries());
  }, [visible]);

  const totalMeters = useMemo(() => visible.reduce((s, i) => s + i.quantityMeters, 0), [visible]);
  const totalValue = useMemo(
    () => visible.reduce((s, i) => s + i.quantityMeters * i.costPerMeter, 0),
    [visible]
  );

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await collectionApi<FinishedFabric>("finished_fabrics").update(editing.id, {
        quantityMeters: Number(qty),
      });
      toast.success("Inventory updated");
      setEditing(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await collectionApi<FinishedFabric>("finished_fabrics").remove(deleting.id);
      toast.success("Item deleted");
      setDeleting(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  };

  return (
    <Box>
      <PageHeader
        title="Finished Fabrics Inventory"
        subtitle={`${totalMeters.toFixed(1)} m total • ${formatCurrency(totalValue)} value`}
      />

      {loading ? (
        <Loader loading rows={3} />
      ) : visible.length === 0 ? (
        <EmptyState message="No finished fabrics found. Dyeing-complete lots received into stock appear here." />
      ) : (
        <Grid container spacing={2.5}>
          {grouped.map(([fabricType, group]) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={fabricType}>
              <Card variant="outlined">
                <Box sx={{ bgcolor: "grey.900", color: "white", p: 2 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ fontWeight: 600 }}>{fabricType}</Typography>
                    <Chip label={`${group.totalMeters.toFixed(1)} m`} size="small" sx={{ bgcolor: "grey.700", color: "white" }} />
                  </Stack>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Source Lot</TableCell>
                        <TableCell align="right">Quantity</TableCell>
                        <TableCell align="right">Cost/m</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {group.items.map((item) => (
                        <TableRow key={item.id} hover>
                          <TableCell sx={{ fontWeight: 500 }}>
                            {lotByNo.get(item.lotId) ?? "Unknown"}
                          </TableCell>
                          <TableCell align="right">{item.quantityMeters} m</TableCell>
                          <TableCell align="right" sx={{ color: "primary.main", fontWeight: 600 }}>
                            {formatCurrency(item.costPerMeter)}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.25} sx={{ justifyContent: "flex-end" }}>
                              <Tooltip title="Edit quantity">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setEditing(item);
                                    setQty(String(item.quantityMeters));
                                  }}
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => setDeleting(item)}>
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
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)}>
        <DialogTitle>Edit Finished Inventory</DialogTitle>
        <DialogContent dividers>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
            <Inventory2 color="action" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              {editing?.fabricType}
            </Typography>
          </Stack>
          <TextField
            label="Quantity (meters)"
            type="number"
            slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            fullWidth
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} color="inherit">Cancel</Button>
          <Button onClick={saveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete Finished Inventory"
        message={`Delete this fabric item? This cannot be undone.`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </Box>
  );
}
