import { Box, Button, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { Add } from "@mui/icons-material";

interface Props {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actionLabel, onAction, children }: Props) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 3 }}>
      <Box>
        <Typography variant="h1">{title}</Typography>
        {subtitle && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      </Box>
      <Stack direction="row" spacing={1}>
        {children}
        {actionLabel && (
          <Button variant="contained" startIcon={<Add />} onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <Paper
      sx={{
        p: 6,
        textAlign: "center",
        color: "text.secondary",
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      {message}
    </Paper>
  );
}

export function Loader({ loading, rows = 1 }: { loading: boolean; rows?: number }) {
  if (!loading) return null;
  return (
    <Stack spacing={1} sx={{ p: 2 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <LinearProgress key={i} sx={{ borderRadius: 1 }} />
      ))}
    </Stack>
  );
}
