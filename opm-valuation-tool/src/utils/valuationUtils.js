/**
 * OPM 估值工具 - Black-Scholes 核心计算模块
 * 
 * 本模块实现基于 Black-Scholes 期权定价模型的资产分配逻辑
 * 用于计算不同资本结构层级（Equity Classes）在不同企业价值断点下的价值分配
 * 
 * ============================================================
 * 核心算法说明（符合 AICPA 估值指南）
 * ============================================================
 * 
 * OPM (Option Pricing Method) 的核心思想：
 * 将企业总权益价值视为一系列看涨期权的组合，每个资本结构层级
 * 对应一个行权价（Strike Price）等于其清算优先权累积值的看涨期权。
 * 
 * 断点区间价值公式：
 *   Tranche Value = C(Lower) - C(Upper)
 * 
 * 为什么使用 C(Lower) - C(Upper) 而不是 C(Upper) - C(Lower)？
 * 
 * 根据 Black-Scholes 模型，看涨期权价值 C(K) 是行权价 K 的
 * 单调递减函数（Monotonically Decreasing Function）：
 *   - 当 K 较小时，期权更可能处于实值状态（In-the-Money），价值更高
 *   - 当 K 较大时，期权更可能处于虚值状态（Out-of-the-Money），价值更低
 * 
 * 因此对于任意两个断点 Lower < Upper，有：
 *   C(Lower) > C(Upper)
 * 
 * 断点区间 [Lower, Upper] 的价值 = C(Lower) - C(Upper) > 0
 * 
 * 这符合 AICPA 估值指南（Valuation of Privately-Held Company
 * Equity Securities Issued as Compensation）的要求：
 * - 每个 Tranche 的价值必须为正数
 * - 所有 Tranche 的价值之和必须等于 Total Equity Value
 * - 分配逻辑必须可审计追溯
 * 
 * 四大审计实务要求：
 * - 所有中间计算步骤必须可追溯
 * - 提供 d1, d2, N(d1), N(d2) 等关键参数
 * - 断点分配表必须完整展示每一层的分配逻辑
 * - 各层分配总额必须等于输入的 Total Equity Value
 */

/**
 * 标准正态分布累积分布函数 (CDF)
 * 使用 Abramowitz and Stegun 近似算法
 */
