/**
 * OPM 估值工具 - Black-Scholes 核心计算模块
 * 
 * 本模块实现基于 Black-Scholes 期权定价模型的资产分配逻辑
 * 用于计算不同资本结构层级（Equity Classes）在不同企业价值断点下的价值分配
 * 
 * ============================================================
 * 核心算法说明（符合 AICPA 估值指南 & Mercer Capital 实务）
 * ============================================================
 * 
 * OPM (Option Pricing Method) 的核心思想：
 * 将企业总权益价值视为一系列看涨期权的组合，每个断点（Breakpoint）
 * 对应一个行权价（Strike Price）的看涨期权。
 * 
 * 断点区间价值公式：
 *   Tranche Value = C(Lower) - C(Upper)
 * 
 * 其中 C(K) 是 Black-Scholes 看涨期权价值，是行权价 K 的单调递减函数。
 * 因此对于 Lower < Upper，有 C(Lower) > C(Upper)，Tranche Value > 0。
 * 
 * ============================================================
 * 高级断点矩阵算法（Mercer Capital 合规）
 * ============================================================
 * 
 * 本算法支持无限层级的资本结构，核心改进：
 * 
 * 1. 绝对清算优先权累积（Absolute Seniority Claims）
 *    - 包含所有优先股的清算优先权
 *    - 这些是"绝对优先"的，在瀑布最上层
 * 
 * 2. 参与权优先股（Participating Preferred）直接计入分母
 *    - 参与权优先股从一开始就参与剩余价值分配
 *    - 其股数直接加入 activeShares 基础分母
 * 
 * 3. 不带参与权优先股的自动转股（Auto-Conversion）
 *    - 当转股价值等于清算优先权时，优先股自动转换为普通股
 *    - 转股后，其清算优先权从 cumulativeAbsolutePref 中扣除
 *    - 其股数流入 activeShares 分母
 * 
 * 4. 多层 ESOP 阶梯触发
 *    - 每个 ESOP 批次按行权价升序排列
 *    - 每解锁一个 ESOP，其股数流入分母，稀释后续区间
 * 
 * 5. 完全比例分配（Proportional Allocation）
 *    - 每个 Tranche 的价值按各证券的有效股数比例分配
 *    - 不再有"三层瀑布"的硬编码限制
 *    - 支持任意数量的断点区间
 * 
 * ============================================================
 * 股息率调整（Dividend-Adjusted Black-Scholes）
 * ============================================================
 * 
 * 当标的资产支付股息时，Black-Scholes 模型需要调整：
 *   d1 = [ln(S/K) + (r - q + σ²/2)T] / (σ√T)
 *   d2 = d1 - σ√T
 *   C = S·e^(-qT)·N(d1) - K·e^(-rT)·N(d2)
 * 
 * 其中 q 为连续股息率。股息率越高，看涨期权价值越低，
 * 因为股息支付会减少标的资产的价值增长。
 * 
 * ============================================================
 * Finnerty DLOM 模型（Discount for Lack of Marketability）
 * ============================================================
 * 
 * Finnerty (2012) 模型基于期权定价理论计算缺乏市场流通性折扣：
 *   DLOM = 1 - e^(-σ_class × √T_holding)
 * 
 * 其中：
 * - σ_class 为该层级证券的特有波动率
 * - T_holding 为预期持有期（通常与 OPM 的 timeToExit 一致）
 * 
 * 层级特有波动率 σ_class 的计算：
 * 使用期权弹性（Omega）方法：
 *   Omega = (S / V_class) × (∂V_class/∂S) = (S / V_class) × delta_class
 *   σ_class = Omega × σ_firm
 * 
 * 其中 delta_class 是该层级证券对标的资产价值变化的敏感度，
 * 通过 OPM 断点分配矩阵的边际变化率计算。
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
 * 标准正态分布概率密度函数 (PDF)
 * 公式: φ(x) = (1/√(2π)) · e^(-x²/2)
 */
export function normalPDF(x) {
  if (x === Infinity || x === -Infinity) return 0;
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-x * x / 2);
}

/**
 * 计算 Black-Scholes 模型中的 d1 参数（含股息调整）
 * 公式: d1 = [ln(S/K) + (r - q + σ²/2)T] / (σ√T)
 * 
 * 在四大估值实务中：
 * - 如果标的资产支付股息（q > 0），d1 会减小
 * - 因为股息支付降低了资产的预期增长率
 * - 这导致看涨期权价值下降，看跌期权价值上升
 */
