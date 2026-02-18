"use client";

import { createBarber } from "@/actions/create-barber";
import { deleteBarber } from "@/actions/delete-barber";
import { updateBarber } from "@/actions/update-barber";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageOff, Loader2, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ChangeEvent, memo, useCallback, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type BarberListItem = {
  id: string;
  name: string;
  imageUrl: string | null;
};

type BarbersManagementCardProps = {
  barbershopId: string;
  barbers: BarberListItem[];
};

const barberFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do barbeiro.").max(80),
});

type BarberFormValues = z.infer<typeof barberFormSchema>;

const DEFAULT_FORM_VALUES: BarberFormValues = {
  name: "",
};

const sortBarbersByName = (barbers: BarberListItem[]) => {
  return [...barbers].sort((firstBarber, secondBarber) =>
    firstBarber.name.localeCompare(secondBarber.name, "pt-BR", {
      sensitivity: "base",
    }),
  );
};

const toFormValues = (barber: BarberListItem): BarberFormValues => ({
  name: barber.name,
});

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

const getBarberInitials = (name: string) => {
  const nameParts = name.trim().split(/\s+/);
  const initials = nameParts.slice(0, 2).map((namePart) => namePart[0] ?? "");
  return initials.join("").toUpperCase();
};

type BarberRowProps = {
  barber: BarberListItem;
  onEdit: (barber: BarberListItem) => void;
  onDelete: (barber: BarberListItem) => void;
};

