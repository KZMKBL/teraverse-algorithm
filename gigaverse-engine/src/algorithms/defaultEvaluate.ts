// path: gigaverse-engine/src/algorithms/defaultEvaluate.ts

import { GigaverseRunState } from "../simulator/GigaverseTypes";

/**
 * Evaluates the state to give a numeric score.
 * Higher is better.
 * Used by Expectimax to decide which future is brighter.
 */
export function defaultEvaluate(state: GigaverseRunState): number {
  const p = state.player;
  const e = state.enemies[state.currentEnemyIndex];

  // 1. ÖLÜM KONTROLÜ (EN KRİTİK)
  // Eğer öldüysek, dünyanın en kötü puanını verelim.
  // 0 vermek yetmez, çünkü bazen 0 puanlı "idare eder" durumlar olabilir.
  if (p.health.current <= 0) return -1000000;

  // Başlangıç puanı
  let score = 0;

  // 2. İLERLEME PUANI (LEVEL ATLAMA)
  // Her düşman öldürmek devasa bir başarıdır.
  // Bunu diğer faktörlerden (can, zırh) daha değerli kılmalıyız.
  score += state.currentEnemyIndex * 50000;

  // 3. OYUNCU SAĞLIĞI (SURVIVAL)
  // Oran (Ratio) yerine Mutlak Değer (Absolute) kullanıyoruz.
  // Çünkü 100/100 HP, 10/10 HP'den çok daha iyidir.
  score += p.health.current * 100;      // Her 1 HP = 100 Puan
  score += p.armor.current * 50;        // Her 1 Zırh = 50 Puan

  // 4. DÜŞMAN DURUMU (AGGRESSION)
  // Expectimax'ın "Düşmana vurmak iyidir" diyebilmesi için bu şart.
  if (e && e.health.current > 0) {
      // Düşmanın canı ne kadar AZ ise o kadar iyi.
      // Toplam Canından kalan canı çıkarıp, verdiğimiz hasarı ödüllendiriyoruz.
      const damageDealt = e.health.max - e.health.current;
      score += damageDealt * 100; // Düşmana vurulan her hasar +100 puan

      // Düşmanın zırhını kırmak da taktiksel avantajdır.
      const armorBroken = e.armor.max - e.armor.current;
      score += armorBroken * 40;
  } else if (!e || e.health.current <= 0) {
      // Düşman öldüyse veya yoksa ekstra bonus (Level geçiş anı)
      score += 20000;
  }

  // 5. GÜÇ VE POTANSİYEL (ECONOMY)
  // Statlarımıza (ATK/DEF) ve Mermilerimize (Charges) puan verelim.
  // Böylece bot "Şu an vuramıyorum ama şarj dolduruyorum" diyebilsin.
  
  const moves = [p.rock, p.paper, p.scissor];
  let totalStats = 0;
  let penalty = 0;

  for (const m of moves) {
      // Statların toplam gücü (Geleceğe yatırım)
      totalStats += m.currentATK + m.currentDEF;

      // Mermi Yönetimi:
      // Mermimiz 0 ise kötü, -1 ise çok kötü.
      if (m.currentCharges === -1) penalty += 500; // Ceza
      else if (m.currentCharges === 0) penalty += 100; // Hafif Ceza
      
      // Mermi biriktirmek iyidir (Max 3'e kadar)
      if (m.currentCharges > 0) score += m.currentCharges * 20;
  }

  // Statlar kalıcı olduğu için çarpanı yüksek tutuyoruz.
  score += totalStats * 50; 
  
  // Cezayı düşüyoruz
  score -= penalty;

  return score;
}
