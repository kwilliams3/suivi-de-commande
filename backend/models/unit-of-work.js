import { AsyncLocalStorage } from 'node:async_hooks';

export const dbContext = new AsyncLocalStorage();
let queue = Promise.resolve();

export function serialized(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}

export function afterCommit(callback) {
  const context = dbContext.getStore();
  if (context) context.callbacks.push(callback);
  else callback();
}

export function transactionalMiddleware(read, commit) {
  return (req, res, next) => {
    if (req.databaseTransaction) return next();
    if (req.path.endsWith('/notifications/stream')) return next();
    req.databaseTransaction = true;
    serialized(() => new Promise(resolve => {
      let originalJson;
      try {
        const previous = structuredClone(read());
        const context = { data: structuredClone(previous), dirty: false, callbacks: [] };
        originalJson = res.json.bind(res);
        let responding = false;
        res.json = body => {
          if (responding) return res;
          responding = true;
          (async () => {
            if (res.statusCode < 400 && context.dirty) await commit(context.data, previous);
            originalJson(body);
            if (res.statusCode < 400) for (const callback of context.callbacks) {
              try { callback(); } catch (error) { console.error('Notification après sauvegarde:', error.message); }
            }
          })().catch(error => {
            console.error('Échec de sauvegarde SQL:', error.code || '', error.message);
            res.status(error.status || 503);
            originalJson({ error: error.status ? error.message : 'Sauvegarde indisponible. Aucune modification validée.' });
          }).finally(resolve);
          return res;
        };
        res.once('close', () => { if (!responding) resolve(); });
        dbContext.run(context, next);
      } catch (error) {
        res.status(error.status || 503);
        (originalJson || res.json.bind(res))({ error: 'Base de données indisponible' });
        resolve();
      }
    })).catch(next);
  };
}
