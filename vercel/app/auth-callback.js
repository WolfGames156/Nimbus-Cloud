export default function AuthCallback({ searchParams }) {
  const token = searchParams.get('token');
  const error = searchParams.get('error');
  
  if (error) {
    return (
      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'100vh',background:'#0d1117',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
        <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
        <h2>Nimbus Cloud</h2>
        <p style={{color:'#ff6b6b',marginBottom:16}}>Giriş hatası</p>
        <p style={{color:'#aaa',fontSize:14}}>Lütfen tekrar deneyin.</p>
      </div>
    );
  }
  
  if (token) {
    return (
      <html>
        <head>
          <title>Nimbus Cloud - Auth</title>
          <script dangerouslySetInnerHTML={{ __html: `
            window.onload = function() {
              window.location.href = 'nimbus://callback?token=${token}';
              setTimeout(function() {
                document.getElementById('manual').style.display = 'block';
              }, 2000);
            }
          `}} />
        </head>
        <body style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'100vh',background:'#0d1117',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',margin:0}}>
          <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
          <h2>Nimbus Cloud</h2>
          <p style={{color:'#aaa',marginBottom:24}}>Giriş başarılı!</p>
          <div id="manual" style={{display:'none',textAlign:'center'}}>
            <p style={{color:'#aaa',marginBottom:16}}>Eğer uygulama otomatik açılmazsa:</p>
            <div style={{padding:'16px 32px',background:'#222',borderRadius:8,maxWidth:'90vw'}}>
              <span style={{color:'#98fa7b'}}>Token:</span>
              <code style={{display:'block',wordBreak:'break-all',marginTop:8,background:'#000',padding:8,borderRadius:4,fontSize:12}}>{token}</code>
            </div>
            <p style={{color:'#666',marginTop:16,fontSize:12}}>Bu token uygulama penceresine yapıştırın</p>
          </div>
        </body>
      </html>
    );
  }
  
  return (
    <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'100vh',background:'#0d1117',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
      <h2>Nimbus Cloud</h2>
      <p style={{color:'#ff6b6b'}}>Hata: Token alınamadı</p>
    </div>
  );
}

export const runtime = 'edge';
