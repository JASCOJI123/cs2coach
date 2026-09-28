import type { Sql } from 'postgres';

export interface NotificationTarget {
  userId: string;
  telegramId: number | null;
  telegramUsername: string | null;
  telegramChatId: number | null;
  telegramLinkedAt: Date | null;
  notificationsEnabled: boolean;
  locale: string;
}

/** Create a website account that is not tied to Telegram (FACEIT login). */
export async function createWebUser(sql: Sql): Promise<{ id: string }> {
  const [row] = await sql<{ id: string }[]>`insert into users default values returning id`;
  return row;
}

export async function getNotificationTarget(sql: Sql, userId: string): Promise<NotificationTarget | null> {
  const [row] = await sql<NotificationTarget[]>`
    select id as user_id, telegram_id, telegram_username, telegram_chat_id, telegram_linked_at, notifications_enabled, locale
    from users where id = ${userId}`;
  if (!row) return null;
  return {
    ...row,
    telegramId: row.telegramId == null ? null : Number(row.telegramId),
    telegramChatId: row.telegramChatId == null ? null : Number(row.telegramChatId),
  };
}

export async function createTelegramLinkToken(sql: Sql, input: { userId: string; token: string; ttlMs: number }): Promise<Date> {
  const expiresAt = new Date(Date.now() + input.ttlMs);
  await sql.begin(async (tx) => {
    await tx`delete from telegram_link_tokens where user_id = ${input.userId} or expires_at < now()`;
    await tx`insert into telegram_link_tokens (token, user_id, expires_at) values (${input.token}, ${input.userId}, ${expiresAt})`;
  });
  return expiresAt;
}

/**
 * Consume a deep-link token and attach the Telegram chat to the website user.
 * A Telegram account can only notify one website user, so it is detached from
 * any other row first. Returns the linked user id, or null for a bad token.
 */
export async function linkTelegramByToken(
  sql: Sql,
  input: { token: string; telegramId: number; chatId: number; username?: string | null },
): Promise<string | null> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ userId: string }[]>`
      delete from telegram_link_tokens where token = ${input.token} and expires_at > now() returning user_id`;
    if (!row) return null;
    await tx`update users set telegram_id = null, telegram_chat_id = null, telegram_linked_at = null, updated_at = now()
             where telegram_id = ${input.telegramId} and id <> ${row.userId}`;
    await tx`update users set telegram_id = ${input.telegramId}, telegram_chat_id = ${input.chatId},
               telegram_username = ${input.username ?? null}, telegram_linked_at = now(),
               notifications_enabled = true, updated_at = now()
             where id = ${row.userId}`;
    return row.userId;
  });
}

export async function unlinkTelegram(sql: Sql, userId: string): Promise<void> {
  await sql`update users set telegram_id = null, telegram_chat_id = null, telegram_username = null,
              telegram_linked_at = null, updated_at = now() where id = ${userId}`;
}

export async function setNotificationsEnabled(sql: Sql, userId: string, enabled: boolean): Promise<void> {
  await sql`update users set notifications_enabled = ${enabled}, updated_at = now() where id = ${userId}`;
}

export async function setNotificationsEnabledByTelegramId(sql: Sql, telegramId: number, enabled: boolean): Promise<boolean> {
  const rows = await sql`update users set notifications_enabled = ${enabled}, updated_at = now()
                         where telegram_id = ${telegramId} returning id`;
  return rows.length > 0;
}

/** Returns true the first time (user, kind, ref) is recorded, false afterwards. */
export async function claimNotification(sql: Sql, input: { userId: string; kind: string; ref: string }): Promise<boolean> {
  const rows = await sql`insert into notification_log (user_id, kind, ref) values (${input.userId}, ${input.kind}, ${input.ref})
                         on conflict do nothing returning user_id`;
  return rows.length > 0;
}

export async function setUserLocale(sql: Sql, userId: string, locale: string): Promise<void> {
  await sql`update users set locale = ${locale}, updated_at = now() where id = ${userId}`;
}
