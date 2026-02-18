"use client";

import { ImageOff, Loader2 } from "lucide-react";
import Image from "next/image";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { IMAGE_UPLOADER_ENDPOINT } from "@/lib/uploadthing-endpoints";
import { useUploadThing } from "@/lib/uploadthing-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImageUploaderProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  disabled?: boolean;
  helperText?: string;
  emptyText?: string;
  previewAlt?: string;
  barbershopId?: string;
  onUploadingChange?: (isUploading: boolean) => void;
}

const getStringValue = (value: unknown) => {
  return typeof value === "string" && value.length > 0 ? value : null;
};

const getUploadedUrl = (uploadedFile: unknown) => {
  if (!uploadedFile || typeof uploadedFile !== "object") {
    return null;
  }

  const fileData = uploadedFile as {
    ufsUrl?: unknown;
    url?: unknown;
    serverData?: unknown;
  };
  const serverData =
    fileData.serverData && typeof fileData.serverData === "object"
      ? (fileData.serverData as { ufsUrl?: unknown; url?: unknown })
      : null;

  return (
    getStringValue(fileData.ufsUrl) ??
    getStringValue(fileData.url) ??
    getStringValue(serverData?.ufsUrl) ??
    getStringValue(serverData?.url)
  );
};

const ImageUploader = ({
  value,
  onChange,
  label,
  disabled = false,
  helperText = "Selecione uma imagem do dispositivo para enviar.",
  emptyText = "Sem imagem para preview.",
  previewAlt,
  onUploadingChange,
}: ImageUploaderProps) => {
  const inputId = useId();
  const [isUploading, setIsUploading] = useState(false);
  const hasAppliedUploadUrlRef = useRef(false);
  const hasUploadErrorRef = useRef(false);

  const applyUploadedUrl = useCallback(
    (uploadedFiles: unknown, source: "callback" | "await") => {
      if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
        return false;
      }

      const uploadedUrl = getUploadedUrl(uploadedFiles[0]);

      if (!uploadedUrl) {
        console.error("UploadThing response missing image URL.", {
          source,
          uploadedFiles,
        });
        return false;
      }

      onChange(uploadedUrl);
      toast.success("Imagem enviada com sucesso.");
      return true;
    },
    [onChange],
  );

  const { startUpload } = useUploadThing(IMAGE_UPLOADER_ENDPOINT, {
    onUploadBegin: () => {
      hasAppliedUploadUrlRef.current = false;
      hasUploadErrorRef.current = false;
      setIsUploading(true);
    },
    onClientUploadComplete: (uploadedFiles) => {
      if (hasAppliedUploadUrlRef.current) {
        setIsUploading(false);
        return;
      }

      const hasAppliedUrl = applyUploadedUrl(uploadedFiles, "callback");
      hasAppliedUploadUrlRef.current = hasAppliedUrl;
      setIsUploading(false);
    },
    onUploadError: (error) => {
      hasUploadErrorRef.current = true;
      setIsUploading(false);
      toast.error(error.message || "Erro ao enviar imagem.");
    },
  });

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    try {
      hasAppliedUploadUrlRef.current = false;
      hasUploadErrorRef.current = false;
      setIsUploading(true);

      const uploadedFiles = await startUpload([selectedFile]);

      if (hasAppliedUploadUrlRef.current) {
        return;
      }

      const hasAppliedUrl = applyUploadedUrl(uploadedFiles, "await");
      hasAppliedUploadUrlRef.current = hasAppliedUrl;

      if (!hasAppliedUrl) {
        console.error("UploadThing startUpload resolved without image URL.", {
          uploadedFiles,
        });
        toast.error("Nao foi possivel obter a URL da imagem enviada.");
      }
    } catch {
      if (!hasUploadErrorRef.current) {
        toast.error("Erro ao enviar imagem.");
      }
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const isComponentDisabled = disabled || isUploading;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={handleFileChange}
        disabled={isComponentDisabled}
      />
      <p className="text-muted-foreground text-xs">{helperText}</p>

      {value ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(null)}
          disabled={isComponentDisabled}
        >
          Remover imagem
        </Button>
      ) : null}

      <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-lg border">
        {value ? (
          <Image
            src={value}
            alt={previewAlt ?? label}
            fill
            className="object-cover"
            sizes="(max-width: 48rem) 100vw, 36rem"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
            <ImageOff className="size-4" />
            {emptyText}
          </div>
        )}

        {isUploading ? (
          <div className="bg-background/80 absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Enviando imagem...
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ImageUploader;
