import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { Property, User } from './models/index.js';

/** First boot only: the admin login from ADMIN_USERNAME / ADMIN_PASSWORD. */
export async function ensureAdmin() {
  if (await User.exists({})) return;
  await User.create({
    username: config.adminUsername,
    passwordHash: await bcrypt.hash(config.adminPassword, 10),
    role: 'admin',
  });
  console.log(`[setup] Created admin user "${config.adminUsername}"`);
}

/** First boot only: one empty property so the screen has something to show. Rename it in Admin → Properties. */
export async function ensureDefaultProperty() {
  if (await Property.exists({})) return;
  await Property.create({ code: config.defaultProperty, name: config.defaultPropertyName });
  console.log(`[setup] Created property ${config.defaultProperty} "${config.defaultPropertyName}"`);
}
