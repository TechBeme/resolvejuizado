import { logger } from "../logger.js";
import { fetchWithRetry } from "./fetch.js";

export type IpInfo = {
    ip: string;
    city?: string;
    region?: string;
    country?: string;
    countryName?: string;
    org?: string;
    timezone?: string;
};

let cachedIpInfo: IpInfo | null = null;

/**
 * Detecta o IP público e informações de geolocalização.
 * Usa cache para evitar múltiplas chamadas.
 */
export async function getIpInfo(): Promise<IpInfo> {
    if (cachedIpInfo) {
        return cachedIpInfo;
    }

    try {
        // Usa ipapi.co para detectar IP e localização (gratuito, sem API key)
        const response = await fetchWithRetry("https://ipapi.co/json/", {
            timeoutMs: 10000,
            maxRetries: 2,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch IP info: ${response.status}`);
        }

        const data = await response.json() as {
            ip?: string;
            city?: string;
            region?: string;
            country?: string;
            country_name?: string;
            org?: string;
            timezone?: string;
        };

        cachedIpInfo = {
            ip: data.ip || "unknown",
            city: data.city,
            region: data.region,
            country: data.country,
            countryName: data.country_name,
            org: data.org,
            timezone: data.timezone,
        };

        return cachedIpInfo;
    } catch (error) {
        logger.warn("Failed to detect IP info", { error: String(error) });

        // Fallback: tenta apenas detectar o IP
        try {
            const ipResponse = await fetchWithRetry("https://api.ipify.org?format=json", {
                timeoutMs: 5000,
                maxRetries: 1,
            });

            if (ipResponse.ok) {
                const ipData = await ipResponse.json() as { ip?: string };
                cachedIpInfo = {
                    ip: ipData.ip || "unknown",
                };
                return cachedIpInfo;
            }
        } catch {
            // Ignore fallback errors
        }

        // Se tudo falhar, retorna info mínima
        cachedIpInfo = { ip: "unknown" };
        return cachedIpInfo;
    }
}

/**
 * Formata as informações de IP para exibição nos logs.
 */
export function formatIpInfo(info: IpInfo): string {
    const parts: string[] = [info.ip];

    if (info.city && info.region) {
        parts.push(`${info.city}, ${info.region}`);
    } else if (info.region) {
        parts.push(info.region);
    }

    if (info.countryName) {
        parts.push(info.countryName);
    } else if (info.country) {
        parts.push(info.country);
    }

    if (info.org) {
        parts.push(`(${info.org})`);
    }

    return parts.join(" • ");
}

/**
 * Loga as informações de IP no início da execução.
 */
export async function logIpInfo(): Promise<void> {
    try {
        const info = await getIpInfo();
        const formatted = formatIpInfo(info);

        // Sempre mostra formato user-friendly (sem JSON)
        console.log(`🌐 Executando a partir de: ${formatted}`);
    } catch (error) {
        console.log(`⚠️  Não foi possível detectar localização: ${error instanceof Error ? error.message : String(error)}`);
    }
}
