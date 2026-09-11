import { Fieldset as FieldsetPrimitive } from "@base-ui/react/fieldset";
import { cn } from "cn";

function Fieldset({ className, ...props }: FieldsetPrimitive.Root.Props) {
  return (
    <FieldsetPrimitive.Root
      data-slot="fieldset"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function FieldsetLegend({
  className,
  ...props
}: FieldsetPrimitive.Legend.Props) {
  return (
    <FieldsetPrimitive.Legend
      data-slot="fieldset-legend"
      className={cn("text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Fieldset, FieldsetLegend };
