"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  lazy,
  Suspense,
} from "react";

/* The alert-dialog primitives (and @base-ui/react with them) are only needed
 * once an alert is opened, so they load on demand instead of riding along in
 * the entry bundle. */
const DialogAlertView = lazy(() => import("./dialog-alert-view"));
const DialogPromptView = lazy(() => import("./dialog-prompt-view"));

export const DialogAlertContext = createContext(null);

export const alert = {
  /**
   *
   * @param {{ title: string, description: string, buttonText: string, onClose: function, secondaryButtonText: string}} config
   */
  close: (config) => {},
  /**
   *
   * @param {{ title: string, description: string, buttonText: string, onClose: function, secondaryButtonText: string}} config
   */
  success: (config) => {},
  /**
   *
   * @param {{ title: string, description: string, buttonText: string, onClose: function, secondaryButtonText: string}} config
   */
  error: (config) => {},
  /**
   *
   * @param {{ title: string, description: string, buttonText: string, onClose: function, secondaryButtonText: string}} config
   */
  warning: (config) => {},
  /**
   *
   * @param {{ title: string, description: string, buttonText: string, onClose: function, secondaryButtonText: string}} config
   */
  info: (config) => {},
  /**
   *
   * @param {{ title: string, description: string, buttonText: string, onClose: function, secondaryButtonText: string}} config
   */
  confirm: (config) => Promise.reject(new Error("Alert not initialized")),
  prompt: (config) => Promise.reject(new Error("Alert not initialized")),
};

window.alerter = alert;

export function DialogAlertProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState("info");
  const [mode, setMode] = useState("alert");
  const [config, setConfig] = useState({
    title: "",
    description: "",
    buttonText: "",
    onClose: null,
    secondaryButtonText: "",
  });

  const triggerAlert = useCallback((alertType, options) => {
    setMode("alert");
    setType(alertType);
    setConfig(options);
    setIsOpen(true);
  }, []);

  const success = useCallback(
    (options) => triggerAlert("success", options),
    [triggerAlert],
  );
  const error = useCallback(
    (options) => triggerAlert("error", options),
    [triggerAlert],
  );
  const warning = useCallback(
    (options) => triggerAlert("warning", options),
    [triggerAlert],
  );
  const info = useCallback(
    (options) => triggerAlert("info", options),
    [triggerAlert],
  );
  const close = useCallback((options) => {
    setIsOpen(false);
    if (options && typeof options.onClose === "function") {
      options.onClose(mode === "prompt" ? options.values : options.confirmed);
    }
  }, [mode]);

  const confirm = useCallback(
    (options) => {
      return new Promise((resolve, reject) => {
        try {
          triggerAlert("confirm", {
            ...options,

            onClose: (confirmed) => {
              setIsOpen(false);
              if (confirmed) {
                resolve(true);
              } else {
                resolve(false);
              }
            },
          });
        } catch (error) {
          reject(error);
        }
      });
    },
    [triggerAlert],
  );

  const prompt = useCallback((options = {}) => {
    return new Promise((resolve, reject) => {
      try {
        setMode("prompt");
        setConfig({
          title: "",
          description: "",
          fields: [],
          buttonText: "Submit",
          secondaryButtonText: "Cancel",
          initialValues: {},
          ...options,
          onClose: (values) => resolve(values ?? null),
        });
        setIsOpen(true);
      } catch (error) {
        reject(error);
      }
    });
  }, []);

  useEffect(() => {
    alert.success = success;
    alert.error = error;
    alert.warning = warning;
    alert.info = info;
    alert.confirm = confirm;
    alert.prompt = prompt;
    alert.close = close;
  }, [success, error, warning, info, confirm, prompt, close]);

  return (
    <DialogAlertContext.Provider
      value={{ success, error, warning, info, close, confirm, prompt }}
    >
      {children}
      {isOpen && (
        <Suspense fallback={null}>
          {mode === "prompt" ? (
            <DialogPromptView
              open={isOpen}
              onOpenChange={setIsOpen}
              config={config}
              onClose={(values) => close({ ...config, values })}
            />
          ) : (
            <DialogAlertView
              open={isOpen}
              onOpenChange={setIsOpen}
              type={type}
              config={config}
              onClose={close}
            />
          )}
        </Suspense>
      )}
    </DialogAlertContext.Provider>
  );
}

export const useDialogAlert = () => {
  const context = useContext(DialogAlertContext);
  if (!context) {
    throw new Error("useDialogAlert must be used within a DialogAlertProvider");
  }
  return context;
};
