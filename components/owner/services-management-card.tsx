"use client";

import { createService } from "@/actions/create-service";
import { deleteService } from "@/actions/delete-service";
import { updateService } from "@/actions/update-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import ImageUploader from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Scissors, Timer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { memo, useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type ServiceListItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceInCents: number;
  durationInMinutes: number;
};

type ServicesManagementCardProps = {
  barbershopId: string;
  services: ServiceListItem[];
};

const serviceFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do servico.").max(80),
  description: z.string().trim().max(500).optional(),
  priceInReais: z
    .string()
    .trim()
    .min(1, "Informe o valor do servico.")
    .max(20, "Informe um valor valido."),
  durationInMinutes: z
    .number()
    .int("Informe um valor inteiro.")
    .min(5, "A duracao minima e de 5 minutos.")
    .max(240, "A duracao maxima e de 240 minutos."),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;

const DEFAULT_FORM_VALUES: ServiceFormValues = {
  name: "",
  description: "",
  priceInReais: "",
  durationInMinutes: 30,
};

const sortServicesByName = (services: ServiceListItem[]) => {
  return [...services].sort((firstService, secondService) =>
    firstService.name.localeCompare(secondService.name, "pt-BR", {
      sensitivity: "base",
    }),
  );
};

const toFormValues = (service: ServiceListItem): ServiceFormValues => ({
  name: service.name,
  description: service.description ?? "",
  priceInReais: (service.priceInCents / 100).toFixed(2).replace(".", ","),
  durationInMinutes: service.durationInMinutes,
});

const parseNumberInputValue = (value: string) => {
  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
};

