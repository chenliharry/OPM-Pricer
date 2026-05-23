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
 * 每个断点 K 对应一个看涨期权
 * - 标的资产：企业总价值 S
 * - 行权价：断点 K
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
 * - Preferred (seniority=3): 清算优先权倍数 × 股数 × 每股价格
 * - Common/ESOP/Warrant (seniority=0): 0（无清算优先权）
 * 
 * 注意：seniority 字段用于过滤哪些证券的清算优先权计入
 * cumulativeAbsolutePref。只有 seniority > 1 的证券才计入。
 * ============================================================
 */
function calculateClassLiquidationPreference(equityClass) {
  switch (equityClass.type) {
    case 'preferred': return equityClass.liquidationPreference * equityClass.shares * (equityClass.pricePerShare || 1);
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
      // ESOP 动态行权：使用 triggerEV 判断是否已解锁
      // triggerEV = cumulativeAbsolutePref + (exercisePrice × activeSharesAtThatPoint)
      // 只有 K_lower ≥ triggerEV 时，ESOP 才被视为"已解锁"
      const exercisePrice = equityClass.exercisePrice || 0;
      if (exercisePrice > 0 && cumulativeAbsolutePref !== undefined && activeSharesAtBreakpoint !== undefined) {
        const triggerEV = cumulativeAbsolutePref + (exercisePrice * activeSharesAtBreakpoint);
        if (lowerBound < triggerEV) {
          return 0; // 该 ESOP 在此断点下尚未解锁
        }
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
  // 
  // ESOP 按行权价分组逻辑：
  // 相同行权价的 ESOP 批次共享同一个断点，不同行权价的 ESOP 有各自独立的断点。
  // 每个组的总股数 = 该行权价下所有 ESOP 批次的有效股数之和。
  // 
  // Participating Preferred 参与上限事件：
  // 带参与权的优先股在参与剩余分配时，通常有一个参与上限（Participation Cap）。
  // 当每股价值达到上限时，优先股停止参与分配，转为普通股。
  // 参与上限断点 = cumulativeAbsolutePref + (capPerShare × activeShares)
  // 其中 capPerShare = pricePerShare × liquidationPreference（或约定的上限倍数）。
  // 
  // 这些断点可能与 ESOP 断点相互交错，因此需要统一排序。
  // ============================================================

  let perShareEvents = [];

  // ESOP events: group by exercise price, one event per unique exercise price
  // 相同行权价的 ESOP 批次共享同一个断点，不同行权价的 ESOP 有各自独立的断点
  // 
  // 注意：行权价为 0 的 ESOP 视为"始终解锁"（Always Vested），
  // 它们从第一个断点开始就参与分配，不需要等待任何触发条件。
  // 这些 ESOP 仍然加入 perShareEvents（strike=0），
  // 这样在 calculateMarginalAllocationMatrix 中可以通过
  // esopBreakpointByPrice 匹配到它们，确保它们始终被计入分母。
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
    // 生成描述性名称：包含行权价和总股数
    const className = price > 0 ? `ESOP @ $${price}` : `ESOP @ $0 (Always Vested)`;
    perShareEvents.push({
      id: `esop-${priceStr}`,
      className,
      type: 'esop',
      strike: price,
      shares: group.totalShares
    });
  });

  // Warrant events (individual, not aggregated)
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
  // The conversion trigger price is the price per share at which
  // the liquidation preference equals the conversion value.
  // Formula: conversionPrice = liquidationPreferenceAmount / (shares * conversionRatio)
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
          // Flag to indicate this event removes from cumulativeAbsolutePref
          removesPref: true,
          prefAmount: prefAmount
        });
      }
    });

  // ============================================================
  // Participating Preferred participation cap events
  // 带参与权的优先股在参与剩余分配时，有一个参与上限。
  // 当每股价值达到上限时，优先股停止参与分配，转为普通股。
  // 
  // 参与上限（capPerShare）的计算：
  // 使用 participationCap 字段（默认值为 1，即 1x 参与上限）。
  // capPerShare = pricePerShare × participationCap
  // 
  // 例如：Series A 以 $1/股投资，participationCap = 3（3x 参与上限）
  // 则 capPerShare = $1 × 3 = $3/股
  // 当每股价值达到 $3 时，Series A 停止参与分配。
  // 
  // 注意：如果 participationCap 为 0 或未设置，则视为无上限（永久参与）。
  // ============================================================
  equityClasses
    .filter(c => c.type === 'preferred' && c.participation && c.shares > 0)
    .forEach(c => {
      // 参与上限 = pricePerShare × participationCap（默认 1x）
      const capMultiple = c.participationCap !== undefined && c.participationCap !== null ? c.participationCap : 1;
      const capPerShare = (c.pricePerShare || 0) * capMultiple;
      if (capPerShare > 0) {
        perShareEvents.push({
          id: c.id,
          className: c.name,
          type: 'participating_preferred_cap',
          strike: capPerShare,
          shares: c.shares * (c.conversionRatio || 1),
          // Flag to indicate this event removes from activeShares (stops participating)
          removesFromActive: true,
          capPerShare
        });
      }
    });

  // Sort events strictly in ascending order by strike price
  perShareEvents.sort((a, b) => a.strike - b.strike);

  // ============================================================
  // Step 4.5: Merge events with the same strike price
  // 当多个证券（如 Preferred 转股、ESOP、Warrant）具有相同的每股行权价时，
  // 它们应该共享同一个断点（Breakpoint），而不是各自生成独立的断点。
  // 
  // 合并规则：
  // - 所有 shares 加总（注意 removesFromActive 的 shares 为负值）
  // - 如果任一事件有 removesPref，则合并事件也有 removesPref
  // - 如果任一事件有 removesFromActive，则合并事件也有 removesFromActive
  // - className 合并为逗号分隔的列表，便于在边际分配矩阵中匹配
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
    
    // Collect all events with the same strike price
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
      // netSharesChange: positive = add to denominator, negative = remove from denominator
      netSharesChange: totalShares
    });
  }

  // ============================================================
  // Step 5: Iteratively push breakpoints and expand/contract the denominator
  // This loop ensures that K grows linearly with the number of events!
  // 
  // 事件类型处理：
  // - ESOP: 解锁后股数流入分母（稀释后续区间）
  // - Warrant: 行权后股数流入分母
  // - Non-participating Preferred: 转股后股数流入分母
  // - Participating Preferred (cap): 达到参与上限后，股数从分母中移除
  //   因为参与权优先股在达到上限后停止参与分配，转为普通股
  // ============================================================
  const processedEvents = [];
  
  mergedEvents.forEach(event => {
    // Formula: BP = Cumulative Pref + (Current Strike * Cumulative Active Shares up to this point)
    const triggerEV = cumulativeAbsolutePref + (event.strike * activeShares);
    
    // 所有事件都加入断点矩阵，无论 triggerEV 是否大于 S。
    // 即使 triggerEV > S，该断点仍然有意义：
    // - 它代表该证券的"行权门槛"在 BS 模型中的位置
    // - C(triggerEV) 的值很小（接近 0），但该证券仍然参与残差分配
    // - 断点矩阵的完整性确保了边际分配比例矩阵能正确计算每个区间的分配
    if (triggerEV > 0) {
      K.push(triggerEV);
    }
    
    // CRITICAL ENGINE REFACTOR: This option is now "In-The-Money".
    // It enters the denominator and dilutes the NEXT higher strike price calculation!
    // For participating preferred cap events, we REMOVE shares from activeShares
    // (the preferred stops participating and converts to common).
    activeShares += event.netSharesChange;
    
    // 为每个原始 className 生成一个 processedEvent 条目
    // 这样 calculateMarginalAllocationMatrix 中的 classBreakpointMap
    // 和 esopBreakpointByPrice 仍然能正确匹配
    event.classNames.forEach((className, idx) => {
      const type = event.types[idx];
      processedEvents.push({
        type: type,
        className: className,
        triggerEV,
        triggerPrice: event.strike,
        sharesAdded: event.netSharesChange,
        activeSharesAfter: activeShares,
        cumulativeAbsolutePrefAfter: cumulativeAbsolutePref
      });
    });
  });

  // ============================================================
  // Step 6: Calculate the "Fully Diluted" breakpoint
  // 最后一个明确断点（上限点）：所有具有优先清算权和参与上限的
  // 股份被完全行权或满足的最大门槛值。
  // 
  // 公式：fullyDilutedBP = cumulativeAbsolutePref + (lastEvent.strike × activeShares)
  // 其中 lastEvent 是最后一个 perShareEvent（行权价最高的事件）。
  // 如果没有任何 perShareEvent，则 fullyDilutedBP = cumulativeAbsolutePref。
  // 
  // 注意：fullyDilutedBP 可能大于 S（企业总价值），也可能小于 S。
  // 如果 fullyDilutedBP < S，则 S 之后的残差价值按完全稀释比例分配。
  // 如果 fullyDilutedBP > S，则 S 位于中间某个位置，最后一个断点
  // 仍然是 fullyDilutedBP（代表所有证券被完全行权的状态）。
  // 
  // 关键：fullyDilutedBP 不设上限（不 cap at S），因为它是"最后一个
  // 明确断点"。之后就是"正无穷"状态，增量价值按完全稀释比例分配。
  // 
  // 注意：S（企业总价值）不再作为断点加入 K 数组。
  // S 是 BS 公式中的标的资产价值，不是行权价。
  // 最后一个断点就是 fullyDilutedBP，代表所有证券被完全行权的状态。
  // ============================================================
  let fullyDilutedBP = cumulativeAbsolutePref;
  if (mergedEvents.length > 0) {
    const lastEvent = mergedEvents[mergedEvents.length - 1];
    fullyDilutedBP = cumulativeAbsolutePref + (lastEvent.strike * activeShares);
  }
  
  // Push the fully diluted breakpoint as the LAST explicit breakpoint
  // This is the point where all securities are fully exercised/satisfied.
  // After this point, residual value is distributed proportionally.
  if (fullyDilutedBP > 0 && !K.includes(fullyDilutedBP)) {
    K.push(fullyDilutedBP);
  }

  // Deduplicate and sort ascending to handle floating point anomalies
  const uniqueK = [...new Set(K)].sort((a, b) => a - b);
  
  return { breakpoints: uniqueK, cumulativeAbsolutePref, processedEvents, fullyDilutedBP };
}

