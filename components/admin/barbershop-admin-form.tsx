"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { adminCreateBarbershopAction } from "@/actions/admin-create-barbershop";
import { adminUpdateBarbershopAction } from "@/actions/admin-update-barbershop";
import BarbershopDeleteButton from "@/components/admin/barbershop-delete-button";
import BarbershopStatusToggle from "@/components/admin/barbershop-status-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ImageUploader from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { normalizePublicSlug } from "@/lib/public-slug";

type FormBarbershop = {
  id: string;
  name: string;
  address: string;
  description: string;
  imageUrl: string | null;
  logoUrl: string | null;
  phones: string[];
  slug: string;
  publicSlug: string;
  exclusiveBarber: boolean;
  stripeEnabled: boolean;
  isActive: boolean;
  ownerId: string | null;
  plan: "BASIC" | "PRO";
  whatsappProvider: "NONE" | "TWILIO";
  whatsappFrom: string | null;
  whatsappEnabled: boolean;
  owner: {
    id: string;
    name: string;
    email: string;
    role: "CUSTOMER" | "OWNER" | "ADMIN";
  } | null;
};

interface BarbershopAdminFormProps {
  mode: "create" | "edit";
  barbershop?: FormBarbershop;
}

const parsePhonesInput = (value: string) => {
  return value
    .split(/[\n,;]+/)
    .map((phone) => phone.trim())
    .filter(Boolean);
};

const formatPhonesInput = (phones: string[]) => phones.join(", ");

const getValidationError = (validationErrors: unknown) => {
  const getFirstErrorFromNode = (value: unknown): string | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const errors = (value as { _errors?: unknown })._errors;

    if (Array.isArray(errors)) {
      const firstStringError = errors.find(
        (errorItem): errorItem is string =>
          typeof errorItem === "string" && errorItem.trim().length > 0,
      );

      if (firstStringError) {
        return firstStringError;
      }
    }

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const nestedError = getFirstErrorFromNode(nestedValue);

      if (nestedError) {
        return nestedError;
      }
    }

    return null;
  };

  return getFirstErrorFromNode(validationErrors);
};

const normalizeUploadUrlValue = (value: string | null) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
};

