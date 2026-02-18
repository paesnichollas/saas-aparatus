"use client";

import { ownerSetFeaturedServices } from "@/actions/owner-set-featured-services";
import { ownerUpdateHomePremium } from "@/actions/owner-update-home-premium";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { KeyboardEvent, useMemo, useState } from "react";
import { toast } from "sonner";

type FeaturedServiceItem = {
  id: string;
  name: string;
  isFeatured: boolean;
};

type ExclusiveHomeCustomizationCardProps = {
  homePremiumTitle: string;
  homePremiumDescription: string;
  homePremiumChips: string[];
  services: FeaturedServiceItem[];
};

const getValidationErrorMessage = (validationErrors: unknown) => {
  if (!validationErrors || typeof validationErrors !== "object") {
    return null;
  }

  const rootErrors = (validationErrors as { _errors?: unknown })._errors;
  if (Array.isArray(rootErrors) && typeof rootErrors[0] === "string") {
    return rootErrors[0];
  }

  return null;
};

const normalizeChip = (value: string) => value.trim();

const ExclusiveHomeCustomizationCard = ({
  homePremiumTitle,
  homePremiumDescription,
  homePremiumChips,
  services,
}: ExclusiveHomeCustomizationCardProps) => {
  const router = useRouter();
  const [titleInput, setTitleInput] = useState(homePremiumTitle);
  const [descriptionInput, setDescriptionInput] = useState(homePremiumDescription);
  const [chips, setChips] = useState(homePremiumChips);
  const [chipInput, setChipInput] = useState("");
  const [featuredServiceIds, setFeaturedServiceIds] = useState(
    services.filter((service) => service.isFeatured).map((service) => service.id),
  );
  const featuredServiceIdsSet = useMemo(
    () => new Set(featuredServiceIds),
    [featuredServiceIds],
  );

  const { executeAsync: executeUpdateHomePremium, isPending: isSavingHomePremium } =
    useAction(ownerUpdateHomePremium);
  const { executeAsync: executeSetFeaturedServices, isPending: isSavingFeatured } =
    useAction(ownerSetFeaturedServices);

  const handleAddChip = () => {
    const normalizedChip = normalizeChip(chipInput);
    if (!normalizedChip) {
      return;
    }

    const hasChipWithSameName = chips.some(
      (chip) => chip.toLowerCase() === normalizedChip.toLowerCase(),
    );

    if (hasChipWithSameName) {
      toast.error("Essa tag ja foi adicionada.");
      return;
    }

    if (chips.length >= 8) {
      toast.error("Voce pode adicionar no maximo 8 tags.");
      return;
    }

    setChips((previousChips) => [...previousChips, normalizedChip]);
    setChipInput("");
  };

  const handleChipInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleAddChip();
  };

  const handleRemoveChip = (chipToRemove: string) => {
    setChips((previousChips) => previousChips.filter((chip) => chip !== chipToRemove));
  };

  const handleSaveHomePremium = async () => {
    if (chips.length === 0) {
      toast.error("Adicione ao menos uma tag.");
      return;
    }

    const result = await executeUpdateHomePremium({
      title: titleInput.trim(),
      description: descriptionInput.trim(),
      chips,
    });

    const validationErrorMessage = getValidationErrorMessage(result.validationErrors);
    if (validationErrorMessage) {
      toast.error(validationErrorMessage);
      return;
    }

    if (result.serverError || !result.data) {
      toast.error("Erro ao salvar personalizacao da home.");
      return;
    }

    setTitleInput(result.data.homePremiumTitle);
    setDescriptionInput(result.data.homePremiumDescription);
    setChips(result.data.homePremiumChips);
    toast.success("Personalizacao da home salva com sucesso.");
    router.refresh();
  };

  const handleFeaturedServiceToggle = (serviceId: string, checked: boolean) => {
    setFeaturedServiceIds((previousIds) => {
      if (checked) {
        if (previousIds.includes(serviceId)) {
          return previousIds;
        }

        return [...previousIds, serviceId];
      }

      return previousIds.filter((id) => id !== serviceId);
    });
  };

  const handleSaveFeaturedServices = async () => {
    const result = await executeSetFeaturedServices({
      serviceIds: featuredServiceIds,
    });

    const validationErrorMessage = getValidationErrorMessage(result.validationErrors);
    if (validationErrorMessage) {
      toast.error(validationErrorMessage);
      return;
    }

    if (result.serverError || !result.data) {
      toast.error("Erro ao salvar servicos em destaque.");
      return;
    }

    setFeaturedServiceIds(result.data.featuredServiceIds);
    toast.success("Servicos em destaque atualizados.");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personalizar Home (Exclusive)</CardTitle>
        <CardDescription>
          Edite o card premium e escolha quais servicos aparecem em destaque na
          home exclusiva.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="home-premium-title" className="text-sm font-medium">
              Titulo do card premium
            </label>
            <Input
              id="home-premium-title"
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              placeholder="Experiencia premium na home"
              disabled={isSavingHomePremium}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="home-premium-description" className="text-sm font-medium">
              Descricao do card premium
            </label>
            <Textarea
              id="home-premium-description"
              value={descriptionInput}
              onChange={(event) => setDescriptionInput(event.target.value)}
              placeholder="Descreva os diferenciais da sua experiencia exclusiva."
              rows={4}
              disabled={isSavingHomePremium}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="home-premium-chip-input" className="text-sm font-medium">
              Tags do card premium
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="home-premium-chip-input"
                value={chipInput}
                onChange={(event) => setChipInput(event.target.value)}
                onKeyDown={handleChipInputKeyDown}
                placeholder="Ex.: Atendimento personalizado"
                disabled={isSavingHomePremium}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddChip}
                disabled={isSavingHomePremium || chipInput.trim().length === 0}
                className="gap-2"
              >
                <Plus className="size-4" />
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Badge key={chip} variant="outline" className="gap-1">
                  {chip}
                  <button
                    type="button"
                    aria-label={`Remover tag ${chip}`}
                    onClick={() => handleRemoveChip(chip)}
                    disabled={isSavingHomePremium}
                    className="focus-visible:ring-ring/50 inline-flex rounded-sm outline-none focus-visible:ring-[0.1875rem] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <Button
            type="button"
            onClick={handleSaveHomePremium}
            disabled={isSavingHomePremium}
            className="gap-2"
          >
            {isSavingHomePremium ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar personalizacao
          </Button>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Servicos em destaque</h3>
            <p className="text-muted-foreground text-sm">
              Selecione manualmente os servicos que aparecerao em destaque na
              home exclusiva.
            </p>
          </div>

          {services.length > 0 ? (
            <div className="space-y-3">
              {services.map((service) => {
                const switchId = `featured-service-${service.id}`;

                return (
                  <div
                    key={service.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <label htmlFor={switchId} className="text-sm font-medium">
                      {service.name}
                    </label>
                    <Switch
                      id={switchId}
                      checked={featuredServiceIdsSet.has(service.id)}
                      onCheckedChange={(checked) =>
                        handleFeaturedServiceToggle(service.id, checked)
                      }
                      disabled={isSavingFeatured}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum servico disponivel para destaque.
            </p>
          )}

          <Button
            type="button"
            onClick={handleSaveFeaturedServices}
            disabled={isSavingFeatured}
            className="gap-2"
          >
            {isSavingFeatured ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvar servicos em destaque
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExclusiveHomeCustomizationCard;
