/**
 * 多语言支持模块 (i18n)
 * 
 * 支持中英文切换，所有 UI 文本和 Excel 导出内容跟随当前语言
 */

const zh = {
  // 导航
  appTitle: 'OPM 估值工具',
  appSubtitle: 'Option Pricing Method Valuation',
  
  // 按钮
  addClass: '添加层级',
  importExcel: '导入 Excel',
  downloadTemplate: '下载模板',
  exportResult: '导出结果',
  parameters: '参数设置',
  
  // 参数面板
  paramTitle: '估值参数设置',
  totalEquityValue: '企业总权益价值 (Total Equity Value)',
  volatility: '波动率 (Volatility) - σ',
  riskFreeRate: '无风险利率 (Risk-free Rate) - r',
  timeToExit: '预期期限 (Time to Exit) - T',
  paramDesc1: '估值基准日的企业总价值，通常基于 DCF 或市场比较法确定',
  paramDesc2: '年化波动率，反映企业价值的不确定性。初创企业通常为 40-80%',
  paramDesc3: '年化无风险利率，通常使用同期限国债收益率',
  paramDesc4: '预期退出时间或流动性事件发生时间（年）',
  paramTips: '参数设置建议',
  paramTip1: '波动率: 可参考同行业上市公司股价波动率，或使用管理层预测的业绩波动范围',
  paramTip2: '无风险利率: 建议使用与预期期限相匹配的国债收益率',
  paramTip3: '预期期限: 通常为下一轮融资或 IPO 的预期时间',
  paramTip4: '参数调整后，估值结果会实时更新',
  
  // 资本结构
  capStructure: '资本结构配置',
  equityType: '股权类型',
  shares: '股本数量 (Shares)',
  pricePerShare: '每股价格 ($)',
  liqPref: '清算优先权倍数',
  conversionRatio: '转股比例',
  participation: '参与权 (Participation)',
  exercisePrice: '行权价格 ($)',
  vestedPct: '已行权比例 (Vested %)',
  vestingProb: '行权概率',
  investmentAmount: '投资金额 ($)',
  valuationCap: '估值上限 ($)',
  discountRate: '折扣率',
  principal: '本金 ($)',
  interestRate: '利率 (%)',
  conversionPrice: '转换价格 ($)',
  seniority: '优先级 (Seniority)',
  
  // 股权类型
  typeCommon: '普通股 (Common)',
  typePreferred: '优先股 (Preferred)',
  typeEsop: '员工期权 (ESOP)',
  typeSafe: 'SAFE',
  typeConvertible: '可转换债券 (Convertible)',
  typeWarrant: '认股权证 (Warrant)',
  
  // 类型说明
  tipCommon: '💡 普通股：最基本的股权形式，享有剩余价值分配权，无清算优先权。',
  tipPreferred: '💡 优先股：享有清算优先权，可选择参与权（参与分配剩余价值），可按转股比例转换为普通股。',
  tipEsop: '💡 ESOP 员工期权计划：授予员工的股票期权，需考虑行权价格、已行权比例和行权概率。使用 Treasury Stock Method 计算稀释效应。',
  tipSafe: '💡 SAFE (Simple Agreement for Future Equity)：YC 发明的未来股权简单协议，可设置估值上限和/或折扣率，在下次融资时转换为股权。',
  tipConvertible: '💡 可转换债券：兼具债权和股权特性，可选择到期还本付息或按约定价格转换为股权。',
  tipWarrant: '💡 认股权证：赋予持有人在特定时间内以特定价格购买公司股票的权利，通常与债券或优先股一同发行。',
  
  // 结果展示
  results: '估值结果',
  showCalcDetails: '显示计算详情',
  hideCalcDetails: '隐藏计算详情',
  totalValue: '企业总价值',
  allocatedValue: '分配总价值',
  numClasses: '资本结构层级',
  
  // 断点分配表
  breakpointTable: '断点分配详情表 (Breakpoint Allocation)',
  bpLower: '下限 (Lower)',
  bpUpper: '上限 (Upper)',
  bpStrike: '行权价 (K)',
  bpCallValue: '期权价值 C(K)',
  bpTrancheValue: '该层分配额',
  bpAllocation: '分配比例',
  bpAmount: '分配金额',
  bpD1: 'd₁',
  bpD2: 'd₂',
  bpNd1: 'N(d₁)',
  bpNd2: 'N(d₂)',
  bpFormula: '分配 = C(Upper) - C(Lower)',
  totalAllocated: '加总 (Total Value Allocated)',
  
  // 结果表格
  className: '层级名称',
  sharesLabel: '股本数量',
  fullyDiluted: '完全稀释股数',
  totalValueLabel: '总价值',
  valuePerShare: '每股价值',
  details: '详情',
  
  // 对比模式
  compareTitle: '估值对比分析',
  lockedTime: '锁定时间',
  paramCompare: '估值参数对比',
  locked: '锁定',
  current: '当前',
  variance: '差异',
  varianceAmount: '差异金额',
  variancePct: '差异比例',
  trend: '趋势',
  
  // 通知
  importSuccess: '成功导入 {count} 个资本结构层级',
  exportSuccess: '估值结果已导出到 Excel',
  templateDownloaded: '模板已下载',
  calcError: '计算错误: {msg}',
  exportError: '导出失败: {msg}',
  needOneClass: '至少需要保留一个资本结构层级',
  
  // 页脚
  footer: 'OPM 估值工具 | 基于 Black-Scholes 期权定价模型 | 仅供专业估值参考',
  footerPrivacy: '所有计算均在本地完成，数据不会上传到服务器',
  
  // 语言
  langSwitch: 'English',
  
  // 默认名称
  defaultName: '层级 {n}',
  
  // 智能命名模板
  smartNamePreferred: '{name} (清算 @ ${price})',
  smartNameCommon: '{name} (普通股 @ ${price})',
  smartNameEsop: '{name} (ESOP @ 行权 ${price})',
  smartNameSafe: '{name} (SAFE ${amount})',
  smartNameConvertible: '{name} (可转债 ${amount})',
  smartNameWarrant: '{name} (Warrant @ ${price})',
};

