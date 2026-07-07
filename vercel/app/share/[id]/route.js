import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
  const shareId = params.id;
  if (!shareId) return NextResponse.json({ error: 'No share ID' }, { status: 400 });

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'WolfGames156';
  const repo = process.env.GITHUB_REPO || 'nimbus-cloud';
  const tag = 'nimbus-shares';

  try {
    // Get release by tag
    const relRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Nimbus-GitCloud' }
    });
    if (!relRes.ok) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
    const rel = await relRes.json();

    // Find the share ZIP asset
    const assetName = `share-${shareId}.zip`;
    const asset = rel.assets.find(a => a.name === assetName);
    if (!asset) return NextResponse.json({ error: 'Share not found' }, { status: 404 });

    // Redirect to GitHub download URL (authenticated)
    return NextResponse.redirect(asset.url, { headers: { Accept: 'application/octet-stream' } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
