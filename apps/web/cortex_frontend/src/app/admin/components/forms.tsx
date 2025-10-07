"use client";

import * as React from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const orgSchema = z.object({
  name: z.string().min(1, "El nombre interno es obligatorio"),
  displayName: z.string().optional(),
  package: z.enum(["marca", "black_ops"]),
  orgType: z.enum(["oem", "dealer_group"]),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  billingEmail: z.string().email("Correo inválido").optional().or(z.literal("")),
  billingPhone: z.string().optional(),
  billingLine1: z.string().optional(),
  billingLine2: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  billingCountry: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  metadataNotes: z.string().optional(),
  superEmail: z.string().email("Correo inválido").optional().or(z.literal("")),
  superPassword: z.string().optional(),
  superName: z.string().optional(),
  superPhone: z.string().optional(),
});

export type OrgFormValues = z.infer<typeof orgSchema>;

type OrgFormProps = {
  defaultValues: OrgFormValues;
  onSubmit: (values: OrgFormValues) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
  className?: string;
};

export function OrganizationCreateForm({ defaultValues, onSubmit, onCancel, loading, className }: OrgFormProps) {
  const form = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues,
  });
  const orgType = form.watch('orgType');

  const submit = React.useCallback(
    async (values: OrgFormValues) => {
      await onSubmit(values);
    },
    [onSubmit]
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className={cn("grid gap-6", className)}>
        <div className="grid gap-6 rounded-lg border bg-card p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre interno *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Grupo Demo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre comercial</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre visible" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="package"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paquete</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona paquete" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="marca">Marca</SelectItem>
                      <SelectItem value="black_ops">Black Ops</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="orgType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de organización</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="oem">OEM / Marca</SelectItem>
                      <SelectItem value="dealer_group">Grupo de dealers</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    OEM incluye superadmins y acceso a panel corporativo; Grupo se limita a dealers.
                  </p>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="legalName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón social</FormLabel>
                  <FormControl>
                    <Input placeholder="Razón social" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RFC / Tax ID</FormLabel>
                  <FormControl>
                    <Input placeholder="RFC" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField
              control={form.control}
              name="billingEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo facturación</FormLabel>
                  <FormControl>
                    <Input placeholder="facturacion@empresa.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billingPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono de facturación</FormLabel>
                  <FormControl>
                    <Input placeholder="+52 ..." {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contacto principal</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del contacto" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono del contacto</FormLabel>
                  <FormControl>
                    <Input placeholder="+52 ..." {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField
              control={form.control}
              name="billingLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input placeholder="Calle, número" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billingLine2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complemento dirección</FormLabel>
                  <FormControl>
                    <Input placeholder="Interior, referencia" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billingCity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billingState"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado / Provincia</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billingZip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código postal</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billingCountry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>País</FormLabel>
                  <FormControl>
                    <Input placeholder="México" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="metadataNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notas internas</FormLabel>
                <FormControl>
                  <Textarea placeholder="Notas adicionales" rows={3} {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {orgType === 'oem' ? (
          <div className="grid gap-6 rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="text-sm font-semibold">Superadmin OEM (opcional)</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="superEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@marca.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="superPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña temporal</FormLabel>
                    <FormControl>
                      <Input placeholder="Se genera si queda vacío" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="superName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="superPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creando…' : 'Crear organización'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
