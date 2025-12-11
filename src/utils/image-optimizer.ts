import sharp from "sharp";

/**
 * Configurações padrão para otimização de imagens
 */
const DEFAULT_CONFIG = {
    maxWidth: 1200,
    maxHeight: 800,
    jpegQuality: 80,
    pngQuality: 85,
    webpQuality: 80,
} as const;

export type ImageOptimizeOptions = {
    maxWidth?: number;
    maxHeight?: number;
    jpegQuality?: number;
    pngQuality?: number;
    webpQuality?: number;
    format?: "jpeg" | "png" | "webp" | "auto";
};

export type OptimizedImage = {
    data: Uint8Array;
    mimeType: string;
    originalSize: number;
    optimizedSize: number;
    compressionRatio: number;
};

/**
 * Otimiza uma imagem reduzindo tamanho e qualidade mantendo boa aparência visual.
 * 
 * Estratégias aplicadas:
 * - Redimensionamento respeitando aspect ratio
 * - Compressão com qualidade ajustável
 * - Conversão para formato mais eficiente (opcional)
 * - Remove metadados EXIF
 */
export async function optimizeImage(
    imageData: Uint8Array,
    options: ImageOptimizeOptions = {}
): Promise<OptimizedImage> {
    const {
        maxWidth = DEFAULT_CONFIG.maxWidth,
        maxHeight = DEFAULT_CONFIG.maxHeight,
        jpegQuality = DEFAULT_CONFIG.jpegQuality,
        pngQuality = DEFAULT_CONFIG.pngQuality,
        webpQuality = DEFAULT_CONFIG.webpQuality,
        format = "auto",
    } = options;

    const originalSize = imageData.length;
    let pipeline = sharp(imageData);

    // Obter metadata da imagem original
    const metadata = await pipeline.metadata();
    const originalFormat = metadata.format;

    // Redimensionar mantendo aspect ratio (fit=inside garante que não ultrapasse limites)
    pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true, // Não aumenta se já for menor
    });

    // Remove metadados para reduzir tamanho
    pipeline = pipeline.rotate(); // Auto-rotaciona baseado em EXIF antes de remover

    // Determinar formato de saída
    let outputFormat: "jpeg" | "png" | "webp";
    if (format === "auto") {
        // Se original for PNG transparente, mantém PNG, senão converte para JPEG
        outputFormat = metadata.hasAlpha ? "png" : "jpeg";
    } else {
        outputFormat = format;
    }

    // Aplicar compressão específica do formato
    switch (outputFormat) {
        case "jpeg":
            pipeline = pipeline.jpeg({
                quality: jpegQuality,
                progressive: true,
                mozjpeg: true, // Usa mozjpeg para melhor compressão
            });
            break;
        case "png":
            pipeline = pipeline.png({
                quality: pngQuality,
                compressionLevel: 9,
                progressive: true,
            });
            break;
        case "webp":
            pipeline = pipeline.webp({
                quality: webpQuality,
                effort: 6, // 0-6, maior = melhor compressão mas mais lento
            });
            break;
    }

    const optimizedBuffer = await pipeline.toBuffer();
    const optimizedData = new Uint8Array(optimizedBuffer);
    const optimizedSize = optimizedData.length;
    const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

    const mimeType =
        outputFormat === "jpeg" ? "image/jpeg" :
            outputFormat === "png" ? "image/png" :
                "image/webp";

    return {
        data: optimizedData,
        mimeType,
        originalSize,
        optimizedSize,
        compressionRatio,
    };
}

/**
 * Formata tamanho de bytes em formato legível
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
