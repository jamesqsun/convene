alter table notification_jobs drop constraint notification_jobs_type_check;
alter table notification_jobs add constraint notification_jobs_type_check
  check (type in ('assignment', 'participant_left', 'cancellation', 'feedback_reminder'));
