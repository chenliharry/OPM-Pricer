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
 * ============================================================
 * 计算单个证券的清算优先权金额
 * 
 * 用于确定该证券在清算瀑布（Waterfall）中的优先级位置。
 * 清算优先权越高，该证券越早获得分配。
 * 
 * 各类型证券的清算优先权计算：
 * - Preferred: 清算优先权倍数 × 股数 × 每股价格
 * - SAFE: 投资金额（估值上限模式下）
 * - Convertible: 本金 × (1 + 利率 × 期限)
 * - Common/ESOP/Warrant: 0（无清算优先权）
 * ============================================================
 */
function calculateClassLiquidationPreference(equityClass) {
  switch (equityClass.type) {
    case 'preferred': return equityClass.liquidationPreference * equityClass.shares * (equityClass.pricePerShare || 1);
    case 'safe': return equityClass.investmentAmount || 0;
    case 'convertible': return (equityClass.principal || 0) * (1 + (equityClass.interestRate || 0) * (equityClass.term || 1));
    default: return 0;
  }
}

/**
 * ============================================================
 * 获取证券在给定断点下的有效股数
 * 
 * 关键逻辑（ESOP 动态行权）：
 * - 对于 ESOP，只有行权价 (exercisePrice) ≤ K_lower 时，
 *   该 ESOP 才被视为"已解锁"（In-the-Money），计入分配分母。
 * - 随着断点 K_lower 升高，越来越多的 ESOP 进入实值状态，
 *   参与分配的总股数动态增加，实现"动态股权稀释"。
 * - 对于非 ESOP 类型，始终计入全部股数。
 * ============================================================
 */
function getEffectiveSharesAtBreakpoint(equityClass, lowerBound) {
  switch (equityClass.type) {
    case 'esop': {
      // ESOP 动态行权：只有行权价 ≤ lowerBound 时才计入
      const exercisePrice = equityClass.exercisePrice || 0;
      if (exercisePrice > 0 && exercisePrice > lowerBound) {
        return 0; // 该 ESOP 在此断点下尚未解锁
      }
      // 已解锁的 ESOP：按已行权比例 + 未行权概率折算
      const vestedShares = equityClass.shares * (equityClass.vestedPercentage || 0);
      const unvestedShares = equityClass.shares * (1 - (equityClass.vestedPercentage || 0));
      const vestingProbability = equityClass.probabilityOfVesting || 0.5;
      return vestedShares + unvestedShares * vestingProbability;
    }
    case 'preferred':
      return equityClass.shares * (equityClass.conversionRatio || 1);
    case 'common':
      return equityClass.shares;
    case 'safe':
      return equityClass.shares || 0;
    case 'convertible':
      return equityClass.shares || 0;
    case 'warrant':
      return equityClass.shares;
    default:
      return equityClass.shares || 0;
  }
}

/**
 * ============================================================
 * 构建断点矩阵（Breakpoint Matrix）- 修正版
 * 
 * 核心修正：区分 Per-share Strike Price 和 Aggregate Enterprise Value Breakpoint
 * 
 * 在 OPM 模型中，断点（Breakpoint）代表的是企业总权益价值的某个阈值，
 * 而 ESOP 的行权价是每股价格（Per-share Strike Price）。
 * 因此需要将每股行权价转换为对应的企业总价值断点。
 * 
 * 关键公式：
 *   BP_ESOP = cumulativePref + (StrikePrice × ActiveCommonShares)
 * 
 * 其中：
 *   - cumulativePref: 所有优先股的清算优先权累积值
 *   - StrikePrice: ESOP 的每股行权价
 *   - ActiveCommonShares: 当前活跃的普通股股数
 *     （在 ESOP 解锁前 = Common Shares；解锁后 = Common + ESOP Shares）
 * 
 * 这是一个迭代过程：
 *   1. 先处理所有清算优先权，形成初始断点
 *   2. 然后按行权价从小到大处理 ESOP：
 *      - 计算当前活跃的普通股股数
 *      - 用公式 BP_ESOP = cumulativePref + (StrikePrice × ActiveCommonShares)
 *        计算该 ESOP 触发时的企业总价值
 *      - 将该 BP_ESOP 加入断点矩阵
 *      - 更新 ActiveCommonShares（该 ESOP 解锁后，普通股股数增加）
 *   3. 后续 ESOP 的触发点会因为普通股股数增加而改变
 * 
 * 示例：
 *   - Series A: 1M shares, $5M liquidation preference
 *   - ESOP 1: 0.5M shares, strike = $0.50/share
 *   - ESOP 2: 0.3M shares, strike = $1.00/share
 *   - Common: 5M shares
 * 
 *   初始 cumulativePref = $5M, ActiveCommonShares = 5M (仅 Common)
 *   ESOP 1 trigger = $5M + ($0.50 × 5M) = $7.5M
 *   解锁后 ActiveCommonShares = 5.5M
 *   ESOP 2 trigger = $5M + ($1.00 × 5.5M) = $10.5M
 * ============================================================
 */
