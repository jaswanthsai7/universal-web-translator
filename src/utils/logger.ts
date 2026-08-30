const PREFIX = '[UniversalTranslator]';

export const logger = {
  debug: (...args: any[]) => {
    if (typeof window !== 'undefined' && (window as any).__WEBTRANS_DEBUG__) {
      console.debug(PREFIX, ...args);
    }
  },
  info: (...args: any[]) => {
    console.info(PREFIX, ...args);
  },
  warn: (...args: any[]) => {
    console.warn(PREFIX, ...args);
  },
  error: (...args: any[]) => {
    console.error(PREFIX, ...args);
  }
};
