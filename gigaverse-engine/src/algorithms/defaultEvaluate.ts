// path: gigaverse-engine/src/algorithms/defaultEvaluate.ts

import { GigaverseRunState, GigaverseFighter, GigaverseMoveState } from "../simulator/GigaverseTypes";

/**
 * Evaluates the state to give a numeric score.
 * Higher is better.
 * Includes "Threat Assessment" and "Ammo Efficiency".
 */
export function defaultEvaluate(state: GigaverseRunState): number {
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  // 1. ÖLÜM KONTROLÜ (GAME OVER)
  if (p.health.current <= 0) return -1000000;

  let score = 0;

  // 2. İLERLEME VE KAZANMA (VICTORY)
  // Düşmanı yenmek her şeyden önemlidir.
  score += state.currentEnemyIndex * 100000; 

  // Eğer mevcut düşman öldüyse ekstra devasa bonus (Round'u bitirmeyi teşvik et)
  if (!e || e.health.current <= 0) {
      score += 50000;
      // Düşman öldüyse diğer hesaplara girmeye gerek yok, kazanmak en iyisidir.
      // Sadece kendi canımızı ekleyip dönüyoruz.
      return score + (p.health.current * 100); 
  }

  // 3. OYUNCU SAĞLIĞI (SURVIVAL)
  // Can her şeydir. Zırh ise canın koruyucusudur.
  score += p.health.current * 200;  // Can puanını artırdım (Agresiflikten ölmesin)
  score += p.armor.current * 50;    // Zırh puanı

  // 4. DÜŞMAN DURUMU (KILLER INSTINCT)
  // Düşmanın canını ne kadar azalttık?
  const damageDealt = e.health.max - e.health.current;
  score += damageDealt * 150; // Agresiflik (Düşmana vurmak iyidir)

  const armorBroken = e.armor.max - e.armor.current;
  score += armorBroken * 50;  // Zırh kırmak taktiksel avantajdır

  // 5. OYUNCU EKONOMİSİ (AMMO CURVE)
  // "Diminishing Returns" mantığı: 0->1 mermi çok değerli, 2->3 mermi az değerli.
  const myMoves = [p.rock, p.paper, p.scissor];
  let myTotalStats = 0;

  for (const m of myMoves) {
      myTotalStats += m.currentATK + m.currentDEF;

      // Mermi Cezaları
      if (m.currentCharges === -1) score -= 800; // Ceza (Çok Kötü)
      else if (m.currentCharges === 0) score -= 150; // Hafif Ceza (Savunmasızlık)

      // Mermi Ödülleri (Kademeli)
      if (m.currentCharges === 1) score += 100;      // İlk mermi hayati!
      else if (m.currentCharges === 2) score += 140; // İkinci mermi iyi (+40 fark)
      else if (m.currentCharges >= 3) score += 160;  // Full şarj lüks (+20 fark)
  }
  // Stat gücü (Gelecek yatırımı)
  score += myTotalStats * 40;


  // 6. DÜŞMAN TEHDİT ANALİZİ (DEFENSIVE IQ)
  // Düşmanın ne kadar tehlikeli olduğu puanımızı düşürmeli.
  // Düşmanın mermisi yoksa puanımız artmalı (tehdit azaldı).
  const enemyMoves = [e.rock, e.paper, e.scissor];
  let threatScore = 0;

  for (const em of enemyMoves) {
      // Düşmanın elinde mermi varsa ve silahı güçlüyse, bu bir TEHDİTTİR.
      if (em.currentCharges > 0) {
          // Tehdit = (Saldırı Gücü) * (Mermi Varlığı)
          // Bu puanı total skordan düşeceğiz.
          // Yani: Düşmanın mermisini bitiren hamleler daha yüksek puan alacak.
          threatScore += (em.currentATK * 20); 
      }
  }
  
  // Tehdidi skordan düş (Düşmanı silahsız bırakmak iyidir)
  score -= threatScore;

  return score;
}