export function buildBreakpointMatrix(equityClasses, totalEquityValue) {
  // 按优先级排序（seniority 越高越优先）
  const sortedClasses = [...equityClasses].sort((a, b) => b.seniority - a.seniority);
  
  // 收集所有断点值
  const breakpointSet = new Set();
  breakpointSet.add(0); // 起始点
  
  // ============================================================
  // 第一阶段：处理所有清算优先权 (Liquidation Preferences)
  // 这些是固定的断点，不受股权稀释影响
  // 
  // 只有 Preferred 类型有清算优先权。
  // Common 和 ESOP 的清算优先权为 0。
  // ============================================================
  let cumulativePref = 0;
  sortedClasses.forEach(ec => {
    const pref = calculateClassLiquidationPreference(ec);
    cumulativePref += pref;
  });
  if (cumulativePref > 0) breakpointSet.add(cumulativePref);
  
  // ============================================================
  // 第二阶段：处理 ESOP 行权触发点 (Exercise Trigger Points)
  // 
  // 这是一个迭代过程，因为 ESOP 行权会稀释分母，
  // 从而改变下一个 ESOP 的行权断点。
  // 
  // 关键公式：
  //   BP_ESOP = cumulativePref + (StrikePrice × ActiveCommonShares)
  // 
  // 其中 ActiveCommonShares 是动态累加的：
  //   - 初始 = 所有 Common 证券的股数之和（不含 ESOP）
  //   - 每解锁一个 ESOP，加上该 ESOP 的有效股数
  // 
  // 为什么 ActiveCommonShares 只包含 Common 和已解锁的 ESOP？
  // 因为 ESOP 的行权价决定了其何时进入"实值状态"。
  // 在 ESOP 解锁前，只有 Common 股东享有剩余价值分配权。
  // ESOP 解锁后，ESOP 持有者与 Common 股东按比例分配剩余价值。
  // ============================================================
  
  // 收集所有 ESOP 并按行权价排序
  const esopClasses = sortedClasses
    .filter(ec => ec.type === 'esop' && ec.exercisePrice && ec.exercisePrice > 0)
    .sort((a, b) => (a.exercisePrice || 0) - (b.exercisePrice || 0));
  
  if (esopClasses.length > 0) {
    // 计算初始 ActiveCommonShares = 所有 Common 证券的股数之和
    // 注意：这里只包含 Common 类型，不包含 ESOP
    let activeCommonShares = sortedClasses
      .filter(ec => ec.type === 'common')
      .reduce((sum, ec) => sum + getEffectiveSharesAtBreakpoint(ec, 0), 0);
    
    // 迭代处理每个 ESOP
    esopClasses.forEach(esop => {
      const exercisePrice = esop.exercisePrice || 0;
      // 计算该 ESOP 触发时的企业总价值断点
      // BP_ESOP = cumulativePref + (StrikePrice × ActiveCommonShares)
      const triggerEV = cumulativePref + (exercisePrice * activeCommonShares);
      
      if (triggerEV > 0 && triggerEV < totalEquityValue) {
        breakpointSet.add(triggerEV);
      }
      
      // 更新 ActiveCommonShares：该 ESOP 解锁后，普通股股数增加
      const esopShares = getEffectiveSharesAtBreakpoint(esop, triggerEV);
      activeCommonShares += esopShares;
    });
  }
  
  // ============================================================
  // 第三阶段：添加终点
  // ============================================================
  if (totalEquityValue > 0) breakpointSet.add(totalEquityValue);
  
  // 排序并返回
  return [...breakpointSet].sort((a, b) => a - b);
}