export function calculateD1(S, K, r, sigma, T, q = 0) {
  if (K === 0) return Infinity;
  if (S === 0) return -Infinity;
  if (sigma === 0 || T === 0) return S > K ? Infinity : -Infinity;
  const numerator = Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T;
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
 * 计算看涨期权价值（Call Option Value）- 含股息调整
 * 公式: C = S·e^(-qT)·N(d1) - K·e^(-rT)·N(d2)
 * 
 * 在 OPM 中的应用：
 * 每个断点 K 对应一个看涨期权
 * - 标的资产：企业总价值 S
 * - 行权价：断点 K
 * - 股息率 q：如果企业支付股息，会降低看涨期权价值
 * 
 * 注意：C(K) 是 K 的单调递减函数。
 * 即：K 越大，C(K) 越小。
 * 这确保了 C(Lower) > C(Upper) 对于 Lower < Upper 恒成立。
 */
export function calculateCallOption(S, K, r, sigma, T, q = 0) {
  if (K === 0 || K === null || K === undefined) {
    // 行权价为 0 时，看涨期权价值等于标的资产现值（含股息调整）
    return { value: S * Math.exp(-q * T), d1: Infinity, d2: Infinity, Nd1: 1, Nd2: 1 };
  }
  if (S === 0) {
    return { value: 0, d1: -Infinity, d2: -Infinity, Nd1: 0, Nd2: 0 };
  }
  const d1 = calculateD1(S, K, r, sigma, T, q);
  const d2 = calculateD2(d1, sigma, T);
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  // 含股息调整的看涨期权公式
  const callValue = S * Math.exp(-q * T) * Nd1 - K * Math.exp(-r * T) * Nd2;
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
 * - Preferred: 股数 × 每股价格（即该轮融资总额）
 * - Common/ESOP/Warrant (seniority=0): 0（无清算优先权）
 * 
 * 注意：seniority 字段用于过滤哪些证券的清算优先权计入
 * cumulativeAbsolutePref。只有 seniority > 1 的证券才计入。
 * 清算优先权金额 = shares × pricePerShare（即该轮融资总额），
 * 不需要再乘以 liquidationPreference 倍数。
 * ============================================================
 */
function calculateClassLiquidationPreference(equityClass) {
  switch (equityClass.type) {
    case 'preferred': return equityClass.shares * (equityClass.pricePerShare || 1);
    default: return 0;
  }
}

/**
 * ============================================================
 * 获取证券在给定断点下的有效股数
 * 
 * 关键逻辑：
 * - 对于 ESOP，使用 cumulativeAbsolutePref + (exercisePrice × activeSharesAtThatPoint)
 *   计算该 ESOP 的专属企业价值断点（triggerEV）。只有 K_lower ≥ triggerEV 时，
 *   该 ESOP 才被视为"已解锁"（In-the-Money），计入分配分母。
 * - 对于 Preferred，始终按转股比例计算股数。
 * - 对于 Common，始终按实际股数计算。
 * 
 * 注意：lowerBound 是 Enterprise Value 金额（美元），不是每股价格。
 * ESOP 的 exercisePrice 是每股价格，不能直接与 lowerBound 比较。
 * 正确的比较方式是通过 triggerEV = cumulativeAbsolutePref + (exercisePrice × activeShares)。
 * ============================================================
 */
function getEffectiveSharesAtBreakpoint(equityClass, lowerBound, cumulativeAbsolutePref, activeSharesAtBreakpoint) {
  switch (equityClass.type) {
    case 'esop': {
      // ESOP 有效股数计算（Treasury Stock Method）
      // 注意：行权判断（是否已解锁）已在 calculateMarginalAllocationMatrix 中
      // 通过 esopBreakpointByPrice 统一完成。相同行权价的 ESOP 共享同一个
      // 断点，同时开始参与分配。因此这里不再重复计算 triggerEV。
      // 
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
    case 'warrant':
      return equityClass.shares;
    default:
      return equityClass.shares || 0;
  }
}

/**
 * ============================================================
 * 构建高级断点矩阵（Fully Diluted & Mercer Capital Compliant）
 * 
 * 核心改进：支持无限层级的资本结构，处理参与权/非参与权优先股、
 * 多层 ESOP、可转换债券等复杂场景。
 * 
 * 算法步骤：
 * 
 * 第一阶段：绝对清算优先权累积
 *   cumulativeAbsolutePref = sum(All Preferred.liquidationPreference)
 *   这是所有"绝对优先"的债权/优先权总和。
 * 
 * 第二阶段：初始化普通股及带参与权证券的分母
 *   activeShares = sum(Common.shares) + sum(ParticipatingPreferred.shares)
 *   参与权优先股从一开始就参与剩余价值分配。
 * 
 * 第三阶段：迭代处理多层 ESOP 行权点与不带参与权优先股的"自动转股点"
 *   将所有具有每股阈值的事件（ESOP行权价、不带参与权优先股的转股触发价）按升序排列。
 *   每个事件触发时：
 *   - ESOP: 计算触发断点，解锁后股数流入分母
 *   - Non-participating Preferred: 计算转股断点，转股后清算优先权从 cumulativeAbsolutePref 中扣除，股数流入分母
 * 
 * 第四阶段：并入当前企业实际总价值终点
 * 
 * 返回值：{ breakpoints: number[], cumulativeAbsolutePref: number, events: Array }
 * 其中 events 记录了每个事件的触发断点和类型，用于后续的边际分配矩阵计算。
 * ============================================================
 */
export function buildAdvancedBreakpointMatrix(equityClasses, totalEquityValue) {
  // Step 1: Initialize with absolute boundaries
  const K = [0];
  const S = totalEquityValue;

  // ============================================================
  // Step 2: Calculate Absolute Liquidation Preference Pool
  // Include Preferred with seniority > 1.
  // 
  // Seniority-based breakpoints:
  // 如果所有证券的 seniority 相同，直接加总为一个断点。
  // 如果 seniority 不同，按 seniority 分组，每组生成一个断点，
  // 实现"逐层分配"的效果（高 seniority 优先获得分配）。
  // ============================================================
  const seniorityClasses = equityClasses.filter(c => (c.seniority || 0) > 1);
  
  // Group by seniority, sort descending (highest seniority first)
  const seniorityGroups = {};
  seniorityClasses.forEach(c => {
    const s = c.seniority || 0;
    if (!seniorityGroups[s]) seniorityGroups[s] = [];
    seniorityGroups[s].push(c);
  });
  
  const sortedSeniorities = Object.keys(seniorityGroups).map(Number).sort((a, b) => b - a);
  
  let cumulativeAbsolutePref = 0;
  sortedSeniorities.forEach(seniority => {
    const groupPref = seniorityGroups[seniority].reduce((sum, c) => sum + calculateClassLiquidationPreference(c), 0);
    cumulativeAbsolutePref += groupPref;
    if (cumulativeAbsolutePref > 0) {
      K.push(cumulativeAbsolutePref);
    }
  });

  // ============================================================
  // Step 3: Initialize Base Active Shares for the Common Equity Floor
  // Common stock starts immediately after cumulativeAbsolutePref is filled.
  // ============================================================
  let activeShares = equityClasses
    .filter(c => c.type === 'common')
    .reduce((sum, c) => sum + c.shares, 0);

  // CRITICAL: Participating Preferred shares enter the denominator IMMEDIATELY here!
  const partPreferredShares = equityClasses
    .filter(c => c.type === 'preferred' && c.participation === true)
    .reduce((sum, c) => sum + (c.shares * (c.conversionRatio || 1)), 0);
  
  activeShares += partPreferredShares;

  // ============================================================
  // Step 4: Extract and Sort ALL Per-Share Strike/Trigger Events
  // Gather all ESOPs (grouped by exercise price), Warrants, Non-participating Preferred,
  // and Participating Preferred (participation cap events).
  // ============================================================

  let perShareEvents = [];

  // ESOP events: group by exercise price
  const esopByPrice = {};
  equityClasses
    .filter(c => c.type === 'esop' && c.exercisePrice !== undefined && c.exercisePrice !== null)
    .forEach(c => {
      const price = c.exercisePrice;
      if (!esopByPrice[price]) {
        esopByPrice[price] = { totalShares: 0, classes: [] };
      }
      const effectiveShares = c.shares * (c.vestedPercentage || 1.0);
      esopByPrice[price].totalShares += effectiveShares;
      esopByPrice[price].classes.push(c);
    });
  
  Object.entries(esopByPrice).forEach(([priceStr, group]) => {
    const price = parseFloat(priceStr);
    const className = price > 0 ? `ESOP @ $${price}` : `ESOP @ $0 (Always Vested)`;
    perShareEvents.push({
      id: `esop-${priceStr}`,
      className,
      type: 'esop',
      strike: price,
      shares: group.totalShares
    });
  });

  // Warrant events
  equityClasses
    .filter(c => c.type === 'warrant')
    .filter(c => c.exercisePrice && c.exercisePrice > 0)
    .forEach(c => {
      perShareEvents.push({
        id: c.id,
        className: c.name,
        type: c.type,
        strike: c.exercisePrice,
        shares: c.shares
      });
    });

  // Non-participating Preferred conversion events
  equityClasses
    .filter(c => c.type === 'preferred' && !c.participation && c.shares > 0)
    .forEach(c => {
      const prefAmount = calculateClassLiquidationPreference(c);
      const convertedShares = c.shares * (c.conversionRatio || 1);
      const conversionPrice = convertedShares > 0 ? prefAmount / convertedShares : 0;
      if (conversionPrice > 0) {
        perShareEvents.push({
          id: c.id,
          className: c.name,
          type: 'non_participating_preferred',
          strike: conversionPrice,
          shares: convertedShares,
          removesPref: true,
          prefAmount: prefAmount
        });
      }
    });

  // ============================================================
  // Participating Preferred participation cap events
  // 
  // 只有当 participationCap 被显式设置（不为 null/undefined）时，
  // 才生成参与上限断点。如果 participationCap 为 null/undefined，
  // 表示"无上限（No Cap）"，该优先股将永久留在分母中参与分配。
  // 
  // 在"无上限"场景下：
  // - 优先股在 Phase 1 获得清算优先权
  // - 在 Phase 2 以 as-if-converted 股数永久参与剩余价值分配
  // - 不需要生成任何转股断点
  // ============================================================
  equityClasses
    .filter(c => c.type === 'preferred' && c.participation && c.shares > 0)
    .forEach(c => {
      // 只有当 participationCap 被显式设置时才生成上限断点
      if (c.participationCap !== undefined && c.participationCap !== null) {
        const capMultiple = c.participationCap;
        const capPerShare = (c.pricePerShare || 0) * capMultiple;
        if (capPerShare > 0) {
          perShareEvents.push({
            id: c.id,
            className: c.name,
            type: 'participating_preferred_cap',
            strike: capPerShare,
            shares: c.shares * (c.conversionRatio || 1),
            removesFromActive: true,
            capPerShare
          });
        }
      }
      // 如果 participationCap 为 null/undefined，不生成任何事件
      // 该优先股将永久留在分母中（No Cap / Double-Dipping）
    });

  // Sort events strictly in ascending order by strike price
  perShareEvents.sort((a, b) => a.strike - b.strike);

  // ============================================================
  // Step 4.5: Merge events with the same strike price
  // 当多个证券（如 Preferred 转股、ESOP、Warrant）具有相同的每股行权价时，
  // 它们应该共享同一个断点（Breakpoint），而不是各自生成独立的断点。
  // ============================================================
  const mergedEvents = [];
  let i = 0;
  while (i < perShareEvents.length) {
    const currentStrike = perShareEvents[i].strike;
    let totalShares = 0;
    let hasRemovesPref = false;
    let hasRemovesFromActive = false;
    let prefAmount = 0;
    let classNames = [];
    let types = [];
    
    while (i < perShareEvents.length && perShareEvents[i].strike === currentStrike) {
      const ev = perShareEvents[i];
      totalShares += ev.removesFromActive ? -ev.shares : ev.shares;
      if (ev.removesPref) {
        hasRemovesPref = true;
        prefAmount += ev.prefAmount || 0;
      }
      if (ev.removesFromActive) {
        hasRemovesFromActive = true;
      }
      classNames.push(ev.className);
      types.push(ev.type);
      i++;
    }
    
    mergedEvents.push({
      strike: currentStrike,
      shares: Math.abs(totalShares),
      removesPref: hasRemovesPref,
      removesFromActive: hasRemovesFromActive,
      prefAmount: prefAmount,
      classNames: classNames,
      types: types,
      netSharesChange: totalShares
    });
  }

  // ============================================================
  // Step 5: Iteratively push breakpoints and expand/contract the denominator
  // 
  // 修正后的断点计算公式（符合 AICPA 估值指南）：
  //   Breakpoint_i = Breakpoint_{i-1} + ActiveShares × (ExercisePrice_i - ExercisePrice_{i-1})
  // 
  // 其中：
  //   - Breakpoint_0 = cumulativeAbsolutePref（清算优先权总额）
  //   - ExercisePrice_0 = 0（第一个事件之前的"隐含行权价"）
  //   - ActiveShares 是当前事件触发前的有效股数
  // 
  // 这个公式的直观含义：
  // 每个断点代表"从上一个断点开始，所有 activeShares 需要再增值多少，
  // 才能让每股价值达到当前事件的 exercisePrice"。
  // 
  // 例如：
  //   cumulativeAbsolutePref = $10M, activeShares = 5M
  //   Event 1: exercisePrice = $0.50
  //     BP_1 = $10M + 5M × ($0.50 - $0) = $10M + $2.5M = $12.5M
  //   Event 2: exercisePrice = $1.00, activeShares = 6M (after ESOP unlock)
  //     BP_2 = $12.5M + 6M × ($1.00 - $0.50) = $12.5M + $3M = $15.5M
  // ============================================================
  const processedEvents = [];
  let previousBP = cumulativeAbsolutePref;
  let previousStrike = 0;
  
  mergedEvents.forEach(event => {
    // 修正公式：BP_i = BP_{i-1} + activeShares × (strike_i - strike_{i-1})
    const triggerEV = previousBP + (activeShares * (event.strike - previousStrike));
    
    if (triggerEV > 0) {
      K.push(triggerEV);
    }
    
    // 记录断点前的 activeShares（用于公式说明）
    const activeSharesBeforeEvent = activeShares;
    
    // 更新 activeShares（事件触发后，新证券加入分母）
    activeShares += event.netSharesChange;
    
    event.classNames.forEach((className, idx) => {
      const type = event.types[idx];
      processedEvents.push({
        type: type,
        className: className,
        triggerEV,
        triggerPrice: event.strike,
        sharesAdded: event.netSharesChange,
        activeSharesAfter: activeShares,
        cumulativeAbsolutePrefAfter: cumulativeAbsolutePref,
        // 新增：用于公式说明的字段
        previousBP: previousBP,
        previousStrike: previousStrike,
        activeSharesBeforeEvent: activeSharesBeforeEvent
      });
    });
    
    // 更新前一个断点和行权价
    previousBP = triggerEV;
    previousStrike = event.strike;
  });

  // ============================================================
  // Step 6: Calculate the "Fully Diluted" breakpoint
  // 
  // 完全稀释断点 = 最后一个事件断点 + 最终 activeShares × (lastStrike - 0)
  // 但实际上，最后一个事件之后已经没有更多行权价了，
  // 所以完全稀释断点就是最后一个事件断点本身。
  // 如果最后一个事件之后还有 activeShares 变化，则：
  //   fullyDilutedBP = lastBP + finalActiveShares × (∞ - lastStrike)
  // 但 ∞ 无法计算，所以用最后一个事件断点作为最终断点。
  // ============================================================
  let fullyDilutedBP = previousBP;
  
  if (fullyDilutedBP > 0 && !K.includes(fullyDilutedBP)) {
    K.push(fullyDilutedBP);
  }

  const uniqueK = [...new Set(K)].sort((a, b) => a - b);
  
  // 记录完全稀释时的最终 activeShares 和最后一个事件的 strike
  const finalActiveShares = activeShares;
  const lastStrike = mergedEvents.length > 0 ? mergedEvents[mergedEvents.length - 1].strike : 0;
  
  return { breakpoints: uniqueK, cumulativeAbsolutePref, processedEvents, fullyDilutedBP, finalActiveShares, lastStrike };
}

/**
 * ============================================================
 * 计算给定区间的边际分配比例矩阵
 * ============================================================
 */
export function calculateMarginalAllocationMatrix(breakpoints, equityClasses, cumulativeAbsolutePref, processedEvents) {
  const allocationMatrix = [];

  const classBreakpointMap = {};
  const esopBreakpointByPrice = {};
  const partPrefCapMap = {};
  processedEvents.forEach(event => {
    classBreakpointMap[event.className] = event.triggerEV;
    if (event.type === 'esop') {
      esopBreakpointByPrice[event.triggerPrice] = event.triggerEV;
    }
    if (event.type === 'participating_preferred_cap') {
      partPrefCapMap[event.className] = event.triggerEV;
    }
  });

  // ============================================================
  // 构建 seniority 分组信息，用于清算优先权区间的逐层分配
  // 
  // 在清算优先权区间（K_upper <= cumulativeAbsolutePref），
  // 分配不是按比例进行的，而是按 seniority 逐层分配：
  // - 最高 seniority 的优先股先获得其全部清算优先权
  // - 然后次高 seniority 的优先股获得其全部清算优先权
  // - 以此类推
  // 
  // 为了实现逐层分配，我们需要知道每个 seniority 组的
  // 累积清算优先权断点，以及每个区间内哪些证券参与分配。
  // ============================================================
  const seniorityClasses = equityClasses.filter(c => (c.seniority || 0) > 1);
  const seniorityGroups = {};
  seniorityClasses.forEach(c => {
    const s = c.seniority || 0;
    if (!seniorityGroups[s]) seniorityGroups[s] = [];
    seniorityGroups[s].push(c);
  });
  const sortedSeniorities = Object.keys(seniorityGroups).map(Number).sort((a, b) => b - a);
  
  // 构建 seniority 断点映射：每个 seniority 级别的累积清算优先权
  let cumPref = 0;
  const seniorityBreakpoints = {};
  sortedSeniorities.forEach(seniority => {
    const groupPref = seniorityGroups[seniority].reduce((sum, c) => sum + calculateClassLiquidationPreference(c), 0);
    cumPref += groupPref;
    seniorityBreakpoints[seniority] = cumPref;
  });

  for (let i = 1; i < breakpoints.length; i++) {
    const K_lower = breakpoints[i - 1];
    const K_upper = breakpoints[i];
    
    let activeSharesMap = {};
    let totalActiveSharesInTranche = 0;

    if (K_upper <= cumulativeAbsolutePref) {
      // ============================================================
      // 清算优先权区间：按 seniority 逐层分配
      // 
      // 对于每个 seniority 级别，检查当前区间是否落在该级别的
      // 清算优先权范围内。如果是，只有该 seniority 级别的证券
      // 参与分配（按清算优先权金额比例）。
      // 
      // 例如：
      //   Seniority 3: $5M (Series A)
      //   Seniority 2: $3M (Series B)
      //   cumulativeAbsolutePref = $8M
      //   
      //   区间 [0, $5M]: 只有 Seniority 3 参与分配
      //   区间 [$5M, $8M]: 只有 Seniority 2 参与分配
      // ============================================================
      let activeSeniority = null;
      for (const s of sortedSeniorities) {
        const bp = seniorityBreakpoints[s];
        if (K_upper <= bp) {
          activeSeniority = s;
          break;
        }
      }
      
      if (activeSeniority !== null) {
        // 只有当前 activeSeniority 级别的证券参与分配
        const activeClasses = seniorityGroups[activeSeniority];
        activeClasses.forEach(c => {
          const pref = calculateClassLiquidationPreference(c);
          if (pref > 0) {
            activeSharesMap[c.name] = pref;
            totalActiveSharesInTranche += pref;
          } else {
            activeSharesMap[c.name] = 0;
          }
        });
        // 其他所有证券（包括其他 seniority 级别和 common）分配为 0
        equityClasses.forEach(c => {
          if (!activeSharesMap.hasOwnProperty(c.name)) {
            activeSharesMap[c.name] = 0;
          }
        });
      } else {
        // 如果不在任何 seniority 区间内（理论上不会发生），所有证券分配为 0
        equityClasses.forEach(c => {
          activeSharesMap[c.name] = 0;
        });
      }
    } else {
      equityClasses.forEach(c => {
        if (c.type === 'common') {
          activeSharesMap[c.name] = c.shares;
          totalActiveSharesInTranche += c.shares;
        } else if (c.type === 'preferred' && c.participation) {
          const capTriggerEV = partPrefCapMap[c.name];
          if (capTriggerEV !== undefined && K_lower >= capTriggerEV) {
            activeSharesMap[c.name] = 0;
          } else {
            activeSharesMap[c.name] = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            totalActiveSharesInTranche += activeSharesMap[c.name];
          }
        } else if (c.type === 'preferred' && !c.participation) {
          const triggerEV = classBreakpointMap[c.name];
          // 修正：使用 K_upper >= triggerEV 替代 K_lower >= triggerEV
          // 这样最后一个断点（最高行权价）的 class 也能在最后一个区间参与分配
          if (triggerEV !== undefined && K_upper >= triggerEV) {
            activeSharesMap[c.name] = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            totalActiveSharesInTranche += activeSharesMap[c.name];
          } else {
            activeSharesMap[c.name] = 0;
          }
        } else if (c.type === 'esop') {
          const triggerEV = esopBreakpointByPrice[c.exercisePrice];
          // 修正：使用 K_upper >= triggerEV 替代 K_lower >= triggerEV
          if (triggerEV !== undefined && K_upper >= triggerEV) {
            const effectiveShares = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            activeSharesMap[c.name] = effectiveShares;
            totalActiveSharesInTranche += effectiveShares;
          } else {
            activeSharesMap[c.name] = 0;
          }
        } else if (c.type === 'warrant') {
          const triggerEV = classBreakpointMap[c.name];
          // 修正：使用 K_upper >= triggerEV 替代 K_lower >= triggerEV
          if (triggerEV !== undefined && K_upper >= triggerEV) {
            const effectiveShares = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            activeSharesMap[c.name] = effectiveShares;
            totalActiveSharesInTranche += effectiveShares;
          } else {
            activeSharesMap[c.name] = 0;
          }
        } else {
          const shares = c.shares || 0;
          activeSharesMap[c.name] = shares;
          totalActiveSharesInTranche += shares;
        }
      });
    }

    let trancheProportions = {};
    equityClasses.forEach(c => {
      trancheProportions[c.name] = totalActiveSharesInTranche > 0 
        ? (activeSharesMap[c.name] || 0) / totalActiveSharesInTranche 
        : 0;
    });

    allocationMatrix.push({
      trancheIndex: i,
      range: [K_lower, K_upper],
      proportions: trancheProportions,
      totalActiveShares: totalActiveSharesInTranche
    });
  }

  return allocationMatrix;
}

/**
 * ============================================================
 * 计算各层级证券的 Delta（对标的资产价值的敏感度）
 *
 * 在 OPM 框架中，每个层级证券的价值 V_class 可以表示为
 * 一系列看涨期权价差的加权和：
 *   V_class = Σ_i w_i × [C(K_{i-1}) - C(K_i)]
 *
 * 其中 w_i 是第 i 个 Tranche 中该层级的分配比例。
 *
 * 该层级的 Delta 为（含股息调整）：
 *   delta_class = e^(-qT) × Σ_i w_i × [N(d1_{i-1}) - N(d1_i)]
 *
 * 其中 N(d1) 是看涨期权对标的资产的一阶偏导（Delta）。
 * e^(-qT) 是股息率调整因子：标的资产支付股息降低了
 * 期权价值对标的资产变动的敏感度。
 *
 * 注意：这里使用的是 Tranche 上下限 N(d1) 的差值，
 * 而不是 N(d1) 的绝对值。这是因为每个 Tranche 的价值
 * 是 C(Lower) - C(Upper)，其 Delta 是 N(d1_lower) - N(d1_upper)。
 *
 * 对于 Tail Tranche（upper = ∞），C(∞) 的 Delta = 0，
 * 因此 Tail Tranche 的 Delta = N(d1_lastBP)（不含股息调整的话）。
 *
 * 这个 Delta 用于计算层级特有波动率（Finnerty 模型）：
 *   σ_Class_j = σ_Asset × (S / V_Class_j) × delta_class
 *
 * @param {Array} breakpointTable - 断点分配表
 * @param {string} className - 层级名称
 * @param {number} totalEquityValue - 企业总价值 S
 * @param {number} classValue - 该层级的总价值 V_class
 * @param {number} timeToExit - 预期退出期限 T（用于股息调整）
 * @param {number} dividendYield - 连续股息率 q（用于股息调整）
 * @returns {number} classDelta - 该层级的 Delta（范围 0~1）
 * ============================================================
 */
export function calculateClassDelta(breakpointTable, className, totalEquityValue, classValue, timeToExit = 0, dividendYield = 0) {
  if (totalEquityValue <= 0 || classValue <= 0) return 0;

  let classDelta = 0;

  breakpointTable.forEach(tranche => {
    const allocation = tranche.allocations.find(a => a.className === className);
    if (allocation && allocation.proportion > 0) {
      // 该 Tranche 的 Delta = e^(-qT) × [N(d1_lower) - N(d1_upper)]
      const deltaLower = tranche.lowerOption.Nd1;
      const deltaUpper = tranche.upperOption.Nd1;
      const trancheDelta = deltaLower - deltaUpper;

      // 该层级在该 Tranche 中的贡献 = 分配比例 × Tranche Delta
      classDelta += allocation.proportion * trancheDelta;
    }
  });

  // 股息率调整：Black-Scholes Delta = e^(-qT) × N(d1)
  // 当 q=0 时，e^(-0) = 1，无调整
  if (dividendYield > 0 && timeToExit > 0) {
    classDelta *= Math.exp(-dividendYield * timeToExit);
  }

  return Math.max(0, Math.min(1, classDelta));
}

/**
 * ============================================================
 * 计算层级特有波动率 σ_Class_j 和 Finnerty DLOM
 *
 * 本实现基于 Finnerty (2012) 模型，使用期权弹性（Omega）方法：
 *
 * 公式 1：层级特有波动率（Class Volatility via Omega）
 *   Omega = (S / V_Class_j) × delta_class
 *   σ_Class_j = Omega × σ_Asset
 *
 *   其中：
 *   - S: 企业总权益价值
 *   - V_Class_j: 该层级的总价值
 *   - delta_class: 该层级的 Delta（对标的资产价值的敏感度）
 *   - σ_Asset: 企业整体波动率
 *
 *   推导逻辑：
 *   期权弹性（Omega）衡量标的资产价格变动 1% 时，
 *   期权价值变动的百分比。对于由多个期权价差组成的层级证券，
 *   其整体弹性为 (S/V) × delta，乘以 σ_Asset 得到层级特有波动率。
 *
 *   注意：delta_class 的范围是 [0, 1]，因此 Omega 的范围是 [0, S/V]。
 *   当 V_Class 较小时（如 Common Stock），Omega 可能较大，
 *   导致 σ_Class 高于 σ_Asset，这反映了低层级证券的杠杆效应。
 *
 *   稳定性约束（Stability Bounds）：
 *   - σ_Class 上限为 5 × σ_Asset。此上限源于 AICPA valuation guide
 *     中关于 OPM 模型在极端杠杆下产生不合理结果的实务共识。
 *   - DLOM 自然界限为 [0, 1)，但实务中对于典型的私募企业，
 *     DLOM 通常不会超过 80%。超过 5 × σ_Asset 的类波动率在
 *     Finnerty 框架中会收敛到近 100% 的 DLOM，失去了经济意义。
 *     实务替代方案包括：Asian put option model, Stout 实证研究等。
 *
 * 公式 2：DLOM（Finnerty 指数衰减模型）
 *   DLOM = 1 - e^(-σ_Class × √T)
 *
 *   其中：
 *   - σ_Class: 层级特有波动率
 *   - T: 预期持有期
 *   - e: 自然常数
 *
 *   这个公式基于 Finnerty (2012) 的经典模型，
 *   将缺乏市场流通性视为一种持有期风险。
 *   持有期越长、波动率越高，DLOM 越大。
 *   该模型被 IRS 和法院广泛认可。
 *
 * @param {number} totalEquityValue - 企业总价值 S
 * @param {number} classValue - 该层级的总价值 V_class
 * @param {number} classDelta - 该层级的 Delta（范围 0~1）
 * @param {number} firmVolatility - 企业整体波动率 σ_firm
 * @param {number} holdingPeriod - 预期持有期（年）
 * @returns {object} { omega, classVolatility, classVolatilityCapped, dlom, discountedValue }
 * ============================================================
 */
export function calculateFinnertyDLOM(totalEquityValue, classValue, classDelta, firmVolatility, holdingPeriod) {
  // 如果参数无效，返回 0 DLOM
  if (totalEquityValue <= 0 || classValue <= 0 || classDelta <= 0 || firmVolatility <= 0 || holdingPeriod <= 0) {
    return {
      omega: 0,
      classVolatility: 0,
      classVolatilityCapped: false,
      dlom: 0,
      discountedValue: classValue
    };
  }

  // ============================================================
  // 公式 1：计算期权弹性 Omega 和层级特有波动率
  // Omega = (S / V_Class_j) × delta_class
  // σ_Class_j = Omega × σ_Asset
  //
  // 稳定性约束：σ_Class_j 上限为 5 × σ_Asset
  // 超过此上限时，Finnerty 模型会收敛到接近 100% 的 DLOM，
  // 此时模型的区分度显著降低。
  // ============================================================
  const omega = (totalEquityValue / classValue) * classDelta;
  const rawClassVolatility = omega * firmVolatility;
  const maxVolatility = 5 * firmVolatility;
  const classVolatility = Math.min(rawClassVolatility, maxVolatility);
  const classVolatilityCapped = rawClassVolatility > maxVolatility;

  // ============================================================
  // 公式 2：计算 Finnerty DLOM
  // DLOM = 1 - e^(-σ_Class × √T)
  //
  // 这是 Finnerty (2012) 的标准指数衰减模型。
  // 当 σ_Class × √T 较大时，DLOM 趋近于 100%。
  // 当 σ_Class × √T 较小时，DLOM ≈ σ_Class × √T（一阶泰勒展开）。
  // ============================================================
  const sqrtT = Math.sqrt(holdingPeriod);
  const dlom = 1 - Math.exp(-classVolatility * sqrtT);

  // 计算折扣后价值
  const discountedValue = classValue * (1 - dlom);

  return {
    omega,
    classVolatility,
    classVolatilityCapped,
    dlom: Math.max(0, Math.min(1, dlom)),
    discountedValue
  };
}

/**
 * ============================================================
 * 执行 OPM 完整估值计算（Mercer Capital 合规版）
 * 
 * 核心算法逻辑：
 * 
 * 第一步：构建高级断点矩阵
 * 第二步：计算每个断点的 Black-Scholes 期权价值（含股息调整）
 * 第三步：计算边际分配比例矩阵
 * 第四步：计算增量价值并分配
 * 第五步：计算残差价值
 * 第六步：汇总各层级总价值
 * 第七步：计算各层级 Delta 和 Finnerty DLOM
 * ============================================================
 */
export function performOPMValuation(totalEquityValue, equityClasses, volatility, riskFreeRate, timeToExit, dividendYield = 0) {
  const results = [];
  
  // ============================================================
  // 第一步：构建高级断点矩阵
  // ============================================================
  const { breakpoints: uniqueBreakpoints, cumulativeAbsolutePref, processedEvents, finalActiveShares, lastStrike } = 
    buildAdvancedBreakpointMatrix(equityClasses, totalEquityValue);
  
  // ============================================================
  // 第二步：计算每个断点的 Black-Scholes 期权价值（含股息调整）
  // ============================================================
  const breakpointOptions = uniqueBreakpoints.map(K => {
    const option = calculateCallOption(totalEquityValue, K, riskFreeRate, volatility, timeToExit, dividendYield);
    return { strikePrice: K, ...option };
  });
  
  // ============================================================
  // 第三步：计算边际分配比例矩阵
  // ============================================================
  const allocationMatrix = calculateMarginalAllocationMatrix(
    uniqueBreakpoints, equityClasses, cumulativeAbsolutePref, processedEvents
  );
  
  // ============================================================
  // 第四步：构建断点分配表
  // ============================================================
  const breakpointTable = [];
  
  // ============================================================
  // 构建断点计算说明（用于 UI 悬停提示）
  // 
  // 每个断点（Upper）的计算方式：
  // 1. Seniority 清算断点: BP = sum(shares × pricePerShare) for each seniority group
  // 2. ESOP 行权断点: BP = cumulativeAbsolutePref + (exercisePrice × activeShares)
  // 3. Non-participating Preferred 转股断点: BP = cumulativeAbsolutePref + (conversionPrice × activeShares)
  // 4. Participating Preferred 参与上限断点: BP = cumulativeAbsolutePref + (capPerShare × activeShares)
  // 5. 完全稀释断点: BP = cumulativeAbsolutePref + (lastEvent.strike × activeShares)
  // 
  // 实现策略：
  // 先构建一个 bp → explanation 的映射表，然后为每个断点查找对应的说明。
  // 这样可以避免索引错位问题，确保每个断点都匹配到正确的逻辑。
  // ============================================================
  
  // 构建 seniority 分组信息
  const seniorityClasses = equityClasses.filter(c => (c.seniority || 0) > 1);
  const seniorityGroups = {};
  seniorityClasses.forEach(c => {
    const s = c.seniority || 0;
    if (!seniorityGroups[s]) seniorityGroups[s] = [];
    seniorityGroups[s].push(c);
  });
  const sortedSeniorities = Object.keys(seniorityGroups).map(Number).sort((a, b) => b - a);
  
  // 第一步：构建 bp → explanation 映射表
  const bpExplanationMap = {};
  
  // 1a. Seniority 清算断点
  let cumPref = 0;
  sortedSeniorities.forEach(seniority => {
    const groupPref = seniorityGroups[seniority].reduce((sum, c) => sum + calculateClassLiquidationPreference(c), 0);
    cumPref += groupPref;
    const details = seniorityGroups[seniority].map(c => ({
      name: c.name,
      shares: c.shares,
      pricePerShare: c.pricePerShare || 1,
      amount: calculateClassLiquidationPreference(c)
    }));
    bpExplanationMap[cumPref] = {
      type: 'seniority',
      seniority,
      details,
      formula: details.map(d => `${d.name}: ${d.shares.toLocaleString()} shares × $${d.pricePerShare} = $${d.amount.toLocaleString()}`).join('\n'),
      total: cumPref
    };
  });
  
  // 1b. 事件断点（ESOP、Preferred 转股、参与上限、Warrant）
  // 
  // 修正后的公式（符合 AICPA 估值指南）：
  //   BP_i = BP_{i-1} + activeShares × (strike_i - strike_{i-1})
  // 
  // 其中：
  //   - BP_{i-1} = 上一个断点（previousBP）
  //   - strike_{i-1} = 上一个事件的行权价（previousStrike）
  //   - activeShares = 当前事件触发前的有效股数（activeSharesBeforeEvent）
  //   - strike_i = 当前事件的行权价（triggerPrice）
  // 
  // 这个公式的直观含义：
  // 每个断点代表"从上一个断点开始，所有 activeShares 需要再增值多少，
  // 才能让每股价值达到当前事件的 exercisePrice"。
  // ============================================================
  processedEvents.forEach(event => {
    const bp = event.triggerEV;
    if (bp <= 0) return;
    
    const eventType = event.type;
    let eventLabel = '';
    let formulaParts = [];
    
    // 使用增量公式：BP_i = BP_{i-1} + activeShares × (strike_i - strike_{i-1})
    const prevBP = event.previousBP || cumulativeAbsolutePref;
    const prevStrike = event.previousStrike || 0;
    const activeSharesBefore = event.activeSharesBeforeEvent || 0;
    const strikeDiff = event.triggerPrice - prevStrike;
    
    if (eventType === 'esop') {
      eventLabel = `ESOP @ $${event.triggerPrice}`;
      formulaParts = [
        `previousBP (BP_{i-1}) = $${prevBP.toLocaleString()}`,
        `activeShares = ${activeSharesBefore.toLocaleString()} shares`,
        `strike_i = $${event.triggerPrice}`,
        `strike_{i-1} = $${prevStrike}`,
        `strikeDiff = $${event.triggerPrice} - $${prevStrike} = $${strikeDiff}`,
        `BP_i = BP_{i-1} + activeShares × (strike_i - strike_{i-1})`,
        `     = $${prevBP.toLocaleString()} + ${activeSharesBefore.toLocaleString()} × $${strikeDiff}`,
        `     = $${bp.toLocaleString()}`
      ];
    } else if (eventType === 'non_participating_preferred') {
      eventLabel = event.className;
      formulaParts = [
        `previousBP (BP_{i-1}) = $${prevBP.toLocaleString()}`,
        `activeShares = ${activeSharesBefore.toLocaleString()} shares`,
        `conversionPrice (strike_i) = $${event.triggerPrice}`,
        `strike_{i-1} = $${prevStrike}`,
        `strikeDiff = $${event.triggerPrice} - $${prevStrike} = $${strikeDiff}`,
        `BP_i = BP_{i-1} + activeShares × (strike_i - strike_{i-1})`,
        `     = $${prevBP.toLocaleString()} + ${activeSharesBefore.toLocaleString()} × $${strikeDiff}`,
        `     = $${bp.toLocaleString()}`
      ];
    } else if (eventType === 'participating_preferred_cap') {
      eventLabel = `${event.className} (Cap)`;
      formulaParts = [
        `previousBP (BP_{i-1}) = $${prevBP.toLocaleString()}`,
        `activeShares = ${activeSharesBefore.toLocaleString()} shares`,
        `capPerShare (strike_i) = $${event.triggerPrice}`,
        `strike_{i-1} = $${prevStrike}`,
        `strikeDiff = $${event.triggerPrice} - $${prevStrike} = $${strikeDiff}`,
        `BP_i = BP_{i-1} + activeShares × (strike_i - strike_{i-1})`,
        `     = $${prevBP.toLocaleString()} + ${activeSharesBefore.toLocaleString()} × $${strikeDiff}`,
        `     = $${bp.toLocaleString()}`
      ];
    } else if (eventType === 'warrant') {
      eventLabel = `${event.className} (Warrant)`;
      formulaParts = [
        `previousBP (BP_{i-1}) = $${prevBP.toLocaleString()}`,
        `activeShares = ${activeSharesBefore.toLocaleString()} shares`,
        `exercisePrice (strike_i) = $${event.triggerPrice}`,
        `strike_{i-1} = $${prevStrike}`,
        `strikeDiff = $${event.triggerPrice} - $${prevStrike} = $${strikeDiff}`,
        `BP_i = BP_{i-1} + activeShares × (strike_i - strike_{i-1})`,
        `     = $${prevBP.toLocaleString()} + ${activeSharesBefore.toLocaleString()} × $${strikeDiff}`,
        `     = $${bp.toLocaleString()}`
      ];
    }
    
    // 如果该 bp 已有 seniority 说明，追加事件信息
    // 否则直接设置事件说明
    if (bpExplanationMap[bp]) {
      // 已有 seniority 说明，追加事件标签
      bpExplanationMap[bp].eventLabel = eventLabel;
      bpExplanationMap[bp].eventFormula = formulaParts.join('\n');
    } else {
      bpExplanationMap[bp] = {
        type: eventType,
        label: eventLabel,
        formula: formulaParts.join('\n'),
        total: bp
      };
    }
  });
  
  // 1c. 完全稀释断点（最后一个断点）
  const lastBP = uniqueBreakpoints[uniqueBreakpoints.length - 1];
  if (lastBP > 0 && !bpExplanationMap[lastBP]) {
    const formulaParts = [
      `cumulativeAbsolutePref = $${cumulativeAbsolutePref.toLocaleString()}`,
      `lastEvent.strike = $${lastStrike}`,
      `finalActiveShares = ${finalActiveShares.toLocaleString()} shares`,
      `BP = $${cumulativeAbsolutePref.toLocaleString()} + ($${lastStrike} × ${finalActiveShares.toLocaleString()})`
    ];
    bpExplanationMap[lastBP] = {
      type: 'fully_diluted',
      label: 'Fully Diluted',
      formula: formulaParts.join('\n'),
      total: lastBP
    };
  }
  
  // 第二步：为每个断点查找对应的说明
  const breakpointExplanations = [];
  for (let i = 1; i < uniqueBreakpoints.length; i++) {
    const bp = uniqueBreakpoints[i];
    // 在映射表中查找最接近的 bp（允许微小误差）
    const keys = Object.keys(bpExplanationMap).map(Number);
    let matchedKey = null;
    for (const key of keys) {
      if (Math.abs(bp - key) < 0.01) {
        matchedKey = key;
        break;
      }
    }
    
    if (matchedKey !== null) {
      breakpointExplanations.push(bpExplanationMap[matchedKey]);
    } else {
      // 如果没有匹配到任何说明，生成一个通用说明
      breakpointExplanations.push({
        type: 'unknown',
        label: 'Breakpoint',
        formula: `BP = $${bp.toLocaleString()}`,
        total: bp
      });
    }
  }
  
  for (let i = 0; i < uniqueBreakpoints.length - 1; i++) {
    const lower = uniqueBreakpoints[i];
    const upper = uniqueBreakpoints[i + 1];
    const lowerOption = breakpointOptions[i];
    const upperOption = breakpointOptions[i + 1];
    
    const trancheValue = Math.max(0, lowerOption.value - upperOption.value);
    
    const matrixEntry = allocationMatrix[i];
    
    const allocations = equityClasses.map(ec => {
      const proportion = matrixEntry ? (matrixEntry.proportions[ec.name] || 0) : 0;
      const amount = trancheValue * proportion;
      
      return {
        className: ec.name,
        type: ec.type,
        shares: ec.shares,
        effectiveShares: matrixEntry ? (matrixEntry.totalActiveShares * proportion) : 0,
        exercisePrice: ec.exercisePrice || 0,
        conversionRatio: ec.conversionRatio || 1,
        proportion,
        amount
      };
    });
    
    breakpointTable.push({
      lower,
      upper,
      lowerOption,
      upperOption,
      trancheValue,
      allocations,
      formula: `C($${lower.toLocaleString()}) - C($${upper.toLocaleString()})`,
      // 该断点的计算说明（用于 UI 悬停提示）
      // 注意：breakpointExplanations[i] 对应的是 lower 断点的说明
      // 因为 breakpointExplanations 的索引与 uniqueBreakpoints[1..n] 对齐
      // 而当前 tranche 的 lower = uniqueBreakpoints[i], upper = uniqueBreakpoints[i+1]
      // 所以 lower 断点的说明 = breakpointExplanations[i]
      lowerExplanation: breakpointExplanations[i] || null
    });
  }
  
  // ============================================================
  // 添加最终层（Tail Tranche）：最后一个断点之后的剩余价值
  // 
  // 在 OPM 框架中，最后一个断点（fully diluted breakpoint）之后，
  // 所有已解锁的证券继续按比例参与剩余价值分配。
  // 该层的价值 = C(lastBP)，即最后一个断点的看涨期权价值。
  // 
  // 这代表了"企业价值超过最后一个断点"的部分，
  // 所有已解锁的证券（Common、已转股的 Preferred、已解锁的 ESOP 等）
  // 按其在最后一个区间中的有效股数比例分配这部分价值。
  // ============================================================
  const tailLastIdx = uniqueBreakpoints.length - 1;
  const tailLastBP = uniqueBreakpoints[tailLastIdx];
  const tailLastOption = breakpointOptions[tailLastIdx];
  const tailTrancheValue = Math.max(0, tailLastOption.value);
  
  if (tailTrancheValue > 0) {
    // 使用最后一个区间的分配比例（所有已解锁证券继续参与）
    const lastMatrixEntry = allocationMatrix[allocationMatrix.length - 1];
    
    const tailAllocations = equityClasses.map(ec => {
      const proportion = lastMatrixEntry ? (lastMatrixEntry.proportions[ec.name] || 0) : 0;
      const amount = tailTrancheValue * proportion;
      
      return {
        className: ec.name,
        type: ec.type,
        shares: ec.shares,
        effectiveShares: lastMatrixEntry ? (lastMatrixEntry.totalActiveShares * proportion) : 0,
        exercisePrice: ec.exercisePrice || 0,
        conversionRatio: ec.conversionRatio || 1,
        proportion,
        amount
      };
    });
    
    breakpointTable.push({
      lower: tailLastBP,
      upper: Infinity,
      lowerOption: tailLastOption,
      upperOption: { value: 0, strikePrice: Infinity, d1: -Infinity, d2: -Infinity, Nd1: 0, Nd2: 0 },
      trancheValue: tailTrancheValue,
      allocations: tailAllocations,
      formula: `C($${tailLastBP.toLocaleString()}) - C(∞) = C($${tailLastBP.toLocaleString()})`,
      // 最终层的 lower 断点说明 = 最后一个断点的说明
      lowerExplanation: breakpointExplanations[breakpointExplanations.length - 1] || null,
      isTailTranche: true
    });
  }
  
  // ============================================================
  // 第五步：计算各层级总价值
  // ============================================================
  let totalAllocated = 0;
  
  equityClasses.forEach(ec => {
    let totalValue = 0;
    let participationValue = 0;
    
    breakpointTable.forEach(tranche => {
      const allocation = tranche.allocations.find(a => a.className === ec.name);
      if (allocation) {
        totalValue += allocation.amount;
      }
    });
    
    // 计算参与权价值（如果有）
    if (ec.type === 'preferred' && ec.participation) {
      // 参与权价值 = 该优先股在参与权区间内获得的价值
      // 即：在达到参与上限之前，该优先股按比例分配的价值
      participationValue = totalValue;
    }
    
    // 计算完全稀释股数
    let fullyDilutedShares = ec.shares;
    if (ec.type === 'preferred') {
      fullyDilutedShares = ec.shares * (ec.conversionRatio || 1);
    } else if (ec.type === 'esop') {
      // ESOP 使用 Treasury Stock Method
      const vestedShares = ec.shares * (ec.vestedPercentage || 0);
      const unvestedShares = ec.shares * (1 - (ec.vestedPercentage || 0));
      const vestingProbability = ec.probabilityOfVesting || 0.5;
      fullyDilutedShares = vestedShares + unvestedShares * vestingProbability;
    }
    
    // 计算每股价值
    const valuePerShare = fullyDilutedShares > 0 ? totalValue / fullyDilutedShares : 0;
    
    // ============================================================
    // 第七步：计算层级 Delta 和 Finnerty DLOM
    // 
    // 公式 1：层级 Delta（对标的资产价值的敏感度）
    //   delta_class = Σ_i w_i × [N(d1_{i-1}) - N(d1_i)]
    //   其中 w_i 是该层级在第 i 个 Tranche 中的分配比例
    //
    // 公式 2：层级特有波动率（Finnerty 弹性方法）
    //   σ_Class_j = σ_Asset × (S / V_Class_j) × delta_class
    //
    // 公式 3：DLOM（Finnerty 指数衰减模型）
    //   DLOM = 1 - e^(-σ_Class × √T)
    // ============================================================
    const classDelta = calculateClassDelta(breakpointTable, ec.name, totalEquityValue, totalValue, timeToExit, dividendYield);

    // 计算 Finnerty DLOM
    const dlomResult = calculateFinnertyDLOM(
      totalEquityValue,
      totalValue,
      classDelta,
      volatility,
      timeToExit
    );
    
    results.push({
      className: ec.name,
      type: ec.type,
      shares: ec.shares,
      fullyDilutedShares,
      totalValue,
      valuePerShare,
      participationValue,
      strikePrice: 0,
      optionValue: totalValue,
      calculations: {
        d1: 0,
        d2: 0,
        Nd1: 0,
        Nd2: 0
      },
      // 层级 Delta 和 DLOM 结果
      classDelta,
      dlom: dlomResult
    });
    
    totalAllocated += totalValue;
  });
  
  // ============================================================
  // 第六步：计算残差价值（分配给 Common Stock）
  // ============================================================
  const residualValue = totalEquityValue - totalAllocated;
  if (residualValue > 0) {
    const commonClasses = equityClasses.filter(c => c.type === 'common');
    const totalCommonShares = commonClasses.reduce((sum, c) => sum + c.shares, 0);
    
    if (totalCommonShares > 0) {
      commonClasses.forEach(ec => {
        const existingResult = results.find(r => r.className === ec.name);
        if (existingResult) {
          const residualShare = (ec.shares / totalCommonShares) * residualValue;
          existingResult.totalValue += residualShare;
          existingResult.valuePerShare = existingResult.fullyDilutedShares > 0 
            ? existingResult.totalValue / existingResult.fullyDilutedShares 
            : 0;
          totalAllocated += residualShare;
        }
      });
    }
  }
  
  return {
    results,
    breakpointTable,
    totalAllocated,
    cumulativeAbsolutePref,
    // 包含股息率和 DLOM 参数信息
    dividendYield,
    dlomParameters: {
      firmVolatility: volatility,
      holdingPeriod: timeToExit
    }
  };
}

/**
 * ============================================================
 * 生成计算逻辑说明（用于 Excel 导出）
 * 
 * 在四大估值实务中，审计师需要追溯每个数字的计算逻辑。
 * 本函数通过字符串拼接模拟出完整的计算过程说明，
 * 便于审计师理解每一层价值的来源。
 * ============================================================
 */
export function generateCalculationExplanation(result, parameters, lang = 'zh') {
  const { className, type, totalValue, valuePerShare, shares, fullyDilutedShares, strikePrice, optionValue, participationValue, classDelta, dlom } = result;
  
  const lines = [];
  
  if (lang === 'zh') {
    lines.push(`【${className}】估值计算说明`);
    lines.push(`类型: ${type}`);
    lines.push(`股本数量: ${shares.toLocaleString()}`);
    lines.push(`完全稀释股数: ${fullyDilutedShares.toLocaleString()}`);
    lines.push('');
    lines.push('一、Black-Scholes 期权价值计算');
    lines.push(`  企业总价值 (S): $${parameters.totalEquityValue.toLocaleString()}`);
    lines.push(`  波动率 (σ): ${(parameters.volatility * 100).toFixed(2)}%`);
    lines.push(`  无风险利率 (r): ${(parameters.riskFreeRate * 100).toFixed(2)}%`);
    lines.push(`  预期期限 (T): ${parameters.timeToExit} 年`);
    if (parameters.dividendYield) {
      lines.push(`  股息率 (q): ${(parameters.dividendYield * 100).toFixed(2)}%`);
    }
    lines.push(`  行权价格 (K): $${strikePrice.toLocaleString()}`);
    lines.push(`  期权价值: $${optionValue.toLocaleString()}`);
    lines.push('');
    lines.push('二、参与权价值');
    lines.push(`  参与权价值: $${participationValue.toLocaleString()}`);
    lines.push('');
    lines.push('三、总价值');
    lines.push(`  总价值: $${totalValue.toLocaleString()}`);
    lines.push(`  每股价值: $${valuePerShare.toLocaleString()}`);
    
    // Finnerty DLOM 说明
    if (dlom && dlom.dlom > 0) {
      lines.push('');
      lines.push('四、Finnerty DLOM（缺乏市场流通性折扣）');
      lines.push(`  层级 Delta: ${(classDelta || 0).toFixed(6)}`);
      lines.push(`  期权弹性 (Omega): ${(dlom.omega || 0).toFixed(4)}`);
      lines.push(`  层级特有波动率 (σ_class): ${(dlom.classVolatility * 100).toFixed(2)}%`);
      lines.push(`  DLOM: ${(dlom.dlom * 100).toFixed(2)}%`);
      lines.push(`  折扣后价值: $${dlom.discountedValue.toLocaleString()}`);
      lines.push(`  公式 1: Omega = (S / V_Class) × delta_class`);
      lines.push(`         = ($${parameters.totalEquityValue.toLocaleString()} / $${totalValue.toLocaleString()}) × ${(classDelta || 0).toFixed(6)}`);
      lines.push(`         = ${(dlom.omega || 0).toFixed(4)}`);
      lines.push(`  公式 2: σ_Class = Omega × σ_Asset`);
      lines.push(`         = ${(dlom.omega || 0).toFixed(4)} × ${(parameters.volatility * 100).toFixed(2)}%`);
      lines.push(`         = ${(dlom.classVolatility * 100).toFixed(2)}%`);
      lines.push(`  公式 3: DLOM = 1 - e^(-σ_Class × √T)`);
      lines.push(`         = 1 - e^(-${(dlom.classVolatility * 100).toFixed(2)}% × √${parameters.timeToExit})`);
      lines.push(`         = ${(dlom.dlom * 100).toFixed(2)}%`);
    }
  } else {
    lines.push(`【${className}】Valuation Calculation`);
    lines.push(`Type: ${type}`);
    lines.push(`Shares: ${shares.toLocaleString()}`);
    lines.push(`Fully Diluted Shares: ${fullyDilutedShares.toLocaleString()}`);
    lines.push('');
    lines.push('1. Black-Scholes Option Value');
    lines.push(`  Total Equity Value (S): $${parameters.totalEquityValue.toLocaleString()}`);
    lines.push(`  Volatility (σ): ${(parameters.volatility * 100).toFixed(2)}%`);
    lines.push(`  Risk-free Rate (r): ${(parameters.riskFreeRate * 100).toFixed(2)}%`);
    lines.push(`  Time to Exit (T): ${parameters.timeToExit} years`);
    if (parameters.dividendYield) {
      lines.push(`  Dividend Yield (q): ${(parameters.dividendYield * 100).toFixed(2)}%`);
    }
    lines.push(`  Strike Price (K): $${strikePrice.toLocaleString()}`);
    lines.push(`  Option Value: $${optionValue.toLocaleString()}`);
    lines.push('');
    lines.push('2. Participation Value');
    lines.push(`  Participation Value: $${participationValue.toLocaleString()}`);
    lines.push('');
    lines.push('3. Total Value');
    lines.push(`  Total Value: $${totalValue.toLocaleString()}`);
    lines.push(`  Value per Share: $${valuePerShare.toLocaleString()}`);
    
    if (dlom && dlom.dlom > 0) {
      lines.push('');
      lines.push('4. Finnerty DLOM (Discount for Lack of Marketability)');
      lines.push(`  Class Delta: ${(classDelta || 0).toFixed(6)}`);
      lines.push(`  Option Omega: ${(dlom.omega || 0).toFixed(4)}`);
      lines.push(`  Class Volatility (σ_class): ${(dlom.classVolatility * 100).toFixed(2)}%`);
      lines.push(`  DLOM: ${(dlom.dlom * 100).toFixed(2)}%`);
      lines.push(`  Discounted Value: $${dlom.discountedValue.toLocaleString()}`);
      lines.push(`  Formula 1: Omega = (S / V_Class) × delta_class`);
      lines.push(`           = ($${parameters.totalEquityValue.toLocaleString()} / $${totalValue.toLocaleString()}) × ${(classDelta || 0).toFixed(6)}`);
      lines.push(`           = ${(dlom.omega || 0).toFixed(4)}`);
      lines.push(`  Formula 2: σ_Class = Omega × σ_Asset`);
      lines.push(`           = ${(dlom.omega || 0).toFixed(4)} × ${(parameters.volatility * 100).toFixed(2)}%`);
      lines.push(`           = ${(dlom.classVolatility * 100).toFixed(2)}%`);
      lines.push(`  Formula 3: DLOM = 1 - e^(-σ_Class × √T)`);
      lines.push(`           = 1 - e^(-${(dlom.classVolatility * 100).toFixed(2)}% × √${parameters.timeToExit})`);
      lines.push(`           = ${(dlom.dlom * 100).toFixed(2)}%`);
    }
  }
  
  return lines.join('\n');
}

export default {
  normalCDF,
  normalPDF,
  calculateD1,
  calculateD2,
  calculateCallOption,
  buildAdvancedBreakpointMatrix,
  calculateMarginalAllocationMatrix,
  calculateClassDelta,
  calculateFinnertyDLOM,
  performOPMValuation,
  generateCalculationExplanation
};
