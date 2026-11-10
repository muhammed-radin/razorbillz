/**
 * Presentational half of the dialog-alert system.
 *
 * Split into its own module so the alert-dialog primitives (~55 kB with
 * @base-ui/react) stay out of the entry bundle and are only fetched the first
 * time an alert is actually opened. See `dialog-alert-provider.jsx`.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";

const ALERT_STYLES = {
  success: { icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> },
  error: { icon: <XCircle className="h-5 w-5 text-destructive" /> },
  warning: { icon: <AlertTriangle className="h-5 w-5 text-amber-500" /> },
  info: { icon: <Info className="h-5 w-5 text-blue-500" /> },
  confirm: { icon: <Info className="h-5 w-5 text-blue-500" /> },
};

export default function DialogAlertView({ open, onOpenChange, type, config, onClose }) {
  const styles = ALERT_STYLES[type] || ALERT_STYLES.info;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-background/10 sm:mx-0">
              {styles.icon}
            </div>
            {config.title}
          </AlertDialogTitle>
          {config.description && (
            <AlertDialogDescription className="text-[15px]">
              {config.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {config.secondaryButtonText && (
            <AlertDialogCancel
              onClick={() => {
                onClose({ confirmed: false, ...config });
              }}
            >
              {config.secondaryButtonText || "Cancel"}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            onClick={() => {
              onClose({ confirmed: true, ...config });
            }}
          >
            {config.buttonText
              ? config.buttonText
              : config.secondaryButtonText || "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
