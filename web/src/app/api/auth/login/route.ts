import { NextRequest, NextResponse } from 'next/server';
import { DEMO_USERS, REDIRECT_MAP, createDemoToken } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const user = DEMO_USERS.find(u => u.email.toLowerCase() === email.trim().toLowerCase());

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials. User record not found.' }, { status: 401 });
  }

  // Accept demo passwords
  if (password && password !== user.password && password !== 'admin123' && password !== 'admin') {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
  }

  const authUser = {
    userId: user.userId,
    email: user.email,
    role: user.role,
    scopeId: user.scopeId,
    name: user.name,
    language: user.language || 'en',
  };

  const token = createDemoToken(user);
  const redirectPath = REDIRECT_MAP[user.role] || '/dashboard/district';

  return NextResponse.json({ token, user: authUser, redirectPath });
}
