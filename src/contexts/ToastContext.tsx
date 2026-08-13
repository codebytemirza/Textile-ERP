import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Snackbar, Alert, type AlertColor } from "@mui/material";

interface Toast {
  id: number;
  message: string;
  severity: AlertColor;
}

interface ToastContextType {
  toast: (message: string, severity?: AlertColor) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  success: () => {},
  error: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, severity: AlertColor = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, severity }]);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider
      value={{
        toast,
        success: (m) => toast(m, "success"),
        error: (m) => toast(m, "error"),
      }}
    >
      {children}
      {toasts.map((t) => (
        <Snackbar
          key={t.id}
          open
          autoHideDuration={4000}
          onClose={() => dismiss(t.id)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert severity={t.severity} variant="filled" onClose={() => dismiss(t.id)} sx={{ width: "100%" }}>
            {t.message}
          </Alert>
        </Snackbar>
      ))}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
