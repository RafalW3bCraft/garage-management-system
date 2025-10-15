import { createContext, useContext, useState, useCallback, ReactNode } from "react";

/**
 * Available dialog types in the application
 */
export type DialogType = "auth" | "booking" | "reschedule" | "contact" | "bid" | null;

/**
 * Dialog context state type
 */
interface DialogContextState {
  activeDialog: DialogType;
  dialogData: Record<string, unknown>;
  openDialog: (type: DialogType, data?: Record<string, unknown>) => void;
  closeDialog: () => void;
  isDialogOpen: (type: DialogType) => boolean;
}

const DialogContext = createContext<DialogContextState | undefined>(undefined);

/**
 * Dialog Provider component for centralized dialog state management.
 * Manages which dialog is currently open and prevents multiple dialogs from being open simultaneously.
 * 
 * @param {object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {JSX.Element} The dialog provider wrapper
 * 
 * @example
 * ```tsx
 * <DialogProvider>
 *   <App />
 * </DialogProvider>
 * ```
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [dialogData, setDialogData] = useState<Record<string, unknown>>({});

  const openDialog = useCallback((type: DialogType, data: Record<string, unknown> = {}) => {
    setActiveDialog(type);
    setDialogData(data);
  }, []);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    setDialogData({});
  }, []);

  const isDialogOpen = useCallback((type: DialogType) => {
    return activeDialog === type;
  }, [activeDialog]);

  return (
    <DialogContext.Provider
      value={{
        activeDialog,
        dialogData,
        openDialog,
        closeDialog,
        isDialogOpen,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

/**
 * Hook for accessing dialog context and controls.
 * Must be used within a DialogProvider component.
 * 
 * @returns {DialogContextState} Dialog state and methods
 * @throws {Error} If used outside of DialogProvider
 * 
 * @example
 * ```tsx
 * const { openDialog, closeDialog, isDialogOpen } = useDialog();
 * 
 *
 * openDialog("auth");
 * 
 *
 * openDialog("booking", { serviceId: "123" });
 * 
 *
 * if (isDialogOpen("auth")) {
 *
 * }
 * 
 *
 * closeDialog();
 * ```
 */
export function useDialog() {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}