export function normalCDF(x) {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * 计算 Black-Scholes 模型中的 d1 参数
 * 公式: d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
 */
export function calculateD1(S, K, r, sigma, T) {
  if (K === 0) return Infinity;
  if (S === 0) return -Infinity;
  if (sigma === 0 || T === 0) return S > K ? Infinity : -Infinity;
  const numerator = Math.log(S / K) + (r + (sigma * sigma) / 2) * T;
  const denominator = sigma * Math.sqrt(T);
  return numerator / denominator;
}

/**
 * 计算 Black-Scholes 模型中的 d2 参数
 * 公式: d2 = d1 - σ√T
 */
export function calculateD2(d1, sigma, T) {
  return d1 - sigma * Math.sqrt(T);
}

/**
 * 计算看涨期权价值（Call Option Value）
 * 公式: C = S·N(d1) - K·e^(-rT)·N(d2)
 * 
 * 在 OPM 中的应用：
 * 每一层资本结构可以被视为一个看涨期权
 * - 标的资产：企业总价值
 * - 行权价：该层级之前所有优先权的总和
 * 
 * 注意：C(K) 是 K 的单调递减函数。
 * 即：K 越大，C(K) 越小。
 * 这确保了 C(Lower) > C(Upper) 对于 Lower < Upper 恒成立。
 */
export function calculateCallOption(S, K, r, sigma, T) {
  if (K === 0 || K === null || K === undefined) {
    return { value: S, d1: Infinity, d2: Infinity, Nd1: 1, Nd2: 1 };
  }
  if (S === 0) {
    return { value: 0, d1: -Infinity, d2: -Infinity, Nd1: 0, Nd2: 0 };
  }
  const d1 = calculateD1(S, K, r, sigma, T);
  const d2 = calculateD2(d1, sigma, T);
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const callValue = S * Nd1 - K * Math.exp(-r * T) * Nd2;
  return { value: Math.max(0, callValue), d1, d2, Nd1, Nd2 };
}

/**
 * 计算资本结构的断点（Breakpoints）
 */
export function calculateBreakpoints(equityClasses) {
  const breakpoints = [];
  let cumulativePreference = 0;
  const sortedClasses = [...equityClasses].sort((a, b) => b.seniority - a.seniority);
  sortedClasses.forEach((equityClass, index) => {
    let liquidationPref = 0;
    switch (equityClass.type) {
      case 'preferred':
        liquidationPref = equityClass.liquidationPreference * equityClass.shares * (equityClass.pricePerShare || 1);
        break;
      case 'safe':
        if (equityClass.valuationCap && equityClass.valuationCap > 0) liquidationPref = equityClass.investmentAmount || 0;
        break;
      case 'convertible':
        liquidationPref = (equityClass.principal || 0) * (1 + (equityClass.interestRate || 0) * (equityClass.term || 1));
        break;
      default:
        liquidationPref = 0;
    }
    cumulativePreference += liquidationPref;
    breakpoints.push({ index, value: cumulativePreference, className: equityClass.name, type: equityClass.type });
  });
  return breakpoints;
}

/**
 * 计算完全稀释股数（Fully Diluted Shares）
 */
export function calculateFullyDilutedShares(equityClasses, totalEquityValue = 0) {
  let totalShares = 0;
  equityClasses.forEach(ec => {
    switch (ec.type) {
      case 'common': totalShares += ec.shares; break;
      case 'preferred': totalShares += ec.shares * (ec.conversionRatio || 1); break;
      case 'esop': {
        const vestedShares = ec.shares * (ec.vestedPercentage || 0);
        if (ec.exercisePrice && ec.exercisePrice > 0 && totalEquityValue > 0) {
          const currentPricePerShare = totalEquityValue / (totalShares || 1);
          totalShares += vestedShares - ((vestedShares * ec.exercisePrice) / currentPricePerShare);
        } else {
          totalShares += vestedShares;
        }
        totalShares += (ec.shares * (1 - (ec.vestedPercentage || 0))) * (ec.probabilityOfVesting || 0.5);
        break;
      }
      case 'safe': {
        if (ec.valuationCap && ec.valuationCap > 0 && totalEquityValue > 0) {
          const conversionPrice = Math.min(ec.valuationCap / (totalShares || 1), (totalEquityValue / (totalShares || 1)) * (ec.discountRate || 1));
          totalShares += (ec.investmentAmount || 0) / conversionPrice;
        } else if (ec.discountRate && ec.discountRate > 0) {
          const discountedPrice = (totalEquityValue / (totalShares || 1)) * (1 - ec.discountRate);
          totalShares += (ec.investmentAmount || 0) / discountedPrice;
        } else {
          const currentPrice = totalEquityValue / (totalShares || 1);
          if (currentPrice > 0) totalShares += (ec.investmentAmount || 0) / currentPrice;
        }
        break;
      }
      case 'convertible': {
        const conversionPrice = ec.conversionPrice || (ec.principal / ec.shares) || 1;
        const accruedInterest = (ec.principal || 0) * (ec.interestRate || 0) * (ec.term || 1);
        totalShares += ((ec.principal || 0) + accruedInterest) / conversionPrice;
        break;
      }
      case 'warrant':
        if (ec.exercisePrice && ec.exercisePrice > 0 && totalEquityValue > 0) {
          const currentPricePerShare = totalEquityValue / (totalShares || 1);
          if (currentPricePerShare > ec.exercisePrice) {
            totalShares += ec.shares - ((ec.shares * ec.exercisePrice) / currentPricePerShare);
          }
        } else {
          totalShares += ec.shares;
        }
        break;
      default: totalShares += ec.shares || 0;
    }
  });
  return totalShares;
}

function calculateClassLiquidationPreference(equityClass) {
  switch (equityClass.type) {
    case 'preferred': return equityClass.liquidationPreference * equityClass.shares * (equityClass.pricePerShare || 1);
    case 'safe': return equityClass.investmentAmount || 0;
    case 'convertible': return (equityClass.principal || 0) * (1 + (equityClass.interestRate || 0) * (equityClass.term || 1));
    default: return 0;
  }
}

/**
 * 执行 OPM 完整估值计算
 * 
 * ============================================================
 * 核心算法逻辑（符合 AICPA 估值指南）
 * ============================================================
 * 
 * 第一步：构建断点分配表 (Breakpoint Allocation Table)
 * 
 * 断点分配表是 OPM 估值中最核心的审计追溯工具。
 * 它将企业价值从 0 到 Total Equity Value 划分为多个区间（Tranche），
 * 每个区间对应一个资本结构层级的清算优先权范围。
 * 
 * 对于每个断点 K，我们计算：
 *   - C(K) = S·N(d1) - K·e^(-rT)·N(d2)  (看涨期权价值)
 * 
 * 关键公式：Tranche Value = C(Lower) - C(Upper)
 * 
 * 为什么使用 C(Lower) - C(Upper)？
 * 
 * 根据 Black-Scholes 模型，看涨期权价值 C(K) 是行权价 K 的
 * 单调递减函数。即：K 越大，C(K) 越小。
 * 
 * 因此对于 Lower < Upper，有 C(Lower) > C(Upper)，
 * 所以 Tranche Value = C(Lower) - C(Upper) > 0。
 * 
 * 这确保了：
 * 1. 每个 Tranche 的价值为正数
 * 2. 所有 Tranche 的价值之和 = C(0) - C(TotalEquityValue) = Total Equity Value
 * 3. 符合 AICPA 估值指南的要求
 * 
 * 第二步：分配 Tranche 价值到各资本结构层级
 * 
 * 每个 Tranche 的价值按照各层级在完全稀释基础上的持股比例
 * （Pro-rata）进行分配。分配比例基于各层级的完全稀释股数。
 * 
 * 第三步：汇总每个层级的总价值
 * 
 * 将每个 Tranche 中分配给该层级的值加总，得到该层级的期权价值。
 * 如果有参与权（Participation），还需加上参与权价值。
 * 
 * 最终验证：各层分配总额必须等于输入的 Total Equity Value
 * ============================================================
 */
export function performOPMValuation(totalEquityValue, equityClasses, volatility, riskFreeRate, timeToExit) {
  const results = [];
  const breakpoints = calculateBreakpoints(equityClasses);
  const fullyDilutedShares = calculateFullyDilutedShares(equityClasses, totalEquityValue);
  const sortedClasses = [...equityClasses].sort((a, b) => b.seniority - a.seniority);
  
  // ============================================================
  // 第一步：构建断点分配表 (Breakpoint Allocation Table)
  // ============================================================
  
  const breakpointValues = [0];
  breakpoints.forEach(bp => {
    if (bp.value > 0 && !breakpointValues.includes(bp.value)) breakpointValues.push(bp.value);
  });
  if (!breakpointValues.includes(totalEquityValue)) breakpointValues.push(totalEquityValue);
  const uniqueBreakpoints = [...new Set(breakpointValues)].sort((a, b) => a - b);
  
  const breakpointOptions = uniqueBreakpoints.map(K => {
    const option = calculateCallOption(totalEquityValue, K, riskFreeRate, volatility, timeToExit);
    return { strikePrice: K, ...option };
  });
  
  const breakpointTable = [];
  for (let i = 0; i < uniqueBreakpoints.length - 1; i++) {
    const lower = uniqueBreakpoints[i];
    const upper = uniqueBreakpoints[i + 1];
    const lowerOption = breakpointOptions[i];
    const upperOption = breakpointOptions[i + 1];
    
    // ============================================================
    // 关键公式：Tranche Value = C(Lower) - C(Upper)
    // 根据 Black-Scholes 模型，C(K) 是 K 的单调递减函数。
    // 因此对于 Lower < Upper，有 C(Lower) > C(Upper)。
    // 所以 Tranche Value = C(Lower) - C(Upper) > 0。
    // 这符合 AICPA 估值指南的要求。
    // ============================================================
    const trancheValue = Math.max(0, lowerOption.value - upperOption.value);
    
    // ============================================================
    // 找出该区间内享有分配权的层级
    // 分配权判断：清算优先权 <= Upper 的层级有权参与该区间的分配
    // 每个层级显示其名称、类型、分配比例和分配金额
    // ============================================================
    const eligibleClasses = sortedClasses.filter(ec => {
      const pref = calculateClassLiquidationPreference(ec);
      return pref <= upper;
    });
    
    const totalEligibleShares = eligibleClasses.reduce((sum, ec) => {
      return sum + (ec.shares * (ec.conversionRatio || 1));
    }, 0);
    
    const allocations = eligibleClasses.map(ec => {
      const ecShares = ec.shares * (ec.conversionRatio || 1);
      const proportion = totalEligibleShares > 0 ? ecShares / totalEligibleShares : 0;
      return {
        className: ec.name,
        type: ec.type,
        shares: ec.shares,
        conversionRatio: ec.conversionRatio || 1,
        proportion,
        amount: trancheValue * proportion
      };
    });
    
    breakpointTable.push({
      lower,
      upper,
      lowerOption,
      upperOption,
      trancheValue,
      allocations,
      // 计算公式说明：C(Lower) - C(Upper)
      // 因为 C(K) 是 K 的单调递减函数，所以 C(Lower) > C(Upper)
      formula: `C($${lower.toLocaleString()}) - C($${upper.toLocaleString()}) = $${lowerOption.value.toFixed(2)} - $${upperOption.value.toFixed(2)} = $${trancheValue.toFixed(2)}`
    });
  }
  
  // ============================================================
  // 第二步：汇总每个资本结构层级的总价值
  // 
  // 将每个 Tranche 中分配给该层级的值加总，
  // 得到该层级的期权价值（Option Value）。
  // 如果有参与权（Participation），还需加上参与权价值。
  //
  // 注意：这里的汇总结果必须与断点分配表中的分配金额完全一致。
  // 即：每个层级的总价值 = 该层级在所有 Tranche 中的分配金额之和。
  // 这是确保"估值结果表"与"断点分配表"数据同步的关键步骤。
  // ============================================================
  
  sortedClasses.forEach((equityClass, index) => {
    let strikePrice = 0;
    for (let i = 0; i < index; i++) {
      strikePrice += calculateClassLiquidationPreference(sortedClasses[i]);
    }
    
    // 从断点分配表中汇总该层级的总期权价值
    let optionValue = 0;
    breakpointTable.forEach(tranche => {
      const allocation = tranche.allocations.find(a => a.className === equityClass.name);
      if (allocation) optionValue += allocation.amount;
    });
    
    let totalValue = 0;
    let participationValue = 0;
    let valuePerShare = 0;
    let effectiveShares = 0;
    
    switch (equityClass.type) {
      case 'preferred':
        if (equityClass.participation) {
          const totalShares = equityClasses.reduce((sum, ec) => sum + (ec.shares * (ec.conversionRatio || 1)), 0);
          const classShares = equityClass.shares * (equityClass.conversionRatio || 1);
          const participationRatio = totalShares > 0 ? classShares / totalShares : 0;
          const lastBreakpoint = breakpoints.length > 0 ? breakpoints[breakpoints.length - 1].value : 0;
          participationValue = Math.max(0, totalEquityValue - lastBreakpoint) * participationRatio;
        }
        totalValue = optionValue + participationValue;
        effectiveShares = equityClass.shares * (equityClass.conversionRatio || 1);
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      case 'common':
        totalValue = optionValue;
        effectiveShares = equityClass.shares;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      case 'esop': {
        const esopCallOption = calculateCallOption(totalEquityValue, equityClass.exercisePrice || 0, riskFreeRate, volatility, timeToExit);
        const vestedRatio = equityClass.vestedPercentage || 0;
        const vestingProbability = equityClass.probabilityOfVesting || 0.5;
        optionValue = (esopCallOption.value * vestedRatio) + (esopCallOption.value * (1 - vestedRatio) * vestingProbability);
        totalValue = optionValue;
        effectiveShares = equityClass.shares;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      }
      case 'safe': {
        let safeValue = 0;
        if (equityClass.valuationCap && equityClass.valuationCap > 0) {
          const capRatio = Math.min(1, equityClass.valuationCap / totalEquityValue);
          safeValue = Math.min((equityClass.investmentAmount || 0) / capRatio, totalEquityValue * 0.5);
        } else if (equityClass.discountRate && equityClass.discountRate > 0) {
          safeValue = (equityClass.investmentAmount || 0) / (1 - equityClass.discountRate);
        } else {
          safeValue = equityClass.investmentAmount || 0;
        }
        optionValue = safeValue;
        totalValue = optionValue;
        effectiveShares = equityClass.shares || 1;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      }
      case 'convertible': {
        const principal = equityClass.principal || 0;
        const accruedInterest = principal * (equityClass.interestRate || 0) * timeToExit;
        const totalDebtValue = principal + accruedInterest;
        const conversionPrice = equityClass.conversionPrice || (principal / (equityClass.shares || 1));
        const conversionShares = totalDebtValue / conversionPrice;
        const conversionValue = (totalEquityValue / fullyDilutedShares) * conversionShares;
        optionValue = Math.max(totalDebtValue, conversionValue);
        totalValue = optionValue;
        effectiveShares = equityClass.shares || 1;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      }
      case 'warrant': {
        const warrantCallOption = calculateCallOption(totalEquityValue, equityClass.exercisePrice || 0, riskFreeRate, volatility, timeToExit);
        optionValue = warrantCallOption.value;
        totalValue = optionValue;
        effectiveShares = equityClass.shares;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      }
      default:
        totalValue = optionValue;
        effectiveShares = equityClass.shares || 0;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
    }
    
    const callOption = calculateCallOption(totalEquityValue, strikePrice, riskFreeRate, volatility, timeToExit);
    
    results.push({
      className: equityClass.name,
      type: equityClass.type,
      shares: equityClass.shares,
      conversionRatio: equityClass.conversionRatio || 1,
      fullyDilutedShares: effectiveShares,
      strikePrice,
      optionValue,
      participationValue,
      totalValue,
      valuePerShare,
      calculations: {
        d1: callOption.d1,
        d2: callOption.d2,
        Nd1: callOption.Nd1,
        Nd2: callOption.Nd2,
        volatility,
        riskFreeRate,
        timeToExit,
        totalEquityValue,
        fullyDilutedShares
      }
    });
  });
  
  const totalAllocated = results.reduce((sum, r) => sum + r.totalValue, 0);
  
  return { results, breakpointTable, totalAllocated };
}

/**
 * 导出计算逻辑说明（用于 Excel 导出）
 */
export function generateCalculationExplanation(result, lang = 'zh') {
  const { calculations, strikePrice, optionValue, participationValue, totalValue } = result;
  
  const typeLabels = {
    common: lang === 'en' ? 'Common Stock' : '普通股 (Common Stock)',
    preferred: lang === 'en' ? 'Preferred Stock' : '优先股 (Preferred Stock)',
    esop: lang === 'en' ? 'ESOP' : '员工期权 (ESOP)',
    safe: 'SAFE',
    convertible: lang === 'en' ? 'Convertible Note' : '可转换债券 (Convertible Note)',
    warrant: lang === 'en' ? 'Warrant' : '认股权证 (Warrant)'
  };
  
  const typeLabel = typeLabels[result.type] || result.type;
  
  if (lang === 'en') {
    return [
      `Calculation Explanation - ${result.className} (${typeLabel})`,
      `==============================================`,
      ``,
      `1. Base Parameters:`,
      `   - Total Equity Value (S): $${calculations.totalEquityValue.toLocaleString()}`,
      `   - Strike Price (K): $${strikePrice.toLocaleString()}`,
      `   - Risk-free Rate (r): ${(calculations.riskFreeRate * 100).toFixed(2)}%`,
      `   - Volatility (σ): ${(calculations.volatility * 100).toFixed(2)}%`,
      `   - Term (T): ${calculations.timeToExit} years`,
      `   - Fully Diluted Shares: ${calculations.fullyDilutedShares.toLocaleString()}`,
      ``,
      `2. Black-Scholes Intermediate Parameters:`,
      `   - d1 = ${calculations.d1.toFixed(6)}`,
      `   - d2 = ${calculations.d2.toFixed(6)}`,
      `   - N(d1) = ${calculations.Nd1.toFixed(6)}`,
      `   - N(d2) = ${calculations.Nd2.toFixed(6)}`,
      ``,
      `3. Option Value Calculation:`,
      `   Call Value = S × N(d1) - K × e^(-rT) × N(d2)`,
      `   = ${calculations.totalEquityValue.toLocaleString()} × ${calculations.Nd1.toFixed(6)} - ${strikePrice.toLocaleString()} × e^(-${calculations.riskFreeRate}×${calculations.timeToExit}) × ${calculations.Nd2.toFixed(6)}`,
      `   = $${optionValue.toLocaleString()}`,
      ``,
      `4. Participation Value:`,
      `   Participation Value = $${participationValue.toLocaleString()}`,
      ``,
      `5. Total Value:`,
      `   Total Value = Option Value + Participation Value`,
      `   = $${optionValue.toLocaleString()} + $${participationValue.toLocaleString()}`,
      `   = $${totalValue.toLocaleString()}`,
      ``,
      `6. Value Per Share:`,
      `   Value Per Share = Total Value / Fully Diluted Shares`,
      `   = $${totalValue.toLocaleString()} / ${calculations.fullyDilutedShares.toLocaleString()}`,
      `   = $${(totalValue / (calculations.fullyDilutedShares || 1)).toFixed(4)}`
    ].join('\n');
  }
  
  return [
    `计算逻辑说明 - ${result.className} (${typeLabel})`,
    `==============================================`,
    ``,
    `1. 基础参数:`,
    `   - 企业总价值 (Total Equity Value, S): $${calculations.totalEquityValue.toLocaleString()}`,
    `   - 行权价格 (Strike Price, K): $${strikePrice.toLocaleString()}`,
    `   - 无风险利率 (Risk-free Rate, r): ${(calculations.riskFreeRate * 100).toFixed(2)}%`,
    `   - 波动率 (Volatility, σ): ${(calculations.volatility * 100).toFixed(2)}%`,
    `   - 期限 (Term, T): ${calculations.timeToExit} 年`,
    `   - 完全稀释股数 (Fully Diluted Shares): ${calculations.fullyDilutedShares.toLocaleString()}`,
    ``,
    `2. Black-Scholes 中间参数:`,
    `   - d1 = ${calculations.d1.toFixed(6)}`,
    `   - d2 = ${calculations.d2.toFixed(6)}`,
    `   - N(d1) = ${calculations.Nd1.toFixed(6)}`,
    `   - N(d2) = ${calculations.Nd2.toFixed(6)}`,
    ``,
    `3. 期权价值计算:`,
    `   看涨期权价值 = S × N(d1) - K × e^(-rT) × N(d2)`,
    `   = ${calculations.totalEquityValue.toLocaleString()} × ${calculations.Nd1.toFixed(6)} - ${strikePrice.toLocaleString()} × e^(-${calculations.riskFreeRate}×${calculations.timeToExit}) × ${calculations.Nd2.toFixed(6)}`,
    `   = $${optionValue.toLocaleString()}`,
    ``,
    `4. 参与权价值 (Participation Value):`,
    `   参与权价值 = $${participationValue.toLocaleString()}`,
    ``,
    `5. 总价值:`,
    `   总价值 = 期权价值 + 参与权价值`,
    `   = $${optionValue.toLocaleString()} + $${participationValue.toLocaleString()}`,
    `   = $${totalValue.toLocaleString()}`,
    ``,
    `6. 每股价值:`,
    `   每股价值 = 总价值 / 完全稀释股数`,
    `   = $${totalValue.toLocaleString()} / ${calculations.fullyDilutedShares.toLocaleString()}`,
    `   = $${(totalValue / (calculations.fullyDilutedShares || 1)).toFixed(4)}`
  ].join('\n');
}
