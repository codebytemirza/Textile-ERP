import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Payments } from "@mui/icons-material";
import { CrudManager, type CrudColumn } from "../components/CrudManager";
import { businessApi } from "../api";
import { useToast } from "../contexts/ToastContext";
import type { Customer } from "../types";
import { formatCurrency } from "../lib/utils";

const columns: CrudColumn<Customer>[] = [
  { field: "name", label: "Name", sortValue: (r) => r.name },
  { field: "contact", label: "Contact", sortValue: (r) => r.contact },
  {
    field: "balance",
    label: "Balance Due",
    align: "right",
    render: (r) => (
      <Typography variant="body2" sx={{ fontWeight: 600, color: r.balance > 0 ? "error.main" : "success.main" }}>
        {formatCurrency(r.balance)}
      </Typography>
    ),
  },
];

export function Customers() {
  const toast = useToast();
  const [paying, setPaying] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const recordPayment = async () => {
    if (!paying || Number(payAmount) <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setSaving(true);
    try {
      await businessApi.payment({ type: "Customer", entityId: paying.id, amount: Number(payAmount) });
      toast.success(`Payment of ${formatCurrency(Number(payAmount))} received from ${paying.name}`);
      setPaying(null);
      setPayAmount("");
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h1" sx={{ mb: 0.5 }}>Customers</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Manage wholesale customers and their outstanding balances. Record a payment directly from a customer row, or use the Ledgers page.
      </Typography>
      <CrudManager<Customer>
        key={reloadKey}
        collection="customers"
        title="Customer"
        addLabel="Add Customer"
        columns={columns}
        defaultValues={{ name: "", contact: "", balance: 0 }}
        searchKeys={["name", "contact"]}
        validate={(f) => (f.name ? null : "Name is required")}
        renderForm={(form, setForm) => (
          <Stack spacing={2.5}>
            <TextField
              label="Customer name"
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="Contact"
              value={form.contact ?? ""}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              fullWidth
              placeholder="Phone / address"
            />
            <TextField
              label="Opening balance (₨)"
              type="number"
              slotProps={{ htmlInput: { step: 0.01 } }}
              value={form.balance ?? 0}
              onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              Opening balance is the amount the customer already owes you when they are added — it seeds their starting balance.
            </Typography>
          </Stack>
        )}
        renderActions={(row) =>
          row.balance > 0 ? (
            <Tooltip title="Record Payment">
              <IconButton size="small" color="success" onClick={() => { setPaying(row); setPayAmount(String(row.balance)); }}>
                <Payments fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null
        }
      />

      <Dialog open={!!paying} onClose={() => setPaying(null)}>
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Receive payment from <b>{paying?.name}</b>. This reduces their balance and allocates across unpaid invoices (oldest first).
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
    </Box>
  );
}