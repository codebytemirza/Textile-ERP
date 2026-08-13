import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
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
import { Add, Delete, Edit, Refresh, Search } from "@mui/icons-material";
import { collectionApi } from "../api";
import { useCollection } from "../lib/useCollection";
import { useToast } from "../contexts/ToastContext";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState, PageHeader, Loader } from "./PageHeader";

export interface CrudColumn<T> {
  field: keyof T;
  label: string;
  align?: "right" | "center";
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

interface Props<T extends { id: string }> {
  collection: string;
  title: string;
  subtitle?: string;
  addLabel?: string;
  columns: CrudColumn<T>[];
  defaultValues: Partial<T> & Record<string, unknown>;
  searchKeys: (keyof T)[];
  renderForm: (form: any, setForm: (v: any) => void) => React.ReactNode;
  validate?: (form: any) => string | null;
  onSaved?: () => void;
  renderActions?: (row: T) => React.ReactNode;
}

export function CrudManager<T extends { id: string }>({
  collection,
  title,
  subtitle,
  addLabel = "Add",
  columns,
  defaultValues,
  searchKeys,
  renderForm,
  validate,
  onSaved,
  renderActions,
}: Props<T>) {
  const toast = useToast();
  const { data, loading, refresh } = useCollection<T>(() => collectionApi<T>(collection).list(), [collection]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<any>(defaultValues);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? data.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)))
      : data;
    return [...filtered].sort((a, b) => {
      const col = columns.find((c) => c.sortValue)?.field ?? "createdAt";
      const av = (a as any)[col] ?? 0;
      const bv = (b as any)[col] ?? 0;
      return Number(bv) - Number(av);
    });
  }, [data, search, columns, searchKeys]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultValues);
    setOpen(true);
  };

  const openEdit = (row: T) => {
    setEditing(row);
    setForm({ ...defaultValues, ...row });
    setOpen(true);
  };

  const handleSave = async () => {
    const err = validate?.(form);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await collectionApi<T>(collection).update(editing.id, form);
        toast.success(`${title} updated`);
      } else {
        await collectionApi<T>(collection).create(form);
        toast.success(`${title} created`);
      }
      setOpen(false);
      refresh();
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await collectionApi<T>(collection).remove(deleting.id);
      toast.success(`${title} deleted`);
      setDeleting(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    }
  };

  return (
    <Box>
      <PageHeader title={title} subtitle={subtitle} actionLabel={addLabel} onAction={openCreate} />

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box />
        <TextField
          placeholder={`Search ${title.toLowerCase()}...`}
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 260 }}
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
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={String(c.field)} align={c.align ?? "left"}>{c.label}</TableCell>
                ))}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} sx={{ py: 2 }}>
                    <Loader loading rows={4} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.map((row) => (
                <TableRow key={row.id} hover>
                  {columns.map((c) => (
                    <TableCell key={String(c.field)} align={c.align ?? "left"}>
                      {c.render ? c.render(row) : String(row[c.field] ?? "")}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                      {renderActions?.(row)}
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(row)}>
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
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
        {!loading && rows.length === 0 && <EmptyState message={`No ${title.toLowerCase()} found.`} />}
      </Paper>

      <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 2 }}>
        <Tooltip title="Refresh">
          <IconButton onClick={refresh}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>{editing ? `Edit ${title}` : `Add ${title}`}</DialogTitle>
        <DialogContent dividers>{renderForm(form, setForm)}</DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${title}`}
        message={`Are you sure you want to delete "${(deleting as any)?.name ?? deleting?.id}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </Box>
  );
}