const BarberRow = memo(({ barber, onEdit, onDelete }: BarberRowProps) => {
  const handleEditClick = useCallback(() => {
    onEdit(barber);
  }, [onEdit, barber]);

  const handleDeleteClick = useCallback(() => {
    onDelete(barber);
  }, [onDelete, barber]);

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{barber.name}</p>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarImage src={barber.imageUrl ?? undefined} />
            <AvatarFallback>{getBarberInitials(barber.name)}</AvatarFallback>
          </Avatar>
          <Badge variant="secondary">
            {barber.imageUrl ? "Com foto" : "Sem foto"}
          </Badge>
        </div>
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

BarberRow.displayName = "BarberRow";

const BarbersManagementCard = ({
  barbershopId,
  barbers,
}: BarbersManagementCardProps) => {
  const router = useRouter();
  const barberList = useMemo(() => sortBarbersByName(barbers), [barbers]);
  const [isBarberFormOpen, setIsBarberFormOpen] = useState(false);
  const [barberInEdition, setBarberInEdition] = useState<BarberListItem | null>(
    null,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [barberToDelete, setBarberToDelete] = useState<BarberListItem | null>(null);
  const [barberImageUrl, setBarberImageUrl] = useState<string | null>(null);
  const [isUploadingBarberImage, setIsUploadingBarberImage] = useState(false);

  const barberForm = useForm<BarberFormValues>({
    resolver: zodResolver(barberFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const watchedBarberName = useWatch({
    control: barberForm.control,
    name: "name",
  });

  const { executeAsync: executeCreateBarber, isPending: isCreatingBarber } =
    useAction(createBarber);
  const { executeAsync: executeUpdateBarber, isPending: isUpdatingBarber } =
    useAction(updateBarber);
  const { executeAsync: executeDeleteBarber, isPending: isDeletingBarber } =
    useAction(deleteBarber);

  const isSavingBarber = isCreatingBarber || isUpdatingBarber;
  const isBarberFormBusy = isSavingBarber || isUploadingBarberImage;

  const handleCreateClick = useCallback(() => {
    setBarberInEdition(null);
    setBarberImageUrl(null);
    barberForm.reset(DEFAULT_FORM_VALUES);
    setIsBarberFormOpen(true);
  }, [barberForm]);

  const handleEditClick = useCallback((barber: BarberListItem) => {
    setBarberInEdition(barber);
    setBarberImageUrl(barber.imageUrl);
    barberForm.reset(toFormValues(barber));
    setIsBarberFormOpen(true);
  }, [barberForm]);

  const handleDeleteClick = useCallback((barber: BarberListItem) => {
    setBarberToDelete(barber);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleBarberFormOpenChange = (open: boolean) => {
    if (!open && isBarberFormBusy) {
      return;
    }

    setIsBarberFormOpen(open);

    if (!open) {
      setBarberInEdition(null);
      setBarberImageUrl(null);
      barberForm.reset(DEFAULT_FORM_VALUES);
    }
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (!open && isDeletingBarber) {
      return;
    }

    setIsDeleteDialogOpen(open);

    if (!open) {
      setBarberToDelete(null);
    }
  };

  const handleBarberImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setIsUploadingBarberImage(true);

    const uploadFormData = new FormData();
    uploadFormData.append("barbershopId", barbershopId);
    uploadFormData.append("file", selectedFile);

    try {
      const uploadResponse = await fetch("/api/uploads/services", {
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
          uploadResponseData?.error ?? "Erro ao enviar imagem. Tente novamente.",
        );
        return;
      }

      setBarberImageUrl(uploadResponseData.url);
      toast.success("Imagem enviada com sucesso.");
    } catch {
      toast.error("Erro ao enviar imagem. Tente novamente.");
    } finally {
      setIsUploadingBarberImage(false);
      event.target.value = "";
    }
  };

  const handleBarberSubmit = async (values: BarberFormValues) => {
    if (isUploadingBarberImage) {
      toast.error("Aguarde o envio da imagem finalizar.");
      return;
    }

    const imageUrl = barberImageUrl;

    if (barberInEdition) {
      const updateResult = await executeUpdateBarber({
        barberId: barberInEdition.id,
        name: values.name.trim(),
        imageUrl,
      });

      const updateErrorMessage = getActionErrorMessage(
        updateResult.validationErrors,
        updateResult.serverError,
        "Erro ao atualizar barbeiro. Tente novamente.",
      );

      if (updateErrorMessage) {
        toast.error(updateErrorMessage);
        return;
      }

      if (!updateResult.data) {
        toast.error("Erro ao atualizar barbeiro. Tente novamente.");
        return;
      }

      setIsBarberFormOpen(false);
      setBarberInEdition(null);
      barberForm.reset(DEFAULT_FORM_VALUES);
      toast.success("Barbeiro atualizado com sucesso.");
      router.refresh();
      return;
    }

    const createResult = await executeCreateBarber({
      barbershopId,
      name: values.name.trim(),
      imageUrl,
    });

    const createErrorMessage = getActionErrorMessage(
      createResult.validationErrors,
      createResult.serverError,
      "Erro ao criar barbeiro. Tente novamente.",
    );

    if (createErrorMessage) {
      toast.error(createErrorMessage);
      return;
    }

    if (!createResult.data) {
      toast.error("Erro ao criar barbeiro. Tente novamente.");
      return;
    }

    setIsBarberFormOpen(false);
    setBarberInEdition(null);
    barberForm.reset(DEFAULT_FORM_VALUES);
    toast.success("Barbeiro criado com sucesso.");
    router.refresh();
  };

  const handleDeleteConfirm = async () => {
    if (!barberToDelete) {
      return;
    }

    const deleteResult = await executeDeleteBarber({
      barberId: barberToDelete.id,
    });

    const deleteErrorMessage = getActionErrorMessage(
      deleteResult.validationErrors,
      deleteResult.serverError,
      "Erro ao remover barbeiro. Tente novamente.",
    );

    if (deleteErrorMessage) {
      toast.error(deleteErrorMessage);
      return;
    }

    setIsDeleteDialogOpen(false);
    setBarberToDelete(null);
    toast.success("Barbeiro removido com sucesso.");
    router.refresh();
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Gerenciar barbeiros</CardTitle>
              <CardDescription>
                Cadastre e mantenha os barbeiros disponiveis para agendamentos.
              </CardDescription>
            </div>
            <Button onClick={handleCreateClick} className="gap-2">
              <Plus className="size-4" />
              Novo barbeiro
            </Button>
          </div>
          <Separator />
        </CardHeader>
        <CardContent className="space-y-4">
          {barberList.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barbeiro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {barberList.map((barber) => (
                  <BarberRow
                    key={barber.id}
                    barber={barber}
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
                Nenhum barbeiro cadastrado
              </Badge>
              <p className="text-muted-foreground text-sm">
                Clique em &quot;Novo barbeiro&quot; para cadastrar o primeiro.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isBarberFormOpen} onOpenChange={handleBarberFormOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {barberInEdition ? "Editar barbeiro" : "Novo barbeiro"}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do barbeiro para disponibiliza-lo no agendamento.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <Form {...barberForm}>
            <form
              onSubmit={barberForm.handleSubmit(handleBarberSubmit)}
              className="space-y-4"
            >
              <FormField
                control={barberForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex.: Rafael Lima"
                        {...field}
                        disabled={isBarberFormBusy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <label htmlFor="barber-image-upload" className="text-sm font-medium">
                  Imagem (opcional)
                </label>
                <Input
                  id="barber-image-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleBarberImageUpload}
                  disabled={isBarberFormBusy}
                />
                <p className="text-muted-foreground text-xs">
                  A imagem e enviada e convertida em URL no backend.
                </p>
                {barberImageUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBarberImageUrl(null)}
                    disabled={isBarberFormBusy}
                  >
                    Remover imagem
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Preview</p>
                <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-lg border">
                  {barberImageUrl ? (
                    <Image
                      src={barberImageUrl}
                      alt={watchedBarberName?.trim() || "Preview do barbeiro"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 48rem) 100vw, 36rem"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                      <ImageOff className="size-4" />
                      Sem imagem para preview.
                    </div>
                  )}
                  {isUploadingBarberImage ? (
                    <div className="bg-background/80 absolute inset-0 flex items-center justify-center gap-2 text-sm">
                      <Loader2 className="size-4 animate-spin" />
                      Enviando imagem...
                    </div>
                  ) : null}
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBarberFormBusy}>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isBarberFormBusy}>
                  {isSavingBarber ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Salvando...
                    </>
                  ) : barberInEdition ? (
                    "Salvar alteracoes"
                  ) : (
                    "Criar barbeiro"
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
            <DialogTitle>Remover barbeiro</DialogTitle>
            <DialogDescription>
              {barberToDelete
                ? `Tem certeza que deseja remover "${barberToDelete.name}"?`
                : "Confirme para remover este barbeiro."}
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isDeletingBarber}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeletingBarber}
            >
              {isDeletingBarber ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BarbersManagementCard;