const en = {
  appTitle: 'OPM Valuation Tool',
  appSubtitle: 'Option Pricing Method Valuation',
  
  addClass: 'Add Class',
  importExcel: 'Import Excel',
  downloadTemplate: 'Download Template',
  exportResult: 'Export Results',
  parameters: 'Parameters',
  
  paramTitle: 'Valuation Parameters',
  totalEquityValue: 'Total Equity Value',
  volatility: 'Volatility - σ',
  riskFreeRate: 'Risk-free Rate - r',
  timeToExit: 'Time to Exit - T',
  paramDesc1: 'Total enterprise value at valuation date, typically from DCF or market approach',
  paramDesc2: 'Annualized volatility reflecting business uncertainty. Startups: 40-80%',
  paramDesc3: 'Annual risk-free rate, typically using government bond yield',
  paramDesc4: 'Expected time to liquidity event (years)',
  paramTips: 'Parameter Guidelines',
  paramTip1: 'Volatility: Reference comparable public company volatility or management forecast range',
  paramTip2: 'Risk-free rate: Use government bond yield matching expected term',
  paramTip3: 'Time to exit: Typically next financing round or IPO timeline',
  paramTip4: 'Results update in real-time as parameters change',
  
  capStructure: 'Capital Structure',
  equityType: 'Equity Type',
  shares: 'Shares',
  pricePerShare: 'Price/Share ($)',
  liqPref: 'Liquidation Preference',
  conversionRatio: 'Conversion Ratio',
  participation: 'Participation',
  exercisePrice: 'Exercise Price ($)',
  vestedPct: 'Vested %',
  vestingProb: 'Vesting Probability',
  investmentAmount: 'Investment Amount ($)',
  valuationCap: 'Valuation Cap ($)',
  discountRate: 'Discount Rate',
  principal: 'Principal ($)',
  interestRate: 'Interest Rate (%)',
  conversionPrice: 'Conversion Price ($)',
  seniority: 'Seniority',
  
  typeCommon: 'Common Stock',
  typePreferred: 'Preferred Stock',
  typeEsop: 'ESOP',
  typeSafe: 'SAFE',
  typeConvertible: 'Convertible Note',
  typeWarrant: 'Warrant',
  
  tipCommon: '💡 Common Stock: Basic equity with residual claim, no liquidation preference.',
  tipPreferred: '💡 Preferred Stock: Has liquidation preference, may have participation rights, convertible to common.',
  tipEsop: '💡 ESOP: Employee stock options. Considers exercise price, vesting schedule, and vesting probability. Uses Treasury Stock Method.',
  tipSafe: '💡 SAFE: Simple Agreement for Future Equity by Y Combinator. May have valuation cap and/or discount rate.',
  tipConvertible: '💡 Convertible Note: Debt that converts to equity at a specified price upon qualified financing.',
  tipWarrant: '💡 Warrant: Right to purchase shares at a specified price within a specified timeframe.',
  
  results: 'Valuation Results',
  showCalcDetails: 'Show Details',
  hideCalcDetails: 'Hide Details',
  totalValue: 'Total Equity Value',
  allocatedValue: 'Total Allocated',
  numClasses: 'Equity Classes',
  
  breakpointTable: 'Breakpoint Allocation Table',
  bpLower: 'Lower Bound',
  bpUpper: 'Upper Bound',
  bpStrike: 'Strike (K)',
  bpCallValue: 'Call Value C(K)',
  bpTrancheValue: 'Tranche Value',
  bpAllocation: 'Allocation %',
  bpAmount: 'Allocation $',
  bpD1: 'd₁',
  bpD2: 'd₂',
  bpNd1: 'N(d₁)',
  bpNd2: 'N(d₂)',
  bpFormula: 'Allocation = C(Upper) - C(Lower)',
  totalAllocated: 'Total Value Allocated',
  
  className: 'Class Name',
  sharesLabel: 'Shares',
  fullyDiluted: 'Fully Diluted',
  totalValueLabel: 'Total Value',
  valuePerShare: 'Value/Share',
  details: 'Details',
  
  compareTitle: 'Variance Analysis',
  lockedTime: 'Locked at',
  paramCompare: 'Parameter Comparison',
  locked: 'Locked',
  current: 'Current',
  variance: 'Variance',
  varianceAmount: 'Variance ($)',
  variancePct: 'Variance (%)',
  trend: 'Trend',
  
  importSuccess: 'Successfully imported {count} equity classes',
  exportSuccess: 'Results exported to Excel',
  templateDownloaded: 'Template downloaded',
  calcError: 'Calculation error: {msg}',
  exportError: 'Export failed: {msg}',
  needOneClass: 'At least one equity class is required',
  
  footer: 'OPM Valuation Tool | Based on Black-Scholes Model | For Professional Use Only',
  footerPrivacy: 'All calculations are performed locally. No data is uploaded.',
  
  langSwitch: '中文',
  
  defaultName: 'Class {n}',
  
  smartNamePreferred: '{name} (Liq @ ${price})',
  smartNameCommon: '{name} (Common @ ${price})',
  smartNameEsop: '{name} (ESOP @ Strike ${price})',
  smartNameSafe: '{name} (SAFE ${amount})',
  smartNameConvertible: '{name} (Conv. ${amount})',
  smartNameWarrant: '{name} (Warrant @ ${price})',
};

