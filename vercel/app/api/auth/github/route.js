import { NextResponse } from 'next/server';

export async function GET(req) {
  const client_id = process.env.GITHUB_CLIENT_ID;
  if (!client_id) {
    return NextResponse.json({ error: 'GITHUB_CLIENT_ID not configured' }, { status: 500 });
  }
  
  const base_url = process.env.NEXTAUTH_URL || 'https://nimbus-gitcloud.vercel.app';
  const redirect_uri = `${base_url}/api/auth/github-callback`;
  const scope = 'read:user user:email repo';
  const url = `https://github.com/login/oauth/authorize?client_id=${client_id}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirect_uri)}`;
  return NextResponse.redirect(url);
}
