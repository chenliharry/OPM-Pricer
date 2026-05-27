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
  // 
  // 每种类型只导出其相关字段：
  // - Common: 层级名称, 类型, 股本数量, 优先级
  // - Preferred: 层级名称, 类型, 股本数量, 每股价格, 参与权, 转股比例, 优先级, 参与上限
  // - ESOP: 层级名称, 类型, 股本数量, 行权价格, 已行权比例, 行权概率, 优先级
  // - Warrant: 层级名称, 类型, 股本数量, 行权价格, 优先级
  // 
  // 注意：清算优先权金额 = shares × pricePerShare（即该轮融资总额），
  // 不再需要单独的"清算优先权倍数"字段。
  // ============================================================
  const header = [
    lang === 'en' ? 'Class Name' : '层级名称',
    lang === 'en' ? 'Type' : '类型 (Type)',
    lang === 'en' ? 'Shares' : '股本数量 (Shares)',
    lang === 'en' ? 'Price/Share' : '每股价格 (Price/Share)',
    lang === 'en' ? 'Participation' : '参与权 (Participation)',
    lang === 'en' ? 'Conversion Ratio' : '转股比例 (Conversion Ratio)',
    lang === 'en' ? 'Seniority' : '优先级 (Seniority)',
    lang === 'en' ? 'Exercise Price' : '行权价格 (Exercise Price)',
    lang === 'en' ? 'Vested %' : '已行权比例 (Vested %)',
    lang === 'en' ? 'Vesting Prob.' : '行权概率 (Vesting Probability)',
    lang === 'en' ? 'Participation Cap' : '参与上限 (Participation Cap)'
  ];

  // 将 equityClasses 转换为模板格式的行数据
  // 每种类型只填充其相关字段，无关字段留空
  const classRows = equityClasses.map(ec => {
    const row = [
      ec.name,
      ec.type,
      ec.shares || 0,
      '',  // Price/Share - 仅 Preferred
      '',  // Participation - 仅 Preferred
      '',  // Conversion Ratio - 仅 Preferred
      ec.seniority || 0,
      '',  // Exercise Price - 仅 ESOP/Warrant
      '',  // Vested % - 仅 ESOP
      '',  // Vesting Prob. - 仅 ESOP
      ''   // Participation Cap - 仅 Preferred
    ];
    
    // 根据类型填充相关字段
    if (ec.type === 'preferred') {
      row[3] = ec.pricePerShare || '';
      row[4] = ec.participation ? (lang === 'en' ? 'Yes' : '是') : (lang === 'en' ? 'No' : '否');
      row[5] = ec.conversionRatio || '';
      row[10] = ec.participationCap !== undefined && ec.participationCap !== null ? ec.participationCap : '';
    } else if (ec.type === 'esop') {
      row[7] = ec.exercisePrice || '';
      row[8] = ec.vestedPercentage || '';
      row[9] = ec.probabilityOfVesting || '';
    } else if (ec.type === 'warrant') {
      row[7] = ec.exercisePrice || '';
    }
    // Common: 所有额外字段留空
    
    return row;
  });

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
  // Sheet 2: 断点分配表 - 分配比例 (Allocation %)
  // 单独展示各层级在各断点区间的分配比例，方便用 Excel 公式验证
  // ============================================================
  const bpPctHeader = [
    lang === 'en' ? 'Lower Bound' : '下限 (Lower)',
    lang === 'en' ? 'Upper Bound' : '上限 (Upper)',
    lang === 'en' ? 'Tranche Value' : '该层分配额 (Tranche Value)',
    'd₁', 'd₂', 'N(d₁)', 'N(d₂)',
    lang === 'en' ? 'Formula' : '计算公式 (Formula)'
  ];

  // 为每个结果类添加分配比例列
  results.forEach(r => {
    bpPctHeader.push(`${r.className} ${lang === 'en' ? 'Alloc %' : '分配比例'}`);
  });

  const bpPctData = [bpPctHeader];
  
  breakpointTable.forEach((tranche, idx) => {
    const row = [
      tranche.lower,
      tranche.upper,
      tranche.trancheValue,
      tranche.lowerOption.d1,
      tranche.lowerOption.d2,
      tranche.lowerOption.Nd1,
      tranche.lowerOption.Nd2,
      tranche.formula
    ];

    // 为每个结果类添加分配比例
    results.forEach(r => {
      const allocation = tranche.allocations.find(a => a.className === r.className);
      row.push(allocation ? allocation.proportion : 0);
    });

    bpPctData.push(row);
  });

  const bpPctSheet = XLSX.utils.aoa_to_sheet(bpPctData);
  XLSX.utils.book_append_sheet(wb, bpPctSheet, lang === 'en' ? 'Allocation %' : '分配比例');

  // ============================================================
  // Sheet 3: 断点分配表 - 分配金额 (Allocation $)
  // 单独展示各层级在各断点区间分配到的金额，方便用 Excel 公式验证
  // 分配金额 = Tranche Value × 分配比例
  // ============================================================
  const bpAmtHeader = [
    lang === 'en' ? 'Lower Bound' : '下限 (Lower)',
    lang === 'en' ? 'Upper Bound' : '上限 (Upper)',
    lang === 'en' ? 'Tranche Value' : '该层分配额 (Tranche Value)',
    'd₁', 'd₂', 'N(d₁)', 'N(d₂)',
    lang === 'en' ? 'Formula' : '计算公式 (Formula)'
  ];

  // 为每个结果类添加分配金额列
  results.forEach(r => {
    bpAmtHeader.push(`${r.className} ${lang === 'en' ? 'Alloc $' : '分配金额'}`);
  });

  const bpAmtData = [bpAmtHeader];
  
  breakpointTable.forEach((tranche, idx) => {
    const row = [
      tranche.lower,
      tranche.upper,
      tranche.trancheValue,
      tranche.lowerOption.d1,
      tranche.lowerOption.d2,
      tranche.lowerOption.Nd1,
      tranche.lowerOption.Nd2,
      tranche.formula
    ];

    // 为每个结果类添加分配金额
    results.forEach(r => {
      const allocation = tranche.allocations.find(a => a.className === r.className);
      row.push(allocation ? allocation.amount : 0);
    });

    bpAmtData.push(row);
  });

  // 添加汇总行
  const totalAllocated = results.reduce((sum, r) => sum + r.totalValue, 0);
  const summaryRow = [
    '', '',
    lang === 'en' ? 'Total Allocated' : '分配总额 (Total Allocated)',
    totalAllocated,
    '', '', '', ''
  ];
  results.forEach(() => { summaryRow.push(''); });
  bpAmtData.push(summaryRow);

  const bpAmtSheet = XLSX.utils.aoa_to_sheet(bpAmtData);
  XLSX.utils.book_append_sheet(wb, bpAmtSheet, lang === 'en' ? 'Allocation $' : '分配金额');

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
              participation: row[4] === 'Yes' || row[4] === '是' || row[4] === true,
              conversionRatio: parseFloat(row[5]) || 1.0,
              seniority: parseInt(row[6]) || 0,
              // ESOP 参数
              exercisePrice: parseFloat(row[7]) || 0,
              vestedPercentage: parseFloat(row[8]) || 0,
              probabilityOfVesting: parseFloat(row[9]) || 0.5,
              participationCap: row[10] !== undefined && row[10] !== '' ? parseFloat(row[10]) : null,
              principal: parseFloat(row[14]) || 0,
              interestRate: parseFloat(row[15]) || 0,
              conversionPrice: parseFloat(row[16]) || 0
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
  // 
  // 每种类型只显示其相关字段：
  // - Common: 层级名称, 类型, 股本数量, 优先级
  // - Preferred: 层级名称, 类型, 股本数量, 每股价格, 参与权, 转股比例, 优先级, 参与上限
  // - ESOP: 层级名称, 类型, 股本数量, 行权价格, 已行权比例, 行权概率, 优先级
  // - Warrant: 层级名称, 类型, 股本数量, 行权价格, 优先级
  // 
  // 注意：清算优先权金额 = shares × pricePerShare（即该轮融资总额），
  // 不再需要单独的"清算优先权倍数"字段。
  // ============================================================
  const header = [
    lang === 'en' ? 'Class Name' : '层级名称',
    lang === 'en' ? 'Type' : '类型 (Type)',
    lang === 'en' ? 'Shares' : '股本数量 (Shares)',
    lang === 'en' ? 'Price/Share' : '每股价格 (Price/Share)',
    lang === 'en' ? 'Participation' : '参与权 (Participation)',
    lang === 'en' ? 'Conversion Ratio' : '转股比例 (Conversion Ratio)',
    lang === 'en' ? 'Seniority' : '优先级 (Seniority)',
    lang === 'en' ? 'Exercise Price' : '行权价格 (Exercise Price)',
    lang === 'en' ? 'Vested %' : '已行权比例 (Vested %)',
    lang === 'en' ? 'Vesting Prob.' : '行权概率 (Vesting Probability)',
    lang === 'en' ? 'Participation Cap' : '参与上限 (Participation Cap)'
  ];

  // 字段说明行（在表头下方显示为注释）
  const fieldDescriptions = [
    lang === 'en' ? 'Security name (e.g., Series A)' : '证券名称（如 Series A）',
    lang === 'en' ? 'Type: common/preferred/esop/warrant' : '类型: common/preferred/esop/warrant',
    lang === 'en' ? 'Number of shares (integer)' : '持股数量（整数）',
    lang === 'en' ? 'Price per share. Preferred only. Liq. Preference = shares × pricePerShare' : '每股价格。仅优先股使用。清算优先权 = 股数 × 每股价格',
    lang === 'en' ? 'TRUE/FALSE. Whether to participate. Preferred only.' : '是否参与剩余分配（TRUE/FALSE）。仅优先股使用。',
    lang === 'en' ? 'Conversion ratio. Preferred only.' : '转股比例。仅优先股使用。',
    lang === 'en' ? 'Priority: higher = earlier distribution (3 > 2 > 1 > 0)' : '优先级: 数值越大越优先（3 > 2 > 1 > 0）',
    lang === 'en' ? 'Strike price. ESOP/Warrant only.' : '行权价。仅 ESOP/Warrant 使用。',
    lang === 'en' ? 'Vested percentage (0-1). ESOP only.' : '已行权比例（0-1）。仅 ESOP 使用。',
    lang === 'en' ? 'Vesting probability (0-1). ESOP only.' : '行权概率（0-1）。仅 ESOP 使用。',
    lang === 'en' ? 'Participation cap multiple. Preferred only. Leave blank = No Cap.' : '参与上限倍数。仅优先股使用。留空 = 无上限。'
  ];

  const exampleData = [
    ['Series A Preferred', 'preferred', 1000000, 1.00, 'No', 1.0, 3, '', '', '', ''],
    ['ESOP Pool', 'esop', 500000, '', '', '', 2, 0.50, 0.40, 0.60, ''],
    ['Common Stock', 'common', 5000000, '', '', '', 0, '', '', '', '']
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
