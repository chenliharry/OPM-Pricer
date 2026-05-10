/**
 * 估值结果显示组件
 * 
 * 展示 OPM 估值计算结果，包括：
 * 1. 断点分配详情表（Breakpoint Allocation Table）- 展示每一层断点的详细参数
 *    每一行明确显示该比例（Pro-rata）具体归属于哪个股权类别
 *    点击断点行高亮显示该层分配给了哪些 Class
 * 2. 各层级估值结果汇总 - 与断点分配表数据完全同步
 * 3. Black-Scholes 中间参数（d1, d2, N(d1), N(d2)）
 * 
 * 四大审计实务要求：
 * - 断点分配表必须完整展示每一层的分配逻辑
 * - 鼠标悬停显示计算公式
 * - 汇总行验证分配总额等于 Total Equity Value
 * - 估值结果表中的最终数值 = 断点分配表中各类别在所有层级分配金额的纵向加总
 */

import { useState } from 'react';
import { BarChart3, Info, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { t } from '../utils/i18n';

function ResultsDisplay({ results, parameters, breakpointTable, totalAllocated, lang }) {
  const [showDetails, setShowDetails] = useState({});
  const [showAllCalculations, setShowAllCalculations] = useState(false);
  const [hoveredTranche, setHoveredTranche] = useState(null);
  const [selectedTranche, setSelectedTranche] = useState(null);

  const toggleDetails = (className) => {
    setShowDetails(prev => ({
      ...prev,
      [className]: !prev[className]
    }));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value, decimals = 2) => {
    if (value === Infinity) return '∞';
    if (value === -Infinity) return '-∞';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatPercent = (value) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const totalValue = results.reduce((sum, r) => sum + r.totalValue, 0);

  return (
    <div className="space-y-6">
      {/* ============================================================
          断点分配详情表 (Breakpoint Allocation Table)
          
          这是 OPM 估值中最核心的审计追溯工具。
          表格展示每个断点区间（Tranche）的：
          - 上下限 (Lower/Upper Bound)
          - 行权价 (Strike Price K)
          - 期权价值 C(K)
          - 该层分配额 (Tranche Value)
          - 各资产类别分配比例和金额（明确显示归属关系）
          - d1, d2, N(d1), N(d2) 中间参数
          
          点击某一行可高亮显示该层分配给了哪些 Class。
          鼠标悬停可查看计算公式。
          ============================================================ */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-apple-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-apple-blue-500" />
            <h2 className="text-xl font-semibold text-apple-gray-900">
              {t('breakpointTable', {}, lang)}
            </h2>
          </div>
        </div>

        {/* 汇总信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('totalValue', {}, lang)}</p>
            <p className="text-xl font-bold">{formatCurrency(parameters.totalEquityValue)}</p>
          </div>
          
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('allocatedValue', {}, lang)}</p>
            <p className="text-xl font-bold">{formatCurrency(totalAllocated)}</p>
          </div>
          
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('numClasses', {}, lang)}</p>
            <p className="text-xl font-bold">{results.length}</p>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('bpTrancheValue', {}, lang)}</p>
            <p className="text-xl font-bold">{breakpointTable.length}</p>
          </div>
        </div>

        {/* 断点分配表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-apple-gray-200">
                <th className="text-left py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpLower', {}, lang)}
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpUpper', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpStrike', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpCallValue', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpTrancheValue', {}, lang)}
                </th>
                {/* 为每个结果类添加分配列 - 明确显示归属关系 */}
                {results.map((result, rIdx) => (
                  <th key={rIdx} className="text-center py-3 px-2 text-xs font-semibold text-apple-gray-700 whitespace-nowrap" colSpan={2}>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] opacity-75">{result.type}</span>
                      <span className="text-xs">{result.className}</span>
                    </div>
                  </th>
                ))}
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpD1', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpD2', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpNd1', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpNd2', {}, lang)}
                </th>
              </tr>
            </thead>
            <tbody>
              {breakpointTable.map((tranche, index) => (
                <tr 
                  key={index} 
                  className={`border-b border-apple-gray-100 transition-colors cursor-pointer ${
                    selectedTranche === index 
                      ? 'bg-apple-blue-100 ring-2 ring-inset ring-apple-blue-500' 
                      : hoveredTranche === index 
                        ? 'bg-apple-blue-50' 
                        : 'hover:bg-apple-gray-50'
                  }`}
                  onMouseEnter={() => setHoveredTranche(index)}
                  onMouseLeave={() => setHoveredTranche(null)}
                  onClick={() => setSelectedTranche(selectedTranche === index ? null : index)}
                >
                  <td className="py-3 px-3 font-mono text-xs text-apple-gray-700">
                    {formatCurrency(tranche.lower)}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-apple-gray-700">
                    {formatCurrency(tranche.upper)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-gray-700">
                    {formatCurrency(tranche.lowerOption.strikePrice)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-blue-600 font-medium">
                    {formatCurrency(tranche.lowerOption.value)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-green-600 font-semibold relative">
                    {formatCurrency(tranche.trancheValue)}
                    {/* 悬停显示计算公式 */}
                    {hoveredTranche === index && (
                      <div className="absolute z-10 left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-apple-gray-200 p-3 w-80 text-left animate-fade-in">
                        <p className="text-xs font-mono text-apple-gray-700 leading-relaxed">
                          <span className="font-semibold text-apple-gray-900">{t('bpFormula', {}, lang)}</span><br/>
                          C({formatCurrency(tranche.upper)}) - C({formatCurrency(tranche.lower)})<br/>
                          = {formatCurrency(tranche.upperOption.value)} - {formatCurrency(tranche.lowerOption.value)}<br/>
                          = <span className="text-green-600 font-bold">{formatCurrency(tranche.trancheValue)}</span>
                        </p>
                      </div>
                    )}
                  </td>
                  {/* 各层级分配比例和金额 - 明确显示归属 */}
                  {results.map((result, rIdx) => {
                    const allocation = tranche.allocations.find(a => a.className === result.className);
                    const isHighlighted = selectedTranche === index && allocation;
                    return (
                      <td key={rIdx} colSpan={2} className={`py-3 px-2 text-center ${isHighlighted ? 'bg-apple-blue-200/50' : ''}`}>
                        {allocation ? (
                          <div className="relative group">
                            <div className="flex flex-col items-center">
                              <span className="text-xs font-mono text-apple-gray-700">
                                {formatPercent(allocation.proportion)}
                              </span>
                              <span className="text-xs font-mono text-green-600 font-semibold">
                                {formatCurrency(allocation.amount)}
                              </span>
                            </div>
                            {/* 悬停显示分配详情 */}
                            <div className="absolute z-10 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white rounded-lg shadow-lg border border-apple-gray-200 p-2 whitespace-nowrap">
                              <p className="text-xs font-mono text-apple-gray-700">
                                <span className="font-semibold">{allocation.className}</span><br/>
                                {lang === 'en' ? 'Allocation %' : '分配比例'}: {formatPercent(allocation.proportion)}<br/>
                                {lang === 'en' ? 'Amount' : '分配金额'}: <span className="text-green-600 font-semibold">{formatCurrency(allocation.amount)}</span>
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-apple-gray-400">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-gray-700">
                    {formatNumber(tranche.lowerOption.d1, 4)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-gray-700">
                    {formatNumber(tranche.lowerOption.d2, 4)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-green-600">
                    {formatNumber(tranche.lowerOption.Nd1, 4)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-green-600">
                    {formatNumber(tranche.lowerOption.Nd2, 4)}
                  </td>
                </tr>
              ))}
              {/* 汇总行 */}
              <tr className="bg-apple-gray-50 font-semibold">
                <td colSpan="4" className="py-3 px-3 text-sm text-apple-gray-900">
                  {t('totalAllocated', {}, lang)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-green-600 font-bold">
                  {formatCurrency(totalAllocated)}
                </td>
                <td colSpan={results.length * 2 + 6} className="py-3 px-3 text-xs text-apple-gray-500">
                  {lang === 'en' 
                    ? `Difference: ${formatCurrency(parameters.totalEquityValue - totalAllocated)}`
                    : `差异: ${formatCurrency(parameters.totalEquityValue - totalAllocated)}`
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 选中断点行的分配详情面板 */}
        {selectedTranche !== null && breakpointTable[selectedTranche] && (
          <div className="mt-4 p-4 bg-apple-blue-50 rounded-xl border border-apple-blue-200 animate-fade-in">
            <h4 className="font-semibold text-apple-blue-900 mb-3">
              {lang === 'en' ? `Tranche ${selectedTranche + 1} Allocation Details` : `第 ${selectedTranche + 1} 层分配详情`}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {breakpointTable[selectedTranche].allocations.map((alloc, aIdx) => (
                <div key={aIdx} className="bg-white rounded-lg p-3 border border-apple-blue-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-apple-gray-900">{alloc.className}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-apple-blue-100 text-apple-blue-700">
                      {alloc.type}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-apple-gray-600">
                    <div className="flex justify-between">
                      <span>{lang === 'en' ? 'Shares:' : '股本:'}</span>
                      <span className="font-mono">{formatNumber(alloc.shares, 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{lang === 'en' ? 'Conversion Ratio:' : '转股比例:'}</span>
                      <span className="font-mono">{alloc.conversionRatio}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{lang === 'en' ? 'Allocation %:' : '分配比例:'}</span>
                      <span className="font-mono text-apple-blue-600">{formatPercent(alloc.proportion)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-apple-gray-200">
                      <span className="font-semibold">{lang === 'en' ? 'Amount:' : '分配金额:'}</span>
                      <span className="font-mono font-semibold text-green-600">{formatCurrency(alloc.amount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 各层级估值结果汇总 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-apple-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-apple-blue-500" />
            <h2 className="text-xl font-semibold text-apple-gray-900">{t('results', {}, lang)}</h2>
          </div>
          
          <button
            onClick={() => setShowAllCalculations(!showAllCalculations)}
            className="px-4 py-2 rounded-xl bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700 transition-all duration-200 flex items-center space-x-2"
          >
            {showAllCalculations ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="text-sm font-medium">
              {showAllCalculations ? t('hideCalcDetails', {}, lang) : t('showCalcDetails', {}, lang)}
            </span>
          </button>
        </div>

        {/* 结果表格 */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-apple-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-apple-gray-700">{t('className', {}, lang)}</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-apple-gray-700">{t('sharesLabel', {}, lang)}</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-apple-gray-700">{t('fullyDiluted', {}, lang)}</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-apple-gray-700">{t('totalValueLabel', {}, lang)}</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-apple-gray-700">{t('valuePerShare', {}, lang)}</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-apple-gray-700">{t('details', {}, lang)}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={index} className="border-b border-apple-gray-100 hover:bg-apple-gray-50 transition-colors">
                  <td className="py-4 px-4">
                    <span className="font-medium text-apple-gray-900">{result.className}</span>
                  </td>
                  <td className="py-4 px-4 text-right text-apple-gray-700">
                    {formatNumber(result.shares, 0)}
                  </td>
                  <td className="py-4 px-4 text-right text-apple-gray-700">
                    {formatNumber(result.fullyDilutedShares, 0)}
                  </td>
                  <td className="py-4 px-4 text-right font-semibold text-apple-gray-900">
                    {formatCurrency(result.totalValue)}
                  </td>
                  <td className="py-4 px-4 text-right font-semibold text-green-600">
                    {formatCurrency(result.valuePerShare)}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <button
                      onClick={() => toggleDetails(result.className)}
                      className="p-2 hover:bg-apple-blue-100 rounded-lg transition-colors"
                    >
                      <Info className="w-5 h-5 text-apple-blue-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 详细计算信息 */}
        {showAllCalculations && (
          <div className="mt-6 space-y-4">
            <h3 className="text-lg font-semibold text-apple-gray-900 mb-4">
              {lang === 'en' ? 'Black-Scholes Calculation Parameters' : 'Black-Scholes 计算参数'}
            </h3>
            
            {results.map((result, index) => (
              <div key={index} className="bg-apple-gray-50 rounded-xl p-5 border border-apple-gray-200">
                <h4 className="font-semibold text-apple-gray-900 mb-3">{result.className}</h4>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-apple-gray-600 mb-1">{lang === 'en' ? 'Strike Price (K)' : '行权价格 (K)'}</p>
                    <p className="font-mono text-sm font-medium text-apple-gray-900">
                      {formatCurrency(result.strikePrice)}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-apple-gray-600 mb-1">{lang === 'en' ? 'Option Value' : '期权价值'}</p>
                    <p className="font-mono text-sm font-medium text-apple-gray-900">
                      {formatCurrency(result.optionValue)}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-apple-gray-600 mb-1">{lang === 'en' ? 'Participation Value' : '参与权价值'}</p>
                    <p className="font-mono text-sm font-medium text-apple-gray-900">
                      {formatCurrency(result.participationValue)}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-apple-gray-600 mb-1">d1</p>
                    <p className="font-mono text-sm font-medium text-apple-blue-600">
                      {formatNumber(result.calculations.d1, 6)}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-apple-gray-600 mb-1">d2</p>
                    <p className="font-mono text-sm font-medium text-apple-blue-600">
                      {formatNumber(result.calculations.d2, 6)}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-apple-gray-600 mb-1">N(d1)</p>
                    <p className="font-mono text-sm font-medium text-green-600">
                      {formatNumber(result.calculations.Nd1, 6)}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-apple-gray-600 mb-1">N(d2)</p>
                    <p className="font-mono text-sm font-medium text-green-600">
                      {formatNumber(result.calculations.Nd2, 6)}
                    </p>
                  </div>
                </div>
                
                {/* 计算公式说明 */}
                <div className="mt-4 p-4 bg-white rounded-lg border border-apple-gray-200">
                  <p className="text-xs font-mono text-apple-gray-700 leading-relaxed">
                    Call Value = S × N(d1) - K × e^(-rT) × N(d2)<br/>
                    = {formatCurrency(parameters.totalEquityValue)} × {formatNumber(result.calculations.Nd1, 6)} 
                    - {formatCurrency(result.strikePrice)} × e^(-{parameters.riskFreeRate}×{parameters.timeToExit}) × {formatNumber(result.calculations.Nd2, 6)}<br/>
                    = {formatCurrency(result.optionValue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 个别详情弹窗 */}
        {Object.entries(showDetails).map(([className, isShown]) => {
          if (!isShown) return null;
          
          const result = results.find(r => r.className === className);
          if (!result) return null;
          
          return (
            <div key={className} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-apple-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                  <h3 className="text-xl font-semibold text-apple-gray-900">
                    {result.className} - {lang === 'en' ? 'Calculation Details' : '计算详情'}
                  </h3>
                  <button
                    onClick={() => toggleDetails(className)}
                    className="p-2 hover:bg-apple-gray-100 rounded-lg transition-colors"
                  >
                    <span className="text-2xl text-apple-gray-600">×</span>
                  </button>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="bg-apple-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold text-apple-gray-900 mb-3">
                      {lang === 'en' ? 'Basic Information' : '基础信息'}
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-apple-gray-600">{lang === 'en' ? 'Shares:' : '股本数量:'}</span>
                        <span className="ml-2 font-medium">{formatNumber(result.shares, 0)}</span>
                      </div>
                      <div>
                        <span className="text-apple-gray-600">{lang === 'en' ? 'Conversion Ratio:' : '转股比例:'}</span>
                        <span className="ml-2 font-medium">{result.conversionRatio}</span>
                      </div>
                      <div>
                        <span className="text-apple-gray-600">{lang === 'en' ? 'Fully Diluted Shares:' : '完全稀释股数:'}</span>
                        <span className="ml-2 font-medium">{formatNumber(result.fullyDilutedShares, 0)}</span>
                      </div>
                      <div>
                        <span className="text-apple-gray-600">{lang === 'en' ? 'Value per Share:' : '每股价值:'}</span>
                        <span className="ml-2 font-medium text-green-600">{formatCurrency(result.valuePerShare)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-apple-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold text-apple-gray-900 mb-3">
                      {lang === 'en' ? 'Valuation Calculation' : '估值计算'}
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-apple-gray-600">{lang === 'en' ? 'Strike Price (K):' : '行权价格 (K):'}</span>
                        <span className="font-medium">{formatCurrency(result.strikePrice)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-apple-gray-600">{lang === 'en' ? 'Option Value:' : '期权价值:'}</span>
                        <span className="font-medium">{formatCurrency(result.optionValue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-apple-gray-600">{lang === 'en' ? 'Participation Value:' : '参与权价值:'}</span>
                        <span className="font-medium">{formatCurrency(result.participationValue)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-apple-gray-300">
                        <span className="text-apple-gray-900 font-semibold">{lang === 'en' ? 'Total Value:' : '总价值:'}</span>
                        <span className="font-semibold text-green-600">{formatCurrency(result.totalValue)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-apple-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold text-apple-gray-900 mb-3">
                      {lang === 'en' ? 'Black-Scholes Parameters' : 'Black-Scholes 参数'}
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm font-mono">
                      <div>
                        <span className="text-apple-gray-600">d1:</span>
                        <span className="ml-2 font-medium text-apple-blue-600">{formatNumber(result.calculations.d1, 6)}</span>
                      </div>
                      <div>
                        <span className="text-apple-gray-600">d2:</span>
                        <span className="ml-2 font-medium text-apple-blue-600">{formatNumber(result.calculations.d2, 6)}</span>
                      </div>
                      <div>
                        <span className="text-apple-gray-600">N(d1):</span>
                        <span className="ml-2 font-medium text-green-600">{formatNumber(result.calculations.Nd1, 6)}</span>
                      </div>
                      <div>
                        <span className="text-apple-gray-600">N(d2):</span>
                        <span className="ml-2 font-medium text-green-600">{formatNumber(result.calculations.Nd2, 6)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ResultsDisplay;
