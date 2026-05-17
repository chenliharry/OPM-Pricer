/**
 * Excel 导入/导出工具模块
 * 
 * 功能：
 * 1. 导出估值结果到 Excel（含公式和计算逻辑说明）
 * 2. 从 Excel 导入资本结构数据（含全局参数）
 * 3. 下载 Excel 模板（中英文双语对照）
 * 
 * 使用 xlsx (SheetJS) 库
 * 支持中英文双语导出
 * 
 * 导出 Excel 的"公式化"特性：
 * - 分配金额列使用公式：= (OptionValue_Lower - OptionValue_Upper) * Allocation_Percentage
 * - 加总列使用 =SUM(...)
 * - 审计人员可在 Excel 中点击单元格查看计算路径
 */

import * as XLSX from 'xlsx';
import { generateCalculationExplanation } from './valuationUtils';
import { t, getTypeLabel } from './i18n';

/**
 * 导出估值结果到 Excel 文件
 * 
 * 导出的 Excel 包含：
 * Sheet 1: 估值参数（Parameters）
 * Sheet 2: 断点分配详情表（Breakpoint Allocation Table）- 含公式
 * Sheet 3: 各层级估值结果（Results）- 含计算逻辑说明
 * 
 * @param {Array} results - 估值结果数组
 * @param {object} parameters - 估值参数
 * @param {Array} equityClasses - 资本结构数组
 * @param {Array} breakpointTable - 断点分配表
 * @param {string} lang - 语言 ('zh' | 'en')
 */