const locales = { zh, en };

/**
 * 获取当前语言的翻译文本
 * @param {string} key - 翻译键
 * @param {object} params - 插值参数
 * @param {string} lang - 语言代码 ('zh' | 'en')
 * @returns {string} 翻译后的文本
 */
export function t(key, params = {}, lang = 'zh') {
  const locale = locales[lang] || locales.zh;
  let text = locale[key] || key;
  
  // 插值替换
  Object.entries(params).forEach(([k, v]) => {
    text = text.replace(`{${k}}`, v);
  });
  
  return text;
}

/**
 * 获取股权类型的中文/英文标签
 */
export function getTypeLabel(type, lang) {
  const map = {
    common: lang === 'en' ? 'Common Stock' : '普通股',
    preferred: lang === 'en' ? 'Preferred Stock' : '优先股',
    esop: lang === 'en' ? 'ESOP' : '员工期权',
    safe: 'SAFE',
    convertible: lang === 'en' ? 'Convertible' : '可转换债券',
    warrant: lang === 'en' ? 'Warrant' : '认股权证',
  };
  return map[type] || type;
}

/**
 * 生成智能层级名称
 * 
 * 关键逻辑：先剥离上一次自动添加的后缀，再重新生成。
 * 避免名称越来越长的问题（如 "Series A (清算 @ $1)(清算 @ $1)"）。
 * 
 * 后缀匹配模式：以 " (" 开头，包含 "@" 或 "$" 或 "行权" 或 "清算" 或 "普通股" 等关键词
 * @param {object} ec - 资本结构层级
 * @param {string} lang - 语言
 * @returns {string} 智能名称
 */
