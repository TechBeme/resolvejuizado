type LogLevel = "debug" | "info" | "warn" | "error";

const levelToConsole: Record<LogLevel, "log" | "warn" | "error"> = {
  debug: "log",
  info: "log",
  warn: "warn",
  error: "error",
};

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

// Função para criar logs user-friendly com emojis e linguagem simples
function formatUserFriendly(level: LogLevel, message: string, meta?: LogMeta): string {
  const emoji = {
    debug: '🔍',
    info: '✅',
    warn: '⚠️',
    error: '❌'
  }[level];

  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `${emoji} [${timestamp}] ${message}`;
}

export type LogMeta = Record<string, unknown>;

export const formatLog = (level: LogLevel, message: string, meta?: LogMeta) => {
  const payload = {
    time: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ?? {}),
  };
  return JSON.stringify(payload);
};

export const logger = {
  log(level: LogLevel, message: string, meta?: LogMeta) {
    const target = levelToConsole[level] ?? "log";

    if (isGitHubActions) {
      // No GitHub Actions: ignora debug, mostra apenas info/warn/error sem detalhes
      if (level === 'debug') return;

      const friendly = formatUserFriendly(level, message, meta);
      // eslint-disable-next-line no-console
      console[target](friendly);

      // Só mostra meta para error críticos
      if (meta && Object.keys(meta).length > 0 && level === 'error') {
        const metaStr = JSON.stringify(meta, null, 2);
        // eslint-disable-next-line no-console
        console.log(`   📋 Detalhes: ${metaStr}`);
      }
    } else {
      // Localmente, mantém formato JSON estruturado
      const serialized = formatLog(level, message, meta);
      // eslint-disable-next-line no-console
      console[target](serialized);
    }
  },
  debug(message: string, meta?: LogMeta) {
    this.log("debug", message, meta);
  },
  info(message: string, meta?: LogMeta) {
    this.log("info", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    this.log("warn", message, meta);
  },
  error(message: string, meta?: LogMeta) {
    this.log("error", message, meta);
  },

  // Funções especiais para logs formatados
  separator() {
    if (isGitHubActions) {
      console.log('\n' + '='.repeat(80) + '\n');
    }
  },

  section(title: string) {
    if (isGitHubActions) {
      console.log('\n' + '━'.repeat(80));
      console.log(`  📌 ${title}`);
      console.log('━'.repeat(80) + '\n');
    } else {
      this.info(title);
    }
  },

  success(message: string, meta?: LogMeta) {
    if (isGitHubActions) {
      console.log(`🎉 ${message}`);
      if (meta) {
        Object.entries(meta).forEach(([key, value]) => {
          console.log(`   • ${key}: ${value}`);
        });
      }
    } else {
      this.info(message, meta);
    }
  }
};