/**
 * ============================================================
 * 执行 OPM 完整估值计算
 * 
 * 核心算法逻辑（符合 AICPA 估值指南）
 * ============================================================
 * 
 * 第一步：构建断点矩阵
 * - 将所有证券的清算优先权累积值和 ESOP 行权价统一排序
 * - 形成递增的断点序列 [K₀, K₁, K₂, ..., Kₙ]
 * 
 * 第二步：计算每个断点的 Black-Scholes 期权价值
 * - 对每个断点 Kᵢ，计算 C(Kᵢ) = S·N(d₁) - Kᵢ·e^(-rT)·N(d₂)
 * 
 * 第三步：计算增量价值（Tranche Value）
 * - Vᵢ = C(Kᵢ₋₁) - C(Kᵢ)
 * - 由于 C(K) 是 K 的单调递减函数，Vᵢ > 0 恒成立
 * 
 * 第四步：瀑布分配（Waterfall Allocation）
 * - 每个区间 [Kᵢ₋₁, Kᵢ] 的分配规则取决于该区间的位置：
 * 
 *   Tranche 1 [0, cumulativePref]:
 *     100% 价值分配给 Preferred Shares
 *     Common 和 ESOP 的有效股数 = 0
 *     （因为清算优先权要求 Preferred 先获得全额分配）
 * 
 *   Tranche 2 [cumulativePref, BP_ESOP]:
 *     100% 价值分配给 Common Shares
 *     ESOP 的有效股数 = 0
 *     （因为 ESOP 尚未进入实值状态）
 * 
 *   Tranche 3 [BP_ESOP, S]:
 *     价值按比例分配给 Common 和 ESOP
 *     ESOP 的有效股数 = 实际 ESOP 股数
 *     分母 = Common Shares + ESOP Shares
 * 
 * 第五步：汇总各层级总价值
 * - 将每个层级在所有区间中分配到的价值加总
 * - 验证：各层分配总额 = Total Equity Value
 * ============================================================
 */
