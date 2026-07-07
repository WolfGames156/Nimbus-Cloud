import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <img src="/logo.png" alt="Nimbus Cloud" width={80} height={80} style={{borderRadius:'50%', marginBottom:24, boxShadow:'0 2px 12px #222'}} />
        <h1 style={{fontSize:32, fontWeight:600, marginBottom:8}}>Nimbus<span style={{color:'#8b949e'}}>Cloud</span></h1>
        <p style={{color:'#8b949e', marginBottom:32, fontSize:14}}>Private desktop cloud storage</p>
        <div style={{display:'flex', gap:12}}>
          <a href="https://github.com/WolfGames156/Nimbus-Cloud" style={{padding:'12px 24px',background:'#58a6ff',color:'#fff',borderRadius:8,textDecoration:'none',fontWeight:500}}>Get Started</a>
        </div>
      </main>
    </div>
  );
}
