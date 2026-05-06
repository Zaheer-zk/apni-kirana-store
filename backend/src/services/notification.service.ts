import { prisma } from '../config/prisma';
import admin from 'firebase-admin';
import { config } from '../config/env';

// Initialise Firebase Admin lazily (only once)
function getFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      privateKey: config.firebase.privateKey,
      clientEmail: config.firebase.clientEmail,
    }),
  });
}

/**
 * Persists a notification record in the DB and, if the user has an FCM token,
 * sends a push notification via Firebase Cloud Messaging.
 */
export async function sendNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  // 1. Save to DB
  await prisma.notification.create({
    data: { userId, title, body, data: data ?? null },
  });

  // 2. Attempt FCM push (fire-and-forget)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });

  if (user?.fcmToken) {
    sendFcmPush(user.fcmToken, title, body, data).catch(() => {
      // Silently ignore FCM failures
    });
  }
}

/**
 * Sends an FCM push notification to a specific device token.
 * Never throws — failures are logged and swallowed.
 */
async function sendFcmPush(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  try {
    const app = getFirebaseApp();
    await admin.messaging(app).send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: {
        payload: { aps: { sound: 'default' } },
      },
    });
  } catch (err) {
    console.error('[FCM] Failed to send push notification:', err);
  }
}