export function performOPMValuation(totalEquityValue, equityClasses, volatility, riskFreeRate, timeToExit) {
  const results = [];
  const sortedClasses = [...equityClasses].sort((a, b) => b.seniority - a.seniority);
  
  // ============================================================
  // 第一步：构建断点矩阵
  // 将所有证券的清算优先权累积值和 ESOP 行权价统一排序
  // ============================================================
  const uniqueBreakpoints = buildBreakpointMatrix(equityClasses, totalEquityValue);
  
  // 计算 cumulativePref 用于瀑布分配判断
  let cumulativePref = 0;
  sortedClasses.forEach(ec => {
    const pref = calculateClassLiquidationPreference(ec);
    cumulativePref += pref;
  });
  
  // ============================================================
  // 第二步：计算每个断点的 Black-Scholes 期权价值
  // ============================================================
  const breakpointOptions = uniqueBreakpoints.map(K => {
    const option = calculateCallOption(totalEquityValue, K, riskFreeRate, volatility, timeToExit);
    return { strikePrice: K, ...option };
  });
  
  // ============================================================
  // 第三步 & 第四步：构建断点分配表
  // 计算每个区间的增量价值，并按瀑布规则分配
  // ============================================================
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
    // 瀑布分配规则（Waterfall Allocation Rules）
    // 
    // 根据断点位置确定分配规则：
    // 
    // 1. 如果 upper <= cumulativePref:
    //    该区间完全属于清算优先权范围。
    //    只有 Preferred 参与分配，Common 和 ESOP 获得 0。
    //    因为清算优先权要求 Preferred 先获得全额分配。
    // 
    // 2. 如果 lower >= cumulativePref 且 upper <= BP_ESOP:
    //    该区间属于 Common 独占范围。
    //    ESOP 尚未进入实值状态，有效股数 = 0。
    //    100% 价值分配给 Common。
    // 
    // 3. 如果 lower >= BP_ESOP:
    //    该区间属于 Common 和 ESOP 共享范围。
    //    ESOP 已进入实值状态，按比例分配。
    // 
    // 4. 跨区间情况（如 lower < cumulativePref < upper）:
    //    该区间跨越多个分配区域。
    //    所有清算优先权 <= upper 的证券参与分配。
    // ============================================================
    
    // 确定该区间内享有分配权的层级
    // 只有清算优先权 <= upper 的层级才有权参与
    const eligibleClasses = sortedClasses.filter(ec => {
      const pref = calculateClassLiquidationPreference(ec);
      return pref <= upper;
    });
    
    // ============================================================
    // 计算该区间内各层级的有效股数
    // 
    // 瀑布规则：
    // - 在清算优先权范围内（upper <= cumulativePref）：
    //   Common 和 ESOP 的有效股数 = 0
    // - 在 Common 独占范围内（lower >= cumulativePref 且 upper <= BP_ESOP）：
    //   ESOP 的有效股数 = 0
    // - 在共享范围内（lower >= BP_ESOP）：
    //   ESOP 按实际股数参与
    // ============================================================
    const allocations = eligibleClasses.map(ec => {
      let ecShares = 0;
      
      if (ec.type === 'common' || ec.type === 'esop') {
        if (upper <= cumulativePref) {
          // 清算优先权范围内：Common 和 ESOP 获得 0
          ecShares = 0;
        } else if (ec.type === 'esop') {
          // ESOP：只有在其行权价对应的断点 <= lower 时才计入
          // 即该 ESOP 在此价值区间已处于实值状态
          ecShares = getEffectiveSharesAtBreakpoint(ec, lower);
        } else {
          // Common：始终计入（但不在清算优先权范围内）
          ecShares = getEffectiveSharesAtBreakpoint(ec, lower);
        }
      } else {
        // Preferred 和其他类型：始终计入
        ecShares = getEffectiveSharesAtBreakpoint(ec, lower);
      }
      
      return {
        className: ec.name,
        type: ec.type,
        shares: ec.shares,
        effectiveShares: ecShares,
        exercisePrice: ec.exercisePrice || 0,
        conversionRatio: ec.conversionRatio || 1,
        proportion: 0,
        amount: 0
      };
    });
    
    // 计算该区间内的总有效股数
    const totalEligibleShares = allocations.reduce((sum, a) => sum + a.effectiveShares, 0);
    
    // 按比例分配该区间的增量价值
    allocations.forEach(a => {
      a.proportion = totalEligibleShares > 0 ? a.effectiveShares / totalEligibleShares : 0;
      a.amount = trancheValue * a.proportion;
    });
    
    breakpointTable.push({
      lower,
      upper,
      lowerOption,
      upperOption,
      trancheValue,
      allocations,
      // 计算公式说明：C(Lower) - C(Upper)
      formula: `C($${lower.toLocaleString()}) - C($${upper.toLocaleString()}) = $${lowerOption.value.toFixed(2)} - $${upperOption.value.toFixed(2)} = $${trancheValue.toFixed(2)}`
    });
  }
  
  // ============================================================
  // 第五步：汇总每个资本结构层级的总价值
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
    // 计算该层级的行权价（Strike Price）
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
        // 参与权（Participation）：在清算优先权之后，按持股比例参与剩余分配
        if (equityClass.participation) {
          const totalShares = equityClasses.reduce((sum, ec) => sum + (ec.shares * (ec.conversionRatio || 1)), 0);
          const classShares = equityClass.shares * (equityClass.conversionRatio || 1);
          const participationRatio = totalShares > 0 ? classShares / totalShares : 0;
          const lastBreakpoint = uniqueBreakpoints.length > 0 ? uniqueBreakpoints[uniqueBreakpoints.length - 1] : 0;
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
        // ESOP 价值 = 看涨期权价值 × 已行权比例 + 看涨期权价值 × 未行权比例 × 行权概率
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
        // SAFE 价值：取估值上限模式和折扣率模式中的较高者
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
        // 可转换债券：取"债券价值"和"转换价值"中的较高者
        const principal = equityClass.principal || 0;
        const accruedInterest = principal * (equityClass.interestRate || 0) * timeToExit;
        const totalDebtValue = principal + accruedInterest;
        const conversionPrice = equityClass.conversionPrice || (principal / (equityClass.shares || 1));
        const conversionShares = totalDebtValue / conversionPrice;
        const fullyDilutedShares = sortedClasses.reduce((sum, ec) => sum + getEffectiveSharesAtBreakpoint(ec, totalEquityValue), 0);
        const conversionValue = (totalEquityValue / fullyDilutedShares) * conversionShares;
        optionValue = Math.max(totalDebtValue, conversionValue);
        totalValue = optionValue;
        effectiveShares = equityClass.shares || 1;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      }
      case 'warrant': {
        // 认股权证：看涨期权价值
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
        fullyDilutedShares: effectiveShares
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

