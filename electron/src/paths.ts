import path from 'path';
import { app } from 'electron';

export function getPaths() {
  const userData = app.getPath('userData');

  return {
    userData,
    db: path.join(userData, 'coding-history.db'),
    logs: path.join(userData, 'logs'),
    dbBackup: path.join(userData, 'db-backup'),
    dbUrl: () => `file:${path.join(userData, 'coding-history.db')}`,
  };
}
