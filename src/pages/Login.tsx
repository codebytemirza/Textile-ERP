import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Factory, LogIn, UserPlus, School } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

export function Login() {
  const { user, login, register, demoCreds } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === 0) {
        await login(email, password);
      } else {
        if (name.trim().length < 2) {
          toast.error("Please enter your full name");
          return;
        }
        await register(email, password, name);
      }
      toast.success(tab === 0 ? "Welcome back!" : "Account created");
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const useDemo = async () => {
    setLoading(true);
    try {
      await login(demoCreds.email, demoCreds.password);
      toast.success("Signed in as demo admin");
    } catch (err: any) {
      toast.error(err?.message ?? "Demo login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="min-h-screen bg-neutral-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Box className="sm:mx-auto sm:w-full sm:max-w-md">
        <Box className="flex justify-center text-blue-600 mb-3">
          <Factory size={48} />
        </Box>
        <Typography variant="h4" align="center" sx={{ fontWeight: 800 }}>
          Textile ERP
        </Typography>
        <Typography align="center" color="text.secondary" sx={{ mt: 0.5 }}>
          Yarn, Production & Sales Management
        </Typography>
      </Box>

      <Paper
        className="mt-6 sm:mx-auto sm:w-full sm:max-w-md"
        variant="outlined"
        sx={{ overflow: "hidden" }}
      >
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab icon={<LogIn size={16} />} iconPosition="start" label="Sign In" />
          <Tab icon={<UserPlus size={16} />} iconPosition="start" label="Register" />
        </Tabs>

        <Box component="form" onSubmit={handleSubmit} sx={{ p: 4, display: "flex", flexDirection: "column", gap: 2.5 }}>
          {tab === 1 && (
            <TextField
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <TextField
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText={tab === 1 ? "Minimum 6 characters" : undefined}
          />

          {tab === 0 && (
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          )}
          {tab === 1 && (
            <Button type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </Button>
          )}

          <Stack spacing={1}>
            <Alert severity="info" icon={<School size={16} />}>
              Demo admin: <b>{demoCreds.email}</b> / <b>{demoCreds.password}</b>
            </Alert>
            <Button variant="outlined" onClick={useDemo} disabled={loading} startIcon={<School size={16} />}>
              Use demo admin
            </Button>
          </Stack>
        </Box>
      </Paper>

      <Typography align="center" color="text.secondary" sx={{ mt: 3, fontSize: 12 }}>
        The first registered account becomes Admin. Later registrations get ShopStaff role.
      </Typography>
    </Box>
  );
}
