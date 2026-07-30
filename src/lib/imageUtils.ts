/**
 * Utilitários de validação e redimensionamento de imagens no cliente.
 * Motivo: evitar subir arquivos gigantes ao storage e padronizar dimensões.
 */

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
}

/** Valida tipo MIME e tamanho máximo (em MB). */
export const validateImageFile = (file: File, maxMB = 5): ImageValidationResult => {
  if (!file) return { ok: false, error: "Nenhum arquivo selecionado" };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { ok: false, error: "Formato inválido. Use JPG, PNG, WEBP ou GIF." };
  }
  if (file.size > maxMB * 1024 * 1024) {
    return { ok: false, error: `Imagem muito grande (máx ${maxMB}MB)` };
  }
  return { ok: true };
};

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: "image/webp" | "image/jpeg" | "image/png";
}

/**
 * Redimensiona mantendo a proporção. Retorna o arquivo original quando
 * o navegador não suporta canvas ou quando o formato é GIF (animação).
 */
export const resizeImage = async (file: File, opts: ResizeOptions = {}): Promise<File> => {
  const { maxWidth = 512, maxHeight = 512, quality = 0.9, mimeType = "image/webp" } = opts;

  if (file.type === "image/gif") return file;

  try {
    const bitmapUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível ler a imagem"));
      el.src = bitmapUrl;
    });

    const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(bitmapUrl);
      return file;
    }
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(bitmapUrl);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, quality),
    );
    if (!blob) return file;

    const ext = mimeType.split("/")[1];
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.${ext}`, { type: mimeType });
  } catch {
    // Falha no redimensionamento não deve bloquear o upload.
    return file;
  }
};
