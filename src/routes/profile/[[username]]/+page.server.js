import { error, fail, redirect } from '@sveltejs/kit';
import { UserGame } from '$game/UserGame';
import { UserQuoteInsights } from '$models/UserQuoteInsights';
import { authenticate } from '$utils/authenticate.js';
import { UserAuth } from '$models/UserAuth';
import { createVerificationToken } from '$auth/verify';
import { sendVerificationEmail } from '$auth/mailer';
import { cookie_options } from '$utils/dbUtil';
import { VerificationToken } from '$models/VerificationToken';
import { decrementUserCount } from '$utils/userCount.js';
import { removeUserFromLeaderboards } from '$utils/leaderboard.js';
import redis from '$services/redis.js';

export async function load({ params, cookies }) {
  const auth = authenticate(cookies.get('auth-token'));
  const requestedUsername = params.username;

  let profileUser;
  let isOwnProfile = false;

  if (requestedUsername) {
    profileUser = await UserGame.findOne({ username: requestedUsername }).lean();
  } else if (auth) {
    profileUser = await UserGame.findById(auth.id).lean();
  } else {
    throw error(401, 'Unauthorized');
  }

  if (!profileUser) {
    throw error(404, 'User not found');
  }

  if (auth && profileUser._id.toString() === auth.id) {
    isOwnProfile = true;
  }

  // Denormalized per-cryptogram insights: a point-read by primary key, not a query against
  // QuoteStats. See docs/singleplayer-stats-plan.md §8.
  const quoteInsights = await UserQuoteInsights.findById(profileUser._id).lean();

  return {
    username: profileUser.username,
    profilePicture: profileUser.profilePicture,
    stats: JSON.stringify(profileUser.stats),
    singleplayerStats: JSON.stringify(profileUser.singleplayerStats),
    quoteInsights: JSON.stringify(quoteInsights ?? null),
    isOwnProfile,
    email: isOwnProfile ? (cookies.get('email') ?? '') : '',
  };
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
  updateEmail: async ({ cookies, request }) => {
    const auth = authenticate(cookies.get('auth-token'));
    if (!auth) throw error(401, 'Unauthorized');

    const formData = await request.formData();
    const newEmail = String(formData.get('email') || '').trim();

    const emailRegexp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newEmail || !emailRegexp.test(newEmail)) {
      return fail(400, { message: 'Please enter a valid email.' });
    }

    const existing = await UserAuth.findOne({
      email: { $regex: `^${newEmail}$`, $options: 'i' },
    }).lean();
    if (existing && existing._id.toString() !== auth.id) {
      return fail(400, { message: 'Email is already in use.' });
    }

    const user = await UserAuth.findById(auth.id);
    if (!user) throw error(404, 'User not found');

    const EXPIRE_LIMIT_MINUTES = 20;

    user.email = newEmail;
    user.verified = false;
    user.lastVerificationRequest = new Date();
    await user.save();

    const token = await createVerificationToken(user, EXPIRE_LIMIT_MINUTES, 'create');
    await sendVerificationEmail(user.email, token, EXPIRE_LIMIT_MINUTES);

    cookies.set('email', user.email, cookie_options);
    cookies.set('verified', false, cookie_options);

    throw redirect(303, '/profile');
  },

  deleteAccount: async ({ cookies }) => {
    const auth = authenticate(cookies.get('auth-token'));
    if (!auth) throw error(401, 'Unauthorized');

    const userId = auth.id;
    const user = await UserAuth.findById(userId).select('username');
    if (user && user.username) {
      try {
        await removeUserFromLeaderboards(redis, user.username);
      } catch (redisError) {
        console.error(
          'CRITICAL: Failed to remove user from leaderboards in Redis for user:',
          user.username,
          redisError
        );
      }
    }

    await Promise.all([
      UserAuth.deleteOne({ _id: userId }),
      UserGame.deleteOne({ _id: userId }),
      VerificationToken.deleteMany({ userId }),
    ]);

    await decrementUserCount();

    try {
      cookies.delete('auth-token', { path: '/' });
    } catch {}
    try {
      cookies.delete('email', { path: '/' });
    } catch {}
    try {
      cookies.delete('username', { path: '/' });
    } catch {}
    try {
      cookies.delete('verified', { path: '/' });
    } catch {}

    throw redirect(303, '/');
  },
};