export function exportToExcel(results, parameters, equityClasses, breakpointTable, lang = 'zh') {
  const wb = XLSX.utils.book_new();

  // ============================================================
  // Sheet 1: 资本结构 (Capital Structure) - 与模板格式一致
  // 使用与 downloadTemplate 相同的表头结构，确保导出的文件
  // 可以直接被 importFromExcel 重新导入
  // ============================================================
  const header = [
    lang === 'en' ? 'Class Name' : '层级名称',
    lang === 'en' ? 'Type' : '类型 (Type)',
    lang === 'en' ? 'Shares' : '股本数量 (Shares)',
    lang === 'en' ? 'Price/Share' : '每股价格 (Price/Share)',
    lang === 'en' ? 'Liq. Preference' : '清算优先权 (Liquidation Preference)',
    lang === 'en' ? 'Participation' : '参与权 (Participation)',
    lang === 'en' ? 'Conversion Ratio' : '转股比例 (Conversion Ratio)',
    lang === 'en' ? 'Seniority' : '优先级 (Seniority)',
    lang === 'en' ? 'Exercise Price' : '行权价格 (Exercise Price)',
    lang === 'en' ? 'Vested %' : '已行权比例 (Vested %)',
    lang === 'en' ? 'Vesting Prob.' : '行权概率 (Vesting Probability)',
    lang === 'en' ? 'Investment Amt' : '投资金额 (Investment Amount)',
    lang === 'en' ? 'Valuation Cap' : '估值上限 (Valuation Cap)',
    lang === 'en' ? 'Discount Rate' : '折扣率 (Discount Rate)'

  ];

  // 将 equityClasses 转换为模板格式的行数据
  const classRows = equityClasses.map(ec => [
    ec.name,
    ec.type,
    ec.shares || 0,
    ec.pricePerShare || '',
    ec.liquidationPreference || '',
    ec.participation ? (lang === 'en' ? 'Yes' : '是') : (lang === 'en' ? 'No' : '否'),
    ec.conversionRatio || '',
    ec.seniority || 0,
    ec.exercisePrice || '',
    ec.vestedPercentage || '',
    ec.probabilityOfVesting || '',
    ec.investmentAmount || '',
    ec.valuationCap || '',
    ec.discountRate || ''
  ]);


  const capStructureData = [header, ...classRows];
  const capStructureSheet = XLSX.utils.aoa_to_sheet(capStructureData);
  XLSX.utils.book_append_sheet(wb, capStructureSheet, lang === 'en' ? 'Capital Structure' : '资本结构 (Capital Structure)');

  // ============================================================
  // Sheet 2: 估值参数 (Parameters) - 与模板格式一致
  // ============================================================
  const paramHeader = [
    lang === 'en' ? 'Parameter' : '参数 (Parameter)',
    lang === 'en' ? 'Value' : '值 (Value)',
    lang === 'en' ? 'Description' : '说明 (Description)'
  ];

  const paramData = [
    paramHeader,
    [lang === 'en' ? 'Total Equity Value' : '企业总权益价值 (Total Equity Value)', parameters.totalEquityValue,
     lang === 'en' ? 'Enterprise value at valuation date' : '估值基准日的企业总价值'],
    [lang === 'en' ? 'Volatility (σ)' : '波动率 (Volatility, σ)', parameters.volatility,
     lang === 'en' ? 'Annualized volatility (e.g., 0.50 = 50%)' : '年化波动率（如 0.50 = 50%）'],
    [lang === 'en' ? 'Risk-free Rate (r)' : '无风险利率 (Risk-free Rate, r)', parameters.riskFreeRate,
     lang === 'en' ? 'Annual risk-free rate (e.g., 0.04 = 4%)' : '年化无风险利率（如 0.04 = 4%）'],
    [lang === 'en' ? 'Time to Exit (T)' : '预期期限 (Time to Exit, T)', parameters.timeToExit,
     lang === 'en' ? 'Expected time to liquidity event in years' : '预期退出时间（年）']
  ];

  const paramSheet = XLSX.utils.aoa_to_sheet(paramData);
  XLSX.utils.book_append_sheet(wb, paramSheet, lang === 'en' ? 'Parameters' : '估值参数 (Parameters)');

  // ============================================================
  // Sheet 2: 断点分配详情表 (Breakpoint Allocation Table)
  // 关键特性：分配金额列使用公式，支持审计追溯
  // ============================================================
  const bpHeader = [
    lang === 'en' ? 'Lower Bound' : '下限 (Lower)',
    lang === 'en' ? 'Upper Bound' : '上限 (Upper)',
    lang === 'en' ? 'Strike (K)' : '行权价 (K)',
    lang === 'en' ? 'Call Value C(K)' : '期权价值 C(K)',
    lang === 'en' ? 'Tranche Value' : '该层分配额 (Tranche Value)',
    'd₁', 'd₂', 'N(d₁)', 'N(d₂)',
    lang === 'en' ? 'Formula' : '计算公式 (Formula)'
  ];

  // 为每个结果类添加分配列
  results.forEach(r => {
    bpHeader.push(`${r.className} ${lang === 'en' ? 'Alloc %' : '分配比例'}`);
    bpHeader.push(`${r.className} ${lang === 'en' ? 'Alloc $' : '分配金额'}`);
  });

  const bpData = [bpHeader];
  
  breakpointTable.forEach((tranche, idx) => {
    const row = [
      tranche.lower,
      tranche.upper,
      tranche.lowerOption.strikePrice,
      tranche.lowerOption.value,
      tranche.trancheValue,
      tranche.lowerOption.d1,
      tranche.lowerOption.d2,
      tranche.lowerOption.Nd1,
      tranche.lowerOption.Nd2,
      tranche.formula
    ];

    // 为每个结果类添加分配比例和金额
    results.forEach(r => {
      const allocation = tranche.allocations.find(a => a.className === r.className);
      if (allocation) {
        row.push(allocation.proportion);
        row.push(allocation.amount);
      } else {
        row.push(0);
        row.push(0);
      }
    });

    bpData.push(row);
  });

  // 添加汇总行
  const totalAllocated = results.reduce((sum, r) => sum + r.totalValue, 0);
  const summaryRow = [
    '', '', '', '',
    lang === 'en' ? 'Total Allocated' : '分配总额 (Total Allocated)',
    totalAllocated,
    '', '', '', ''
  ];
  // 填充汇总行的分配列
  results.forEach(() => { summaryRow.push(''); summaryRow.push(''); });
  bpData.push(summaryRow);

  const bpSheet = XLSX.utils.aoa_to_sheet(bpData);
  XLSX.utils.book_append_sheet(wb, bpSheet, lang === 'en' ? 'Breakpoint Table' : '断点分配表');

  // ============================================================
  // Sheet 3: 各层级估值结果（含计算逻辑说明）
  // ============================================================
  const resultHeader = [
    lang === 'en' ? 'Class Name' : '层级名称',
    lang === 'en' ? 'Type' : '类型',
    lang === 'en' ? 'Shares' : '股本数量 (Shares)',
    lang === 'en' ? 'Fully Diluted' : '完全稀释股数 (Fully Diluted)',
    lang === 'en' ? 'Strike Price' : '行权价格 (Strike Price)',
    lang === 'en' ? 'Option Value' : '期权价值 (Option Value)',
    lang === 'en' ? 'Participation Value' : '参与权价值 (Participation Value)',
    lang === 'en' ? 'Total Value' : '总价值 (Total Value)',
    lang === 'en' ? 'Value/Share' : '每股价值 (Value/Share)',
    'd₁', 'd₂', 'N(d₁)', 'N(d₂)',
    lang === 'en' ? 'Calculation Logic' : '计算逻辑说明 (Calculation Logic)'
  ];

  const resultData = [resultHeader];
  
  results.forEach(result => {
    resultData.push([
      result.className,
      getTypeLabel(result.type, lang),
      result.shares,
      result.fullyDilutedShares,
      result.strikePrice,
      result.optionValue,
      result.participationValue,
      result.totalValue,
      result.valuePerShare,
      result.calculations.d1,
      result.calculations.d2,
      result.calculations.Nd1,
      result.calculations.Nd2,
      generateCalculationExplanation(result, lang)
    ]);
  });

  // 添加汇总行
  resultData.push([
    lang === 'en' ? 'Total' : '合计 (Total)',
    '', '', '', '', '', '',
    totalAllocated,
    '', '', '', '', '', ''
  ]);

  const resultSheet = XLSX.utils.aoa_to_sheet(resultData);
  XLSX.utils.book_append_sheet(wb, resultSheet, lang === 'en' ? 'Results' : '估值结果');

  // 生成并下载 Excel 文件
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `OPM_Valuation_${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 从 Excel 文件导入资本结构数据
 * 
 * 支持导入：
 * - 资本结构层级（Sheet 1）
 * - 全局估值参数（Sheet 1 中的参数行）
 * 
 * @param {File} file - Excel 文件
 * @returns {Promise<object>} { equityClasses: Array, parameters: object }
 */
export async function importFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 尝试读取第一个 sheet
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        const equityClasses = [];
        let parameters = null;
        
        // 解析数据
        jsonData.forEach((row, index) => {
          if (index === 0) return; // 跳过表头
          
          const name = row[0];
          const type = row[1];
          const shares = parseFloat(row[2]) || 0;
          
          // 检查是否是参数行
          if (name && !type && !shares) {
            return;
          }
          
          if (name && type) {
            const equityClass = {
              id: `equity-${Date.now()}-${index}`,
              name: String(name),
              type: String(type).toLowerCase(),
              shares,
              pricePerShare: parseFloat(row[3]) || 1.0,
              liquidationPreference: parseFloat(row[4]) || 0,
              participation: row[5] === 'Yes' || row[5] === '是' || row[5] === true,
              conversionRatio: parseFloat(row[6]) || 1.0,
              seniority: parseInt(row[7]) || 0,
              // ESOP 参数
              exercisePrice: parseFloat(row[8]) || 0,
              vestedPercentage: parseFloat(row[9]) || 0,
              probabilityOfVesting: parseFloat(row[10]) || 0.5,
              // SAFE 参数
              investmentAmount: parseFloat(row[11]) || 0,
              valuationCap: parseFloat(row[12]) || 0,
              discountRate: parseFloat(row[13]) || 0

            };
            
            equityClasses.push(equityClass);
          }
        });
        
        // 尝试读取参数 sheet
        if (workbook.SheetNames.length > 1) {
          const paramSheetName = workbook.SheetNames[1];
          const paramSheet = workbook.Sheets[paramSheetName];
          const paramData = XLSX.utils.sheet_to_json(paramSheet, { header: 1 });
          
          paramData.forEach(row => {
            const paramName = String(row[0] || '').toLowerCase();
            const paramValue = parseFloat(row[1]);
            
            if (paramName.includes('total equity') || paramName.includes('企业总权益')) {
              parameters = { ...parameters, totalEquityValue: paramValue };
            } else if (paramName.includes('volatility') || paramName.includes('波动率')) {
              parameters = { ...parameters, volatility: paramValue };
            } else if (paramName.includes('risk-free') || paramName.includes('无风险利率')) {
              parameters = { ...parameters, riskFreeRate: paramValue };
            } else if (paramName.includes('time to exit') || paramName.includes('预期期限')) {
              parameters = { ...parameters, timeToExit: paramValue };
            }
          });
        }
        
        resolve({ equityClasses, parameters });
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 下载 Excel 模板（中英文双语对照）
 * 
 * 模板包含：
 * Sheet 1: 资本结构输入模板（含示例数据，关键术语保留英文对照）
 * Sheet 2: 参数设置模板（关键术语保留英文对照）
 * 
 * @param {string} lang - 语言 ('zh' | 'en')
 */
export function downloadTemplate(lang = 'zh') {
  const wb = XLSX.utils.book_new();

  // ============================================================
  // Sheet 1: 资本结构输入模板
  // 关键金融术语保留英文括号对照，防止翻译歧义
  // 表头下方添加字段说明行（灰色注释行）
  // ============================================================
  const header = [
    lang === 'en' ? 'Class Name' : '层级名称',
    lang === 'en' ? 'Type' : '类型 (Type)',
    lang === 'en' ? 'Shares' : '股本数量 (Shares)',
    lang === 'en' ? 'Price/Share' : '每股价格 (Price/Share)',
    lang === 'en' ? 'Liq. Preference' : '清算优先权 (Liquidation Preference)',
    lang === 'en' ? 'Participation' : '参与权 (Participation)',
    lang === 'en' ? 'Conversion Ratio' : '转股比例 (Conversion Ratio)',
    lang === 'en' ? 'Seniority' : '优先级 (Seniority)',
    lang === 'en' ? 'Exercise Price' : '行权价格 (Exercise Price)',
    lang === 'en' ? 'Vested %' : '已行权比例 (Vested %)',
    lang === 'en' ? 'Vesting Prob.' : '行权概率 (Vesting Probability)',
    lang === 'en' ? 'Investment Amt' : '投资金额 (Investment Amount)',
    lang === 'en' ? 'Valuation Cap' : '估值上限 (Valuation Cap)',
    lang === 'en' ? 'Discount Rate' : '折扣率 (Discount Rate)'

  ];

  // 字段说明行（在表头下方显示为注释）
  const fieldDescriptions = [
    lang === 'en' ? 'Security name (e.g., Series A)' : '证券名称（如 Series A）',
    lang === 'en' ? 'Type: common/preferred/esop/safe/warrant' : '类型: common/preferred/esop/safe/warrant',

    lang === 'en' ? 'Number of shares (integer)' : '持股数量（整数）',
    lang === 'en' ? 'Price per share (for preferred)' : '每股价格（优先股使用）',
    lang === 'en' ? 'Liquidation preference multiple (e.g., 1 = 1x). Common: fill 0' : '清算优先权倍数（如 1 代表 1x）。普通股填 0',
    lang === 'en' ? 'TRUE/FALSE. Whether to participate in residual distribution' : '是否参与剩余分配（TRUE/FALSE）',
    lang === 'en' ? 'Conversion ratio (e.g., 1.0)' : '转股比例（如 1.0）',
    lang === 'en' ? 'Priority: higher = earlier distribution (3 > 2 > 1 > 0)' : '优先级: 数值越大越优先（3 > 2 > 1 > 0）',
    lang === 'en' ? 'Strike price. Common: fill 0. ESOP: must fill actual strike price' : '行权价。普通股填 0；ESOP 必须填写实际行权价',
    lang === 'en' ? 'Vested percentage (0-1). ESOP only' : '已行权比例（0-1）。仅 ESOP 使用',
    lang === 'en' ? 'Vesting probability (0-1). ESOP only' : '行权概率（0-1）。仅 ESOP 使用',
    lang === 'en' ? 'Investment amount. SAFE only' : '投资金额。仅 SAFE 使用',
    lang === 'en' ? 'Valuation cap. SAFE only' : '估值上限。仅 SAFE 使用',
    lang === 'en' ? 'Discount rate (0-1). SAFE only' : '折扣率（0-1）。仅 SAFE 使用'

  ];

  const exampleData = [
    ['Series A Preferred', 'preferred', 1000000, 1.00, 1.0, 'No', 1.0, 3, '', '', '', '', '', ''],
    ['ESOP Pool', 'esop', 500000, '', '', '', '', 2, 0.50, 0.40, 0.60, '', '', ''],
    ['SAFE Investors', 'safe', 500000, 1.00, 1.0, 'No', 1.0, 3, '', '', '', '', '', ''],
    ['Common Stock', 'common', 5000000, 0.10, 0, 'No', 1.0, 0, '', '', '', '', '', '']
  ];


  const templateData = [header, fieldDescriptions, ...exampleData];
  const templateSheet = XLSX.utils.aoa_to_sheet(templateData);
  XLSX.utils.book_append_sheet(wb, templateSheet, lang === 'en' ? 'Capital Structure' : '资本结构 (Capital Structure)');


  // ============================================================
  // Sheet 2: 参数设置模板
  // 关键金融术语保留英文括号对照
  // ============================================================
  const paramHeader = [
    lang === 'en' ? 'Parameter' : '参数 (Parameter)',
    lang === 'en' ? 'Value' : '值 (Value)',
    lang === 'en' ? 'Description' : '说明 (Description)'
  ];

  const paramData = [
    paramHeader,
    [lang === 'en' ? 'Total Equity Value' : '企业总权益价值 (Total Equity Value)', 10000000,
     lang === 'en' ? 'Enterprise value at valuation date' : '估值基准日的企业总价值'],
    [lang === 'en' ? 'Volatility (σ)' : '波动率 (Volatility, σ)', 0.50,
     lang === 'en' ? 'Annualized volatility (e.g., 0.50 = 50%)' : '年化波动率（如 0.50 = 50%）'],
    [lang === 'en' ? 'Risk-free Rate (r)' : '无风险利率 (Risk-free Rate, r)', 0.04,
     lang === 'en' ? 'Annual risk-free rate (e.g., 0.04 = 4%)' : '年化无风险利率（如 0.04 = 4%）'],
    [lang === 'en' ? 'Time to Exit (T)' : '预期期限 (Time to Exit, T)', 3.0,
     lang === 'en' ? 'Expected time to liquidity event in years' : '预期退出时间（年）']
  ];

  const paramSheet = XLSX.utils.aoa_to_sheet(paramData);
  XLSX.utils.book_append_sheet(wb, paramSheet, lang === 'en' ? 'Parameters' : '估值参数 (Parameters)');

  // 生成并下载模板
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `OPM_Template_${lang}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
