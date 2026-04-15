import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@multica/ui/components/ui/alert-dialog";

interface KeepDiscardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onKeep: () => void;
  onDiscard: () => void;
  discardVariant?: "default" | "destructive";
}

const KEEP_LABEL = "Keep";
const DISCARD_LABEL = "Discard";

export function KeepDiscardDialog({
  open,
  onOpenChange,
  title,
  description,
  onKeep,
  onDiscard,
  discardVariant = "default",
}: KeepDiscardDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeep}>{KEEP_LABEL}</AlertDialogCancel>
          <AlertDialogAction variant={discardVariant} onClick={onDiscard}>{DISCARD_LABEL}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
