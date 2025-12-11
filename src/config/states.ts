// Mapeamento de estados brasileiros
export const BRAZILIAN_STATES = {
    AC: "Acre",
    AL: "Alagoas",
    AP: "Amapá",
    AM: "Amazonas",
    BA: "Bahia",
    CE: "Ceará",
    DF: "Distrito Federal",
    ES: "Espírito Santo",
    GO: "Goiás",
    MA: "Maranhão",
    MT: "Mato Grosso",
    MS: "Mato Grosso do Sul",
    MG: "Minas Gerais",
    PA: "Pará",
    PB: "Paraíba",
    PR: "Paraná",
    PE: "Pernambuco",
    PI: "Piauí",
    RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte",
    RS: "Rio Grande do Sul",
    RO: "Rondônia",
    RR: "Roraima",
    SC: "Santa Catarina",
    SP: "São Paulo",
    SE: "Sergipe",
    TO: "Tocantins",
} as const;

export type StateCode = keyof typeof BRAZILIAN_STATES;

// Extrai código do estado a partir da URL do site
export function extractStateFromUrl(url: string): StateCode | null {
    const urlLower = url.toLowerCase();

    // Mapeamento de domínios conhecidos
    const domainMap: Record<string, StateCode> = {
        'procon.df.gov.br': 'DF',
        'procon.es.gov.br': 'ES',
        'procon.ma.gov.br': 'MA',
        'procon.mt.gov.br': 'MT',
        'mpmg.mp.br': 'MG',
        'procon.pb.gov.br': 'PB',
        'procon.pr.gov.br': 'PR',
        'rj.gov.br': 'RJ',
        'prefeitura.rio': 'RJ',
        'niteroi.rj.gov.br': 'RJ',
        'procon.rs.gov.br': 'RS',
        'portal.rr.gov.br': 'RR',
        'procon.sc.gov.br': 'SC',
        'prefeitura.sp.gov.br': 'SP',
        'procon.campinas.sp.gov.br': 'SP',
        'procon.santos.sp.gov.br': 'SP',
        'sorocaba.sp.gov.br': 'SP',
        'procon.se.gov.br': 'SE',
        'goias.gov.br': 'GO',
        'sedihpop.ma.gov.br': 'MA',
        'procon.pa.gov.br': 'PA',
        'semjidh.rn.gov.br': 'RN',
        'rondonia.ro.gov.br': 'RO',
        'to.gov.br': 'TO',
        'agencia.ac.gov.br': 'AC',
    };

    // Procura por domínio conhecido
    for (const [domain, state] of Object.entries(domainMap)) {
        if (urlLower.includes(domain)) {
            return state;
        }
    }

    // Fallback: procura por sigla do estado na URL
    const stateRegex = /\.(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\.gov\.br/i;
    const match = urlLower.match(stateRegex);
    if (match) {
        return match[1].toUpperCase() as StateCode;
    }

    return null;
}

// Gera nome da categoria para o estado
export function getCategoryName(stateCode: StateCode): string {
    return `Notícias ${stateCode}`;
}

// Gera slug da categoria
export function getCategorySlug(stateCode: StateCode): string {
    return `noticias-${stateCode.toLowerCase()}`;
}