const BarbershopAdminForm = ({ mode, barbershop }: BarbershopAdminFormProps) => {
  const router = useRouter();
  const isEditMode = mode === "edit";

  const [name, setName] = useState(barbershop?.name ?? "");
  const [address, setAddress] = useState(barbershop?.address ?? "");
  const [description, setDescription] = useState(barbershop?.description ?? "");
  const [phonesText, setPhonesText] = useState(
    formatPhonesInput(barbershop?.phones ?? []),
  );
  const [imageUrl, setImageUrl] = useState<string | null>(barbershop?.imageUrl ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(barbershop?.logoUrl ?? null);
  const [slugInput, setSlugInput] = useState(barbershop?.slug ?? "");
  const [exclusiveBarber, setExclusiveBarber] = useState(
    barbershop?.exclusiveBarber ?? false,
  );
  const [stripeEnabled, setStripeEnabled] = useState(barbershop?.stripeEnabled ?? true);
  const [ownerIdInput, setOwnerIdInput] = useState(barbershop?.ownerId ?? "");
  const [plan, setPlan] = useState<"BASIC" | "PRO">(barbershop?.plan ?? "BASIC");
  const [whatsappProvider, setWhatsappProvider] = useState<"NONE" | "TWILIO">(
    barbershop?.whatsappProvider ?? "NONE",
  );
  const [whatsappFrom, setWhatsappFrom] = useState(barbershop?.whatsappFrom ?? "");
  const [whatsappEnabled, setWhatsappEnabled] = useState(
    barbershop?.whatsappEnabled ?? false,
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const { executeAsync: executeCreate, isPending: isCreating } = useAction(
    adminCreateBarbershopAction,
  );
  const { executeAsync: executeUpdate, isPending: isUpdating } = useAction(
    adminUpdateBarbershopAction,
  );

  const currentOwnerLabel = useMemo(() => {
    if (!barbershop?.owner) {
      return "Sem owner";
    }

    return `${barbershop.owner.name} (${barbershop.owner.email})`;
  }, [barbershop?.owner]);

  const normalizedSlug = normalizePublicSlug(slugInput.trim() || name.trim());
  const isSubmitting = isCreating || isUpdating || isUploadingImage || isUploadingLogo;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedPhones = parsePhonesInput(phonesText);

    if (!normalizedSlug) {
      toast.error("Informe um slug valido.");
      return;
    }

    if (parsedPhones.length === 0) {
      toast.error("Informe pelo menos um telefone.");
      return;
    }

    const payload = {
      name: name.trim(),
      address: address.trim(),
      description: description.trim(),
      imageUrl: normalizeUploadUrlValue(imageUrl),
      logoUrl: normalizeUploadUrlValue(logoUrl),
      phones: parsedPhones,
      slug: normalizedSlug,
      exclusiveBarber,
      stripeEnabled,
      ownerId: ownerIdInput.trim().length > 0 ? ownerIdInput.trim() : null,
      plan,
      whatsappProvider: plan === "PRO" ? whatsappProvider : "NONE",
      whatsappFrom: plan === "PRO" ? whatsappFrom.trim() || null : null,
      whatsappEnabled: plan === "PRO" ? whatsappEnabled : false,
    };

    if (!isEditMode) {
      const result = await executeCreate(payload);
      const validationError = getValidationError(result.validationErrors);

      if (validationError) {
        toast.error(validationError);
        return;
      }

      if (result.data && !result.data.ok) {
        toast.error(result.data.message);
        return;
      }

      if (result.serverError || !result.data?.ok) {
        toast.error("Falha ao criar barbearia.");
        return;
      }

      toast.success("Barbearia criada com sucesso.");
      router.push(`/admin/barbershops/${result.data.data.id}`);
      router.refresh();
      return;
    }

    if (!barbershop) {
      toast.error("Barbearia invalida.");
      return;
    }

    const result = await executeUpdate({
      ...payload,
      barbershopId: barbershop.id,
    });
    const validationError = getValidationError(result.validationErrors);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (result.data && !result.data.ok) {
      toast.error(result.data.message);
      return;
    }

    if (result.serverError || !result.data?.ok) {
      toast.error("Falha ao atualizar barbearia.");
      return;
    }

    const updatedBarbershop = result.data.data;

    setName(updatedBarbershop.name);
    setAddress(updatedBarbershop.address);
    setDescription(updatedBarbershop.description);
    setPhonesText(formatPhonesInput(updatedBarbershop.phones));
    setImageUrl(updatedBarbershop.imageUrl);
    setLogoUrl(updatedBarbershop.logoUrl);
    setSlugInput(updatedBarbershop.slug);
    setOwnerIdInput(updatedBarbershop.ownerId ?? "");
    setPlan(updatedBarbershop.plan);
    setWhatsappProvider(updatedBarbershop.whatsappProvider);
    setWhatsappFrom(updatedBarbershop.whatsappFrom ?? "");
    setWhatsappEnabled(updatedBarbershop.whatsappEnabled);
    setExclusiveBarber(updatedBarbershop.exclusiveBarber);
    setStripeEnabled(updatedBarbershop.stripeEnabled);

    toast.success("Barbearia atualizada com sucesso.");
    router.refresh();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {isEditMode && barbershop ? (
        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={barbershop.isActive ? "secondary" : "destructive"}>
              {barbershop.isActive ? "Ativa" : "Inativa"}
            </Badge>
            <BarbershopStatusToggle
              barbershopId={barbershop.id}
              isActive={barbershop.isActive}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-name">Nome</Label>
        <Input
          id="admin-barbershop-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSubmitting}
          placeholder="Nome da barbearia"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-address">Endereco</Label>
        <Input
          id="admin-barbershop-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          disabled={isSubmitting}
          placeholder="Rua, numero, bairro, cidade"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-description">Descricao</Label>
        <Textarea
          id="admin-barbershop-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={isSubmitting}
          placeholder="Descreva os diferenciais da barbearia"
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-phones">Telefones</Label>
        <Input
          id="admin-barbershop-phones"
          value={phonesText}
          onChange={(event) => setPhonesText(event.target.value)}
          disabled={isSubmitting}
          placeholder="(11) 99999-9999, (11) 98888-7777"
        />
        <p className="text-muted-foreground text-xs">
          Separe por virgula, ponto e virgula ou quebra de linha.
        </p>
      </div>

      <ImageUploader
        value={imageUrl}
        onChange={setImageUrl}
        label="Imagem principal"
        previewAlt={name.trim() || "Preview da barbearia"}
        barbershopId={barbershop?.id}
        disabled={isCreating || isUpdating}
        helperText="A imagem e enviada via UploadThing e salva como URL."
        emptyText="Sem imagem para preview."
        onUploadingChange={setIsUploadingImage}
      />

      <ImageUploader
        value={logoUrl}
        onChange={setLogoUrl}
        label="Logo (opcional)"
        previewAlt={name.trim() || "Preview da logo"}
        barbershopId={barbershop?.id}
        disabled={isCreating || isUpdating}
        helperText="A logo e enviada via UploadThing e salva como URL."
        emptyText="Sem logo para preview."
        onUploadingChange={setIsUploadingLogo}
      />

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-slug">Slug interno</Label>
        <Input
          id="admin-barbershop-slug"
          value={slugInput}
          onChange={(event) => setSlugInput(event.target.value)}
          disabled={isSubmitting}
          placeholder="minha-barbearia"
        />
        <p className="text-muted-foreground text-xs">Slug final: {normalizedSlug || "-"}</p>
      </div>

      {isEditMode && barbershop ? (
        <div className="space-y-2">
          <Label htmlFor="admin-barbershop-public-slug">Public slug (readonly)</Label>
          <Input
            id="admin-barbershop-public-slug"
            value={barbershop.publicSlug}
            readOnly
            disabled
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-owner-id">Owner ID (opcional)</Label>
        <Input
          id="admin-barbershop-owner-id"
          value={ownerIdInput}
          onChange={(event) => setOwnerIdInput(event.target.value)}
          disabled={isSubmitting}
          placeholder="UUID do owner (vazio remove owner)"
        />
        {isEditMode ? (
          <p className="text-muted-foreground text-xs">Owner atual: {currentOwnerLabel}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Se informado, o usuario sera promovido para OWNER desta barbearia.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-barbershop-plan">Plano</Label>
        <select
          id="admin-barbershop-plan"
          value={plan}
          onChange={(event) => {
            const selectedPlan = event.target.value === "PRO" ? "PRO" : "BASIC";
            setPlan(selectedPlan);

            if (selectedPlan === "BASIC") {
              setWhatsappProvider("NONE");
              setWhatsappEnabled(false);
              setWhatsappFrom("");
            } else if (whatsappProvider === "NONE") {
              setWhatsappProvider("TWILIO");
            }
          }}
          className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          disabled={isSubmitting}
        >
          <option value="BASIC">BASIC</option>
          <option value="PRO">PRO</option>
        </select>
      </div>

      {plan === "PRO" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="admin-whatsapp-provider">WhatsApp provider</Label>
            <select
              id="admin-whatsapp-provider"
              value={whatsappProvider}
              onChange={(event) =>
                setWhatsappProvider(event.target.value === "TWILIO" ? "TWILIO" : "NONE")
              }
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              disabled={isSubmitting}
            >
              <option value="NONE">NONE</option>
              <option value="TWILIO">TWILIO</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-whatsapp-from">WhatsApp from</Label>
            <Input
              id="admin-whatsapp-from"
              value={whatsappFrom}
              onChange={(event) => setWhatsappFrom(event.target.value)}
              disabled={isSubmitting}
              placeholder="whatsapp:+14155238886"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="admin-whatsapp-enabled"
              checked={whatsappEnabled}
              onCheckedChange={setWhatsappEnabled}
              disabled={isSubmitting}
            />
            <Label htmlFor="admin-whatsapp-enabled">whatsappEnabled</Label>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            id="admin-barbershop-exclusive-barber"
            checked={exclusiveBarber}
            onCheckedChange={setExclusiveBarber}
            disabled={isSubmitting}
          />
          <Label htmlFor="admin-barbershop-exclusive-barber">exclusiveBarber</Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="admin-barbershop-stripe-enabled"
            checked={stripeEnabled}
            onCheckedChange={setStripeEnabled}
            disabled={isSubmitting}
          />
          <Label htmlFor="admin-barbershop-stripe-enabled">stripeEnabled</Label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isSubmitting || !normalizedSlug}>
          {isSubmitting
            ? "Salvando..."
            : isEditMode
              ? "Salvar alteracoes"
              : "Criar barbearia"}
        </Button>

        {isEditMode && barbershop ? (
          <BarbershopDeleteButton
            barbershopId={barbershop.id}
            barbershopName={name || barbershop.name}
          />
        ) : null}
      </div>
    </form>
  );
};

export default BarbershopAdminForm;