const parsePriceInCents = (value: string) => {
  const normalizedValue = value.trim().replace(/\s+/g, "");

  if (!normalizedValue) {
    return null;
  }

  const valueWithDotDecimal = normalizedValue.includes(",")
    ? normalizedValue.replace(/\./g, "").replace(",", ".")
    : normalizedValue;
  const parsedPriceInReais = Number.parseFloat(valueWithDotDecimal);

  if (!Number.isFinite(parsedPriceInReais)) {
    return null;
  }

  const priceInCents = Math.round(parsedPriceInReais * 100);

  if (!Number.isInteger(priceInCents) || priceInCents < 0 || priceInCents > 1_000_000) {
    return null;
  }

  return priceInCents;
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

const getActionErrorMessage = (
  validationErrors: unknown,
  serverError: unknown,
  fallbackMessage: string,
) => {
  const validationErrorMessage = getValidationErrorMessage(validationErrors);

  if (validationErrorMessage) {
    return validationErrorMessage;
  }

  if (serverError) {
    return fallbackMessage;
  }

  return null;
};

type ServiceRowProps = {
  service: ServiceListItem;
  onEdit: (service: ServiceListItem) => void;
  onDelete: (service: ServiceListItem) => void;
};

const ServiceRow = memo(({ service, onEdit, onDelete }: ServiceRowProps) => {
  const handleEditClick = useCallback(() => {
    onEdit(service);
  }, [onEdit, service]);

  const handleDeleteClick = useCallback(() => {
    onDelete(service);
  }, [onDelete, service]);

  return (
    <TableRow>
      <TableCell>
        <div className="space-y-1">
          <p className="font-medium">{service.name}</p>
          <p className="text-muted-foreground text-xs">
            {service.description?.trim() || "Sem descricao."}
          </p>
          <Badge variant="secondary">
            {service.imageUrl ? "Com imagem" : "Sem imagem"}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{formatCurrency(service.priceInCents)}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="gap-1">
          <Timer className="size-3" />
          {service.durationInMinutes} min
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleEditClick}
          >
            <Pencil className="size-3.5" />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={handleDeleteClick}
          >
            <Trash2 className="size-3.5" />
            Remover
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

ServiceRow.displayName = "ServiceRow";

const ServicesManagementCard = ({
  barbershopId,
  services,
}: ServicesManagementCardProps) => {
  const router = useRouter();
  const serviceList = useMemo(() => sortServicesByName(services), [services]);
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [serviceInEdition, setServiceInEdition] = useState<ServiceListItem | null>(
    null,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceListItem | null>(
    null,
  );
  const [serviceImageUrl, setServiceImageUrl] = useState<string | null>(null);
  const [isUploadingServiceImage, setIsUploadingServiceImage] = useState(false);

  const serviceForm = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const { executeAsync: executeCreateService, isPending: isCreatingService } =
    useAction(createService);
  const { executeAsync: executeUpdateService, isPending: isUpdatingService } =
    useAction(updateService);
  const { executeAsync: executeDeleteService, isPending: isDeletingService } =
    useAction(deleteService);

  const isSavingService = isCreatingService || isUpdatingService;
  const isServiceFormBusy = isSavingService || isUploadingServiceImage;

  const handleCreateClick = useCallback(() => {
    setServiceInEdition(null);
    setServiceImageUrl(null);
    serviceForm.reset(DEFAULT_FORM_VALUES);
    setIsServiceFormOpen(true);
  }, [serviceForm]);

  const handleEditClick = useCallback(
    (service: ServiceListItem) => {
      setServiceInEdition(service);
      setServiceImageUrl(service.imageUrl);
      serviceForm.reset(toFormValues(service));
      setIsServiceFormOpen(true);
    },
    [serviceForm],
  );

  const handleDeleteClick = useCallback((service: ServiceListItem) => {
    setServiceToDelete(service);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleServiceFormOpenChange = (open: boolean) => {
    if (!open && isServiceFormBusy) {
      return;
    }

    setIsServiceFormOpen(open);

    if (!open) {
      setServiceInEdition(null);
      setServiceImageUrl(null);
      serviceForm.reset(DEFAULT_FORM_VALUES);
    }
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!open && isDeletingService) {
      return;
    }

    setIsDeleteDialogOpen(open);

    if (!open) {
      setServiceToDelete(null);
    }
  };

  const handleServiceSubmit = async (values: ServiceFormValues) => {
    if (isUploadingServiceImage) {
      toast.error("Aguarde o envio da imagem finalizar.");
      return;
    }

    const priceInCents = parsePriceInCents(values.priceInReais);

    if (priceInCents === null) {
      serviceForm.setError("priceInReais", {
        message: "Informe um valor valido. Exemplo: 29,90.",
      });
      toast.error("Informe um valor valido para o servico.");
      return;
    }

    if (serviceInEdition) {
      const updateResult = await executeUpdateService({
        serviceId: serviceInEdition.id,
        name: values.name.trim(),
        description: values.description?.trim(),
        imageUrl: serviceImageUrl ?? null,
        priceInCents,
        durationInMinutes: values.durationInMinutes,
      });

      const updateErrorMessage = getActionErrorMessage(
        updateResult.validationErrors,
        updateResult.serverError,
        "Erro ao atualizar servico. Tente novamente.",
      );

      if (updateErrorMessage) {
        toast.error(updateErrorMessage);
        return;
      }

      if (!updateResult.data) {
        toast.error("Erro ao atualizar servico. Tente novamente.");
        return;
      }

      setIsServiceFormOpen(false);
      setServiceInEdition(null);
      setServiceImageUrl(null);
      serviceForm.reset(DEFAULT_FORM_VALUES);
      toast.success("Servico atualizado com sucesso.");
      router.refresh();
      return;
    }

    const createResult = await executeCreateService({
      barbershopId,
      name: values.name.trim(),
      description: values.description?.trim(),
      imageUrl: serviceImageUrl ?? null,
      priceInCents,
      durationInMinutes: values.durationInMinutes,
    });

    const createErrorMessage = getActionErrorMessage(
      createResult.validationErrors,
      createResult.serverError,
      "Erro ao criar servico. Tente novamente.",
    );

    if (createErrorMessage) {
      toast.error(createErrorMessage);
      return;
    }

    if (!createResult.data) {
      toast.error("Erro ao criar servico. Tente novamente.");
      return;
    }

    setIsServiceFormOpen(false);
    setServiceInEdition(null);
    setServiceImageUrl(null);
    serviceForm.reset(DEFAULT_FORM_VALUES);
    toast.success("Servico criado com sucesso.");
    router.refresh();
  };

  const handleDeleteConfirm = async () => {
    if (!serviceToDelete) {
      return;
    }

    const deleteResult = await executeDeleteService({
      serviceId: serviceToDelete.id,
    });

    const deleteErrorMessage = getActionErrorMessage(
      deleteResult.validationErrors,
      deleteResult.serverError,
      "Erro ao remover servico. Tente novamente.",
    );

    if (deleteErrorMessage) {
      toast.error(deleteErrorMessage);
      return;
    }

    setIsDeleteDialogOpen(false);
    setServiceToDelete(null);
    toast.success("Servico removido com sucesso.");
    router.refresh();
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Gerenciar servicos</CardTitle>
              <CardDescription>
                Crie, edite e remova servicos da sua barbearia.
              </CardDescription>
            </div>
            <Button onClick={handleCreateClick} className="gap-2">
              <Plus className="size-4" />
              Novo servico
            </Button>
          </div>
          <Separator />
        </CardHeader>
        <CardContent className="space-y-4">
          {serviceList.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servico</TableHead>
                  <TableHead>Preco</TableHead>
                  <TableHead>Duracao</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceList.map((service) => (
                  <ServiceRow
                    key={service.id}
                    service={service}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
              <Badge variant="secondary" className="gap-1">
                <Scissors className="size-3" />
                Nenhum servico cadastrado
              </Badge>
              <p className="text-muted-foreground text-sm">
                Clique em &quot;Novo servico&quot; para cadastrar o primeiro servico.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isServiceFormOpen} onOpenChange={handleServiceFormOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {serviceInEdition ? "Editar servico" : "Novo servico"}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do servico e salve para atualizar sua listagem.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <Form {...serviceForm}>
            <form
              onSubmit={serviceForm.handleSubmit(handleServiceSubmit)}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={serviceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex.: Corte completo"
                          {...field}
                          disabled={isServiceFormBusy}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={serviceForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Descricao (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Descricao curta do servico"
                          {...field}
                          value={field.value ?? ""}
                          disabled={isServiceFormBusy}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="md:col-span-2">
                  <ImageUploader
                    value={serviceImageUrl}
                    onChange={setServiceImageUrl}
                    label="Imagem (opcional)"
                    barbershopId={barbershopId}
                    disabled={isSavingService}
                    helperText="A imagem e enviada via UploadThing e salva como URL."
                    emptyText="Sem imagem para preview."
                    onUploadingChange={setIsUploadingServiceImage}
                  />
                </div>

                <FormField
                  control={serviceForm.control}
                  name="priceInReais"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex.: 29,90"
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          disabled={isServiceFormBusy}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={serviceForm.control}
                  name="durationInMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duracao (minutos)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={5}
                          max={240}
                          step={5}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(parseNumberInputValue(event.target.value))
                          }
                          disabled={isServiceFormBusy}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isServiceFormBusy}
                  >
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isServiceFormBusy}>
                  {isSavingService ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Salvando...
                    </>
                  ) : serviceInEdition ? (
                    "Salvar alteracoes"
                  ) : (
                    "Criar servico"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Remover servico</DialogTitle>
            <DialogDescription>
              {serviceToDelete
                ? `Tem certeza que deseja remover "${serviceToDelete.name}"?`
                : "Confirme para remover este servico."}
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isDeletingService}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeletingService}
            >
              {isDeletingService ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ServicesManagementCard;
