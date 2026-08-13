import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { Dataset, DeleteSweep } from "@mui/icons-material";
import { businessApi } from "../api";
import { useToast } from "../contexts/ToastContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";

export function Settings() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSeed = async () => {
    setLoading(true);
    try {
      await businessApi.seed();
      toast.success("Sample data seeded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to seed sample data");
    } finally {
      setLoading(false);
      setSeedOpen(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await businessApi.seedDelete();
      toast.success("All business data deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete data");
    } finally {
      setLoading(false);
      setDeleteOpen(false);
    }
  };

  return (
    <Box>
      <PageHeader title="Settings" subtitle="Sample data management and system configuration" />

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h3" sx={{ mb: 1 }}>Sample Data Management</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Seed a realistic demo environment covering yarn, production, inventory, sales and ledgers. Deleting removes
              all business records — user accounts are kept.
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" startIcon={<Dataset />} onClick={() => setSeedOpen(true)} disabled={loading}>
                Seed Sample Data
              </Button>
              <Button variant="outlined" color="error" startIcon={<DeleteSweep />} onClick={() => setDeleteOpen(true)} disabled={loading}>
                Delete All Data
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h3" sx={{ mb: 1 }}>Demo Credentials</Typography>
            <Typography variant="body2" color="text.secondary">
              The first registered account becomes <b>Admin</b>. Later registrations get <b>ShopStaff</b> role. Use the demo
              button on the login screen for instant admin access.
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      <ConfirmDialog
        open={seedOpen}
        title="Seed Sample Data"
        message="This will add realistic sample records across all modules. Continue?"
        confirmLabel="Seed"
        onConfirm={handleSeed}
        onClose={() => setSeedOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete All Data"
        message="This permanently deletes all business records. User accounts are kept. Continue?"
        confirmLabel="Delete Everything"
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </Box>
  );
}