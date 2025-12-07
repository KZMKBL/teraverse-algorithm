// path: gigaverse-engine/src/algorithms/defaultEvaluate.ts

import { GigaverseRunState, GigaverseFighter, GigaverseMoveState } from "../simulator/GigaverseTypes";

/**
 * Evaluates the state to give a numeric score.
 * Higher is better.
 * OPTIMIZED FOR: Expectimax (Standard Version)
 * Balance: Survival > Damage > Ammo Economy
 */
export function defaultEvaluate(state: GigaverseRunState): number {
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  // 1. ÖLÜM KONTROLÜ (KIRMIZI ÇİZGİ)
  // Eğer bu senaryoda ölüyorsak, puan -1 Milyon.
  // Expectimax ortalama alsa bile bu kadar düşük puan o yolu seçtirmez.
  if (p.health.current <= 0) return -1000000;

  let score = 0;

  // 2. İLERLEME VE ZAFER
  score += state.currentEnemyIndex * 100000; 

  // Düşman öldü mü? Harika!
  if (!e || e.health.current <= 0) {
      score += 50000;
      // Zafer anında ne kadar canımız kaldığı çok önemli
      return score + (p.health.current * 500); 
  }

  // 3. HAYATTA KALMA (MUTLAK DEĞERLER)
  // Oran (Ratio) kullanmıyoruz. 30 Can, 10 Candan iyidir.
  
  // Can: En değerli varlığımız.
  score += p.health.current * 200; 

  // Zırh: Canın kalkanıdır.
  score += p.armor.current * 100; 

  // ZIRH KIRILMA TEHLİKESİ
  // Zırh 0'a inerse savunmasız kalırız. Buna ceza veriyoruz.
  if (p.armor.current === 0) {
      score -= 2000; 
  }

  // 4. HASAR (AGGRESSION)
  // Düşmanın canını ne kadar azalttık?
  const damageDealt = e.health.max - e.health.current;
  score += damageDealt * 150; 

  // 5. EKONOMİ (MERMİ YÖNETİMİ)
  // Mermi (Charge) durumuna göre puan veriyoruz.
  const myMoves = [p.rock, p.paper, p.scissor];
  let myTotalStats = 0;

  for (const m of myMoves) {
      myTotalStats += m.currentATK + m.currentDEF;

      // Mermimiz 0 ise kötüdür, savunmasızız demektir.
      if (m.currentCharges <= 0) score -= 300; 

      // Mermimiz varsa iyidir (Ama 3'ten sonrası zaten dolmaz, max 3)
      // İlk mermi çok değerlidir (+100), diğerleri bonus (+20).
      if (m.currentCharges === 1) score += 100;
      else if (m.currentCharges > 1) score += 120;
  }
  
  // Stat gücümüzü de hesaba katalım (Geleceğe yatırım)
  score += myTotalStats * 50;

  // 6. TEHDİT ANALİZİ
  // Düşmanın mermisi varsa (bize vurabilecekse) puanı biraz kıralım.
  // Böylece bot, düşmanın mermisinin bittiği anları "Fırsat" olarak görür.
  const enemyMoves = [e.rock, e.paper, e.scissor];
  let threatScore = 0;

  for (const em of enemyMoves) {
      if (em.currentCharges > 0) {
          // Düşmanın saldırı gücü kadar tehdit var
          threatScore += (em.currentATK * 20); 
      }
  }
  
  score -= threatScore;

  return score;
}
