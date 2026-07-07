import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  
  if (error) {
    const base_url = process.env.NEXTAUTH_URL || 'https://nimbus-gitcloud.vercel.app';
    return NextResponse.redirect(`${base_url}/auth-callback?error=${encodeURIComponent(error)}`);
  }
  
  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const client_id = process.env.GITHUB_CLIENT_ID;
  const client_secret = process.env.GITHUB_CLIENT_SECRET;
  
  if (!client_id || !client_secret) {
    return NextResponse.json({ error: 'GitHub OAuth not configured' }, { status: 500 });
  }

  const base_url = process.env.NEXTAUTH_URL || 'https://nimbus-gitcloud.vercel.app';
  const redirect_uri = `${base_url}/api/auth/github-callback`;

  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id,
        client_secret,
        code,
        redirect_uri,
      })
    });
    
    const data = await res.json();
    
    if (!data.access_token) {
      return NextResponse.redirect(`${base_url}/auth-callback?error=${encodeURIComponent(data.error || 'token_exchange_failed')}`);
    }

    const FEurl = `${base_url}/auth-callback?token=${data.access_token}`;
    return NextResponse.redirect(FEurl);
  } catch (err) {
    const base_url = process.env.NEXTAUTH_URL || 'https://nimbus-gitcloud.vercel.app';
    return NextResponse.redirect(`${base_url}/auth-callback?error=${encodeURIComponent('network_error')}`);
  }
}
