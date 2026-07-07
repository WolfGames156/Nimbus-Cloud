'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AuthCallback() {
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
      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'80vh',background:'#0d1117',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
        <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
        <h2>Nimbus Cloud</h2>
        <p style={{color:'#ff6b6b',marginBottom:16}}>Giris hatasi</p>
        <p style={{color:'#aaa',fontSize:14}}>Lutfen tekrar deneyin.</p>
      </div>
    );
  }

  if (token) {
    return (
      <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'80vh',background:'#0d1117',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
        <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
        <h2>Nimbus Cloud</h2>
        <p style={{color:'#aaa',marginBottom:24}}>Giris basarili!</p>
        {showManual && (
          <div style={{textAlign:'center'}}>
            <p style={{color:'#aaa',marginBottom:16}}>Eger uygulama otomatik acilmazsa:</p>
            <div style={{padding:'16px 32px',background:'#222',borderRadius:8,maxWidth:'90vw'}}>
              <span style={{color:'#98fa7b'}}>Token:</span>
              <code style={{display:'block',wordBreak:'break-all',marginTop:8,background:'#000',padding:8,borderRadius:4,fontSize:12}}>{token}</code>
            </div>
            <p style={{color:'#666',marginTop:16,fontSize:12}}>Bu token uygulama penceresine yapistirin</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',minHeight:'80vh',background:'#0d1117',color:'#fff',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <img src="/logo.png" alt="Nimbus Logo" style={{width:80, height:80, borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
      <h2>Nimbus Cloud</h2>
      <p style={{color:'#ff6b6b'}}>Hata: Token alinamadi</p>
    </div>
  );
}
