private getLootSynergyScore(state: GigaverseRunState, loot: any): number {
    const p = state.player;
    const type = loot.boonTypeString;
    let score = 0;
  
    switch (type) {
      // ---------------------------------------------------------
      // 1. CAN YÖNETİMİ (Artık daha "Cesur")
      // ---------------------------------------------------------
      case "Heal": {
        const missingHealth = p.health.max - p.health.current;
        const hpPercent = p.health.current / p.health.max; // 0.0 ile 1.0 arası
        const healAmount = loot.selectedVal1 || 0;
  
        // KURAL 1: Canın %60'ın üzerindeyse Heal alma, git güçlen!
        if (hpPercent > 0.60) {
            return -200; // Caydırıcı puan
        }
        
        if (missingHealth <= 0) return -5000;
  
        const effectiveHeal = Math.min(missingHealth, healAmount);
        
        // KURAL 2: Sadece can kritikse (%35 altı) yüksek puan ver (Panik Modu)
        // Can %50 civarıysa düşük puan ver.
        let urgency = 1;
        if (hpPercent < 0.35) urgency = 10; // Ölüyoruz!
        else urgency = 2; // İdare ederiz.
  
        score += effectiveHeal * urgency;
        break;
      }
  
      case "AddMaxHealth": {
        // Max HP değerlidir ama hasar kadar değil. Puanı makul tutuyoruz.
        // +2 MaxHP => 50 Puan
        score += (loot.selectedVal1 || 0) * 25; 
        break;
      }
  
      case "AddMaxArmor": {
        // ESKİ: *60 -> YENİ: *30
        // +1 Armor artık sadece 30 puan. 
        // Böylece +3 Sword Def (Build bonuslarıyla 100+ puan) onu rahatça geçer.
        score += (loot.selectedVal1 || 0) * 30;
        break;
      }
  
      // ---------------------------------------------------------
      // 2. BUILD STRATEJİSİ & DOYGUNLUK KONTROLÜ
      // ---------------------------------------------------------
      case "UpgradeRock":
      case "UpgradePaper":
      case "UpgradeScissor": {
        const isAtk = (loot.selectedVal1 || 0) > 0;
        const val = isAtk ? loot.selectedVal1 : loot.selectedVal2;
  
        let charges = 0;
        let currentStat = 0;
        let buildMultiplier = 1.0;

        // Element Kontrolü
        if (type === "UpgradeRock") {
            charges = p.rock.currentCharges;
            currentStat = isAtk ? p.rock.currentATK : p.rock.currentDEF;
            buildMultiplier = 2.5; // Rock çok önemli (x2.5 yaptık)
        } else if (type === "UpgradePaper") {
            charges = p.paper.currentCharges;
            currentStat = isAtk ? p.paper.currentATK : p.paper.currentDEF;
            buildMultiplier = 2.5; // Paper çok önemli
        } else if (type === "UpgradeScissor") {
            charges = p.scissor.currentCharges;
            currentStat = isAtk ? p.scissor.currentATK : p.scissor.currentDEF;
            buildMultiplier = 0.2; // Scissor çöp (iyice düşürdük)
        }

        // --- DEFANS İÇİN "DOYGUNLUK" (CAP) KONTROLÜ ---
        // Eğer Defans Upgrade'i ise ve zaten Max Armor'a ulaştıysak değeri düşmeli.
        let usefulness = 1.0;
        if (!isAtk) { // Eğer bu bir DEF geliştirmesi ise
            const currentTotalDef = currentStat; // Kabaca o anki defansımız
            const maxArmor = p.armor.max;
            
            // Eğer kartın defansı zaten Max Armor'dan büyükse, daha fazla Def
            // eklemek o kadar da kritik değildir (Yine de iyidir ama öncelik azalır).
            // Ama senin örneğindeki gibi (Def 9 < Armor 16) ise, çok değerlidir.
            if (currentTotalDef < maxArmor) {
                usefulness = 2.0; // Kapasite dolana kadar DEF bas!
            } else {
                usefulness = 0.8; // Zaten taşıyor, belki başka şeye bakarız.
            }
        }
        // ---------------------------------------------
  
        if (charges > 0) {
            // Mermi limiti (Cap) 6. 
            const effectiveChargeImpact = Math.min(charges, 6); 
            
            // Formül: Değer * Mermi * 5 * BuildTorpili * İşeYarama
            score += val * effectiveChargeImpact * 5 * buildMultiplier * usefulness;
            
            // Mevcut statı da hafif ödüllendir (Stacking)
            score += currentStat * 1 * buildMultiplier;
        } else {
            // Mermi yoksa düşük puan
            score += val * 1 * buildMultiplier;
        }
        break;
      }

      default:
        score += 20; 
        break;
    }
  
    return score;
  }
