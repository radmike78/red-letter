import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { isValidDateKey } from '../core/dates';
import { useStore } from '../storage/repository';
import { configureNotificationHandler, syncReminders } from './notifications';

/**
 * Keeps the scheduled reminders in step with the data, and opens the right day
 * when one is tapped.
 *
 * Rendered once inside the provider rather than being a hook each screen calls,
 * so there is exactly one scheduler and no chance of two screens racing to
 * rebuild the same notification set.
 */
export function ReminderSync(): null {
  const router = useRouter();
  const { data, ready } = useStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    if (!ready) return undefined;

    // Rescheduling is debounced well past the save debounce: editing a title
    // should not rebuild the OS notification set on every keystroke.
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void syncReminders(data).catch(() => {
        // Reminders are a convenience; a scheduling failure must never take
        // the app down or block an edit from being saved.
      });
    }, 1_500);

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [data, ready]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // The payload is one we wrote ourselves, but it has been through the OS
      // and back, so it is validated like anything else crossing a boundary.
      const date = response.notification.request.content.data?.date;
      if (isValidDateKey(date)) router.push(`/day/${date}`);
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}
