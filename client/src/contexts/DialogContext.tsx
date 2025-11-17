import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type DialogType = "auth" | "booking" | "reschedule" | "contact" | "bid" | null;

interface DialogContextState {
  activeDialog: DialogType;
  dialogData: Record<string, unknown>;
  openDialog: (type: DialogType, data?: Record<string, unknown>) => void;
  closeDialog: () => void;
  isDialogOpen: (type: DialogType) => boolean;
}

const DialogContext = createContext<DialogContextState | undefined>(undefined);

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

export function useDialog() {
  const context = useContext(DialogContext);
  if (context === undefined) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}
