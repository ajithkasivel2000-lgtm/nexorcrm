-- Overdue activity reminders repeated forever: the sweep kept chasing an
-- activity nobody had closed every overdueRepeatMinutes, indefinitely. A cap
-- (0 = off, the old behaviour) bounds the worst case, the same way
-- CollectionReminderSetting.maxOverdue already bounds buyer payment reminders.
ALTER TABLE "ReminderSetting" ADD COLUMN "maxOverdueReminders" INTEGER NOT NULL DEFAULT 4;
