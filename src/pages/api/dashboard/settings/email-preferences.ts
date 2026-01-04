import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { db, users } from '../../../../db';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const session = await requireAuth(cookies);

    const formData = await request.formData();
    const emailNotifications = formData.get('email_notifications') === 'on';

    await db
      .update(users)
      .set({
        emailNotifications,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    return redirect('/dashboard/settings?success=email-preferences');
  } catch (error) {
    console.error('Error saving email preferences:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
