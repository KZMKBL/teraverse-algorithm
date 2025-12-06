// path: gigaverse-engine/src/algorithms/defaultEvaluate.ts

import { GigaverseRunState, GigaverseFighter, GigaverseMoveState } from "../simulator/GigaverseTypes";

/**
 * Evaluates the state to give a numeric score.
 * Higher is better.
 * TUNED FOR: High Defense, Smart Aggression, Ammo Management.
 */
export function defaultEvaluate(state: GigaverseRunState): number {
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  // 1. ÖLÜM KONTROLÜ (KRİTİK)
  if (p.health.current <= 0) return -1000000;

  let score = 0;

  // 2. İLERLEME VE ZAFER
  score += state.currentEnemyIndex * 100000; 

  // Eğer düşman öldüyse, zafer bonusunu al ve çık (Mermi/Zırh önemsizdir)
  if (!e || e.health.current <= 0) {
      score += 50000;
      return score + (p.health.current * 200); 
  }

  // 3. HAYATTA KALMA (DEFANSİF ZEKA)
  
  // Can Puanı: Agresiflikten ölmeyi engellemek için yüksek çarpan.
  score += p.health.current * 250; 

  // Zırh Puanı: Zırhı korumak çok önemlidir.
  score += p.armor.current * 80; 

  // ZIRH KIRILMA CEZASI (EN ÖNEMLİ KISIM):
  // Eğer zırh 0'a inerse, bot panikler (-5000 puan). 
  // Bu sayede zırhı kırdırmamak için elinden geleni yapar.
  if (p.armor.current === 0) {
      score -= 5000; 
  } else if (p.armor.current < p.armor.max * 0.2) {
      score -= 1500; // Zırh çok azaldı uyarısı
  }

  // 4. SALDIRGANLIK (KONTROLLÜ)
  // Düşmanın canını azaltmak iyidir ama kendi canımızdan değerli değildir.
  const damageDealt = e.health.max - e.health.current;
  score += damageDealt * 120; 

  // Zırh kırmak taktiksel avantajdır
  const armorBroken = e.armor.max - e.armor.current;
  score += armorBroken * 50;  

  // 5. EKONOMİ (MERMİ YÖNETİMİ)
  const myMoves = [p.rock, p.paper, p.scissor];
  let myTotalStats = 0;

  for (const m of myMoves) {
      myTotalStats += m.currentATK + m.currentDEF;

      // Mermisiz kalmak savunmasız kalmaktır
      if (m.currentCharges === -1) score -= 800; // Ceza
      else if (m.currentCharges === 0) score -= 200; // Hafif Ceza

      // Mermi biriktirmek iyidir (Diminishing Returns)
      if (m.currentCharges === 1) score += 100;      // İlk mermi hayati
      else if (m.currentCharges === 2) score += 140; // İkinci iyi
      else if (m.currentCharges >= 3) score += 160;  // Full lüks
  }
  
  // Geleceğe yatırım (Stat gücü)
  score += myTotalStats * 40;

  // 6. TEHDİT ANALİZİ (THREAT ASSESSMENT)
  // Düşmanın elinde mermi varsa kork, yoksa rahatla.
  const enemyMoves = [e.rock, e.paper, e.scissor];
  let threatScore = 0;

  for (const em of enemyMoves) {
      if (em.currentCharges > 0) {
          // Düşmanın saldırı gücü kadar puan düşüyoruz.
          // Düşmanın mermisini bitiren senaryolar (Drain) daha yüksek puan alacak.
          threatScore += (em.currentATK * 30); 
      }
  }
  
  score -= threatScore;

  return score;
}