export function generateSmartName(ec, lang = 'zh') {
  // ============================================================
  // 第一步：剥离上一次自动添加的后缀
  // 
  // 匹配模式：以 " (" 开头，包含 "@" 或 "$" 或中英文关键词
  // 例如：
  //   "Series A (清算 @ $1)" → "Series A"
  //   "ESOP Pool (ESOP @ Strike $0.5)" → "ESOP Pool"
  //   "Common Stock (普通股 @ $0.1)" → "Common Stock"
  // 
  // 使用正则匹配：从最后一个 " (" 开始到结尾的内容
  // ============================================================
  let baseName = ec.name;
  // 匹配以 " (" 开头，包含特定关键词的后缀
  const suffixPattern = /\s*\(.*(?:@|$|行权|清算|普通股|Liq|Common|Strike|ESOP|SAFE|可转债|Conv|Warrant).*\)$/;
  if (suffixPattern.test(baseName)) {
    // 找到最后一个 " (" 的位置
    const lastParen = baseName.lastIndexOf(' (');
    if (lastParen > 0) {
      baseName = baseName.substring(0, lastParen);
    }
  }
  
  // ============================================================
  // 第二步：根据类型生成新的后缀
  // ============================================================
  const templates = {
    preferred: lang === 'zh' 
      ? `${baseName} (清算 @ $${ec.pricePerShare || 0})`
      : `${baseName} (Liq @ $${ec.pricePerShare || 0})`,
    common: lang === 'zh'
      ? `${baseName} (普通股 @ $${ec.pricePerShare || 0})`
      : `${baseName} (Common @ $${ec.pricePerShare || 0})`,
    esop: lang === 'zh'
      ? `${baseName} (ESOP @ 行权 $${ec.exercisePrice || 0})`
      : `${baseName} (ESOP @ Strike $${ec.exercisePrice || 0})`,
    safe: lang === 'zh'
      ? `${baseName} (SAFE $${(ec.investmentAmount || 0).toLocaleString()})`
      : `${baseName} (SAFE $${(ec.investmentAmount || 0).toLocaleString()})`,
    convertible: lang === 'zh'
      ? `${baseName} (可转债 $${(ec.principal || 0).toLocaleString()})`
      : `${baseName} (Conv. $${(ec.principal || 0).toLocaleString()})`,
    warrant: lang === 'zh'
      ? `${baseName} (Warrant @ $${ec.exercisePrice || 0})`
      : `${baseName} (Warrant @ $${ec.exercisePrice || 0})`,
  };
  return templates[ec.type] || baseName;
}


export default locales;
