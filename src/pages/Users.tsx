import { Box, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { CrudManager, type CrudColumn } from "../components/CrudManager";
import type { User } from "../types";
import { formatDate } from "../lib/utils";

const ROLE_COLORS: Record<string, "default" | "error" | "secondary" | "info"> = {
  Admin: "error",
  Manager: "secondary",
  ShopStaff: "info",
};

const columns: CrudColumn<User>[] = [
  { field: "name", label: "Name", sortValue: (r) => r.name },
  { field: "email", label: "Email", sortValue: (r) => r.email },
  {
    field: "role",
    label: "Role",
    render: (r) => <Chip label={r.role} color={ROLE_COLORS[r.role] ?? "default"} size="small" />,
  },
  {
    field: "createdAt",
    label: "Created",
    render: (r) => <Typography variant="body2">{formatDate(r.createdAt)}</Typography>,
  },
];

export function Users() {
  return (
    <Box>
      <Typography variant="h1" sx={{ mb: 0.5 }}>Users</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Manage team accounts and roles. Only Admins can create, edit or delete users.
      </Typography>
      <CrudManager<User>
        collection="users"
        title="User"
        addLabel="Add User"
        columns={columns}
        defaultValues={{ name: "", email: "", role: "ShopStaff", password: "" }}
        searchKeys={["name", "email", "role"]}
        validate={(f) => {
          if (!f.name) return "Name is required";
          if (!f.email || !/.+@.+\..+/.test(f.email)) return "A valid email is required";
          if (!f.password) return "Password is required when creating a user";
          if (String(f.password).length < 6) return "Password must be at least 6 characters";
          return null;
        }}
        renderForm={(form, setForm) => (
          <Stack spacing={2.5}>
            <TextField
              label="Full name"
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="Email address"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={form.password ?? ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              fullWidth
            />
            <TextField
              select
              label="Role"
              value={form.role ?? "ShopStaff"}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              fullWidth
            >
              <MenuItem value="Admin">Admin</MenuItem>
              <MenuItem value="Manager">Manager</MenuItem>
              <MenuItem value="ShopStaff">ShopStaff</MenuItem>
            </TextField>
          </Stack>
        )}
      />
    </Box>
  );
}