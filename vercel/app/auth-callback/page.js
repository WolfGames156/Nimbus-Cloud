'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function AuthCallbackInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const error = searchParams.get('error');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (token) {
      window.location.href = 'nimbus://callback?token=' + token;
      const timer = setTimeout(() => setShowManual(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [token]);

  if (error) {
    return (
      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'80vh'}}>
        <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
        <h2 style={{fontSize:24,fontWeight:600,marginBottom:8}}>Nimbus Cloud</h2>
        <p style={{color:'#ff6b6b',marginBottom:16}}>Giris hatasi</p>
        <p style={{color:'#8b949e',fontSize:14}}>Lutfen tekrar deneyin.</p>
      </div>
    );
  }

  if (token) {
    return (
      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'80vh'}}>
        <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
        <h2 style={{fontSize:24,fontWeight:600,marginBottom:8}}>Nimbus Cloud</h2>
        <p style={{color:'#8b949e',marginBottom:24}}>Giris basarili!</p>
        {showManual && (
          <div style={{textAlign:'center'}}>
            <p style={{color:'#8b949e',marginBottom:16}}>Eger uygulama otomatik acilmazsa:</p>
            <div style={{padding:'16px 32px',background:'#161b22',borderRadius:8,maxWidth:'90vw',border:'1px solid #30363d'}}>
              <span style={{color:'#3fb950'}}>Token:</span>
              <code style={{display:'block',wordBreak:'break-all',marginTop:8,background:'#0d1117',padding:8,borderRadius:4,fontSize:12,color:'#e6edf3'}}>{token}</code>
            </div>
            <p style={{color:'#6e7681',marginTop:16,fontSize:12}}>Bu token uygulama penceresine yapistirin</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'80vh'}}>
      <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
      <h2 style={{fontSize:24,fontWeight:600,marginBottom:8}}>Nimbus Cloud</h2>
      <p style={{color:'#ff6b6b'}}>Hata: Token alinamadi</p>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'80vh'}}>
        <p style={{color:'#8b949e'}}>Yukleniyor...</p>
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  );
}
