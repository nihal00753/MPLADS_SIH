import { NextRequest, NextResponse } from 'next/server';
import { DEMO_USERS, REDIRECT_MAP, createDemoToken } from '@/app/api/_mock/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'auth-login' });
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const { email, password } = body;

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
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err?.message || 'Authentication error' }, { status: 500 });
  }
}
