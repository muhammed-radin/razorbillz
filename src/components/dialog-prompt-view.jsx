import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const INPUT_TYPES = new Set([
  "button",
  "color",
  "date",
  "datetime-local",
  "email",
  "file",
  "hidden",
  "month",
  "number",
  "password",
  "range",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);

function fieldValue(field, values) {
  return values[field.name] ?? field.defaultValue ?? "";
}

function isEmptyValue(value, type) {
  if (type === "checkbox") return value !== true;
  if (type === "file") return !value || value.length === 0;
  return value === undefined || value === null || value === "";
}

function getFieldLabel(fields, path) {
  const name = path?.[0];
  return fields.find((field) => field.name === name)?.label || name;
}

function getValidationMessage(fields, issue) {
  const label = getFieldLabel(fields, issue?.path);
  const isMissingValue =
    issue?.code === "invalid_type" &&
    /received (undefined|null)/.test(issue.message || "");

  if (isMissingValue) {
    return label ? `${label} is required.` : "This field is required.";
  }

  return issue?.message || "Please correct the highlighted values.";
}

function getInitialValues(config) {
  return (config.fields || []).reduce(
    (values, field) => {
      if (field.defaultValue !== undefined && values[field.name] === undefined) {
        values[field.name] = field.defaultValue;
      }
      return values;
    },
    { ...(config.initialValues || {}) },
  );
}

function Field({ field, values, setValue }) {
  const generatedId = useId();
  const id = field.id || `${field.name}-${generatedId}`;
  const label = field.label || field.name;
  const commonProps = {
    id,
    name: field.name,
    required: field.required,
    disabled: field.disabled,
    placeholder: field.placeholder,
    className: field.className,
  };

  if (field.type === "hidden") {
    return (
      <Input
        {...commonProps}
        type="hidden"
        value={fieldValue(field, values)}
        onChange={(event) => setValue(field.name, event.target.value)}
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          name={field.name}
          checked={Boolean(values[field.name] ?? field.defaultValue)}
          disabled={field.disabled}
          onCheckedChange={(checked) => setValue(field.name, checked === true)}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
    );
  }

  if (field.type === "progress") {
    const value = fieldValue(field, values);
    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={id}>{label}</Label>
          {field.showValue !== false && (
            <span className="text-sm text-muted-foreground">
              {value}
              {field.max ? ` / ${field.max}` : "%"}
            </span>
          )}
        </div>
        <Progress
          id={id}
          value={value}
          max={field.max || 100}
          className={field.className}
        />
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {label}
          {field.required && <span className="text-destructive"> *</span>}
        </legend>
        <RadioGroup
          value={values[field.name] || ""}
          onValueChange={(value) => setValue(field.name, value)}
          disabled={field.disabled}
          className="grid gap-2"
        >
          {(field.options || []).map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem
                id={`${id}-${option.value}`}
                value={option.value}
              />
              <Label htmlFor={`${id}-${option.value}`}>
                {option.label ?? option.value}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
    );
  }

  if (field.type === "select") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>
          {label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        <Select
          value={fieldValue(field, values) || undefined}
          onValueChange={(value) => setValue(field.name, value)}
          disabled={field.disabled}
        >
          <SelectTrigger id={id} className={field.className}>
            <SelectValue placeholder={field.placeholder || "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label ?? option.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>
          {label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        <Textarea
          {...commonProps}
          rows={field.rows}
          value={fieldValue(field, values)}
          onChange={(event) => setValue(field.name, event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "color") {
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>
          {label}
          {field.required && <span className="text-destructive"> *</span>}
        </Label>
        <Input
          {...commonProps}
          type="color"
          value={fieldValue(field, values) || "#000000"}
          onChange={(event) => setValue(field.name, event.target.value)}
        />
      </div>
    );
  }

  if (field.type === "range") {
    const value = Number(fieldValue(field, values) || field.min || 0);
    const min = Number(field.min ?? 0);
    const max = Number(field.max ?? 100);
    const step = Number(field.step ?? 1);

    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={id}>
            {label}
            {field.required && <span className="text-destructive"> *</span>}
          </Label>
          {field.showValue !== false && (
            <span className="text-sm text-muted-foreground">{value}</span>
          )}
        </div>
        <Slider
          id={id}
          name={field.name}
          min={min}
          max={max}
          step={step}
          value={[value]}
          disabled={field.disabled}
          className={field.className}
          onValueChange={([nextValue]) => setValue(field.name, nextValue)}
          aria-label={label}
        />
      </div>
    );
  }

  const type = INPUT_TYPES.has(field.type) ? field.type : "text";
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        {...commonProps}
        type={type}
        min={field.min}
        max={field.max}
        step={field.step}
        accept={field.accept}
        {...(type === "file" ? {} : { value: fieldValue(field, values) })}
        onChange={(event) =>
          setValue(
            field.name,
            type === "number" || type === "range"
              ? event.target.value === ""
                ? ""
                : Number(event.target.value)
              : type === "file"
                ? event.target.files
                : event.target.value,
          )
        }
      />
    </div>
  );
}

export default function DialogPromptView({ open, onOpenChange, config, onClose }) {
  const [values, setValues] = useState(() => getInitialValues(config));
  const [validationError, setValidationError] = useState("");
  const shouldScroll =
    config.scrollable ?? (config.fields || []).length > 4;
  const setValue = (name, value) =>
    setValues((current) => ({ ...current, [name]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const missingField = (config.fields || []).find((field) => {
      if (!field.required) return false;
      const value = values[field.name] ?? field.defaultValue;
      return isEmptyValue(value, field.type) ||
        (typeof value === "string" && value.trim() === "");
    });
    if (missingField) {
      setValidationError(
        `${missingField.label || missingField.name} is required.`,
      );
      return;
    }
    if (!event.currentTarget.reportValidity()) return;
    if (config.schema && typeof config.schema.safeParse !== "function") {
      setValidationError("The prompt schema must provide a safeParse method.");
      return;
    }
    if (config.schema) {
      try {
        const result = config.schema.safeParse(values);
        if (!result.success) {
          const issue = result.error.issues[0];
          setValidationError(getValidationMessage(config.fields || [], issue));
          return;
        }
        setValidationError("");
        onClose(result.data);
        return;
      } catch (error) {
        console.error("Prompt schema validation failed:", error);
        setValidationError("Unable to validate the form. Please try again.");
        return;
      }
    }
    setValidationError("");
    onClose(values);
  };

  const handleOpenChange = (nextOpen) => {
    onOpenChange(nextOpen);
    if (!nextOpen) onClose(null);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle>{config.title || "Enter details"}</AlertDialogTitle>
          {config.description && (
            <AlertDialogDescription>{config.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4">
          <ScrollArea
            className={cn(
              "min-h-0 shrink-0",
              shouldScroll && "h-[min(60vh,28rem)]",
            )}
          >
            <div className="grid gap-4 pr-3">
              {(config.fields || []).map((field) => (
                <Field
                  key={field.id || field.name}
                  field={field}
                  values={values}
                  setValue={setValue}
                />
              ))}
            </div>
          </ScrollArea>
          {validationError && (
            <p className="text-sm text-destructive" role="alert">
              {validationError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" onClick={() => onClose(null)}>
              {config.secondaryButtonText || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction type="submit">
              {config.buttonText || "Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
