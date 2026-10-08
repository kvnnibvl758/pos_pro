// ===== RAPPEL DE SAUVEGARDE =====
// Comme les données vivent uniquement dans le navigateur (localStorage), on
// rappelle périodiquement à l'administrateur d'exporter une sauvegarde.
const LAST_BACKUP_KEY = 'pos-last-backup-at';
const DISMISS_KEY = 'pos-backup-reminder-dismissed-on';
const REMINDER_INTERVAL_DAYS = 7;
const MIN_SALES_BEFORE_REMINDER = 3;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function recordBackupDone() {
  localStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
}

export function dismissBackupReminderToday() {
  localStorage.setItem(DISMISS_KEY, todayKey());
}

export function shouldShowBackupReminder(salesCount) {
  if (salesCount < MIN_SALES_BEFORE_REMINDER) return false;
  if (localStorage.getItem(DISMISS_KEY) === todayKey()) return false;

  const lastBackup = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
  if (!lastBackup) return true;

  const daysSinceBackup = (Date.now() - lastBackup) / (1000 * 60 * 60 * 24);
  return daysSinceBackup >= REMINDER_INTERVAL_DAYS;
}
