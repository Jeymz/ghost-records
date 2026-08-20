export const fixedNow = () => new Date('2026-08-20T12:00:00.000Z');

export const defaultLimits = Object.freeze({
  maxChainDepth: 8,
  maxQueries: 32,
  maxConcurrency: 2,
  queryTimeoutMs: 25,
  maxAnswers: 100,
});

export function dnsError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

export function noData() {
  return Promise.reject(dnsError('ENODATA'));
}

export function resolverDouble({ cname = noData, a = noData, aaaa = noData } = {}) {
  return {
    cancel() {},
    resolveCname: (...arguments_) => cname(...arguments_),
    resolve4: (...arguments_) => a(...arguments_),
    resolve6: (...arguments_) => aaaa(...arguments_),
  };
}

export function resolverFactory(...resolvers) {
  let index = 0;

  return () => {
    const resolver = resolvers[index];
    index += 1;
    if (!resolver) {
      throw new Error('Unexpected resolver creation.');
    }
    return resolver;
  };
}
