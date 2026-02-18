"use client";

import { updateBarbershopBranding } from "@/actions/update-barbershop-branding";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ImageOff, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type BrandingSettingsFormProps = {
  barbershopId: string;
  name: string;
  description: string;
  address: string;
  phones: string[];
  imageUrl: string;
  slug: string;
  shareLink: string;
};

const normalizeSlugValue = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

const parsePhonesInput = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((phone) => phone.trim())
    .filter(Boolean);

const formatPhonesInput = (phones: string[]) => phones.join(", ");

const BrandingSettingsForm = ({
  barbershopId,
  name,
  description,
  address,
  phones,
  imageUrl,
  slug,
  shareLink,
}: BrandingSettingsFormProps) => {
  const router = useRouter();
  const [nameInput, setNameInput] = useState(name);
  const [descriptionInput, setDescriptionInput] = useState(description);
  const [addressInput, setAddressInput] = useState(address);
  const [phonesInput, setPhonesInput] = useState(formatPhonesInput(phones));
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(
    imageUrl,
  );
  const [slugInput, setSlugInput] = useState(slug);
  const [isUploadingBackgroundImage, setIsUploadingBackgroundImage] =
    useState(false);

  const { executeAsync: executeUpdateBranding, isPending } = useAction(
    updateBarbershopBranding,
  );

  const isFormBusy = isPending || isUploadingBackgroundImage;
  const slugPreview = useMemo(() => normalizeSlugValue(slugInput), [slugInput]);

  const handleCopyShareLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    toast.success("Link copiado com sucesso.");
  };

  const handleBackgroundImageUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setIsUploadingBackgroundImage(true);

    const uploadFormData = new FormData();
    uploadFormData.append("barbershopId", barbershopId);
    uploadFormData.append("file", selectedFile);

    try {
      const uploadResponse = await fetch("/api/uploads/barbershops", {
        method: "POST",
        body: uploadFormData,
      });

      const uploadResponseData = (await uploadResponse.json()) as
        | {
            url?: string;
            error?: string;
          }
        | undefined;

      if (!uploadResponse.ok || !uploadResponseData?.url) {
        toast.error(
          uploadResponseData?.error ??
            "Erro ao enviar imagem de fundo. Tente novamente.",
        );
        return;
      }

      setBackgroundImageUrl(uploadResponseData.url);
      toast.success("Imagem de fundo enviada com sucesso.");
    } catch {
      toast.error("Erro ao enviar imagem de fundo. Tente novamente.");
    } finally {
      setIsUploadingBackgroundImage(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isUploadingBackgroundImage) {
      toast.error("Aguarde o envio da imagem do banner finalizar.");
      return;
    }

    if (!slugPreview) {
      toast.error("Informe um slug valido para a URL publica.");
      return;
    }

    const parsedPhones = parsePhonesInput(phonesInput);

    if (parsedPhones.length === 0) {
      toast.error("Informe pelo menos um telefone de contato.");
      return;
    }

    if (!backgroundImageUrl?.trim()) {
      toast.error("Envie uma imagem de banner para a barbearia.");
      return;
    }

    const result = await executeUpdateBranding({
      barbershopId,
      name: nameInput.trim(),
      description: descriptionInput.trim(),
      address: addressInput.trim(),
      phones: parsedPhones,
      imageUrl: backgroundImageUrl.trim(),
      slug: slugPreview,
    });

    if (result.validationErrors) {
      toast.error(result.validationErrors._errors?.[0] ?? "Dados invalidos.");
      return;
    }

    if (result.serverError || !result.data) {
      toast.error("Erro ao salvar configuracoes. Tente novamente.");
      return;
    }

    setNameInput(result.data.name);
    setDescriptionInput(result.data.description);
    setAddressInput(result.data.address);
    setPhonesInput(formatPhonesInput(result.data.phones));
    setBackgroundImageUrl(result.data.imageUrl);
    setSlugInput(result.data.slug);
    toast.success("Dados da barbearia atualizados com sucesso.");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da barbearia</CardTitle>
        <CardDescription>
          Atualize nome, descricao, endereco, contato e banner da barbearia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="barbershop-name" className="text-sm font-medium">
              Nome da barbearia
            </label>
            <Input
              id="barbershop-name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="Nome da barbearia"
              disabled={isFormBusy}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="barbershop-description" className="text-sm font-medium">
              Descricao
            </label>
            <Textarea
              id="barbershop-description"
              value={descriptionInput}
              onChange={(event) => setDescriptionInput(event.target.value)}
              placeholder="Descreva os diferenciais da sua barbearia"
              rows={4}
              disabled={isFormBusy}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="barbershop-address" className="text-sm font-medium">
              Endereco
            </label>
            <Input
              id="barbershop-address"
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
              placeholder="Rua, numero, bairro, cidade"
              disabled={isFormBusy}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="barbershop-phones" className="text-sm font-medium">
              Telefones de contato
            </label>
            <Input
              id="barbershop-phones"
              value={phonesInput}
              onChange={(event) => setPhonesInput(event.target.value)}
              placeholder="(11) 99999-9999, (11) 98888-7777"
              disabled={isFormBusy}
            />
            <p className="text-muted-foreground text-xs">
              Use virgula, ponto e virgula ou quebra de linha para separar.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="barbershop-background-upload"
              className="text-sm font-medium"
            >
              Banner da barbearia
            </label>
            <Input
              id="barbershop-background-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleBackgroundImageUpload}
              disabled={isFormBusy}
            />
            <p className="text-muted-foreground text-xs">
              O banner e enviado e convertido em URL no backend.
            </p>
            {backgroundImageUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setBackgroundImageUrl(null)}
                disabled={isFormBusy}
              >
                Remover banner
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Preview do banner</p>
            <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-lg border">
              {backgroundImageUrl ? (
                <Image
                  src={backgroundImageUrl}
                  alt={nameInput.trim() || "Preview do banner"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 48rem) 100vw, 36rem"
                />
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                  <ImageOff className="size-4" />
                  Sem banner para preview.
                </div>
              )}
              {isUploadingBackgroundImage ? (
                <div className="bg-background/80 absolute inset-0 flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Enviando banner...
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="barbershop-slug" className="text-sm font-medium">
              Slug publico
            </label>
            <Input
              id="barbershop-slug"
              value={slugInput}
              onChange={(event) => setSlugInput(event.target.value)}
              placeholder="minha-barbearia"
              disabled={isFormBusy}
            />
            <p className="text-muted-foreground text-xs">
              Esse slug e usado na rota por slug da barbearia.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="barbershop-share-link" className="text-sm font-medium">
              Link de compartilhamento
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="barbershop-share-link"
                value={shareLink}
                readOnly
                disabled={isFormBusy}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyShareLink}
                disabled={isFormBusy}
                className="gap-2"
              >
                <Copy className="size-4" />
                Copiar link
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={isFormBusy || !slugPreview}>
            Salvar dados da barbearia
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default BrandingSettingsForm;
