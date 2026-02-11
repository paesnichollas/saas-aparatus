"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { adminUpdateBarbershopAction } from "@/actions/admin-update-barbershop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface BarbershopAdminFormProps {
  barbershop: {
    id: string;
    name: string;
    phones: string[];
    exclusiveBarber: boolean;
    stripeEnabled: boolean;
    publicSlug: string;
    ownerId: string | null;
    owner: {
      id: string;
      name: string;
      email: string;
      role: "CUSTOMER" | "OWNER" | "ADMIN";
    } | null;
  };
}

const parsePhonesInput = (value: string) => {
  return value
    .split(/[\n,;]+/)
    .map((phone) => phone.trim())
    .filter(Boolean);
};

const formatPhonesInput = (phones: string[]) => phones.join(", ");

const getValidationError = (validationErrors: unknown) => {
  if (!validationErrors || typeof validationErrors !== "object") {
    return null;
  }

  const errors = (validationErrors as { _errors?: unknown })._errors;

  if (!Array.isArray(errors)) {
    return null;
  }

  return typeof errors[0] === "string" ? errors[0] : null;
};

const BarbershopAdminForm = ({ barbershop }: BarbershopAdminFormProps) => {
  const router = useRouter();
  const [name, setName] = useState(barbershop.name);
  const [phonesText, setPhonesText] = useState(formatPhonesInput(barbershop.phones));
  const [exclusiveBarber, setExclusiveBarber] = useState(barbershop.exclusiveBarber);
  const [stripeEnabled, setStripeEnabled] = useState(barbershop.stripeEnabled);
  const [ownerIdInput, setOwnerIdInput] = useState(barbershop.ownerId ?? "");

  const { executeAsync, isPending } = useAction(adminUpdateBarbershopAction);

  const currentOwnerLabel = useMemo(() => {
    if (!barbershop.owner) {
      return "Sem owner";
    }

    return `${barbershop.owner.name} (${barbershop.owner.email})`;
  }, [barbershop.owner]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedPhones = parsePhonesInput(phonesText);

    if (parsedPhones.length === 0) {
      toast.error("Informe pelo menos um telefone.");
      return;
    }

    const result = await executeAsync({
      barbershopId: barbershop.id,
      name: name.trim(),
      phones: parsedPhones,
      exclusiveBarber,
      stripeEnabled,
      ownerId: ownerIdInput.trim().length > 0 ? ownerIdInput.trim() : null,
    });

    const validationError = getValidationError(result.validationErrors);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (result.serverError || !result.data) {
      toast.error("Falha ao atualizar barbearia.");
      return;
    }

    toast.success("Barbearia atualizada com sucesso.");
    router.refresh();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-name">Nome</Label>
        <Input
          id="admin-barbershop-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-phones">Telefones</Label>
        <Input
          id="admin-barbershop-phones"
          value={phonesText}
          onChange={(event) => setPhonesText(event.target.value)}
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">
          Separe por virgula, ponto e virgula ou quebra de linha.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-owner-id">Owner ID</Label>
        <Input
          id="admin-barbershop-owner-id"
          value={ownerIdInput}
          onChange={(event) => setOwnerIdInput(event.target.value)}
          disabled={isPending}
          placeholder="UUID do owner (vazio remove owner)"
        />
        <p className="text-muted-foreground text-xs">
          Owner atual: {currentOwnerLabel}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-public-slug">Public slug (readonly)</Label>
        <Input
          id="admin-barbershop-public-slug"
          value={barbershop.publicSlug}
          readOnly
          disabled
        />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="admin-barbershop-exclusive-barber"
            checked={exclusiveBarber}
            onCheckedChange={setExclusiveBarber}
            disabled={isPending}
          />
          <Label htmlFor="admin-barbershop-exclusive-barber">
            exclusiveBarber
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="admin-barbershop-stripe-enabled"
            checked={stripeEnabled}
            onCheckedChange={setStripeEnabled}
            disabled={isPending}
          />
          <Label htmlFor="admin-barbershop-stripe-enabled">
            stripeEnabled
          </Label>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Salvar alteracoes"}
      </Button>
    </form>
  );
};

export default BarbershopAdminForm;