/**
 * ============================================================
 * 计算给定区间的边际分配比例矩阵
 * 
 * 核心逻辑：
 * 每个 Tranche [K_{i-1}, K_i] 的增量价值按该区间内所有活跃证券的
 * 有效股数比例分配。有效股数随断点位置动态变化：
 * 
 * - 在绝对清算优先权范围内（K_upper ≤ cumulativeAbsolutePref）：
 *   只有 seniority > 1 的证券（Preferred）参与分配，
 *   按清算优先权金额比例分配。
 * 
 * - 在清算优先权范围外（K_lower ≥ cumulativeAbsolutePref）：
 *   Common 常驻分母；
 *   参与权优先股常驻分母；
 *   ESOP/Warrant 阶梯式判断：只有 K_lower ≥ 其专属断点时才计入；
 *   非参与权优先股在转股后计入。
 * 
 * @param {Array} breakpoints 已排序的唯一断点数组 K
 * @param {Array} equityClasses 包含所有证券属性的数组
 * @param {number} cumulativeAbsolutePref 绝对清算优先权总额
 * @param {Array} processedEvents 事件处理记录（含每个 ESOP/优先股的触发断点）
 * @returns {Array} 每一个元素对应一个区间的分配比例对象
 * ============================================================
 */
export function calculateMarginalAllocationMatrix(breakpoints, equityClasses, cumulativeAbsolutePref, processedEvents) {
  const allocationMatrix = [];

  // ============================================================
  // 为每个 ESOP/Warrant/Participating Preferred 计算其专属的企业价值断点
  // 这个断点用于判断该证券在某个 Tranche 中是否已解锁/已到达上限
  // 
  // 对于 ESOP：相同行权价的 ESOP 批次共享同一个断点。
  // 使用 processedEvents 中记录的 triggerEV，通过 className 匹配。
  // className 格式为 "ESOP @ $<exercisePrice>"。
  // 
  // 对于 Warrant：每个 Warrant 有独立的断点，通过 className 匹配。
  // 
  // 对于 Participating Preferred (cap)：达到参与上限后，该优先股
  // 停止参与分配，其股数从分母中移除。
  // ============================================================
  const classBreakpointMap = {};
  // ESOP 按行权价映射：exercisePrice → triggerEV
  const esopBreakpointByPrice = {};
  // Participating Preferred cap 映射：className → triggerEV
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
  // 遍历每一个闭区间 (Tranche)
  // ============================================================
  for (let i = 1; i < breakpoints.length; i++) {
    const K_lower = breakpoints[i - 1];
    const K_upper = breakpoints[i];
    
    let activeSharesMap = {};
    let totalActiveSharesInTranche = 0;

    // ============================================================
    // 规则判定：属于绝对清算区间
    // 当 K_upper ≤ cumulativeAbsolutePref 时，该区间完全属于
    // 清算优先权范围。只有 seniority > 1 的证券参与分配：
    //   - Preferred (seniority=3): 清算优先权金额
    // 
    // 注意：这里按清算优先权金额比例分配，而不是按股数比例。
    // 因为在这个区间内，优先权持有者获得的是"清算优先权金额"，
    // 而不是"股权价值"。
    // ============================================================
    if (K_upper <= cumulativeAbsolutePref) {
      equityClasses.forEach(c => {
        if ((c.seniority || 0) > 1) {
          const pref = calculateClassLiquidationPreference(c);
          if (pref > 0) {
            activeSharesMap[c.name] = pref;
            totalActiveSharesInTranche += pref;
          } else {
            activeSharesMap[c.name] = 0;
          }
        } else {
          activeSharesMap[c.name] = 0;
        }
      });
    } 

    // ============================================================
    // 规则判定：属于清算填满后的剩余分配区间
    // 当 K_lower ≥ cumulativeAbsolutePref 时，清算优先权已被满足，
    // 剩余价值按股数比例分配。
    // 
    // 各证券的参与规则：
    // - Common: 常驻分母，始终按实际股数计入
    // - Participating Preferred: 常驻分母，始终按转股比例计入
    // - ESOP: 阶梯式判断，只有 K_lower ≥ 其专属断点时才计入
    // - Non-participating Preferred: 转股后（K_lower ≥ 转股断点）才计入
    // ============================================================
    else {
      equityClasses.forEach(c => {
        if (c.type === 'common') {
          // 普通股常驻分母
          activeSharesMap[c.name] = c.shares;
          totalActiveSharesInTranche += c.shares;
        } else if (c.type === 'preferred' && c.participation) {
          // 带参与权的优先股：检查是否已达到参与上限
          const capTriggerEV = partPrefCapMap[c.name];
          if (capTriggerEV !== undefined && K_lower >= capTriggerEV) {
            activeSharesMap[c.name] = 0;
          } else {
            activeSharesMap[c.name] = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            totalActiveSharesInTranche += activeSharesMap[c.name];
          }
        } else if (c.type === 'preferred' && !c.participation) {
          // 不带参与权的优先股：只有 K_lower ≥ 其转股断点时才计入
          const triggerEV = classBreakpointMap[c.name];
          if (triggerEV !== undefined && K_lower >= triggerEV) {
            activeSharesMap[c.name] = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            totalActiveSharesInTranche += activeSharesMap[c.name];
          } else {
            activeSharesMap[c.name] = 0;
          }
        } else if (c.type === 'esop') {
          // ESOP 按行权价分组断点判断
          const triggerEV = esopBreakpointByPrice[c.exercisePrice];
          if (triggerEV !== undefined && K_lower >= triggerEV) {
            const effectiveShares = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            activeSharesMap[c.name] = effectiveShares;
            totalActiveSharesInTranche += effectiveShares;
          } else {
            activeSharesMap[c.name] = 0;
          }
        } else if (c.type === 'warrant') {
          // Warrant 独立断点判断
          const triggerEV = classBreakpointMap[c.name];
          if (triggerEV !== undefined && K_lower >= triggerEV) {
            const effectiveShares = getEffectiveSharesAtBreakpoint(c, K_lower, cumulativeAbsolutePref, totalActiveSharesInTranche);
            activeSharesMap[c.name] = effectiveShares;
            totalActiveSharesInTranche += effectiveShares;
          } else {
            activeSharesMap[c.name] = 0;
          }
        } else {
          // 其他类型：按 shares 字段计入
          const shares = c.shares || 0;
          activeSharesMap[c.name] = shares;
          totalActiveSharesInTranche += shares;
        }
      });
    }

    // ============================================================
    // 计算当前区间的最终边际百分比 p_{i,j}
    // 公式：p_{i,j} = shares_{i,j} / sum(shares_{i,k} for k=1..m)
    // ============================================================
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
 * 执行 OPM 完整估值计算（Mercer Capital 合规版）
 * 
 * 核心算法逻辑：
 * 
 * 第一步：构建高级断点矩阵
 * - 使用 buildAdvancedBreakpointMatrix 生成所有断点
 * - 支持无限层级的资本结构
 * 
 * 第二步：计算每个断点的 Black-Scholes 期权价值
 * - 对每个断点 Kᵢ，计算 C(Kᵢ) = S·N(d₁) - Kᵢ·e^(-rT)·N(d₂)
 * 
 * 第三步：计算边际分配比例矩阵
 * - 使用 calculateMarginalAllocationMatrix 计算每个区间的分配比例
 * - 每个区间的比例由该区间内所有活跃证券的有效股数决定
 * 
 * 第四步：计算增量价值并分配
 * - Vᵢ = C(Kᵢ₋₁) - C(Kᵢ)
 * - A_{i,j} = Vᵢ × p_{i,j}
 * 
 * 第五步：汇总各层级总价值
 * - 将每个层级在所有区间中分配到的价值加总
 * ============================================================
 */
export function performOPMValuation(totalEquityValue, equityClasses, volatility, riskFreeRate, timeToExit) {
  const results = [];
  
  // ============================================================
  // 第一步：构建高级断点矩阵
  // ============================================================
  const { breakpoints: uniqueBreakpoints, cumulativeAbsolutePref, processedEvents } = 
    buildAdvancedBreakpointMatrix(equityClasses, totalEquityValue);
  
  // ============================================================
  // 第二步：计算每个断点的 Black-Scholes 期权价值
  // ============================================================
  const breakpointOptions = uniqueBreakpoints.map(K => {
    const option = calculateCallOption(totalEquityValue, K, riskFreeRate, volatility, timeToExit);
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
  // 计算每个区间的增量价值，并按边际分配比例分配
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
    // ============================================================
    const trancheValue = Math.max(0, lowerOption.value - upperOption.value);
    
    // 获取该区间的边际分配比例
    const matrixEntry = allocationMatrix[i];
    
    // 按比例分配该区间的增量价值
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
      // 计算公式说明：C(Lower) - C(Upper)
      formula: `C($${lower.toLocaleString()}) - C($${upper.toLocaleString()}) = $${lowerOption.value.toFixed(2)} - $${upperOption.value.toFixed(2)} = $${trancheValue.toFixed(2)}`
    });
  }
  
  // ============================================================
  // 第五步：计算残差价值 C(S)
  // 最后一个断点 S 对应的看涨期权价值 C(S) 代表"正无穷"状态
  // 之后的增量企业价值。根据 OPM 理论，最后一个明确断点之后，
  // 增量的企业价值将直接按照完全稀释（Fully Diluted）比例
  // 分配给所有权益持有者。
  // 
  // 因此，C(S) 不再只分配给 Common，而是按完全稀释比例
  // 分配给所有证券（Common、Preferred、ESOP、Warrant）。
  // ============================================================
  const lastBreakpointOption = breakpointOptions[breakpointOptions.length - 1];
  const residualValue = lastBreakpointOption ? lastBreakpointOption.value : 0;
  
  // 计算完全稀释比例：所有证券按转股比例计算的有效股数
  const fullyDilutedShares = {};
  let totalFullyDilutedShares = 0;
  equityClasses.forEach(ec => {
    let shares = 0;
    switch (ec.type) {
      case 'common': shares = ec.shares; break;
      case 'preferred': shares = ec.shares * (ec.conversionRatio || 1); break;
      case 'esop': shares = ec.shares; break;
      case 'warrant': shares = ec.shares; break;
      default: shares = ec.shares || 0;
    }
    fullyDilutedShares[ec.name] = shares;
    totalFullyDilutedShares += shares;
  });
  
  // ============================================================
  // 第六步：汇总每个资本结构层级的总价值
  // ============================================================
  
  equityClasses.forEach((equityClass) => {
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
    
    // 残差价值 C(S) 按完全稀释比例分配给所有证券
    const residualAllocation = totalFullyDilutedShares > 0
      ? residualValue * (fullyDilutedShares[equityClass.name] || 0) / totalFullyDilutedShares
      : 0;
    
    switch (equityClass.type) {
      case 'preferred':
        totalValue = optionValue + residualAllocation;
        effectiveShares = equityClass.shares * (equityClass.conversionRatio || 1);
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      case 'common':
        totalValue = optionValue + residualAllocation;
        effectiveShares = equityClass.shares;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      case 'esop': {
        totalValue = optionValue + residualAllocation;
        effectiveShares = equityClass.shares;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      }
      case 'warrant': {
        totalValue = optionValue + residualAllocation;
        effectiveShares = equityClass.shares;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
        break;
      }
      default:
        totalValue = optionValue + residualAllocation;
        effectiveShares = equityClass.shares || 0;
        valuePerShare = effectiveShares > 0 ? totalValue / effectiveShares : 0;
    }

    // 计算该层级的行权价（Strike Price）
    let strikePrice = 0;
    for (const ec of equityClasses) {
      if (ec.name === equityClass.name) break;
      strikePrice += calculateClassLiquidationPreference(ec);
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
  
  return { results, breakpointTable, totalAllocated, allocationMatrix };
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
      `   = $${calculations.totalEquityValue.toLocaleString()} × ${calculations.Nd1.toFixed(6)} - $${strikePrice.toLocaleString()} × e^(-${calculations.riskFreeRate}×${calculations.timeToExit}) × ${calculations.Nd2.toFixed(6)}`,
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
    `   = $${calculations.totalEquityValue.toLocaleString()} × ${calculations.Nd1.toFixed(6)} - $${strikePrice.toLocaleString()} × e^(-${calculations.riskFreeRate}×${calculations.timeToExit}) × ${calculations.Nd2.toFixed(6)}`,
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
