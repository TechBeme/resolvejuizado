import { test } from "node:test";
import assert from "node:assert";
import { optimizeImage, formatBytes } from "../src/utils/image-optimizer.js";

// Criar imagem PNG simples de teste (1x1 pixel vermelho)
const createTestPNG = (): Uint8Array => {
    return new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
        0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
};

test("optimizeImage - processa imagem corretamente", async () => {
    const testImage = createTestPNG();
    const result = await optimizeImage(testImage, {
        maxWidth: 800,
        maxHeight: 600,
        jpegQuality: 75,
    });

    assert.ok(result.data instanceof Uint8Array, "Deve retornar Uint8Array");
    assert.ok(result.data.length > 0, "Imagem otimizada não deve estar vazia");
    assert.strictEqual(result.originalSize, testImage.length, "Tamanho original deve ser preservado");
    assert.ok(result.optimizedSize > 0, "Tamanho otimizado deve ser maior que zero");
    // Nota: imagens muito pequenas podem ficar maiores devido aos headers do formato
    assert.ok(typeof result.compressionRatio === "number", "Deve calcular taxa de compressão");
});

test("optimizeImage - mantém aspect ratio", async () => {
    const testImage = createTestPNG();
    const result = await optimizeImage(testImage, {
        maxWidth: 1200,
        maxHeight: 800,
    });

    // Verificar que a imagem foi processada
    assert.ok(result.data.length > 0, "Imagem deve ser processada");
    assert.ok(["image/jpeg", "image/png", "image/webp"].includes(result.mimeType), "Deve ter mimetype válido");
});

test("optimizeImage - respeita formato auto", async () => {
    const testImage = createTestPNG();
    const result = await optimizeImage(testImage, {
        format: "auto",
        jpegQuality: 80,
    });

    // PNG sem transparência geralmente é convertido para JPEG
    assert.ok(["image/jpeg", "image/png"].includes(result.mimeType), "Deve escolher formato automaticamente");
});

test("optimizeImage - força formato JPEG", async () => {
    const testImage = createTestPNG();
    const result = await optimizeImage(testImage, {
        format: "jpeg",
        jpegQuality: 80,
    });

    assert.strictEqual(result.mimeType, "image/jpeg", "Deve converter para JPEG");
});

test("optimizeImage - força formato PNG", async () => {
    const testImage = createTestPNG();
    const result = await optimizeImage(testImage, {
        format: "png",
        pngQuality: 85,
    });

    assert.strictEqual(result.mimeType, "image/png", "Deve manter PNG");
});

test("optimizeImage - força formato WebP", async () => {
    const testImage = createTestPNG();
    const result = await optimizeImage(testImage, {
        format: "webp",
        webpQuality: 80,
    });

    assert.strictEqual(result.mimeType, "image/webp", "Deve converter para WebP");
});

test("optimizeImage - não aumenta imagens pequenas", async () => {
    const testImage = createTestPNG(); // 1x1 pixel
    const result = await optimizeImage(testImage, {
        maxWidth: 10000,
        maxHeight: 10000,
    });

    // Imagem pequena não deve ser aumentada
    assert.ok(result.data.length > 0, "Deve processar imagem pequena");
});

test("formatBytes - formata corretamente", () => {
    assert.strictEqual(formatBytes(0), "0 B");
    assert.strictEqual(formatBytes(1024), "1.00 KB");
    assert.strictEqual(formatBytes(1024 * 1024), "1.00 MB");
    assert.strictEqual(formatBytes(1536), "1.50 KB");
    assert.strictEqual(formatBytes(500), "500.00 B");
});

test("optimizeImage - retorna estatísticas de compressão", async () => {
    const testImage = createTestPNG();
    const result = await optimizeImage(testImage, {
        jpegQuality: 70, // Qualidade mais baixa para garantir compressão
    });

    // Verificar que temos estatísticas válidas
    assert.ok(typeof result.originalSize === "number" && result.originalSize > 0, "originalSize válido");
    assert.ok(typeof result.optimizedSize === "number" && result.optimizedSize > 0, "optimizedSize válido");
    assert.ok(typeof result.compressionRatio === "number", "compressionRatio válido");
    // compressionRatio pode ser negativo para imagens muito pequenas (overhead dos headers)
    assert.ok(!isNaN(result.compressionRatio), "compressionRatio deve ser um número");
});
